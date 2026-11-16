"""
AETIS Central Engine — User Schemas
Pydantic schemas for user accounts, admin provisioning, and profile representations.
"""

from typing import Optional

from pydantic import BaseModel, model_validator


class UserBase(BaseModel):
    email: str
    full_name: str
    role: str  # Enum: ADMIN | DISPATCHER | DRIVER | HOSPITAL
    phone: Optional[str] = None
    hospital_id: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    hospital_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: str
    is_active: bool
    name: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def sync_name(self) -> "UserResponse":
        if not self.name and self.full_name:
            self.name = self.full_name
        return self
