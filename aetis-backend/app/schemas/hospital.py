"""
AETIS Central Engine — Hospital Schemas
Pydantic schemas for hospital profiles, ER inbound triage alerts, and trauma acknowledgment.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, model_validator


class HospitalBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    contact_phone: str
    trauma_level: int
    available_beds: int = 0


class HospitalCreate(HospitalBase):
    id: str


class HospitalUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: Optional[str] = None
    trauma_level: Optional[int] = None
    available_beds: Optional[int] = None


class HospitalResponse(HospitalBase):
    id: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Hospital Inbound Alerts & Triage Handshake
# ---------------------------------------------------------------------------

class HospitalAcknowledgeRequest(BaseModel):
    """Payload submitted by hospital ER staff acknowledging an inbound patient."""
    trauma_bay_assigned: str
    notes: Optional[str] = None


class HospitalAlertResponse(BaseModel):
    """Inbound emergency alert delivered to hospital ER dispatch console."""
    id: str
    emergency_id: str
    emergency_title: Optional[str] = None
    severity: Optional[str] = None
    estimated_arrival_minutes: Optional[int] = None
    patient_notes: Optional[str] = None
    acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    trauma_bay_assigned: Optional[str] = None
    notes: Optional[str] = None
    hospital_id: Optional[str] = None
    patient_condition: Optional[str] = None
    estimated_arrival: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def populate_alert_fields(cls, data: Any) -> Any:
        if hasattr(data, "emergency") and data.emergency is not None:
            emg = data.emergency
            title = getattr(emg, "title", None)
            sev = getattr(emg, "severity", None)
            p_notes = getattr(emg, "patient_notes", None)
            est_arr = getattr(data, "estimated_arrival", None)
            mins = None
            if est_arr is not None:
                now_utc = datetime.now(timezone.utc)
                if est_arr.tzinfo is None:
                    est_arr = est_arr.replace(tzinfo=timezone.utc)
                diff = (est_arr - now_utc).total_seconds() / 60.0
                mins = max(0, int(diff))
            return {
                "id": str(data.id),
                "emergency_id": str(data.emergency_id),
                "emergency_title": title,
                "severity": sev,
                "estimated_arrival_minutes": mins,
                "patient_notes": p_notes,
                "acknowledged": bool(data.acknowledged),
                "acknowledged_at": data.acknowledged_at,
                "trauma_bay_assigned": data.trauma_bay_assigned,
                "notes": data.notes,
                "hospital_id": str(data.hospital_id),
                "patient_condition": getattr(data, "patient_condition", None),
                "estimated_arrival": est_arr,
            }
        return data


class HospitalAcknowledgeReceipt(BaseModel):
    """Confirmation receipt returned after successful trauma acknowledgment."""
    status: str = "ACKNOWLEDGED"
    alert_id: str
    emergency_id: str
    hospital_id: str
    trauma_bay_assigned: str
    acknowledged_by_id: str
    acknowledged_at: datetime
    notes: Optional[str] = None
