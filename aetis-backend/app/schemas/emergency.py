"""
AETIS Central Engine — Emergency Schemas
"""

from datetime import datetime

from pydantic import BaseModel


class EmergencyBase(BaseModel):
    title: str
    severity: str
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str | None = None
    patient_notes: str | None = None


class EmergencyCreate(EmergencyBase):
    id: str
    incident_number: str


class EmergencyUpdate(BaseModel):
    title: str | None = None
    severity: str | None = None
    status: str | None = None
    assigned_vehicle_id: str | None = None
    destination_hospital_id: str | None = None
    dispatcher_id: str | None = None
    patient_notes: str | None = None
    completed_at: datetime | None = None


class EmergencyResponse(EmergencyBase):
    id: str
    incident_number: str
    status: str
    assigned_vehicle_id: str | None = None
    destination_hospital_id: str | None = None
    dispatcher_id: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}
