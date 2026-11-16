"""
AETIS Central Engine — Vehicles Router
Endpoints for fleet management, vehicle registration, and emergency unit assignment.
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
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.vehicle import (
    VehicleAssignRequest,
    VehicleCreate,
    VehicleResponse,
)

router = APIRouter()

VALID_VEHICLE_TYPES = {"AMBULANCE", "FIRE_TRUCK", "POLICE"}
VALID_VEHICLE_STATUSES = {"AVAILABLE", "DISPATCHED", "BUSY", "MAINTENANCE"}


def generate_vehicle_id(db: Session, v_type: str) -> str:
    """Generate vehicle ID prefix by type e.g., AMB-01, FIRE-01, POL-01."""
    prefixes = {
        "AMBULANCE": "AMB",
        "FIRE_TRUCK": "FIRE",
        "POLICE": "POL",
    }
    pfx = prefixes.get(v_type.upper(), "VEH")
    count = db.query(Vehicle).filter(Vehicle.type == v_type.upper()).count() + 1
    candidate = f"{pfx}-{count:02d}"
    while db.query(Vehicle).filter(Vehicle.id == candidate).first():
        count += 1
        candidate = f"{pfx}-{count:02d}"
    return candidate


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[VehicleResponse],
    summary="List Fleet Vehicles",
    description="Retrieve all fleet vehicles with optional filtering by status (AVAILABLE, DISPATCHED, etc.) and type (AMBULANCE, FIRE_TRUCK, POLICE).",
)
async def list_vehicles(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: e.g. AVAILABLE, DISPATCHED, BUSY, MAINTENANCE"),
    type_filter: Optional[str] = Query(None, alias="type", description="Filter by type: e.g. AMBULANCE, FIRE_TRUCK, POLICE"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VehicleResponse]:
    """List fleet vehicles with optional status and type filters."""
    query = db.query(Vehicle)

    if status_filter:
        query = query.filter(Vehicle.status == status_filter.strip().upper())

    if type_filter:
        canonical_type = type_filter.strip().upper().replace(" ", "_")
        query = query.filter(Vehicle.type == canonical_type)

    vehicles = query.order_by(Vehicle.id.asc()).all()
    return [VehicleResponse.model_validate(v) for v in vehicles]


@router.post(
    "",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Fleet Vehicle (Admin)",
    description="Registers a new emergency unit. Restricted to administrators.",
)
async def register_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
) -> VehicleResponse:
    """Register a new vehicle into the fleet."""
    v_type = payload.type.strip().upper().replace(" ", "_")
    if v_type not in VALID_VEHICLE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid vehicle type '{payload.type}'. Must be AMBULANCE, FIRE_TRUCK, or POLICE.",
        )

    vehicle_id = payload.id.strip().upper() if payload.id else generate_vehicle_id(db, v_type)

    # Check for duplicate ID
    existing = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle with ID '{vehicle_id}' already exists",
        )

    # Validate optional driver
    if payload.current_driver_id:
        driver = db.query(User).filter(User.id == payload.current_driver_id).first()
        if not driver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Driver user '{payload.current_driver_id}' not found",
            )
        if driver.role.upper() != "DRIVER":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User '{payload.current_driver_id}' does not have the DRIVER role",
            )

    status_val = payload.status.strip().upper() if payload.status else "AVAILABLE"
    if status_val not in VALID_VEHICLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid vehicle status '{payload.status}'. Must be AVAILABLE, DISPATCHED, BUSY, or MAINTENANCE.",
        )

    vehicle = Vehicle(
        id=vehicle_id,
        call_sign=payload.call_sign.strip(),
        type=v_type,
        license_plate=payload.license_plate.strip(),
        status=status_val,
        current_latitude=payload.current_latitude,
        current_longitude=payload.current_longitude,
        current_driver_id=payload.current_driver_id,
    )
    db.add(vehicle)

    # Record Audit Log
    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="VEHICLE_REGISTERED",
        performed_by_id=current_user.id,
        details=f"Registered vehicle {vehicle_id} ({payload.call_sign}) of type {v_type}",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()
    db.refresh(vehicle)
    return VehicleResponse.model_validate(vehicle)


@router.patch(
    "/{id}/assign",
    response_model=VehicleResponse,
    summary="Assign Vehicle to Emergency Incident",
    description="Assigns an available vehicle to an emergency. Updates vehicle status to DISPATCHED and emergency status to DISPATCHED.",
)
async def assign_vehicle(
    id: str,
    payload: VehicleAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VehicleResponse:
    """Assign vehicle to emergency incident and advance both to DISPATCHED."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found",
        )

    if vehicle.status.upper() != "AVAILABLE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle '{id}' is currently '{vehicle.status}' and cannot be assigned. Only AVAILABLE vehicles can be dispatched.",
        )

    emergency = db.query(Emergency).filter(Emergency.id == payload.emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident '{payload.emergency_id}' not found",
        )

    if emergency.status.upper() in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign vehicle to incident '{emergency.incident_number}' because it is already {emergency.status}.",
        )

    # If the emergency was already assigned another vehicle, release it
    if emergency.assigned_vehicle_id and emergency.assigned_vehicle_id != vehicle.id:
        prev_vehicle = db.query(Vehicle).filter(Vehicle.id == emergency.assigned_vehicle_id).first()
        if prev_vehicle:
            prev_vehicle.status = "AVAILABLE"

    # Update state
    vehicle.status = "DISPATCHED"
    emergency.assigned_vehicle_id = vehicle.id
    emergency.status = "DISPATCHED"

    # Record Audit Log
    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="VEHICLE_ASSIGNED",
        performed_by_id=current_user.id,
        details=f"Assigned vehicle {vehicle.id} ({vehicle.call_sign}) to emergency {emergency.incident_number}",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()
    db.refresh(vehicle)
    return VehicleResponse.model_validate(vehicle)
