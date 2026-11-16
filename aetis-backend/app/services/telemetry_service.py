import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.models.emergency import Emergency
from app.models.vehicle import Vehicle
from app.schemas.telemetry import LocationUpdatePayload
from app.services.websocket_manager import manager


def calculate_haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on the earth in meters.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


async def process_location_update(
    payload: LocationUpdatePayload,
    db: Session,
) -> Dict[str, Any]:
    """
    Processes high-frequency GPS telemetry:
    1. Updates vehicle's current_latitude, current_longitude, speed, heading, and timestamp in DB.
    2. Broadcasts 'tracking:location_update' to emergency:{emergency_id} room.
    3. Broadcasts 'tracking:location_update' to dispatchers room.
    4. If associated emergency has a destination hospital, broadcasts ETA to hospital:{hospital_id} room.
    """
    # 1. Update vehicle coordinates in database
    vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
    update_time = (
        datetime.fromtimestamp(payload.timestamp, tz=timezone.utc)
        if payload.timestamp
        else datetime.now(timezone.utc)
    )

    if not vehicle:
        # Create vehicle if not yet registered in DB
        vehicle = Vehicle(
            id=payload.vehicle_id,
            label=f"Vehicle {payload.vehicle_id}",
            current_latitude=payload.latitude,
            current_longitude=payload.longitude,
            speed=payload.speed,
            heading=payload.heading,
            status="en_route",
            last_update_at=update_time,
        )
        db.add(vehicle)
    else:
        vehicle.current_latitude = payload.latitude
        vehicle.current_longitude = payload.longitude
        vehicle.speed = payload.speed
        vehicle.heading = payload.heading
        vehicle.last_update_at = update_time
        if vehicle.status == "available":
            vehicle.status = "en_route"

    db.commit()
    db.refresh(vehicle)

    # 2 & 3. Broadcast to emergency room and dispatchers room
    telemetry_data = payload.dict()
    await manager.broadcast_to_room(
        f"emergency:{payload.emergency_id}",
        "tracking:location_update",
        telemetry_data,
    )
    await manager.broadcast_to_room(
        "dispatchers",
        "tracking:location_update",
        telemetry_data,
    )

    # 4. Check for destination hospital
    emergency = db.query(Emergency).filter(Emergency.id == payload.emergency_id).first()
    dest_hospital_id = payload.hospital_id or (emergency.hospital_id if emergency else None)

    eta_seconds: Optional[float] = payload.eta_seconds

    if dest_hospital_id:
        if eta_seconds is None and emergency and emergency.destination_lat and emergency.destination_lng:
            dist_meters = calculate_haversine_distance_meters(
                payload.latitude,
                payload.longitude,
                emergency.destination_lat,
                emergency.destination_lng,
            )
            # Estimate speed: minimum 20 km/h (5.56 m/s) in city traffic
            speed_mps = max(payload.speed * (1000.0 / 3600.0), 5.56)
            eta_seconds = round(dist_meters / speed_mps)
        elif eta_seconds is None:
            # Default placeholder ETA if coordinates unknown
            eta_seconds = 300.0

        eta_payload = {
            "emergency_id": payload.emergency_id,
            "vehicle_id": payload.vehicle_id,
            "hospital_id": dest_hospital_id,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "speed": payload.speed,
            "heading": payload.heading,
            "eta_seconds": eta_seconds,
            "timestamp": payload.timestamp,
        }

        # Broadcast to hospital specific room
        await manager.broadcast_to_room(
            f"hospital:{dest_hospital_id}",
            "tracking:eta_update",
            eta_payload,
        )
        # Also send inbound.eta for frontend event compatibility
        await manager.broadcast_to_room(
            f"hospital:{dest_hospital_id}",
            "inbound.eta",
            eta_payload,
        )

    return {
        "status": "success",
        "vehicle_id": vehicle.id,
        "emergency_id": payload.emergency_id,
        "current_latitude": vehicle.current_latitude,
        "current_longitude": vehicle.current_longitude,
        "speed": vehicle.speed,
        "heading": vehicle.heading,
        "destination_hospital_id": dest_hospital_id,
        "eta_seconds": eta_seconds,
    }
