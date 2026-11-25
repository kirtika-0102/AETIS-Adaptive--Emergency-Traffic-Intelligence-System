"""
AETIS Central Engine — Emergencies Router
Endpoints for managing emergency incidents, RBAC-scoped state machine transitions,
atomic ID generation, and completion/cancellation cleanup.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.audit import AuditLog
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.enums import (
    ACTIVE_EMERGENCY_STATUSES,
    EmergencySeverity,
    EmergencyStatus,
    EmergencyType,
    JourneyLeg,
)
from app.models.hospital import Hospital
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.emergency import (
    EmergencyCreate,
    EmergencyResponse,
    EmergencyStatusUpdate,
)
from app.services.hospital_service import (
    close_hospital_alerts_for_emergency,
    upsert_hospital_alert_for_emergency,
)
from app.services.preemption_service import release_signals_for_vehicle
from app.services.websocket_manager import manager

router = APIRouter()

VALID_STATE_TRANSITIONS: dict[str, set[str]] = {
    EmergencyStatus.PENDING.value: {
        EmergencyStatus.DISPATCHED.value,
        EmergencyStatus.CANCELLED.value,
    },
    EmergencyStatus.DISPATCHED.value: {
        EmergencyStatus.IN_TRANSIT.value,
        EmergencyStatus.ARRIVED.value,
        EmergencyStatus.CANCELLED.value,
    },
    EmergencyStatus.IN_TRANSIT.value: {
        EmergencyStatus.ARRIVED.value,
        EmergencyStatus.COMPLETED.value,
        EmergencyStatus.CANCELLED.value,
    },
    EmergencyStatus.ARRIVED.value: {
        EmergencyStatus.IN_TRANSIT.value,
        EmergencyStatus.COMPLETED.value,
        EmergencyStatus.CANCELLED.value,
    },
    EmergencyStatus.COMPLETED.value: set(),
    EmergencyStatus.CANCELLED.value: set(),
}

DRIVER_ALLOWED_TARGETS = {
    EmergencyStatus.IN_TRANSIT.value,
    EmergencyStatus.ARRIVED.value,
    EmergencyStatus.COMPLETED.value,
}


def normalize_status(raw_status: str) -> str:
    """Normalize status string to uppercase canonical enum value."""
    s = raw_status.strip().upper().replace("-", "_")
    if s == "EN_ROUTE":
        return EmergencyStatus.IN_TRANSIT.value
    return s


def _next_numeric_suffix(existing_ids: list[str], prefix: str) -> int:
    max_num = 0
    for val in existing_ids:
        if val and val.startswith(prefix):
            tail = val[len(prefix) :]
            if tail.isdigit():
                max_num = max(max_num, int(tail))
    return max_num + 1


def generate_incident_number(db: Session) -> str:
    """Generate sequential collision-safe incident number INC-YYYY-XXX."""
    year = datetime.now(timezone.utc).year
    prefix = f"INC-{year}-"
    existing = [
        row[0]
        for row in db.query(Emergency.incident_number)
        .filter(Emergency.incident_number.like(f"{prefix}%"))
        .all()
    ]
    seq = _next_numeric_suffix(existing, prefix)
    candidate = f"{prefix}{seq:03d}"
    if db.query(Emergency.id).filter(Emergency.incident_number == candidate).first():
        candidate = f"{prefix}{uuid.uuid4().hex[:6].upper()}"
    return candidate


def generate_emergency_id(db: Session) -> str:
    """Generate collision-safe emergency ID EMG-XX."""
    prefix = "EMG-"
    existing = [
        row[0]
        for row in db.query(Emergency.id).filter(Emergency.id.like(f"{prefix}%")).all()
    ]
    seq = _next_numeric_suffix(existing, prefix)
    candidate = f"{prefix}{seq:02d}"
    if db.query(Emergency.id).filter(Emergency.id == candidate).first():
        candidate = f"{prefix}{uuid.uuid4().hex[:8].upper()}"
    return candidate


@router.post(
    "",
    response_model=EmergencyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Emergency Incident",
    description="Registers a new emergency incident in PENDING status. Restricted to DISPATCHER and ADMIN roles.",
)
async def create_emergency(
    payload: EmergencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
) -> EmergencyResponse:
    """Create a new incident with validated severity/type and resolved hospital coordinates."""
    incident_number = payload.incident_number or generate_incident_number(db)
    emergency_id = payload.id or generate_emergency_id(db)

    if db.query(Emergency.id).filter(Emergency.id == emergency_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Emergency ID '{emergency_id}' already exists",
        )
    if db.query(Emergency.id).filter(Emergency.incident_number == incident_number).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Incident number '{incident_number}' already exists",
        )

    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    dest_name: Optional[str] = None
    hosp_name: Optional[str] = None

    if payload.destination_hospital_id:
        hospital = (
            db.query(Hospital)
            .filter(Hospital.id == payload.destination_hospital_id)
            .first()
        )
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Destination hospital '{payload.destination_hospital_id}' not found",
            )
        dest_lat = hospital.latitude
        dest_lng = hospital.longitude
        dest_name = hospital.name
        hosp_name = hospital.name

    severity_norm = payload.severity.strip().upper()
    if severity_norm not in {s.value for s in EmergencySeverity}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid severity '{payload.severity}'. Must be LOW, MEDIUM, HIGH, or CRITICAL.",
        )

    type_norm = (payload.type or EmergencyType.MEDICAL.value).strip().lower()
    if type_norm not in {t.value for t in EmergencyType}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid emergency type '{payload.type}'. Must be medical, fire, or police.",
        )

    emergency = Emergency(
        id=emergency_id,
        incident_number=incident_number,
        title=payload.title.strip(),
        type=type_norm,
        severity=severity_norm,
        status=EmergencyStatus.PENDING.value,
        journey_leg=JourneyLeg.TO_SCENE.value,
        pickup_latitude=payload.pickup_latitude,
        pickup_longitude=payload.pickup_longitude,
        pickup_address=payload.pickup_address,
        patient_notes=payload.patient_notes,
        destination_hospital_id=payload.destination_hospital_id,
        destination_lat=dest_lat,
        destination_lng=dest_lng,
        destination_name=dest_name,
        hospital_name=hosp_name,
        dispatcher_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(emergency)
    db.flush()

    if emergency.destination_hospital_id:
        upsert_hospital_alert_for_emergency(db, emergency)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="EMERGENCY_CREATED",
            performed_by_id=current_user.id,
            details=f"Created incident {incident_number} ({emergency_id}) type={type_norm} severity={severity_norm}",
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()
    db.refresh(emergency)
    resp = EmergencyResponse.model_validate(emergency)
    await manager.broadcast_to_room(
        "dispatchers",
        "emergency.updated",
        resp.model_dump(mode="json"),
    )
    return resp


@router.get(
    "",
    response_model=list[EmergencyResponse],
    summary="List Emergencies",
    description="Retrieve emergencies. Filter with ?status=active, ?type=, ?search=, ?page=, ?pageSize=.",
)
async def list_emergencies(
    response: Response,
    status_filter: Optional[str] = Query(
        None, alias="status", description="Filter: 'active', 'all', or specific status"
    ),
    type_filter: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, alias="pageSize", ge=1, le=500),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EmergencyResponse]:
    """List emergencies with role-appropriate visibility, filtering, and X-Total-Count header."""
    query = db.query(Emergency)

    role_upper = (current_user.role or "").upper()
    if role_upper == "HOSPITAL" and current_user.hospital_id:
        query = query.filter(Emergency.destination_hospital_id == current_user.hospital_id)
    elif role_upper in {"POLICE", "FIRE"}:
        query = query.filter(Emergency.type == role_upper.lower())
    elif role_upper == "DRIVER":
        driver_vehicles = [
            v[0]
            for v in db.query(Vehicle.id)
            .filter(Vehicle.current_driver_id == current_user.id)
            .all()
        ]
        if driver_vehicles:
            query = query.filter(Emergency.assigned_vehicle_id.in_(driver_vehicles))
        else:
            response.headers["X-Total-Count"] = "0"
            return []

    if status_filter:
        norm = status_filter.strip().lower()
        if norm == "active":
            query = query.filter(Emergency.status.in_(ACTIVE_EMERGENCY_STATUSES))
        elif norm != "all":
            canonical = normalize_status(status_filter)
            query = query.filter(Emergency.status == canonical)

    if type_filter:
        query = query.filter(func.lower(Emergency.type) == type_filter.strip().lower())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Emergency.id.ilike(term),
                Emergency.incident_number.ilike(term),
                Emergency.title.ilike(term),
                Emergency.pickup_address.ilike(term),
            )
        )

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    eff_limit = page_size if page_size is not None else limit
    eff_offset = ((page - 1) * eff_limit) if page is not None else offset

    emergencies = (
        query.order_by(Emergency.created_at.desc())
        .offset(eff_offset)
        .limit(eff_limit)
        .all()
    )
    return [EmergencyResponse.model_validate(e) for e in emergencies]


@router.get(
    "/{id}",
    response_model=EmergencyResponse,
    summary="Get Emergency Details",
    description="Retrieve full details for an emergency incident by its ID.",
)
async def get_emergency(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmergencyResponse:
    """Retrieve an emergency by ID with role-based horizontal visibility checks."""
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident '{id}' not found",
        )

    role_upper = (current_user.role or "").upper()
    if role_upper == "HOSPITAL":
        if not current_user.hospital_id or emergency.destination_hospital_id != current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view an emergency assigned to another hospital facility",
            )
    elif role_upper in {"POLICE", "FIRE"}:
        if (emergency.type or "").lower() != role_upper.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot view a non-{role_upper.lower()} emergency",
            )
    elif role_upper == "DRIVER":
        if not emergency.assigned_vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Drivers can only view incidents assigned to their vehicle",
            )
        assigned_veh = (
            db.query(Vehicle).filter(Vehicle.id == emergency.assigned_vehicle_id).first()
        )
        if not assigned_veh or assigned_veh.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view an emergency assigned to another driver",
            )

    return EmergencyResponse.model_validate(emergency)


@router.patch(
    "/{id}/status",
    response_model=EmergencyResponse,
    summary="Update Incident Status (State Machine)",
    description=(
        "Advance incident through lifecycle. Releases assigned vehicle, clears preempted signals, "
        "and closes hospital alerts upon COMPLETED or CANCELLED."
    ),
)
async def update_emergency_status(
    id: str,
    payload: EmergencyStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "DRIVER", "ADMIN"])),
) -> EmergencyResponse:
    """Validate role permissions and execute state transition for emergency incident."""
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident '{id}' not found",
        )

    role_upper = (current_user.role or "").upper()
    target_status = normalize_status(payload.status)

    if role_upper == "DRIVER":
        if not emergency.assigned_vehicle_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Drivers can only update incidents assigned to their vehicle",
            )
        assigned_veh = (
            db.query(Vehicle).filter(Vehicle.id == emergency.assigned_vehicle_id).first()
        )
        if not assigned_veh or assigned_veh.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot update an emergency whose vehicle is not assigned to you",
            )
        if target_status not in DRIVER_ALLOWED_TARGETS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Drivers are not permitted to set status '{target_status}'",
            )

    current_status = emergency.status.upper()
    allowed = VALID_STATE_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid state transition from '{current_status}' to '{target_status}'. "
                f"Allowed transitions from '{current_status}': {sorted(list(allowed)) or 'None (Terminal state)'}"
            ),
        )

    if payload.patient_notes is not None:
        emergency.patient_notes = payload.patient_notes

    emergency.status = target_status

    if target_status == EmergencyStatus.ARRIVED.value:
        emergency.journey_leg = JourneyLeg.TO_HOSPITAL.value
    elif target_status in {EmergencyStatus.IN_TRANSIT.value} and current_status == EmergencyStatus.ARRIVED.value:
        emergency.journey_leg = JourneyLeg.TO_HOSPITAL.value

    if emergency.destination_hospital_id and target_status in {
        EmergencyStatus.DISPATCHED.value,
        EmergencyStatus.IN_TRANSIT.value,
        EmergencyStatus.ARRIVED.value,
    }:
        upsert_hospital_alert_for_emergency(db, emergency)

    freed_vehicle_id: Optional[str] = None
    released_signal_ids: list[str] = []
    if target_status in {EmergencyStatus.COMPLETED.value, EmergencyStatus.CANCELLED.value}:
        emergency.completed_at = datetime.now(timezone.utc)
        emergency.journey_leg = JourneyLeg.COMPLETED.value
        if emergency.assigned_vehicle_id:
            vehicle = (
                db.query(Vehicle)
                .filter(Vehicle.id == emergency.assigned_vehicle_id)
                .first()
            )
            if vehicle:
                vehicle.status = "AVAILABLE"
                freed_vehicle_id = vehicle.id
            released = await release_signals_for_vehicle(
                db,
                emergency.assigned_vehicle_id,
                reason=f"EMERGENCY_{target_status}",
                performed_by_id=current_user.id,
            )
            released_signal_ids = [s.id for s in released]

        close_hospital_alerts_for_emergency(db, emergency.id, target_status)
        armed_cameras = (
            db.query(Camera).filter(Camera.armed_emergency_id == emergency.id).all()
        )
        for cam in armed_cameras:
            cam.is_armed = False
            cam.armed_emergency_id = None

    detail_msg = (
        f"Incident {emergency.incident_number} status changed from "
        f"{current_status} to {target_status} by {current_user.email}"
    )
    if freed_vehicle_id:
        detail_msg += f". Vehicle {freed_vehicle_id} released to AVAILABLE."
    if released_signal_ids:
        detail_msg += f". Released signals: {', '.join(released_signal_ids)}."

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="EMERGENCY_STATUS_UPDATED",
            performed_by_id=current_user.id,
            details=detail_msg,
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()
    db.refresh(emergency)
    await manager.broadcast_to_room(
        "dispatchers",
        "emergency.status",
        {"id": emergency.id, "status": emergency.status.lower()},
    )
    await manager.broadcast_to_room(
        f"emergency:{emergency.id}",
        "emergency.status",
        {"id": emergency.id, "status": emergency.status.lower()},
    )
    if target_status in {EmergencyStatus.COMPLETED.value, EmergencyStatus.CANCELLED.value}:
        await manager.broadcast_to_room(
            "dispatchers",
            "ev.ended",
            {"emergencyId": emergency.id},
        )
    return EmergencyResponse.model_validate(emergency)
