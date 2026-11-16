"""
AETIS Central Engine — Vehicle Schemas
"""

from pydantic import BaseModel


class VehicleBase(BaseModel):
    id: str
    call_sign: str
    type: str
    license_plate: str
    status: str = "AVAILABLE"
    current_latitude: float | None = None
    current_longitude: float | None = None
    current_driver_id: str | None = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    call_sign: str | None = None
    status: str | None = None
    current_latitude: float | None = None
    current_longitude: float | None = None
    current_driver_id: str | None = None


class VehicleResponse(VehicleBase):
    model_config = {"from_attributes": True}
