from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.emergency import EmergencySeverity, EmergencyStatus


class EmergencyBase(BaseModel):
    id: str  # e.g. 'EMG-01'
    incident_number: str
    title: str
    severity: EmergencySeverity = EmergencySeverity.MEDIUM
    status: EmergencyStatus = EmergencyStatus.PENDING
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    patient_notes: Optional[str] = None
    assigned_vehicle_id: Optional[str] = None
    destination_hospital_id: Optional[str] = None
    dispatcher_id: Optional[str] = None


class EmergencyCreate(EmergencyBase):
    pass


class EmergencyUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[EmergencySeverity] = None
    status: Optional[EmergencyStatus] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_address: Optional[str] = None
    patient_notes: Optional[str] = None
    assigned_vehicle_id: Optional[str] = None
    destination_hospital_id: Optional[str] = None
    dispatcher_id: Optional[str] = None
    completed_at: Optional[datetime] = None


class EmergencyResponse(EmergencyBase):
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
