from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.camera import Camera
from app.models.signal import TrafficSignal
from app.schemas.camera import CameraCreate, CameraResponse

router = APIRouter(prefix="/api/v1/cameras", tags=["Traffic Cameras"])


@router.get("", response_model=List[CameraResponse], summary="Get all traffic cameras")
def get_all_cameras(db: Session = Depends(get_db)):
    """
    Returns all traffic cameras with stream URLs and connected traffic signals.
    """
    cameras = db.query(Camera).all()
    return cameras


@router.get("/{id}", response_model=CameraResponse, summary="Get camera by ID")
def get_camera_by_id(id: str, db: Session = Depends(get_db)):
    """
    Returns detailed camera information and stream endpoint.
    """
    camera = db.query(Camera).filter(Camera.id == id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{id}' not found",
        )
    return camera


@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED, summary="Register a traffic camera")
def create_camera(camera_in: CameraCreate, db: Session = Depends(get_db)):
    """
    Register a new traffic camera connected to an existing traffic signal.
    """
    # Check if camera ID already exists
    existing_camera = db.query(Camera).filter(Camera.id == camera_in.id).first()
    if existing_camera:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Camera with id '{camera_in.id}' already exists",
        )

    # Validate connected signal exists
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == camera_in.connected_signal_id).first()
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
        status=camera_in.status.value if hasattr(camera_in.status, "value") else str(camera_in.status),
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera
