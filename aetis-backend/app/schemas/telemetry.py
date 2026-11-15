from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class LocationUpdatePayload(BaseModel):
    """
    High-frequency GPS telemetry breadcrumb emitted by emergency vehicle drivers.
    """
    vehicle_id: str = Field(..., description="Unique vehicle ID", json_schema_extra={"example": "EV-AMB-01"})
    emergency_id: str = Field(..., description="Associated active emergency ID", json_schema_extra={"example": "EMG-101"})
    latitude: float = Field(..., ge=-90.0, le=90.0, description="GPS latitude", json_schema_extra={"example": 12.9716})
    longitude: float = Field(..., ge=-180.0, le=180.0, description="GPS longitude", json_schema_extra={"example": 77.5946})
    speed: float = Field(..., ge=0.0, description="Vehicle speed in km/h", json_schema_extra={"example": 54.5})
    heading: float = Field(..., ge=0.0, le=360.0, description="Heading in degrees (0-360)", json_schema_extra={"example": 85.0})
    timestamp: float = Field(..., description="Epoch timestamp in seconds", json_schema_extra={"example": 1700000000.0})

    # Optional fields for destination hospital & ETA if provided directly
    hospital_id: Optional[str] = Field(default=None, description="Optional destination hospital ID", json_schema_extra={"example": "HOSP-01"})
    eta_seconds: Optional[float] = Field(default=None, description="Optional estimated time of arrival in seconds", json_schema_extra={"example": 320.0})

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    def dict(self, *args, **kwargs) -> Dict[str, Any]:
        """Backward-compatible dict method mapping to Pydantic v2 model_dump."""
        return self.model_dump(*args, **kwargs)
