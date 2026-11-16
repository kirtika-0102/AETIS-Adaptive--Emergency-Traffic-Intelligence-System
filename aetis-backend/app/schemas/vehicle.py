from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
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


class VehicleCreate(VehicleBase):
    pass


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

    model_config = ConfigDict(from_attributes=True)
