from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class HospitalBase(BaseModel):
    id: str  # e.g. 'HOSP-01'
    name: str
    address: str
    latitude: float
    longitude: float
    contact_phone: str
    trauma_level: int = 1
    available_beds: int = 0


class HospitalCreate(HospitalBase):
    pass


class HospitalUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: Optional[str] = None
    trauma_level: Optional[int] = None
    available_beds: Optional[int] = None


class HospitalResponse(HospitalBase):
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HospitalAlertResponse(BaseModel):
    id: str
    emergency_id: str
    emergency_title: str
    severity: str
    estimated_arrival_minutes: int
    patient_notes: Optional[str] = None
    acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    trauma_bay_assigned: Optional[str] = None
    patient_condition: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HospitalAcknowledgeRequest(BaseModel):
    trauma_bay_assigned: str
    notes: Optional[str] = None


class HospitalAcknowledgeResponse(BaseModel):
    alert_id: str
    status: str = "ACKNOWLEDGED"
    acknowledged_at: datetime
    acknowledged_by: str
    trauma_bay_assigned: str
    notes: Optional[str] = None
    message: str = "Triage alert acknowledged and trauma bay assigned."
