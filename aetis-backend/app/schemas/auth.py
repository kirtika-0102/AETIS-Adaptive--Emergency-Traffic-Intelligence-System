from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, model_validator


class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str
    role: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_username_and_email(cls, data: Any) -> Any:
        if isinstance(data, dict):
            email = data.get("email")
            username = data.get("username")
            if not email and username:
                data["email"] = username
            elif not username and email:
                data["username"] = email
        return data

    @property
    def identifier(self) -> str:
        return (self.email or self.username or "").strip()


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    phone: Optional[str] = None
    hospital_id: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_name(cls, data: Any) -> Any:
        if hasattr(data, "full_name") and not getattr(data, "name", None):
            try:
                setattr(data, "name", data.full_name)
            except Exception:
                pass
        elif isinstance(data, dict) and "full_name" in data and "name" not in data:
            data["name"] = data["full_name"]
        return data


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Alias for backward compatibility
Token = TokenResponse


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    exp: Optional[int] = None


class RefreshTokenRequest(BaseModel):
    token: Optional[str] = None
