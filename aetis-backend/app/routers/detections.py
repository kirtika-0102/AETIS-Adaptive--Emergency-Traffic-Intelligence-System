import math
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.camera import Camera
from app.models.signal import TrafficSignal
from app.schemas.telemetry import CameraDetectionPayload
from app.services.preemption_service import trigger_green_wave
from app.services.routing_service import haversine_distance
from app.services.websocket_manager import manager

router = APIRouter(prefix="/api/v1/detections", tags=["Camera AI Ingestion"])


def find_downstream_target(
    db: Session,
    camera: Camera,
) -> Optional[TrafficSignal]:
    """
    Identifies the downstream intersection along the road approach.
    Uses the camera's view heading vector and proximity to query the next downstream signal.
    """
    other_signals = (
        db.query(TrafficSignal)
        .filter(TrafficSignal.id != camera.connected_signal_id)
        .all()
    )
    if not other_signals:
        return None

    best_signal: Optional[TrafficSignal] = None
    min_distance = float("inf")

    cam_heading_rad = math.radians(camera.view_heading)
    head_dx = math.sin(cam_heading_rad)
    head_dy = math.cos(cam_heading_rad)

    for signal in other_signals:
        dist = haversine_distance(camera.latitude, camera.longitude, signal.latitude, signal.longitude)
        # Vector towards candidate signal
        meters_per_deg_lat = 111320.0
        meters_per_deg_lon = 111320.0 * math.cos(math.radians(camera.latitude))
        dy = (signal.latitude - camera.latitude) * meters_per_deg_lat
        dx = (signal.longitude - camera.longitude) * meters_per_deg_lon
        norm = math.sqrt(dx * dx + dy * dy)
        if norm > 0:
            # Dot product to check forward directional alignment
            dot = (dx * head_dx + dy * head_dy) / norm
            # Within 75-degree cone (dot > 0.25)
            if dot > 0.25 and dist < min_distance:
                min_distance = dist
                best_signal = signal

    # Fallback to closest other signal if none in exact heading cone
    if not best_signal and other_signals:
        other_signals.sort(
            key=lambda s: haversine_distance(camera.latitude, camera.longitude, s.latitude, s.longitude)
        )
        best_signal = other_signals[0]

    return best_signal


@router.post(
    "/camera-alert",
    summary="Camera AI Detection Ingestion Webhook",
    status_code=status.HTTP_200_OK,
)
async def intake_camera_detection(
    payload: CameraDetectionPayload,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Intake webhook where external computer vision models (YOLO / OpenCV) post detections.

    Logic:
    If detected_vehicle_type == 'AMBULANCE' and confidence >= 0.80:
      - Find connected signal ID from camera record.
      - Query downstream intersection camera along the road segment.
      - Trigger queue dissipation preemption on target signal using estimated_queue_count.
      - Broadcast manager.broadcast_to_room('signals', 'camera:detection_alert', payload.dict()).
      - Return HTTP 200 {"status": "alert_dispatched", "downstream_signaled": True}.
    """
    # 1. Lookup camera
    camera = db.query(Camera).filter(Camera.id == payload.camera_id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{payload.camera_id}' not found",
        )

    # 2. Check vehicle type and confidence threshold
    v_type = payload.detected_vehicle_type.upper().strip()
    is_ambulance = v_type == "AMBULANCE"
    high_confidence = payload.confidence >= 0.80

    if not (is_ambulance and high_confidence):
        return {
            "status": "alert_ignored",
            "downstream_signaled": False,
            "reason": "Detection did not meet AMBULANCE criteria or confidence >= 0.80 threshold",
            "confidence": payload.confidence,
            "detected_vehicle_type": payload.detected_vehicle_type,
        }

    # 3. Find connected signal and downstream target
    current_signal_id = camera.connected_signal_id
    downstream_signal = find_downstream_target(db, camera)
    target_signal = downstream_signal or db.query(TrafficSignal).filter(TrafficSignal.id == current_signal_id).first()

    target_signal_id = target_signal.id if target_signal else current_signal_id

    # 4. Trigger queue dissipation preemption on target signal
    # Queue dissipation formula: (queue_count * 2.0) + 15.0s safety margin + 15s hold
    calculated_hold_seconds = max(35, int((payload.estimated_queue_count * 2.0) + 30.0))
    vehicle_id = payload.vehicle_id or "AMB-01"

    await trigger_green_wave(
        db=db,
        signal_id=target_signal_id,
        vehicle_id=vehicle_id,
        hold_duration_seconds=calculated_hold_seconds,
    )

    # 5. Broadcast to WebSockets
    telemetry_dict = payload.dict()
    await manager.broadcast_to_room("signals", "camera:detection_alert", telemetry_dict)
    await manager.broadcast_to_room("dispatchers", "camera:detection_alert", telemetry_dict)

    # Downstream camera info if available
    downstream_cam = (
        db.query(Camera).filter(Camera.connected_signal_id == target_signal_id).first()
        if downstream_signal
        else None
    )

    return {
        "status": "alert_dispatched",
        "downstream_signaled": True,
        "connected_signal_id": current_signal_id,
        "target_signal_id": target_signal_id,
        "downstream_camera_id": downstream_cam.id if downstream_cam else None,
        "estimated_queue_count": payload.estimated_queue_count,
        "hold_duration_seconds": calculated_hold_seconds,
    }
