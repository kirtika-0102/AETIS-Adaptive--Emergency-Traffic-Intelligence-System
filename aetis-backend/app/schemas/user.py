"""
AETIS Central Engine — User Schemas
"""

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: str
    full_name: str
    role: str
    phone: str | None = None
    hospital_id: str | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: str | None = None
    hospital_id: str | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    id: str
    is_active: bool

    model_config = {"from_attributes": True}
