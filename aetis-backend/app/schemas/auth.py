"""
AETIS Central Engine — Auth Schemas
Pydantic schemas for authentication requests, tokens, and role-based access.
"""

from typing import Optional

from pydantic import BaseModel, model_validator


class LoginRequest(BaseModel):
    """Credentials payload for user authentication."""
    username: Optional[str] = None
    email: Optional[str] = None
    password: str
    role: Optional[str] = None

    @model_validator(mode="after")
    def validate_identifier(self) -> "LoginRequest":
        if not self.email and not self.username:
            raise ValueError("Either 'email' or 'username' must be provided.")
        if not self.email and self.username:
            self.email = self.username
        if not self.username and self.email:
            self.username = self.email
        return self


class UserResponse(BaseModel):
    """User profile data included in authentication responses."""
    id: str
    email: str
    full_name: str
    name: Optional[str] = None
    role: str
    phone: Optional[str] = None
    hospital_id: Optional[str] = None
    is_active: bool = True

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_name(self) -> "UserResponse":
        if not self.name and self.full_name:
            self.name = self.full_name
        return self


class TokenResponse(BaseModel):
    """Bearer token bundle returned upon successful login or refresh."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    id: Optional[str] = None
    role: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def sync_user_fields(self) -> "TokenResponse":
        if self.user:
            if not self.id:
                self.id = self.user.id
            if not self.role:
                self.role = self.user.role
            if not self.name:
                self.name = self.user.full_name
            if not self.email:
                self.email = self.user.email
        return self


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    token: Optional[str] = None
