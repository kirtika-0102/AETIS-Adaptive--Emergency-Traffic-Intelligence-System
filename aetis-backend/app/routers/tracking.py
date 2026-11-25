import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.emergency import Emergency
from app.models.enums import EN_ROUTE_EMERGENCY_STATUSES
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.telemetry import LocationUpdatePayload
from app.services.telemetry_service import process_location_update
from app.utils.geo import haversine_distance

logger = logging.getLogger("aetis.tracking")

router = APIRouter(prefix="/api/v1/tracking", tags=["Vehicle Tracking & Telemetry"])


def _build_tracked_ev(emg: Emergency, veh: Vehicle) -> Optional[Dict[str, Any]]:
    if veh.current_latitude is None or veh.current_longitude is None:
        return None

    # Use active leg destination: scene during TO_SCENE, hospital during TO_HOSPITAL
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    dest_name: str = emg.destination_name or emg.hospital_name or emg.pickup_address or "Destination"

    if (emg.journey_leg or "TO_SCENE").upper() == "TO_HOSPITAL" and emg.destination_lat is not None and emg.destination_lng is not None:
        dest_lat = emg.destination_lat
        dest_lng = emg.destination_lng
        dest_name = emg.hospital_name or emg.destination_name or "Hospital"
    elif emg.pickup_latitude or emg.pickup_longitude:
        dest_lat = emg.pickup_latitude
        dest_lng = emg.pickup_longitude
        dest_name = emg.pickup_address or "Incident Scene"
    elif emg.destination_lat is not None and emg.destination_lng is not None:
        dest_lat = emg.destination_lat
        dest_lng = emg.destination_lng

    eta_seconds: Optional[int] = None
    route: List[Dict[str, float]] = [
        {"lat": veh.current_latitude, "lng": veh.current_longitude}
    ]
    if dest_lat is not None and dest_lng is not None:
        route.append({"lat": dest_lat, "lng": dest_lng})
        dist_m = haversine_distance(veh.current_latitude, veh.current_longitude, dest_lat, dest_lng)
        speed_mps = max((veh.speed or 0.0) * (1000.0 / 3600.0), 5.56)
        eta_seconds = round(dist_m / speed_mps)

    v_type_raw = (veh.type or "AMBULANCE").lower()
    v_type = "fire" if "fire" in v_type_raw else "police" if "police" in v_type_raw else "ambulance"

    return {
        "emergencyId": emg.id,
        "vehicleId": veh.id,
        "vehicleLabel": veh.label or veh.call_sign or veh.id,
        "vehicleType": v_type,
        "location": {"lat": veh.current_latitude, "lng": veh.current_longitude},
        "speedKmh": veh.speed,
        "etaSeconds": eta_seconds,
        "destinationName": dest_name,
        "route": route,
        "lastUpdateAt": veh.last_update_at.isoformat() if veh.last_update_at else None,
    }


@router.get(
    "/active",
    summary="List active tracked emergency vehicles",
)
def get_active_tracked_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Return active dispatched/en-route vehicles scoped by caller role and facility."""
    role_upper = (current_user.role or "").upper()
    query = db.query(Emergency).filter(
        Emergency.status.in_(EN_ROUTE_EMERGENCY_STATUSES),
        Emergency.assigned_vehicle_id.isnot(None),
    )

    if role_upper == "HOSPITAL":
        if not current_user.hospital_id:
            return []
        query = query.filter(Emergency.destination_hospital_id == current_user.hospital_id)
    elif role_upper == "DRIVER":
        drv_vehicle_ids = [
            v[0]
            for v in db.query(Vehicle.id)
            .filter(Vehicle.current_driver_id == current_user.id)
            .all()
        ]
        if not drv_vehicle_ids:
            return []
        query = query.filter(Emergency.assigned_vehicle_id.in_(drv_vehicle_ids))

    emergencies = query.all()
    items: List[Dict[str, Any]] = []
    for emg in emergencies:
        veh = emg.assigned_vehicle
        if not veh:
            continue
        tracked = _build_tracked_ev(emg, veh)
        if tracked:
            items.append(tracked)
    return items


@router.get(
    "/emergency/{emergency_id}",
    summary="Get live tracked vehicle state for a specific emergency",
)
def get_tracked_emergency(
    emergency_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return tracked vehicle snapshot for an active emergency (role- and facility-scoped)."""
    emg = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active tracking session for emergency '{emergency_id}'",
        )

    role_upper = (current_user.role or "").upper()
    if role_upper == "HOSPITAL":
        if not current_user.hospital_id or emg.destination_hospital_id != current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view tracking for an emergency assigned to another hospital",
            )
    elif role_upper == "DRIVER":
        if not emg.assigned_vehicle or emg.assigned_vehicle.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view tracking for an emergency not assigned to your vehicle",
            )

    if emg.status not in EN_ROUTE_EMERGENCY_STATUSES or not emg.assigned_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active tracking session for emergency '{emergency_id}'",
        )
    tracked = _build_tracked_ev(emg, emg.assigned_vehicle)
    if not tracked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned vehicle has not reported GPS coordinates yet",
        )
    return tracked


@router.post(
    "/update-location",
    summary="HTTP REST fallback for GPS telemetry ingestion",
    status_code=status.HTTP_200_OK,
)
async def update_location_http(
    payload: LocationUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DRIVER", "DISPATCHER", "ADMIN"])),
) -> Dict[str, Any]:
    """Accept GPS breadcrumbs via authenticated HTTP POST and broadcast live updates."""
    if (current_user.role or "").upper() == "DRIVER":
        veh = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
        if not veh:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle '{payload.vehicle_id}' is not registered in fleet",
            )
        if veh.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Drivers can only submit GPS telemetry for a vehicle assigned to them",
            )

    try:
        return await process_location_update(payload, db)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unhandled error while processing telemetry update for vehicle %s", payload.vehicle_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while processing telemetry update",
        )


@router.get(
    "/vehicle/{vehicle_id}",
    summary="Get current GPS position and status for a vehicle",
)
def get_vehicle_location(
    vehicle_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve latest telemetry coordinates and operational status for a vehicle."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found",
        )

    role_upper = (current_user.role or "").upper()
    if role_upper == "DRIVER" and vehicle.current_driver_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Drivers can only inspect their own assigned vehicle",
        )
    if role_upper == "HOSPITAL":
        if not current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hospital account is not linked to a facility",
            )
        inbound = (
            db.query(Emergency.id)
            .filter(
                Emergency.assigned_vehicle_id == vehicle.id,
                Emergency.destination_hospital_id == current_user.hospital_id,
                Emergency.status.in_(EN_ROUTE_EMERGENCY_STATUSES),
            )
            .first()
        )
        if not inbound:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vehicle is not currently inbound to your hospital facility",
            )

    return {
        "vehicle_id": vehicle.id,
        "label": vehicle.label or vehicle.call_sign or vehicle.id,
        "type": vehicle.type,
        "status": vehicle.status,
        "latitude": vehicle.current_latitude,
        "longitude": vehicle.current_longitude,
        "speed": vehicle.speed,
        "heading": vehicle.heading,
        "last_update_at": vehicle.last_update_at.isoformat() if vehicle.last_update_at else None,
    }
