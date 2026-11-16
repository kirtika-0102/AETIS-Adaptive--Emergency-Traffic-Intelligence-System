"""
AETIS Central Engine — Emergencies Router
Endpoints for managing emergency incidents and state machine transitions.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.emergency import (
    EmergencyCreate,
    EmergencyResponse,
    EmergencyStatusUpdate,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Emergency Lifecycle State Machine Definition
# Valid forward transitions:
# PENDING -> DISPATCHED -> IN_TRANSIT -> ARRIVED -> COMPLETED
# Any non-terminal state may also transition to CANCELLED.
# ---------------------------------------------------------------------------
VALID_STATE_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"DISPATCHED", "CANCELLED"},
    "DISPATCHED": {"IN_TRANSIT", "ARRIVED", "CANCELLED"},
    "IN_TRANSIT": {"ARRIVED", "COMPLETED", "CANCELLED"},
    "ARRIVED": {"COMPLETED", "CANCELLED"},
    "COMPLETED": set(),
    "CANCELLED": set(),
}


def normalize_status(raw_status: str) -> str:
    """Normalize status string to uppercase canonical enum value."""
    s = raw_status.strip().upper().replace("-", "_")
    if s == "EN_ROUTE":
        return "IN_TRANSIT"
    return s


def generate_incident_number(db: Session) -> str:
    """Generate sequential incident number in the format INC-YYYY-XXX."""
    year = datetime.now(timezone.utc).year
    prefix = f"INC-{year}-"
    count = db.query(Emergency).filter(Emergency.incident_number.like(f"{prefix}%")).count() + 1
    candidate = f"{prefix}{count:03d}"
    while db.query(Emergency).filter(Emergency.incident_number == candidate).first():
        count += 1
        candidate = f"{prefix}{count:03d}"
    return candidate


def generate_emergency_id(db: Session) -> str:
    """Generate human-readable emergency ID in the format EMG-XX."""
    count = db.query(Emergency).count() + 1
    candidate = f"EMG-{count:02d}"
    while db.query(Emergency).filter(Emergency.id == candidate).first():
        count += 1
        candidate = f"EMG-{count:02d}"
    return candidate


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=EmergencyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Emergency Incident",
    description="Registers a new emergency incident in PENDING status. Auto-assigns incident_number and records dispatcher.",
)
async def create_emergency(
    payload: EmergencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmergencyResponse:
    """Create a new incident with auto-generated incident number and PENDING status."""
    incident_number = payload.incident_number or generate_incident_number(db)
    emergency_id = payload.id or generate_emergency_id(db)

    # Validate destination hospital if supplied
    if payload.destination_hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == payload.destination_hospital_id).first()
        if not hospital:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Destination hospital '{payload.destination_hospital_id}' not found",
            )

    severity_norm = payload.severity.strip().upper()
    if severity_norm not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid severity '{payload.severity}'. Must be LOW, MEDIUM, HIGH, or CRITICAL.",
        )

    emergency = Emergency(
        id=emergency_id,
        incident_number=incident_number,
        title=payload.title.strip(),
        severity=severity_norm,
        status="PENDING",
        pickup_latitude=payload.pickup_latitude,
        pickup_longitude=payload.pickup_longitude,
        pickup_address=payload.pickup_address,
        patient_notes=payload.patient_notes,
        destination_hospital_id=payload.destination_hospital_id,
        dispatcher_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(emergency)

    # Record Audit Log
    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="EMERGENCY_CREATED",
        performed_by_id=current_user.id,
        details=f"Created incident {incident_number} ({emergency_id}) with severity {severity_norm}",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()
    db.refresh(emergency)
    return EmergencyResponse.model_validate(emergency)


@router.get(
    "",
    response_model=list[EmergencyResponse],
    summary="List Emergencies",
    description="Retrieve emergencies. Filter with ?status=active (PENDING, DISPATCHED, IN_TRANSIT, ARRIVED) or ?status=all.",
)
async def list_emergencies(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter: 'active', 'all', or specific status like 'PENDING'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EmergencyResponse]:
    """List emergencies with optional active / all / specific status filtering."""
    query = db.query(Emergency)

    if status_filter:
        norm = status_filter.strip().lower()
        if norm == "active":
            query = query.filter(Emergency.status.in_(["PENDING", "DISPATCHED", "IN_TRANSIT", "ARRIVED"]))
        elif norm != "all":
            canonical = normalize_status(status_filter)
            query = query.filter(Emergency.status == canonical)

    emergencies = query.order_by(Emergency.created_at.desc()).all()
    return [EmergencyResponse.model_validate(e) for e in emergencies]


@router.get(
    "/{id}",
    response_model=EmergencyResponse,
    summary="Get Emergency Details",
    description="Retrieve full details for an emergency incident by its ID (e.g., EMG-01).",
)
async def get_emergency(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmergencyResponse:
    """Retrieve an emergency by ID."""
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident '{id}' not found",
        )
    return EmergencyResponse.model_validate(emergency)


@router.patch(
    "/{id}/status",
    response_model=EmergencyResponse,
    summary="Update Incident Status (State Machine)",
    description="Advance incident through lifecycle: PENDING -> DISPATCHED -> IN_TRANSIT -> ARRIVED -> COMPLETED. Auto-frees assigned vehicle on COMPLETED or CANCELLED.",
)
async def update_emergency_status(
    id: str,
    payload: EmergencyStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmergencyResponse:
    """Validate and execute state transition for emergency incident."""
    emergency = db.query(Emergency).filter(Emergency.id == id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident '{id}' not found",
        )

    current_status = emergency.status.upper()
    target_status = normalize_status(payload.status)

    # Validate state transition
    allowed = VALID_STATE_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid state transition from '{current_status}' to '{target_status}'. "
                f"Allowed transitions from '{current_status}': {sorted(list(allowed)) or 'None (Terminal state)'}"
            ),
        )

    # Update patient notes if provided
    if payload.patient_notes is not None:
        emergency.patient_notes = payload.patient_notes

    emergency.status = target_status

    # Terminal state logic: COMPLETED or CANCELLED
    freed_vehicle_id: Optional[str] = None
    if target_status in {"COMPLETED", "CANCELLED"}:
        emergency.completed_at = datetime.now(timezone.utc)
        if emergency.assigned_vehicle_id:
            vehicle = db.query(Vehicle).filter(Vehicle.id == emergency.assigned_vehicle_id).first()
            if vehicle:
                vehicle.status = "AVAILABLE"
                freed_vehicle_id = vehicle.id

    # Record Audit Log
    detail_msg = f"Incident {emergency.incident_number} status changed from {current_status} to {target_status} by {current_user.email}"
    if freed_vehicle_id:
        detail_msg += f". Vehicle {freed_vehicle_id} released to AVAILABLE."

    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="EMERGENCY_STATUS_UPDATED",
        performed_by_id=current_user.id,
        details=detail_msg,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()
    db.refresh(emergency)
    return EmergencyResponse.model_validate(emergency)
