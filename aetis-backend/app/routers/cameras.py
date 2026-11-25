from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.enums import CameraStatus
from app.models.signal import TrafficSignal
from app.models.user import User
from app.schemas.camera import CameraCreate, CameraResponse

router = APIRouter(prefix="/api/v1/cameras", tags=["Traffic Cameras"])


class CameraStatusPatch(BaseModel):
    status: CameraStatus


class CameraArmRequest(BaseModel):
    emergency_id: Optional[str] = None


@router.get("", response_model=List[CameraResponse], summary="Get all traffic cameras")
def get_all_cameras(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns traffic cameras with stream URLs and connected traffic signals."""
    return db.query(Camera).offset(offset).limit(limit).all()


@router.get("/{id}", response_model=CameraResponse, summary="Get camera by ID")
def get_camera_by_id(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns detailed camera information and stream endpoint."""
    camera = db.query(Camera).filter(Camera.id == id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{id}' not found",
        )
    return camera


@router.post(
    "",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a traffic camera",
)
def create_camera(
    camera_in: CameraCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Register a new traffic camera connected to an existing traffic signal (Admin only)."""
    existing_camera = db.query(Camera).filter(Camera.id == camera_in.id).first()
    if existing_camera:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Camera with id '{camera_in.id}' already exists",
        )

    signal = (
        db.query(TrafficSignal)
        .filter(TrafficSignal.id == camera_in.connected_signal_id)
        .first()
    )
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connected traffic signal '{camera_in.connected_signal_id}' not found",
        )

    camera = Camera(
        id=camera_in.id,
        name=camera_in.name,
        latitude=camera_in.latitude,
        longitude=camera_in.longitude,
        stream_url=camera_in.stream_url,
        connected_signal_id=camera_in.connected_signal_id,
        view_heading=camera_in.view_heading,
        status=camera_in.status.value
        if hasattr(camera_in.status, "value")
        else str(camera_in.status),
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera


@router.patch("/{id}/status", response_model=CameraResponse, summary="Update camera operational status")
def update_camera_status(
    id: str,
    payload: CameraStatusPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Toggle camera operational status (ONLINE / OFFLINE / ERROR)."""
    camera = db.query(Camera).filter(Camera.id == id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{id}' not found",
        )
    camera.status = payload.status.value
    db.commit()
    db.refresh(camera)
    return camera


@router.post(
    "/{id}/arm",
    summary="Arm camera issue-flag for active emergency corridor detection",
)
def arm_camera(
    id: str,
    payload: Optional[CameraArmRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
):
    """Enable CV preemption arming flag on a camera for a specific corridor."""
    camera = db.query(Camera).filter(Camera.id == id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{id}' not found",
        )
    emergency_id = payload.emergency_id if payload else None
    if emergency_id:
        emg = db.query(Emergency).filter(Emergency.id == emergency_id).first()
        if not emg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency '{emergency_id}' not found",
            )
    camera.is_armed = True
    camera.armed_emergency_id = emergency_id
    db.commit()
    db.refresh(camera)
    return {
        "id": camera.id,
        "is_armed": camera.is_armed,
        "armed_emergency_id": camera.armed_emergency_id,
    }


@router.delete(
    "/{id}/arm",
    summary="Disarm camera emergency issue-flag",
)
def disarm_camera(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
):
    """Disable CV preemption arming flag on a camera."""
    camera = db.query(Camera).filter(Camera.id == id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{id}' not found",
        )
    camera.is_armed = False
    camera.armed_emergency_id = None
    db.commit()
    db.refresh(camera)
    return {"id": camera.id, "is_armed": False, "armed_emergency_id": None}
