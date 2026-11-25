"""
AETIS Central Engine — Real-Time GPS Telemetry Ingestion Service
Validates registered vehicles, updates DB coordinates with canonical statuses,
persists dynamic hospital ETAs, and broadcasts location/ETA events.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.emergency import Emergency
from app.models.enums import EN_ROUTE_EMERGENCY_STATUSES, VehicleStatus
from app.models.vehicle import Vehicle
from app.schemas.telemetry import LocationUpdatePayload
from app.services.hospital_service import update_hospital_alert_eta
from app.services.preemption_service import (
    calculate_queue_dissipation,
    expire_due_preemptions,
    trigger_green_wave,
)
from app.services.routing_service import get_signals_along_corridor
from app.services.websocket_manager import manager
from app.utils.geo import haversine_distance


async def process_location_update(
    payload: LocationUpdatePayload,
    db: Session,
) -> Dict[str, Any]:
    """
    Processes high-frequency GPS telemetry for registered vehicles:
    1. Rejects unregistered vehicle IDs (prevents phantom fleet rows).
    2. Ignores out-of-order stale telemetry older than vehicle.last_update_at.
    3. Updates vehicle coordinates, speed, heading, and canonical status in DB.
    4. Broadcasts 'tracking:location_update' to emergency & dispatchers rooms.
    5. Computes real ETA (when destination coordinates exist) & updates HospitalAlert.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
    if not vehicle:
        raise ValueError(f"Vehicle '{payload.vehicle_id}' is not registered in fleet")

    update_time = (
        datetime.fromtimestamp(payload.timestamp, tz=timezone.utc)
        if payload.timestamp
        else datetime.now(timezone.utc)
    )

    if vehicle.last_update_at is not None:
        last_ts = vehicle.last_update_at
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        if update_time < last_ts:
            return {
                "status": "ignored_stale",
                "vehicle_id": vehicle.id,
                "emergency_id": payload.emergency_id,
                "current_latitude": vehicle.current_latitude,
                "current_longitude": vehicle.current_longitude,
                "speed": vehicle.speed,
                "heading": vehicle.heading,
                "destination_hospital_id": None,
                "eta_seconds": None,
            }

    vehicle.current_latitude = payload.latitude
    vehicle.current_longitude = payload.longitude
    vehicle.speed = payload.speed
    vehicle.heading = payload.heading
    vehicle.last_update_at = update_time
    if (vehicle.status or "").strip().upper() == VehicleStatus.AVAILABLE.value:
        vehicle.status = VehicleStatus.EN_ROUTE.value

    db.commit()
    db.refresh(vehicle)

    telemetry_data = payload.model_dump()
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

    emergency = db.query(Emergency).filter(Emergency.id == payload.emergency_id).first()
    dest_hospital_id = payload.hospital_id or (emergency.hospital_id if emergency else None)

    eta_seconds: Optional[float] = payload.eta_seconds
    if dest_hospital_id:
        if eta_seconds is None and emergency and emergency.destination_lat is not None and emergency.destination_lng is not None:
            dist_meters = haversine_distance(
                payload.latitude,
                payload.longitude,
                emergency.destination_lat,
                emergency.destination_lng,
            )
            speed_mps = max(payload.speed * (1000.0 / 3600.0), 5.56)
            eta_seconds = round(dist_meters / speed_mps)

        if eta_seconds is not None:
            update_hospital_alert_eta(db, payload.emergency_id, eta_seconds)
            db.commit()

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

        await manager.broadcast_to_room(
            f"hospital:{dest_hospital_id}",
            "tracking:eta_update",
            eta_payload,
        )
        await manager.broadcast_to_room(
            f"hospital:{dest_hospital_id}",
            "inbound.eta",
            eta_payload,
        )

    preempted_signal_ids: list[str] = []
    if emergency and (emergency.status or "").upper() in EN_ROUTE_EMERGENCY_STATUSES:
        await expire_due_preemptions(db)
        leg = (emergency.journey_leg or "TO_SCENE").upper()
        if leg == "TO_HOSPITAL" and emergency.destination_lat is not None and emergency.destination_lng is not None:
            corr_dest_lat, corr_dest_lng = emergency.destination_lat, emergency.destination_lng
        elif emergency.pickup_latitude or emergency.pickup_longitude:
            corr_dest_lat, corr_dest_lng = emergency.pickup_latitude, emergency.pickup_longitude
        elif emergency.destination_lat is not None and emergency.destination_lng is not None:
            corr_dest_lat, corr_dest_lng = emergency.destination_lat, emergency.destination_lng
        else:
            corr_dest_lat, corr_dest_lng = None, None

        if corr_dest_lat is not None and corr_dest_lng is not None:
            corridor_signals = get_signals_along_corridor(
                db=db,
                origin_lat=payload.latitude,
                origin_lng=payload.longitude,
                dest_lat=corr_dest_lat,
                dest_lng=corr_dest_lng,
                corridor_width_meters=80.0,
                heading=payload.heading,
            )
            speed_mps = payload.speed * (1000.0 / 3600.0)
            for sig in corridor_signals:
                if sig.is_preempted:
                    continue
                dist = haversine_distance(payload.latitude, payload.longitude, sig.latitude, sig.longitude)
                timing = calculate_queue_dissipation(dist, speed_mps, queue_count=5)
                if timing["should_trigger_preemption"]:
                    await trigger_green_wave(
                        db=db,
                        signal_id=sig.id,
                        vehicle_id=vehicle.id,
                        hold_duration_seconds=45,
                        source="TELEMETRY_AUTO",
                    )
                    preempted_signal_ids.append(sig.id)
                    break

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
        "preempted_signal_ids": preempted_signal_ids,
    }
