from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.emergency import Emergency
from app.models.signal import SignalPhase, TrafficSignal
from app.schemas.signal import (
    CorridorEvaluationRequest,
    CorridorEvaluationResponse,
    SignalCreate,
    SignalOverrideRequest,
    SignalResponse,
)
from app.services.preemption_service import (
    calculate_queue_dissipation,
    trigger_green_wave,
)
from app.services.routing_service import (
    get_signals_along_corridor,
    haversine_distance,
)

router = APIRouter(prefix="/api/v1/signals", tags=["Traffic Signals"])


@router.get("", response_model=List[SignalResponse], summary="Get all traffic signals")
def get_all_signals(db: Session = Depends(get_db)):
    """
    Returns all traffic signals with current phase, coordinates, and preemption status.
    """
    signals = db.query(TrafficSignal).all()
    return signals


@router.post(
    "/evaluate-corridor",
    response_model=CorridorEvaluationResponse,
    summary="Evaluate corridor intersections and trigger queue-clearing preemption",
)
async def evaluate_corridor(
    request: CorridorEvaluationRequest,
    db: Session = Depends(get_db),
):
    """
    Evaluates traffic signals along the approaching vehicle's route corridor.
    Calculates queue dissipation timing and triggers green wave preemption
    on downstream signals when arrival ETA drops within the clearance window.
    """
    # 1. Resolve destination coordinates
    dest_lat = request.destination_latitude
    dest_lng = request.destination_longitude

    if dest_lat is None or dest_lng is None:
        if request.emergency_id:
            emergency = db.query(Emergency).filter(Emergency.id == request.emergency_id).first()
            if emergency and emergency.destination_lat is not None and emergency.destination_lng is not None:
                dest_lat = emergency.destination_lat
                dest_lng = emergency.destination_lng
        else:
            emergency = (
                db.query(Emergency)
                .filter(
                    Emergency.assigned_vehicle_id == request.vehicle_id,
                    Emergency.status.in_(["active", "en_route", "dispatched"]),
                )
                .first()
            )
            if emergency and emergency.destination_lat is not None and emergency.destination_lng is not None:
                dest_lat = emergency.destination_lat
                dest_lng = emergency.destination_lng

    # 2. Query corridor signals
    if dest_lat is not None and dest_lng is not None:
        corridor_signals = get_signals_along_corridor(
            db=db,
            origin_lat=request.current_latitude,
            origin_lng=request.current_longitude,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            corridor_width_meters=request.corridor_width_meters,
        )
    else:
        # Fallback: all signals sorted by proximity
        all_signals = db.query(TrafficSignal).all()
        corridor_signals = sorted(
            all_signals,
            key=lambda s: haversine_distance(request.current_latitude, request.current_longitude, s.latitude, s.longitude),
        )

    speed_mps = request.speed_kmh * (1000.0 / 3600.0)

    # 3. Evaluate each signal in proximity order
    details = []
    preemption_triggered = False
    preempted_signal_id = None
    next_signal_id = None
    dist_to_next = None
    next_eta = None
    clear_time = None
    threshold = None

    for signal in corridor_signals:
        dist = haversine_distance(request.current_latitude, request.current_longitude, signal.latitude, signal.longitude)
        timing = calculate_queue_dissipation(dist, speed_mps, request.queue_count)

        if next_signal_id is None:
            next_signal_id = signal.id
            dist_to_next = round(dist, 1)
            next_eta = round(timing["vehicle_eta_seconds"], 1)
            clear_time = round(timing["queue_clear_time"], 1)
            threshold = round(timing["trigger_threshold_seconds"], 1)

        is_triggered_here = False
        if timing["should_trigger_preemption"] and not preemption_triggered:
            await trigger_green_wave(
                db=db,
                signal_id=signal.id,
                vehicle_id=request.vehicle_id,
                hold_duration_seconds=request.hold_duration_seconds,
            )
            preemption_triggered = True
            preempted_signal_id = signal.id
            is_triggered_here = True

        details.append({
            "signal_id": signal.id,
            "signal_name": signal.name,
            "current_phase": signal.current_phase,
            "is_preempted": signal.is_preempted,
            "distance_meters": round(dist, 1),
            "vehicle_eta_seconds": round(timing["vehicle_eta_seconds"], 1),
            "queue_clear_time_seconds": round(timing["queue_clear_time"], 1),
            "trigger_threshold_seconds": round(timing["trigger_threshold_seconds"], 1),
            "should_trigger": timing["should_trigger_preemption"],
            "triggered": is_triggered_here,
        })

    return CorridorEvaluationResponse(
        vehicle_id=request.vehicle_id,
        evaluated_signals_count=len(corridor_signals),
        preemption_triggered=preemption_triggered,
        preempted_signal_id=preempted_signal_id,
        next_signal_id=next_signal_id,
        distance_to_signal_meters=dist_to_next,
        vehicle_eta_seconds=next_eta,
        queue_clear_time_seconds=clear_time,
        trigger_threshold_seconds=threshold,
        details=details,
    )


@router.get("/{id}", response_model=SignalResponse, summary="Get traffic signal by ID")
def get_signal_by_id(id: str, db: Session = Depends(get_db)):
    """
    Returns detailed status for a specific traffic signal controller.
    """
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )
    return signal


@router.post("", response_model=SignalResponse, status_code=status.HTTP_201_CREATED, summary="Create a traffic signal")
def create_signal(signal_in: SignalCreate, db: Session = Depends(get_db)):
    """
    Register a new traffic signal controller.
    """
    existing = db.query(TrafficSignal).filter(TrafficSignal.id == signal_in.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Traffic signal with id '{signal_in.id}' already exists",
        )
    signal = TrafficSignal(
        id=signal_in.id,
        name=signal_in.name,
        latitude=signal_in.latitude,
        longitude=signal_in.longitude,
        current_phase=signal_in.current_phase.value if hasattr(signal_in.current_phase, "value") else str(signal_in.current_phase),
        normal_cycle_seconds=signal_in.normal_cycle_seconds,
        is_preempted=signal_in.is_preempted,
        preempted_by_vehicle_id=signal_in.preempted_by_vehicle_id,
        preemption_end_time=signal_in.preemption_end_time,
    )
    db.add(signal)
    db.commit()
    db.refresh(signal)
    return signal


@router.post("/{id}/override", response_model=SignalResponse, summary="Manual emergency preemption override")
def override_signal(
    id: str,
    override_data: Optional[SignalOverrideRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Manual emergency toggle for dispatchers.
    Forces GREEN phase, activates preemption (is_preempted=True), and sets preemption window.
    """
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )

    # Force GREEN phase and mark as preempted
    signal.current_phase = SignalPhase.GREEN.value
    signal.is_preempted = True

    if override_data:
        if override_data.vehicle_id:
            signal.preempted_by_vehicle_id = override_data.vehicle_id

        if override_data.preemption_end_time:
            signal.preemption_end_time = override_data.preemption_end_time
        elif override_data.duration_seconds:
            signal.preemption_end_time = datetime.now(timezone.utc) + timedelta(seconds=override_data.duration_seconds)
        else:
            signal.preemption_end_time = datetime.now(timezone.utc) + timedelta(seconds=60)
    else:
        signal.preemption_end_time = datetime.now(timezone.utc) + timedelta(seconds=60)

    db.commit()
    db.refresh(signal)
    return signal


@router.post("/{id}/reset", response_model=SignalResponse, summary="Reset traffic signal to normal autonomous cycle")
def reset_signal(id: str, db: Session = Depends(get_db)):
    """
    Resets signal back to normal autonomous cycle.
    Restores normal phase cycle (RED default), clears preemption state and vehicle locks.
    """
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )

    signal.current_phase = SignalPhase.RED.value
    signal.is_preempted = False
    signal.preempted_by_vehicle_id = None
    signal.preemption_end_time = None

    db.commit()
    db.refresh(signal)
    return signal
