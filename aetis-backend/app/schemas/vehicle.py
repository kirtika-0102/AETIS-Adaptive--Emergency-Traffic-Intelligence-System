"""
AETIS Central Engine — Vehicle Schemas
Pydantic schemas for vehicle creation, status updates, emergency assignment, and responses.
"""

from typing import Any, Optional

from pydantic import BaseModel, model_validator


class VehicleBase(BaseModel):
    call_sign: str
    type: str  # Enum: AMBULANCE | FIRE_TRUCK | POLICE
    license_plate: str
    status: str = "AVAILABLE"  # Enum: AVAILABLE | DISPATCHED | BUSY | MAINTENANCE
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_driver_id: Optional[str] = None


class VehicleCreate(VehicleBase):
    id: Optional[str] = None  # e.g., 'AMB-01', auto-assigned if omitted


class VehicleUpdate(BaseModel):
    call_sign: Optional[str] = None
    type: Optional[str] = None
    license_plate: Optional[str] = None
    status: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_driver_id: Optional[str] = None


class VehicleAssignRequest(BaseModel):
    emergency_id: str
    vehicle_id: Optional[str] = None


class VehicleResponse(VehicleBase):
    id: str

    # UI/Frontend compatibility fields
    label: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    etaSeconds: Optional[int] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_vehicle_compatibility_fields(self) -> "VehicleResponse":
        if not self.label:
            self.label = self.call_sign or self.id
        if not self.location and self.current_latitude is not None and self.current_longitude is not None:
            self.location = {
                "lat": self.current_latitude,
                "lng": self.current_longitude,
            }
        return self
