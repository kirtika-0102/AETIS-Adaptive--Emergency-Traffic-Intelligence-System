"""
AETIS Central Engine — Canonical Domain Enumerations
Shared across ORM models, Pydantic schemas, routers, and real-time services.
"""

import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    DISPATCHER = "DISPATCHER"
    DRIVER = "DRIVER"
    HOSPITAL = "HOSPITAL"
    POLICE = "POLICE"
    FIRE = "FIRE"


class EmergencySeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EmergencyStatus(str, enum.Enum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    ARRIVED = "ARRIVED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class EmergencyType(str, enum.Enum):
    MEDICAL = "medical"
    FIRE = "fire"
    POLICE = "police"


class JourneyLeg(str, enum.Enum):
    TO_SCENE = "TO_SCENE"
    TO_HOSPITAL = "TO_HOSPITAL"
    COMPLETED = "COMPLETED"


class VehicleType(str, enum.Enum):
    AMBULANCE = "AMBULANCE"
    FIRE_TRUCK = "FIRE_TRUCK"
    POLICE = "POLICE"


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    DISPATCHED = "DISPATCHED"
    EN_ROUTE = "EN_ROUTE"
    BUSY = "BUSY"
    MAINTENANCE = "MAINTENANCE"


class SignalPhase(str, enum.Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    ALL_RED = "ALL_RED"
    GREEN = "GREEN"


class SignalTransitionState(str, enum.Enum):
    NORMAL = "NORMAL"
    CLEARANCE_YELLOW = "CLEARANCE_YELLOW"
    ALL_RED = "ALL_RED"
    PREEMPTED = "PREEMPTED"
    RECOVERY = "RECOVERY"


class CameraStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


ACTIVE_EMERGENCY_STATUSES: tuple[str, ...] = (
    EmergencyStatus.PENDING.value,
    EmergencyStatus.DISPATCHED.value,
    EmergencyStatus.IN_TRANSIT.value,
    EmergencyStatus.ARRIVED.value,
)

EN_ROUTE_EMERGENCY_STATUSES: tuple[str, ...] = (
    EmergencyStatus.DISPATCHED.value,
    EmergencyStatus.IN_TRANSIT.value,
    EmergencyStatus.ARRIVED.value,
)

TERMINAL_EMERGENCY_STATUSES: tuple[str, ...] = (
    EmergencyStatus.COMPLETED.value,
    EmergencyStatus.CANCELLED.value,
)
