"""
AETIS Central Engine — Vehicle Schemas
Pydantic schemas for vehicle creation, status updates, emergency assignment, and responses.
"""

from typing import Any, Optional

from pydantic import BaseModel, model_validator


class VehicleBase(BaseModel):
    call_sign: Optional[str] = None
    type: str = "AMBULANCE"  # Enum: AMBULANCE | FIRE_TRUCK | POLICE
    license_plate: Optional[str] = None
    status: str = "AVAILABLE"  # Enum: AVAILABLE | DISPATCHED | EN_ROUTE | BUSY | MAINTENANCE
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_driver_id: Optional[str] = None


class VehicleCreate(VehicleBase):
    id: Optional[str] = None


class VehicleUpdate(BaseModel):
    call_sign: Optional[str] = None
    type: Optional[str] = None
    license_plate: Optional[str] = None
    status: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_driver_id: Optional[str] = None
    driverId: Optional[str] = None
    retired: Optional[bool] = None


class VehicleStatusUpdate(BaseModel):
    status: str


class VehicleAssignRequest(BaseModel):
    emergency_id: str
    vehicle_id: Optional[str] = None


class VehicleResponse(VehicleBase):
    id: str

    # UI/Frontend compatibility fields
    label: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    etaSeconds: Optional[int] = None
    registrationNumber: Optional[str] = None
    retired: bool = False
    driver: Optional[dict[str, str]] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def extract_driver(cls, data: Any) -> Any:
        if hasattr(data, "id"):
            drv = getattr(data, "current_driver", None)
            drv_obj = (
                {"id": str(drv.id), "name": str(drv.full_name)}
                if drv is not None
                else None
            )
            loc = (
                {"lat": data.current_latitude, "lng": data.current_longitude}
                if data.current_latitude is not None and data.current_longitude is not None
                else None
            )
            return {
                "id": data.id,
                "call_sign": data.call_sign,
                "type": data.type,
                "license_plate": data.license_plate,
                "status": data.status,
                "current_latitude": data.current_latitude,
                "current_longitude": data.current_longitude,
                "current_driver_id": data.current_driver_id,
                "label": data.label or data.call_sign or data.id,
                "location": loc,
                "registrationNumber": data.license_plate,
                "retired": (data.status or "").upper() == "MAINTENANCE",
                "driver": drv_obj,
            }
        return data
