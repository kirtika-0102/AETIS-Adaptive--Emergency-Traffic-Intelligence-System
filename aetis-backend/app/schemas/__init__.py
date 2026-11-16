"""
AETIS Central Engine — Pydantic Schemas Package
"""

from app.schemas.auth import LoginRequest, RefreshTokenRequest, TokenResponse, UserResponse
from app.schemas.camera import (
    CameraBase,
    CameraCreate,
    CameraResponse,
    CameraStatus,
)
from app.schemas.emergency import EmergencyCreate, EmergencyResponse, EmergencyStatusUpdate
from app.schemas.hospital import HospitalResponse
from app.schemas.signal import (
    CorridorEvaluationRequest,
    CorridorEvaluationResponse,
    SignalBase,
    SignalCreate,
    SignalOverrideRequest,
    SignalPhase,
    SignalResponse,
)
from app.schemas.telemetry import CameraDetectionPayload, LocationUpdatePayload
from app.schemas.vehicle import VehicleAssignRequest, VehicleCreate, VehicleResponse

__all__ = [
    "CameraBase",
    "CameraCreate",
    "CameraDetectionPayload",
    "CameraResponse",
    "CameraStatus",
    "CorridorEvaluationRequest",
    "CorridorEvaluationResponse",
    "EmergencyCreate",
    "EmergencyResponse",
    "EmergencyStatusUpdate",
    "HospitalResponse",
    "LocationUpdatePayload",
    "LoginRequest",
    "RefreshTokenRequest",
    "SignalBase",
    "SignalCreate",
    "SignalOverrideRequest",
    "SignalPhase",
    "SignalResponse",
    "TokenResponse",
    "UserResponse",
    "VehicleAssignRequest",
    "VehicleCreate",
    "VehicleResponse",
]
