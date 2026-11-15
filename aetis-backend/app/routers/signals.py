from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.signal import SignalPhase, TrafficSignal
from app.schemas.signal import (
    SignalCreate,
    SignalOverrideRequest,
    SignalResponse,
)

router = APIRouter(prefix="/api/v1/signals", tags=["Traffic Signals"])


@router.get("", response_model=List[SignalResponse], summary="Get all traffic signals")
def get_all_signals(db: Session = Depends(get_db)):
    """
    Returns all traffic signals with current phase, coordinates, and preemption status.
    """
    signals = db.query(TrafficSignal).all()
    return signals


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
