from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, model_validator
from app.models.emergency import EmergencySeverity, EmergencyStatus
from app.schemas.vehicle import VehicleResponse
from app.schemas.hospital import HospitalResponse


class EmergencyBase(BaseModel):
    title: str
    severity: EmergencySeverity = EmergencySeverity.MEDIUM
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    patient_notes: Optional[str] = None
    destination_hospital_id: Optional[str] = None


class EmergencyCreate(EmergencyBase):
    pass


class EmergencyStatusUpdate(BaseModel):
    status: EmergencyStatus
    notes: Optional[str] = None


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


class EmergencyResponse(BaseModel):
    id: str
    incident_number: str
    title: str
    severity: EmergencySeverity
    status: EmergencyStatus
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    patient_notes: Optional[str] = None
    assigned_vehicle_id: Optional[str] = None
    destination_hospital_id: Optional[str] = None
    dispatcher_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    assigned_vehicle: Optional[VehicleResponse] = None
    destination_hospital: Optional[HospitalResponse] = None

    # Frontend-compatible attributes
    location: Optional[dict] = None
    createdAt: Optional[str] = None
    type: Optional[str] = "medical"

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_frontend_fields(cls, data: Any) -> Any:
        if hasattr(data, "pickup_latitude") and hasattr(data, "pickup_longitude"):
            try:
                lat = getattr(data, "pickup_latitude")
                lng = getattr(data, "pickup_longitude")
                addr = getattr(data, "pickup_address", "")
                setattr(data, "location", {"lat": lat, "lng": lng, "address": addr})
                created_at = getattr(data, "created_at", None)
                if created_at and hasattr(created_at, "isoformat"):
                    setattr(data, "createdAt", created_at.isoformat())
                if not getattr(data, "type", None):
                    setattr(data, "type", "medical")
            except Exception:
                pass
        elif isinstance(data, dict):
            lat = data.get("pickup_latitude")
            lng = data.get("pickup_longitude")
            addr = data.get("pickup_address", "")
            data["location"] = {"lat": lat, "lng": lng, "address": addr}
            if "created_at" in data and "createdAt" not in data:
                data["createdAt"] = str(data["created_at"])
            if "type" not in data:
                data["type"] = "medical"
        return data


class PaginatedEmergencyResponse(BaseModel):
    data: List[EmergencyResponse]
    total: int
    page: int
    pageSize: int
