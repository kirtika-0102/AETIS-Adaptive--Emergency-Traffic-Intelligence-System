from datetime import datetime, timezone
from typing import Optional, List, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.hospital import Hospital
from app.models.emergency import Emergency, EmergencySeverity, EmergencyStatus
from app.models.audit import AuditLog
from app.schemas.emergency import (
    EmergencyCreate,
    EmergencyStatusUpdate,
    EmergencyResponse,
    PaginatedEmergencyResponse,
)

router = APIRouter()

# Valid State Transitions Definition
VALID_TRANSITIONS = {
    EmergencyStatus.PENDING: [EmergencyStatus.DISPATCHED, EmergencyStatus.CANCELLED],
    EmergencyStatus.DISPATCHED: [EmergencyStatus.IN_TRANSIT, EmergencyStatus.CANCELLED],
    EmergencyStatus.IN_TRANSIT: [EmergencyStatus.ARRIVED, EmergencyStatus.CANCELLED],
    EmergencyStatus.ARRIVED: [EmergencyStatus.COMPLETED, EmergencyStatus.CANCELLED],
    EmergencyStatus.COMPLETED: [],  # Terminal state
    EmergencyStatus.CANCELLED: [],  # Terminal state
}


def generate_incident_number(db: Session) -> str:
    """Generate sequential incident number in the format INC-{YYYY}-{SEQ:03d}."""
    current_year = datetime.now(timezone.utc).year
    prefix = f"INC-{current_year}-"
    count = db.query(Emergency).filter(Emergency.incident_number.like(f"{prefix}%")).count()
    seq = count + 1
    incident_num = f"{prefix}{seq:03d}"
    while db.query(Emergency).filter(Emergency.incident_number == incident_num).first():
        seq += 1
        incident_num = f"{prefix}{seq:03d}"
    return incident_num


def generate_emergency_id(db: Session) -> str:
    """Generate unique emergency identifier e.g. EMG-001."""
    count = db.query(Emergency).count()
    seq = count + 1
    emg_id = f"EMG-{seq:03d}"
    while db.query(Emergency).filter(Emergency.id == emg_id).first():
        seq += 1
        emg_id = f"EMG-{seq:03d}"
    return emg_id


@router.post(
    "",
    response_model=EmergencyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new emergency incident"
)
def create_emergency(
    payload: EmergencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates a new emergency incident.

    - Auto-generates incident_number (e.g., 'INC-2026-001').
    - Sets initial status to 'PENDING'.
    - Assigns dispatcher_id from current authenticated user.
    """
    if payload.destination_hospital_id:
        hosp = db.query(Hospital).filter(Hospital.id == payload.destination_hospital_id).first()
        if not hosp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hospital '{payload.destination_hospital_id}' not found."
            )

    incident_number = generate_incident_number(db)
    emg_id = generate_emergency_id(db)

    emergency = Emergency(
        id=emg_id,
        incident_number=incident_number,
        title=payload.title,
        severity=payload.severity,
        status=EmergencyStatus.PENDING,
        pickup_latitude=payload.pickup_latitude,
        pickup_longitude=payload.pickup_longitude,
        pickup_address=payload.pickup_address,
        patient_notes=payload.patient_notes,
        destination_hospital_id=payload.destination_hospital_id,
        dispatcher_id=current_user.id,
    )

    db.add(emergency)

    audit = AuditLog(
        action="EMERGENCY_CREATED",
        performed_by_id=current_user.id,
        details=f"Created incident {incident_number} ({emergency.title}) with status PENDING",
    )
    db.add(audit)

    db.commit()
    db.refresh(emergency)
    return emergency


@router.get(
    "",
    response_model=Union[PaginatedEmergencyResponse, List[EmergencyResponse]],
    summary="List emergency incidents"
)
def list_emergencies(
    status_filter: Optional[str] = Query(None, alias="status", description="'active', 'all', or specific status like 'PENDING'"),
    severity: Optional[str] = Query(None, description="Optional severity filter (LOW, MEDIUM, HIGH, CRITICAL)"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, alias="pageSize", ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists emergencies. Supports query filter ?status=active (non-completed) or ?status=all."""
    query = db.query(Emergency)

    if isinstance(status_filter, str) and status_filter.strip():
        normalized_status = status_filter.strip().lower()
        if normalized_status == "active":
            query = query.filter(
                Emergency.status.notin_([EmergencyStatus.COMPLETED, EmergencyStatus.CANCELLED])
            )
        elif normalized_status != "all":
            query = query.filter(Emergency.status == status_filter.strip().upper())

    if isinstance(severity, str) and severity.strip():
        query = query.filter(Emergency.severity == severity.strip().upper())

    query = query.order_by(desc(Emergency.created_at))

    total = query.count()

    if isinstance(page, int) and page >= 1:
        p = page
        ps = page_size if isinstance(page_size, int) and page_size >= 1 else 10
        emergencies = query.offset((p - 1) * ps).limit(ps).all()
        return PaginatedEmergencyResponse(
            data=emergencies,
            total=total,
            page=p,
            pageSize=ps,
        )

    return query.all()


@router.get(
    "/{id}",
    response_model=EmergencyResponse,
    summary="Get detailed incident view"
)
def get_emergency(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detailed incident view with assigned vehicle and destination hospital details."""
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        emergency = db.query(Emergency).filter(Emergency.incident_number == id).first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident '{id}' not found."
            )
    return emergency


@router.patch(
    "/{id}/status",
    response_model=EmergencyResponse,
    summary="Update incident lifecycle status (State Machine Transition)"
)
def update_emergency_status(
    id: str,
    payload: EmergencyStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Updates incident status through valid state machine transitions:

    PENDING -> DISPATCHED -> IN_TRANSIT -> ARRIVED -> COMPLETED.
    Any active state can transition to CANCELLED.

    When status is set to COMPLETED or CANCELLED:
    - Sets completed_at timestamp.
    - Automatically frees up the assigned vehicle (status becomes 'AVAILABLE').
    """
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        emergency = db.query(Emergency).filter(Emergency.incident_number == id).first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident '{id}' not found."
            )

    current_status = emergency.status
    target_status = payload.status

    allowed_transitions = VALID_TRANSITIONS.get(current_status, [])
    if target_status not in allowed_transitions and target_status != current_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid state transition from '{current_status.value}' to '{target_status.value}'. "
                f"Allowed transitions: {[t.value for t in allowed_transitions]}"
            ),
        )

    emergency.status = target_status

    if payload.notes:
        if emergency.patient_notes:
            emergency.patient_notes += f"\n[Status Update - {target_status.value}]: {payload.notes}"
        else:
            emergency.patient_notes = f"[Status Update - {target_status.value}]: {payload.notes}"

    # Auto-free assigned vehicle when incident completes or is cancelled
    freed_vehicle_id = None
    if target_status in [EmergencyStatus.COMPLETED, EmergencyStatus.CANCELLED]:
        emergency.completed_at = datetime.now(timezone.utc)
        if emergency.assigned_vehicle_id:
            assigned_vehicle = db.query(Vehicle).filter(
                Vehicle.id == emergency.assigned_vehicle_id
            ).first()
            if assigned_vehicle:
                assigned_vehicle.status = VehicleStatus.AVAILABLE
                freed_vehicle_id = assigned_vehicle.id

    audit_detail = f"Status transition: {current_status.value} -> {target_status.value} for incident {emergency.incident_number}."
    if freed_vehicle_id:
        audit_detail += f" Assigned vehicle '{freed_vehicle_id}' automatically set to AVAILABLE."

    audit = AuditLog(
        action="EMERGENCY_STATUS_UPDATED",
        performed_by_id=current_user.id,
        details=audit_detail,
    )
    db.add(audit)

    db.commit()
    db.refresh(emergency)
    return emergency


@router.post(
    "/{id}/dispatch",
    response_model=EmergencyResponse,
    summary="Dispatch a vehicle to an emergency"
)
def dispatch_vehicle_to_emergency(
    id: str,
    vehicle_id: Optional[str] = Query(None),
    body: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Helper dispatch route for frontend compatibility."""
    v_id = vehicle_id if isinstance(vehicle_id, str) else None
    if not v_id and body and isinstance(body, dict):
        v_id = body.get("vehicleId") or body.get("vehicle_id")

    if not v_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="vehicleId is required."
        )

    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        emergency = db.query(Emergency).filter(Emergency.incident_number == id).first()
        if not emergency:
            raise HTTPException(status_code=404, detail=f"Emergency '{id}' not found.")

    vehicle = db.query(Vehicle).filter(Vehicle.id == v_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle '{v_id}' not found.")

    if vehicle.status != VehicleStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle '{vehicle.id}' is not available (status: {vehicle.status.value})."
        )

    if emergency.status in [EmergencyStatus.COMPLETED, EmergencyStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot dispatch vehicle to an incident that is {emergency.status.value}."
        )

    vehicle.status = VehicleStatus.DISPATCHED
    emergency.assigned_vehicle_id = vehicle.id
    emergency.status = EmergencyStatus.DISPATCHED

    audit = AuditLog(
        action="VEHICLE_DISPATCHED",
        performed_by_id=current_user.id,
        details=f"Dispatched vehicle {vehicle.id} to emergency {emergency.incident_number}",
    )
    db.add(audit)

    db.commit()
    db.refresh(emergency)
    return emergency
