import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.models.signal import SignalPhase, TrafficSignal
from app.services.websocket_manager import manager

logger = logging.getLogger("aetis.preemption")


def calculate_queue_dissipation(
    distance_to_signal: float,
    speed_mps: float,
    queue_count: int = 5,
) -> Dict[str, Any]:
    """
    Predictive queue dissipation algorithm:
    - queue_clear_time = (queue_count * 2.0) + 15.0 (15s = yellow clearance + all-red pedestrian safety)
    - vehicle_eta_seconds = (distance_to_signal / speed_mps) if speed_mps > 2 else 9999
    - should_trigger_preemption = vehicle_eta_seconds <= (queue_clear_time + 5.0)
    """
    queue_clear_time = (queue_count * 2.0) + 15.0
    vehicle_eta_seconds = (distance_to_signal / speed_mps) if speed_mps > 2.0 else 9999.0
    trigger_threshold = queue_clear_time + 5.0
    should_trigger_preemption = vehicle_eta_seconds <= trigger_threshold

    return {
        "queue_count": queue_count,
        "queue_clear_time": queue_clear_time,
        "vehicle_eta_seconds": vehicle_eta_seconds,
        "trigger_threshold_seconds": trigger_threshold,
        "should_trigger_preemption": should_trigger_preemption,
    }


async def trigger_green_wave(
    db: Session,
    signal_id: str,
    vehicle_id: str,
    hold_duration_seconds: int = 45,
) -> Optional[TrafficSignal]:
    """
    Forces GREEN phase on the designated traffic signal, establishes preemption state,
    and broadcasts notifications over WebSockets to 'signals' and 'dispatchers' rooms.
    """
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == signal_id).first()
    if not signal:
        logger.warning(f"Cannot trigger green wave: signal '{signal_id}' not found.")
        return None

    # Update signal state to preempted GREEN
    signal.current_phase = SignalPhase.GREEN.value
    signal.is_preempted = True
    signal.preempted_by_vehicle_id = vehicle_id
    signal.preemption_end_time = datetime.now(timezone.utc) + timedelta(seconds=hold_duration_seconds)

    db.commit()
    db.refresh(signal)

    # 1. Broadcast phase change to 'signals' room (controllers and drivers)
    await manager.broadcast_to_room(
        "signals",
        "signal:phase_changed",
        {
            "signal_id": signal_id,
            "phase": "GREEN",
            "is_preempted": True,
            "countdown": hold_duration_seconds,
        },
    )

    # 2. Broadcast preemption event to 'dispatchers' room (incident overview screen)
    await manager.broadcast_to_room(
        "dispatchers",
        "signal:preemption_triggered",
        {
            "signal_id": signal_id,
            "vehicle_id": vehicle_id,
        },
    )

    logger.info(
        f"Green wave preemption triggered on {signal_id} for vehicle {vehicle_id} (duration: {hold_duration_seconds}s)"
    )
    return signal
