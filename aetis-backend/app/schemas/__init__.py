"""
AETIS Central Engine — Pydantic Schemas Package
"""

from app.schemas.auth import LoginRequest, RefreshTokenRequest, TokenResponse, UserResponse
from app.schemas.emergency import EmergencyCreate, EmergencyResponse, EmergencyStatusUpdate
from app.schemas.hospital import HospitalResponse
from app.schemas.vehicle import VehicleAssignRequest, VehicleCreate, VehicleResponse

__all__ = [
    "EmergencyCreate",
    "EmergencyResponse",
    "EmergencyStatusUpdate",
    "HospitalResponse",
    "LoginRequest",
    "RefreshTokenRequest",
    "TokenResponse",
    "UserResponse",
    "VehicleAssignRequest",
    "VehicleCreate",
    "VehicleResponse",
]
