from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.vehicle import Vehicle, VehicleType, VehicleStatus
from app.models.emergency import Emergency, EmergencyStatus
from app.models.audit import AuditLog
from app.schemas.vehicle import (
    VehicleCreate,
    VehicleAssignRequest,
    VehicleResponse,
    VehicleUpdate,
    VehicleLocationUpdate,
)

router = APIRouter()


@router.get(
    "",
    response_model=List[VehicleResponse],
    summary="List fleet vehicles with status & type filtering"
)
def list_vehicles(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (AVAILABLE, DISPATCHED, BUSY, MAINTENANCE)"),
    type_filter: Optional[str] = Query(None, alias="type", description="Filter by type (AMBULANCE, FIRE_TRUCK, POLICE)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all vehicles in the fleet. Supports filtering by ?status=AVAILABLE or ?type=AMBULANCE."""
    query = db.query(Vehicle)

    if isinstance(status_filter, str) and status_filter.strip():
        query = query.filter(Vehicle.status == status_filter.strip().upper())

    if isinstance(type_filter, str) and type_filter.strip():
        query = query.filter(Vehicle.type == type_filter.strip().upper())

    return query.all()


@router.get(
    "/{id}",
    response_model=VehicleResponse,
    summary="Get vehicle details by ID"
)
def get_vehicle(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve detailed vehicle representation by its ID."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found."
        )
    return vehicle


@router.post(
    "",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new emergency fleet unit (Admin/Dispatcher)"
)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "DISPATCHER"])),
):
    """Admin/Dispatcher registration of a new emergency unit."""
    if db.query(Vehicle).filter(Vehicle.id == payload.id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle with ID '{payload.id}' already exists."
        )

    if db.query(Vehicle).filter(Vehicle.license_plate == payload.license_plate).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle with license plate '{payload.license_plate}' already exists."
        )

    vehicle = Vehicle(
        id=payload.id,
        call_sign=payload.call_sign,
        type=payload.type,
        license_plate=payload.license_plate,
        status=payload.status or VehicleStatus.AVAILABLE,
        current_latitude=payload.current_latitude or 0.0,
        current_longitude=payload.current_longitude or 0.0,
        current_driver_id=payload.current_driver_id,
    )

    db.add(vehicle)

    audit = AuditLog(
        action="VEHICLE_CREATED",
        performed_by_id=current_user.id,
        details=f"Registered vehicle {vehicle.id} ({vehicle.call_sign}, {vehicle.license_plate})",
    )
    db.add(audit)

    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.patch(
    "/{id}/assign",
    response_model=VehicleResponse,
    summary="Assign vehicle to an emergency"
)
def assign_vehicle_to_emergency(
    id: str,
    payload: VehicleAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assigns vehicle to an emergency incident.

    - Updates vehicle status to 'DISPATCHED'.
    - Updates emergency assigned_vehicle_id and status to 'DISPATCHED'.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{id}' not found."
        )

    emergency = db.query(Emergency).filter(Emergency.id == payload.emergency_id).first()
    if not emergency:
        emergency = db.query(Emergency).filter(Emergency.incident_number == payload.emergency_id).first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident '{payload.emergency_id}' not found."
            )

    if vehicle.status != VehicleStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle '{vehicle.id}' is not available (current status: '{vehicle.status.value}')."
        )

    if emergency.status in [EmergencyStatus.COMPLETED, EmergencyStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign vehicle to incident that is '{emergency.status.value}'."
        )

    vehicle.status = VehicleStatus.DISPATCHED
    emergency.assigned_vehicle_id = vehicle.id
    emergency.status = EmergencyStatus.DISPATCHED

    audit = AuditLog(
        action="VEHICLE_ASSIGNED",
        performed_by_id=current_user.id,
        details=(
            f"Assigned vehicle '{vehicle.id}' ({vehicle.call_sign}) to emergency "
            f"'{emergency.incident_number}' ({emergency.title})."
        ),
    )
    db.add(audit)

    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.patch(
    "/{id}/location",
    response_model=VehicleResponse,
    summary="Update vehicle GPS coordinates"
)
def update_vehicle_location(
    id: str,
    payload: VehicleLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Telemetry endpoint updating current GPS coordinates of an active unit."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle '{id}' not found.")

    vehicle.current_latitude = payload.latitude
    vehicle.current_longitude = payload.longitude

    db.commit()
    db.refresh(vehicle)
    return vehicle
