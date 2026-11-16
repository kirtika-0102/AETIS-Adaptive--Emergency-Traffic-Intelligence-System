"""
AETIS Central Engine — Hospital Schemas
"""

from pydantic import BaseModel


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
    name: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    contact_phone: str | None = None
    trauma_level: int | None = None
    available_beds: int | None = None


class HospitalResponse(HospitalBase):
    id: str

    model_config = {"from_attributes": True}
