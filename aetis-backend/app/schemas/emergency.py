"""
AETIS Central Engine — Emergency Schemas
Pydantic schemas for emergency incident creation, state transitions, and responses.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, model_validator

from app.schemas.hospital import HospitalResponse
from app.schemas.vehicle import VehicleResponse


class EmergencyBase(BaseModel):
    title: str
    severity: str  # Enum: LOW | MEDIUM | HIGH | CRITICAL
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: Optional[str] = None
    patient_notes: Optional[str] = None
    destination_hospital_id: Optional[str] = None


class EmergencyCreate(EmergencyBase):
    id: Optional[str] = None  # e.g., 'EMG-01', auto-assigned if omitted
    incident_number: Optional[str] = None  # e.g., 'INC-2026-001', auto-generated if omitted
    type: Optional[str] = "medical"  # Frontend type: medical | police | fire


class EmergencyStatusUpdate(BaseModel):
    status: str  # Enum: PENDING | DISPATCHED | IN_TRANSIT | ARRIVED | COMPLETED | CANCELLED
    patient_notes: Optional[str] = None


class EmergencyResponse(EmergencyBase):
    id: str
    incident_number: str
    status: str
    assigned_vehicle_id: Optional[str] = None
    destination_hospital_id: Optional[str] = None
    dispatcher_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    # Nested full model representations
    assigned_vehicle: Optional[VehicleResponse] = None
    destination_hospital: Optional[HospitalResponse] = None

    # Frontend compatibility fields
    type: Optional[str] = "medical"
    createdAt: Optional[str] = None
    location: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_compatibility_fields(self) -> "EmergencyResponse":
        if not self.createdAt and self.created_at:
            self.createdAt = self.created_at.isoformat()
        if not self.location:
            self.location = {
                "address": self.pickup_address or "",
                "lat": self.pickup_latitude,
                "lng": self.pickup_longitude,
            }
        return self
