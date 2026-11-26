from datetime import datetime, timezone
import json
import math
import time
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_camera_or_dispatcher
from app.models.audit import AuditLog
from app.models.camera import Camera
from app.models.enums import CameraStatus
from app.models.signal import TrafficSignal
from app.models.user import User
from app.schemas.telemetry import CameraDetectionPayload
from app.services.preemption_service import expire_due_preemptions, trigger_green_wave
from app.services.websocket_manager import manager
from app.utils.geo import haversine_distance

router = APIRouter(prefix="/api/v1/detections", tags=["Camera AI Ingestion"])


def find_downstream_target(
    db: Session,
    camera: Camera,
) -> Optional[TrafficSignal]:
    """
    Identifies the downstream intersection along the road approach using
    camera view heading alignment and proximity.
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

    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(camera.latitude))

    for signal in other_signals:
        dist = haversine_distance(
            camera.latitude, camera.longitude, signal.latitude, signal.longitude
        )
        dy = (signal.latitude - camera.latitude) * meters_per_deg_lat
        dx = (signal.longitude - camera.longitude) * meters_per_deg_lon
        norm = math.sqrt(dx * dx + dy * dy)
        if norm > 0:
            dot = (dx * head_dx + dy * head_dy) / norm
            if dot > 0.25 and dist < min_distance:
                min_distance = dist
                best_signal = signal

    return best_signal


@router.get(
    "/recent",
    summary="List recent camera AI detections",
)
def get_recent_detections(
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Return recent recorded camera AI detection events derived from persistent AuditLogs."""
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.action == "CAMERA_DETECTION_RECORDED")
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    results: List[Dict[str, Any]] = []
    for entry in logs:
        meta: Dict[str, Any] = {}
        if entry.details:
            try:
                meta = json.loads(entry.details)
            except Exception:
                meta = {}
        results.append(
            {
                "id": entry.id,
                "cameraId": meta.get("camera_id", ""),
                "cameraName": meta.get("camera_name", meta.get("camera_id", "")),
                "signalId": meta.get("signal_id", ""),
                "signalName": meta.get("signal_name", meta.get("signal_id", "")),
                "vehicleType": meta.get("vehicle_type", "ambulance"),
                "confidence": meta.get("confidence", 0.0),
                "detectedAt": entry.timestamp.isoformat(),
                "emergencyId": meta.get("emergency_id"),
            }
        )
    return results


@router.post(
    "/camera-alert",
    summary="Camera AI Detection Ingestion Webhook",
    status_code=status.HTTP_200_OK,
)
async def intake_camera_detection(
    payload: CameraDetectionPayload,
    db: Session = Depends(get_db),
    actor: Optional[User] = Depends(require_camera_or_dispatcher),
) -> Dict[str, Any]:
    """
    Authenticated intake webhook where external edge CV nodes (or dispatchers) post detections.
    Requires valid X-AETIS-API-Key header or DISPATCHER/ADMIN JWT.
    """
    camera = db.query(Camera).filter(Camera.id == payload.camera_id).first()
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{payload.camera_id}' not found",
        )

    if (camera.status or "").upper() != CameraStatus.ONLINE.value:
        return {
            "status": "alert_ignored",
            "downstream_signaled": False,
            "reason": f"Camera '{camera.id}' is not ONLINE (status={camera.status})",
        }

    if not camera.is_armed:
        return {
            "status": "alert_ignored",
            "downstream_signaled": False,
            "reason": f"Camera '{camera.id}' is not armed by a dispatcher",
        }

    now_epoch = time.time()
    if abs(now_epoch - payload.timestamp) > 120.0:
        return {
            "status": "alert_ignored",
            "downstream_signaled": False,
            "reason": "Stale or out-of-window camera detection timestamp (>120s)",
        }

    if camera.last_triggered_at is not None:
        last_trig = camera.last_triggered_at
        if last_trig.tzinfo is None:
            last_trig = last_trig.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_trig).total_seconds()
        if elapsed < 30.0:
            return {
                "status": "alert_ignored",
                "downstream_signaled": False,
                "reason": "Duplicate detection suppressed within 30s camera cooldown",
            }

    v_type = payload.detected_vehicle_type.upper().strip()
    is_ambulance = v_type in {"AMBULANCE", "EMERGENCY"}
    high_confidence = payload.confidence >= 0.80

    if not (is_ambulance and high_confidence):
        return {
            "status": "alert_ignored",
            "downstream_signaled": False,
            "reason": "Detection did not meet AMBULANCE criteria or confidence >= 0.80 threshold",
            "confidence": payload.confidence,
            "detected_vehicle_type": payload.detected_vehicle_type,
        }

    current_signal_id = camera.connected_signal_id
    downstream_signal = find_downstream_target(db, camera)
    target_signal = (
        downstream_signal
        or db.query(TrafficSignal).filter(TrafficSignal.id == current_signal_id).first()
    )

    target_signal_id = target_signal.id if target_signal else current_signal_id
    calculated_hold_seconds = max(35, int((payload.estimated_queue_count * 2.0) + 30.0))
    vehicle_id = payload.vehicle_id or "EV-AMB-01"

    await expire_due_preemptions(db)
    if target_signal:
        db.refresh(target_signal)
        if (
            target_signal.is_preempted
            and target_signal.preempted_by_vehicle_id
            and target_signal.preempted_by_vehicle_id != vehicle_id
        ):
            return {
                "status": "alert_ignored",
                "downstream_signaled": False,
                "reason": (
                    f"Target signal '{target_signal_id}' is currently held by another "
                    f"vehicle ({target_signal.preempted_by_vehicle_id})"
                ),
            }

    await trigger_green_wave(
        db=db,
        signal_id=target_signal_id,
        vehicle_id=vehicle_id,
        hold_duration_seconds=calculated_hold_seconds,
        performed_by_id=actor.id if actor else None,
        source="CAMERA_CV",
    )

    now = datetime.now(timezone.utc)
    camera.last_triggered_at = now
    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="CAMERA_DETECTION_RECORDED",
            performed_by_id=actor.id if actor else None,
            details=json.dumps(
                {
                    "camera_id": camera.id,
                    "camera_name": camera.name,
                    "signal_id": target_signal_id,
                    "signal_name": target_signal.name if target_signal else target_signal_id,
                    "vehicle_type": "ambulance",
                    "confidence": payload.confidence,
                    "emergency_id": camera.armed_emergency_id,
                }
            ),
            timestamp=now,
        )
    )
    db.commit()

    telemetry_dict = payload.model_dump()
    await manager.broadcast_to_room("signals", "camera:detection_alert", telemetry_dict)
    await manager.broadcast_to_room("dispatchers", "camera:detection_alert", telemetry_dict)

    downstream_cam = (
        db.query(Camera)
        .filter(Camera.connected_signal_id == target_signal_id)
        .first()
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
