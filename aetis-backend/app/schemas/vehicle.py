from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, model_validator
from app.models.vehicle import VehicleType, VehicleStatus


class VehicleBase(BaseModel):
    id: str  # e.g. 'AMB-01'
    call_sign: str
    type: VehicleType = VehicleType.AMBULANCE
    license_plate: str
    status: VehicleStatus = VehicleStatus.AVAILABLE
    current_latitude: float = 0.0
    current_longitude: float = 0.0
    current_driver_id: Optional[str] = None


class VehicleCreate(BaseModel):
    id: str  # e.g. 'AMB-01'
    call_sign: str
    type: VehicleType = VehicleType.AMBULANCE
    license_plate: str
    current_latitude: Optional[float] = 0.0
    current_longitude: Optional[float] = 0.0
    status: Optional[VehicleStatus] = VehicleStatus.AVAILABLE
    current_driver_id: Optional[str] = None


class VehicleAssignRequest(BaseModel):
    vehicle_id: Optional[str] = None
    emergency_id: str


class VehicleUpdate(BaseModel):
    call_sign: Optional[str] = None
    type: Optional[VehicleType] = None
    license_plate: Optional[str] = None
    status: Optional[VehicleStatus] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_driver_id: Optional[str] = None


class VehicleLocationUpdate(BaseModel):
    latitude: float
    longitude: float


class VehicleResponse(VehicleBase):
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Frontend-compatible attributes
    label: Optional[str] = None
    location: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_frontend_fields(cls, data: Any) -> Any:
        if hasattr(data, "call_sign"):
            try:
                setattr(data, "label", getattr(data, "call_sign"))
                lat = getattr(data, "current_latitude", 0.0)
                lng = getattr(data, "current_longitude", 0.0)
                setattr(data, "location", {"lat": lat, "lng": lng})
            except Exception:
                pass
        elif isinstance(data, dict):
            if "call_sign" in data and "label" not in data:
                data["label"] = data["call_sign"]
            data["location"] = {
                "lat": data.get("current_latitude", 0.0),
                "lng": data.get("current_longitude", 0.0),
            }
        return data
