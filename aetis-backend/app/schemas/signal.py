from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SignalPhase(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


class SignalBase(BaseModel):
    name: str = Field(..., description="Name or intersection label of the traffic signal", json_schema_extra={"example": "Junction 4 - MG Road & Park Ave"})
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude coordinate", json_schema_extra={"example": 12.9716})
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude coordinate", json_schema_extra={"example": 77.5946})
    normal_cycle_seconds: int = Field(default=60, ge=10, le=300, description="Duration of normal cycle in seconds", json_schema_extra={"example": 60})


class SignalCreate(SignalBase):
    id: str = Field(..., description="Unique Signal ID", json_schema_extra={"example": "SIG-101"})
    current_phase: SignalPhase = Field(default=SignalPhase.RED, description="Current signal light phase")
    is_preempted: bool = Field(default=False, description="Whether signal is actively preempted for an emergency vehicle")
    preempted_by_vehicle_id: Optional[str] = Field(default=None, description="Vehicle ID that requested preemption", json_schema_extra={"example": "EV-AMB-01"})
    preemption_end_time: Optional[datetime] = Field(default=None, description="Expiration timestamp of the preemption window")


class SignalOverrideRequest(BaseModel):
    vehicle_id: Optional[str] = Field(default=None, description="Emergency vehicle ID initiating preemption", json_schema_extra={"example": "EV-AMB-01"})
    duration_seconds: Optional[int] = Field(default=60, ge=5, le=600, description="Duration in seconds to hold preemption before auto-reset", json_schema_extra={"example": 60})
    preemption_end_time: Optional[datetime] = Field(default=None, description="Explicit expiration timestamp (overrides duration_seconds if provided)")


class SignalResponse(SignalBase):
    id: str
    current_phase: str
    is_preempted: bool
    preempted_by_vehicle_id: Optional[str] = None
    preemption_end_time: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CorridorEvaluationRequest(BaseModel):
    vehicle_id: str = Field(..., description="Approaching emergency vehicle identifier", json_schema_extra={"example": "EV-AMB-01"})
    current_latitude: float = Field(..., ge=-90.0, le=90.0, description="Current GPS latitude of vehicle", json_schema_extra={"example": 12.9710})
    current_longitude: float = Field(..., ge=-180.0, le=180.0, description="Current GPS longitude of vehicle", json_schema_extra={"example": 77.5940})
    speed_kmh: float = Field(default=45.0, ge=0.0, description="Vehicle speed in km/h", json_schema_extra={"example": 50.0})
    destination_latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0, description="Optional route destination latitude")
    destination_longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0, description="Optional route destination longitude")
    emergency_id: Optional[str] = Field(default=None, description="Optional emergency incident ID to look up route destination")
    heading: Optional[float] = Field(default=None, ge=0.0, le=360.0, description="Optional compass heading degrees (0-360) for approach filtering")
    queue_count: int = Field(default=5, ge=0, description="Observed/estimated vehicle queue at intersection", json_schema_extra={"example": 4})
    corridor_width_meters: float = Field(default=80.0, ge=10.0, le=500.0, description="Width of corridor in meters", json_schema_extra={"example": 80.0})
    hold_duration_seconds: int = Field(default=45, ge=10, le=300, description="Green wave hold time in seconds", json_schema_extra={"example": 45})


class CorridorEvaluationResponse(BaseModel):
    vehicle_id: str
    evaluated_signals_count: int
    preemption_triggered: bool
    preempted_signal_id: Optional[str] = None
    next_signal_id: Optional[str] = None
    distance_to_signal_meters: Optional[float] = None
    vehicle_eta_seconds: Optional[float] = None
    queue_clear_time_seconds: Optional[float] = None
    trigger_threshold_seconds: Optional[float] = None
    details: List[Dict[str, Any]] = []
