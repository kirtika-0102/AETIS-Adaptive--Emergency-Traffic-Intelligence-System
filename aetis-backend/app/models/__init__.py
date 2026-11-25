"""
AETIS Central Engine — ORM Model Registry
Import all models here so that Alembic and other tooling can discover them
from a single import of this package.
"""

from app.models.audit import AuditLog
from app.models.auth import RefreshToken, RevokedToken
from app.models.camera import Camera, CameraStatus
from app.models.emergency import Emergency
from app.models.enums import (
    ACTIVE_EMERGENCY_STATUSES,
    EN_ROUTE_EMERGENCY_STATUSES,
    TERMINAL_EMERGENCY_STATUSES,
    EmergencySeverity,
    EmergencyStatus,
    EmergencyType,
    JourneyLeg,
    SignalTransitionState,
    UserRole,
    VehicleStatus,
    VehicleType,
)
from app.models.hospital import Hospital, HospitalAlert
from app.models.signal import Signal, SignalPhase, TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle

__all__ = [
    "ACTIVE_EMERGENCY_STATUSES",
    "AuditLog",
    "Camera",
    "CameraStatus",
    "EN_ROUTE_EMERGENCY_STATUSES",
    "Emergency",
    "EmergencySeverity",
    "EmergencyStatus",
    "EmergencyType",
    "Hospital",
    "HospitalAlert",
    "JourneyLeg",
    "RefreshToken",
    "RevokedToken",
    "Signal",
    "SignalPhase",
    "SignalTransitionState",
    "TERMINAL_EMERGENCY_STATUSES",
    "TrafficSignal",
    "User",
    "UserRole",
    "Vehicle",
    "VehicleStatus",
    "VehicleType",
]
