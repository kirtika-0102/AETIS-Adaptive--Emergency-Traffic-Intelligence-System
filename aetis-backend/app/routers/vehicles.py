"""
AETIS Central Engine — Vehicles Router
Endpoints for fleet management, vehicle registration, and RBAC-protected unit assignment.
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
from app.models.enums import EmergencyStatus, VehicleStatus, VehicleType
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.vehicle import (
    VehicleAssignRequest,
    VehicleCreate,
    VehicleResponse,
    VehicleStatusUpdate,
    VehicleUpdate,
)
from app.services.hospital_service import upsert_hospital_alert_for_emergency
from app.services.websocket_manager import manager

router = APIRouter()

VALID_VEHICLE_TYPES = {t.value for t in VehicleType}
VALID_VEHICLE_STATUSES = {s.value for s in VehicleStatus}


def generate_vehicle_id(db: Session, v_type: str) -> str:
    """Generate collision-safe vehicle ID prefix e.g., AMB-01, FIRE-01, POL-01."""
    prefixes = {
        VehicleType.AMBULANCE.value: "AMB",
        VehicleType.FIRE_TRUCK.value: "FIRE",
        VehicleType.POLICE.value: "POL",
    }
    pfx = prefixes.get(v_type.upper(), "VEH")
    existing = [
        row[0]
        for row in db.query(Vehicle.id).filter(Vehicle.id.like(f"{pfx}-%")).all()
    ]
    max_num = 0
    for val in existing:
        tail = val[len(pfx) + 1 :]
        if tail.isdigit():
            max_num = max(max_num, int(tail))
    candidate = f"{pfx}-{max_num + 1:02d}"
    if db.query(Vehicle.id).filter(Vehicle.id == candidate).first():
        candidate = f"{pfx}-{uuid.uuid4().hex[:6].upper()}"
    return candidate


@router.get(
    "",
    response_model=list[VehicleResponse],
    summary="List Fleet Vehicles",
    description="Retrieve fleet vehicles with optional status/type filtering and pagination.",
)
async def list_vehicles(
    status_filter: Optional[str] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
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

    vehicles = query.order_by(Vehicle.id.asc()).offset(offset).limit(limit).all()
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

    existing = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle with ID '{vehicle_id}' already exists",
        )

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

    status_val = payload.status.strip().upper() if payload.status else VehicleStatus.AVAILABLE.value
    if status_val not in VALID_VEHICLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid vehicle status '{payload.status}'. Must be one of: "
                f"{', '.join(sorted(VALID_VEHICLE_STATUSES))}."
            ),
        )

    vehicle = Vehicle(
        id=vehicle_id,
        call_sign=payload.call_sign.strip() if payload.call_sign else vehicle_id,
        label=payload.call_sign.strip() if payload.call_sign else vehicle_id,
        type=v_type,
        license_plate=payload.license_plate.strip() if payload.license_plate else None,
        status=status_val,
        current_latitude=payload.current_latitude,
        current_longitude=payload.current_longitude,
        current_driver_id=payload.current_driver_id,
    )
    db.add(vehicle)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="VEHICLE_REGISTERED",
            performed_by_id=current_user.id,
            details=f"Registered vehicle {vehicle_id} ({vehicle.call_sign}) of type {v_type}",
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()
    db.refresh(vehicle)
    await manager.broadcast_to_room(
        "dispatchers",
        "vehicle.status",
        {"id": vehicle.id, "status": vehicle.status.lower()},
    )
    return VehicleResponse.model_validate(vehicle)


@router.patch(
    "/{id}/assign",
    response_model=VehicleResponse,
    summary="Assign Vehicle to Emergency Incident",
    description="Assigns an available vehicle to an emergency. Restricted to DISPATCHER and ADMIN.",
)
async def assign_vehicle(
    id: str,
    payload: VehicleAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
) -> VehicleResponse:
    """Assign vehicle to emergency incident, advance to DISPATCHED, and create hospital alert."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found",
        )

    if (vehicle.status or "").upper() != VehicleStatus.AVAILABLE.value:
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

    if (emergency.status or "").upper() in {
        EmergencyStatus.COMPLETED.value,
        EmergencyStatus.CANCELLED.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign vehicle to incident '{emergency.incident_number}' because it is already {emergency.status}.",
        )

    if emergency.assigned_vehicle_id and emergency.assigned_vehicle_id != vehicle.id:
        prev_vehicle = (
            db.query(Vehicle)
            .filter(Vehicle.id == emergency.assigned_vehicle_id)
            .first()
        )
        if prev_vehicle:
            prev_vehicle.status = VehicleStatus.AVAILABLE.value

    vehicle.status = VehicleStatus.DISPATCHED.value
    emergency.assigned_vehicle_id = vehicle.id
    emergency.status = EmergencyStatus.DISPATCHED.value

    if emergency.destination_hospital_id:
        upsert_hospital_alert_for_emergency(db, emergency)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="VEHICLE_ASSIGNED",
            performed_by_id=current_user.id,
            details=f"Assigned vehicle {vehicle.id} ({vehicle.call_sign}) to emergency {emergency.incident_number}",
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()
    db.refresh(vehicle)
    await manager.broadcast_to_room(
        "dispatchers",
        "vehicle.status",
        {"id": vehicle.id, "status": vehicle.status.lower()},
    )
    return VehicleResponse.model_validate(vehicle)


@router.patch(
    "/{id}/status",
    response_model=VehicleResponse,
    summary="Update Vehicle Status",
    description="Update duty status for a vehicle. Drivers can only update their own assigned vehicle.",
)
async def update_vehicle_status(
    id: str,
    payload: VehicleStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DRIVER", "DISPATCHER", "ADMIN"])),
) -> VehicleResponse:
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found",
        )

    if (current_user.role or "").upper() == "DRIVER":
        if vehicle.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Drivers can only update status for their own assigned vehicle",
            )

    raw_s = payload.status.strip().upper()
    if raw_s == "OFFLINE":
        raw_s = VehicleStatus.MAINTENANCE.value
    if raw_s not in VALID_VEHICLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid vehicle status '{payload.status}'",
        )

    vehicle.status = raw_s
    db.commit()
    db.refresh(vehicle)
    await manager.broadcast_to_room(
        "dispatchers",
        "vehicle.status",
        {"id": vehicle.id, "status": vehicle.status.lower()},
    )
    return VehicleResponse.model_validate(vehicle)


@router.patch(
    "/{id}",
    response_model=VehicleResponse,
    summary="Admin Update Vehicle (Driver / Retire)",
    description="Update assigned driver or retired status (Admin only).",
)
async def admin_update_vehicle(
    id: str,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
) -> VehicleResponse:
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found",
        )

    driver_val = payload.driverId if "driverId" in payload.model_fields_set else payload.current_driver_id
    if "driverId" in payload.model_fields_set or "current_driver_id" in payload.model_fields_set:
        if driver_val:
            drv = db.query(User).filter(User.id == driver_val).first()
            if not drv or (drv.role or "").upper() != "DRIVER":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Specified driver account not found or does not have DRIVER role",
                )
            vehicle.current_driver_id = drv.id
        else:
            vehicle.current_driver_id = None

    if payload.retired is not None:
        if payload.retired:
            vehicle.status = VehicleStatus.MAINTENANCE.value
        elif (vehicle.status or "").upper() == VehicleStatus.MAINTENANCE.value:
            vehicle.status = VehicleStatus.AVAILABLE.value

    db.commit()
    db.refresh(vehicle)
    return VehicleResponse.model_validate(vehicle)
