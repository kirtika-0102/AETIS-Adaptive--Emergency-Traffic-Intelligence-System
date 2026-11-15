from enum import Enum
from pydantic import BaseModel, ConfigDict, Field


class CameraStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


class CameraBase(BaseModel):
    name: str = Field(..., description="Name or description of the camera view", json_schema_extra={"example": "Northbound Approach Cam 1"})
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Camera latitude coordinate", json_schema_extra={"example": 12.9718})
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Camera longitude coordinate", json_schema_extra={"example": 77.5948})
    stream_url: str = Field(..., description="RTSP URL or video stream endpoint", json_schema_extra={"example": "rtsp://traffic.city.internal/live/cam201"})
    connected_signal_id: str = Field(..., description="ID of the traffic signal this camera monitors", json_schema_extra={"example": "SIG-101"})
    view_heading: int = Field(..., ge=0, le=360, description="Compass degrees view orientation (0-360)", json_schema_extra={"example": 0})
    status: CameraStatus = Field(default=CameraStatus.ONLINE, description="Operational status of the camera")


class CameraCreate(CameraBase):
    id: str = Field(..., description="Unique Camera ID", json_schema_extra={"example": "CAM-201"})


class CameraResponse(CameraBase):
    id: str
    status: str

    model_config = ConfigDict(from_attributes=True)
