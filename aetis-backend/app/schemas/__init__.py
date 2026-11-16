from app.schemas.auth import Token, TokenResponse, TokenPayload, LoginRequest
from app.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse
from app.schemas.vehicle import (
    VehicleBase,
    VehicleCreate,
    VehicleAssignRequest,
    VehicleUpdate,
    VehicleLocationUpdate,
    VehicleResponse,
)
from app.schemas.hospital import HospitalBase, HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.emergency import (
    EmergencyBase,
    EmergencyCreate,
    EmergencyStatusUpdate,
    EmergencyUpdate,
    EmergencyResponse,
    PaginatedEmergencyResponse,
)

__all__ = [
    "Token",
    "TokenResponse",
    "TokenPayload",
    "LoginRequest",
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "VehicleBase",
    "VehicleCreate",
    "VehicleAssignRequest",
    "VehicleUpdate",
    "VehicleLocationUpdate",
    "VehicleResponse",
    "HospitalBase",
    "HospitalCreate",
    "HospitalUpdate",
    "HospitalResponse",
    "EmergencyBase",
    "EmergencyCreate",
    "EmergencyStatusUpdate",
    "EmergencyUpdate",
    "EmergencyResponse",
    "PaginatedEmergencyResponse",
]
