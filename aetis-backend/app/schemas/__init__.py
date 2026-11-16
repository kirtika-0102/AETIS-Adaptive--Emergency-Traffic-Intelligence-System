from app.schemas.auth import Token, TokenPayload, LoginRequest
from app.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse
from app.schemas.vehicle import VehicleBase, VehicleCreate, VehicleUpdate, VehicleLocationUpdate, VehicleResponse
from app.schemas.hospital import HospitalBase, HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.emergency import EmergencyBase, EmergencyCreate, EmergencyUpdate, EmergencyResponse

__all__ = [
    "Token",
    "TokenPayload",
    "LoginRequest",
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "VehicleBase",
    "VehicleCreate",
    "VehicleUpdate",
    "VehicleLocationUpdate",
    "VehicleResponse",
    "HospitalBase",
    "HospitalCreate",
    "HospitalUpdate",
    "HospitalResponse",
    "EmergencyBase",
    "EmergencyCreate",
    "EmergencyUpdate",
    "EmergencyResponse",
]
