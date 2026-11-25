"""
AETIS Central Engine — Queue-Flushing Signal Preemption Engine
NOTE: Simulates virtual phase timing in DB + WebSocket broadcasts. Physical intersection
signal hardware must always enforce clearance interlocks locally via NTCIP/SCATS controller.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.enums import SignalPhase, SignalTransitionState
from app.models.signal import TrafficSignal
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


async def advance_clearance_stage(
    db: Session,
    signal: TrafficSignal,
    transition_state: SignalTransitionState,
    phase: SignalPhase,
) -> TrafficSignal:
    """Record an explicit intermediate clearance or recovery state transition on a signal."""
    signal.transition_state = transition_state.value
    signal.current_phase = phase.value
    db.commit()
    db.refresh(signal)
    await manager.broadcast_to_room(
        "signals",
        "signal:phase_changed",
        {
            "signal_id": signal.id,
            "phase": signal.current_phase,
            "transition_state": signal.transition_state,
            "is_preempted": signal.is_preempted,
            "countdown": 0,
        },
    )
    return signal


async def trigger_green_wave(
    db: Session,
    signal_id: str,
    vehicle_id: str,
    hold_duration_seconds: int = 45,
    performed_by_id: Optional[str] = None,
    source: str = "GREEN_WAVE",
    staged_clearance: bool = False,
) -> Optional[TrafficSignal]:
    """
    Activates preemption on the designated simulated signal controller, increments
    preemption metrics & AuditLog, and broadcasts WebSocket updates.
    When staged_clearance=True, walks explicit CLEARANCE_YELLOW -> ALL_RED -> PREEMPTED
    transitions prior to holding GREEN.
    """
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == signal_id).first()
    if not signal:
        logger.warning(f"Cannot trigger green wave: signal '{signal_id}' not found.")
        return None

    now = datetime.now(timezone.utc)
    was_already_same_vehicle = (
        signal.is_preempted and signal.preempted_by_vehicle_id == vehicle_id
    )

    if staged_clearance and not signal.is_preempted:
        await advance_clearance_stage(
            db, signal, SignalTransitionState.CLEARANCE_YELLOW, SignalPhase.YELLOW
        )
        await advance_clearance_stage(
            db, signal, SignalTransitionState.ALL_RED, SignalPhase.ALL_RED
        )

    signal.current_phase = SignalPhase.GREEN.value
    signal.transition_state = SignalTransitionState.PREEMPTED.value
    signal.is_preempted = True
    signal.preempted_by_vehicle_id = vehicle_id
    signal.preemption_end_time = now + timedelta(seconds=hold_duration_seconds)
    signal.last_preemption_at = now
    if not was_already_same_vehicle:
        signal.preemptions_count = (signal.preemptions_count or 0) + 1

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action=f"SIGNAL_PREEMPTED_{source}",
            performed_by_id=performed_by_id,
            details=(
                f"Signal {signal_id} preempted for vehicle {vehicle_id} "
                f"(hold={hold_duration_seconds}s, clearance={'staged' if staged_clearance else 'virtual'})"
            ),
            timestamp=now,
        )
    )

    db.commit()
    db.refresh(signal)

    await manager.broadcast_to_room(
        "signals",
        "signal:phase_changed",
        {
            "signal_id": signal_id,
            "phase": SignalPhase.GREEN.value,
            "transition_state": SignalTransitionState.PREEMPTED.value,
            "is_preempted": True,
            "countdown": hold_duration_seconds,
        },
    )
    await manager.broadcast_to_room(
        "dispatchers",
        "signal:preemption_triggered",
        {
            "signal_id": signal_id,
            "vehicle_id": vehicle_id,
            "hold_duration_seconds": hold_duration_seconds,
        },
    )

    logger.info(
        "Green wave preemption triggered on %s for vehicle %s (duration: %ss)",
        signal_id,
        vehicle_id,
        hold_duration_seconds,
    )
    return signal


async def reset_signal_state(
    db: Session,
    signal: TrafficSignal,
    reason: str = "RESET",
    performed_by_id: Optional[str] = None,
) -> TrafficSignal:
    """Restore a signal to autonomous normal cycling and broadcast reset state."""
    now = datetime.now(timezone.utc)
    signal.current_phase = SignalPhase.RED.value
    signal.transition_state = SignalTransitionState.NORMAL.value
    signal.is_preempted = False
    signal.preempted_by_vehicle_id = None
    signal.preemption_end_time = None

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action=f"SIGNAL_{reason}",
            performed_by_id=performed_by_id,
            details=f"Signal {signal.id} returned to normal phase cycling ({reason})",
            timestamp=now,
        )
    )
    db.commit()
    db.refresh(signal)

    await manager.broadcast_to_room(
        "signals",
        "signal:phase_changed",
        {
            "signal_id": signal.id,
            "phase": SignalPhase.RED.value,
            "transition_state": SignalTransitionState.NORMAL.value,
            "is_preempted": False,
            "countdown": 0,
        },
    )
    await manager.broadcast_to_room(
        "dispatchers",
        "signal:reset",
        {
            "signal_id": signal.id,
            "reason": reason,
        },
    )
    return signal


async def release_signals_for_vehicle(
    db: Session,
    vehicle_id: str,
    reason: str = "EMERGENCY_ENDED",
    performed_by_id: Optional[str] = None,
) -> List[TrafficSignal]:
    """Release every signal currently held by vehicle_id upon completion/cancellation."""
    held = (
        db.query(TrafficSignal)
        .filter(
            TrafficSignal.is_preempted.is_(True),
            TrafficSignal.preempted_by_vehicle_id == vehicle_id,
        )
        .all()
    )
    released: List[TrafficSignal] = []
    for sig in held:
        released.append(
            await reset_signal_state(db, sig, reason=reason, performed_by_id=performed_by_id)
        )
    return released


async def expire_due_preemptions(db: Session) -> List[TrafficSignal]:
    """Reset any preempted signal whose preemption_end_time has elapsed (UTC-safe)."""
    now = datetime.now(timezone.utc)
    preempted = (
        db.query(TrafficSignal)
        .filter(
            TrafficSignal.is_preempted.is_(True),
            TrafficSignal.preemption_end_time.isnot(None),
        )
        .all()
    )
    expired: List[TrafficSignal] = []
    for sig in preempted:
        end_dt = sig.preemption_end_time
        if end_dt is None:
            continue
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        if end_dt <= now:
            sig.transition_state = SignalTransitionState.RECOVERY.value
            expired.append(await reset_signal_state(db, sig, reason="EXPIRED"))
    return expired
