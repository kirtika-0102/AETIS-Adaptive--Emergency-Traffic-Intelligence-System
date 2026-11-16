from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.vehicle import Vehicle
from app.schemas.telemetry import LocationUpdatePayload
from app.services.telemetry_service import process_location_update

router = APIRouter(prefix="/api/v1/tracking", tags=["Vehicle Tracking & Telemetry"])


@router.post(
    "/update-location",
    summary="HTTP REST fallback for GPS telemetry ingestion",
    status_code=status.HTTP_200_OK,
)
async def update_location_http(
    payload: LocationUpdatePayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Accepts high-frequency GPS breadcrumbs via HTTP POST and immediately broadcasts
    to active WebSocket rooms (dispatchers, emergency room, and destination hospital).
    Designed as a seamless fallback for drivers behind restrictive cellular proxies or WebSocket firewalls.
    """
    try:
        result = await process_location_update(payload, db)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process telemetry update: {str(e)}",
        )


@router.get(
    "/vehicle/{vehicle_id}",
    summary="Get current GPS position and status for a vehicle",
)
def get_vehicle_location(
    vehicle_id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve latest telemetry coordinates and operational status for a vehicle.
    """
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found",
        )
    return {
        "vehicle_id": vehicle.id,
        "label": vehicle.label,
        "type": vehicle.type,
        "status": vehicle.status,
        "latitude": vehicle.current_latitude,
        "longitude": vehicle.current_longitude,
        "speed": vehicle.speed,
        "heading": vehicle.heading,
        "last_update_at": vehicle.last_update_at.isoformat() if vehicle.last_update_at else None,
    }
