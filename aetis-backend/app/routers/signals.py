import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.enums import (
    EN_ROUTE_EMERGENCY_STATUSES,
    SignalPhase,
    SignalTransitionState,
)
from app.models.signal import TrafficSignal
from app.models.user import User
from app.schemas.signal import (
    CorridorEvaluationRequest,
    CorridorEvaluationResponse,
    SignalCreate,
    SignalOverrideRequest,
    SignalResponse,
)
from app.services.preemption_service import (
    calculate_queue_dissipation,
    expire_due_preemptions,
    reset_signal_state,
    trigger_green_wave,
)
from app.services.routing_service import get_signals_along_corridor
from app.services.websocket_manager import manager
from app.utils.geo import haversine_distance

router = APIRouter(prefix="/api/v1/signals", tags=["Traffic Signals"])


@router.get("", response_model=List[SignalResponse], summary="Get all traffic signals")
def get_all_signals(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns traffic signals with current phase, coordinates, and preemption status."""
    return db.query(TrafficSignal).offset(offset).limit(limit).all()


@router.post(
    "/evaluate-corridor",
    response_model=CorridorEvaluationResponse,
    summary="Evaluate corridor intersections and trigger queue-clearing preemption",
)
async def evaluate_corridor(
    request: CorridorEvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
):
    """
    Evaluates traffic signals along the approaching vehicle's route corridor.
    Expires overdue preemptions first, applies heading & corridor vector checks,
    and respects priority conflict locks held by other vehicles.
    """
    await expire_due_preemptions(db)

    dest_lat = request.destination_latitude
    dest_lng = request.destination_longitude

    if dest_lat is None or dest_lng is None:
        if request.emergency_id:
            emergency = (
                db.query(Emergency)
                .filter(Emergency.id == request.emergency_id)
                .first()
            )
            if emergency and emergency.destination_lat is not None and emergency.destination_lng is not None:
                dest_lat = emergency.destination_lat
                dest_lng = emergency.destination_lng
        else:
            emergency = (
                db.query(Emergency)
                .filter(
                    Emergency.assigned_vehicle_id == request.vehicle_id,
                    Emergency.status.in_(EN_ROUTE_EMERGENCY_STATUSES),
                )
                .first()
            )
            if emergency and emergency.destination_lat is not None and emergency.destination_lng is not None:
                dest_lat = emergency.destination_lat
                dest_lng = emergency.destination_lng

    if dest_lat is not None and dest_lng is not None:
        corridor_signals = get_signals_along_corridor(
            db=db,
            origin_lat=request.current_latitude,
            origin_lng=request.current_longitude,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            corridor_width_meters=request.corridor_width_meters,
            heading=request.heading,
        )
    else:
        all_signals = db.query(TrafficSignal).all()
        corridor_signals = sorted(
            all_signals,
            key=lambda s: haversine_distance(
                request.current_latitude, request.current_longitude, s.latitude, s.longitude
            ),
        )

    speed_mps = request.speed_kmh * (1000.0 / 3600.0)

    details = []
    preemption_triggered = False
    preempted_signal_id = None
    next_signal_id = None
    dist_to_next = None
    next_eta = None
    clear_time = None
    threshold = None

    for signal in corridor_signals:
        dist = haversine_distance(
            request.current_latitude,
            request.current_longitude,
            signal.latitude,
            signal.longitude,
        )
        timing = calculate_queue_dissipation(dist, speed_mps, request.queue_count)

        if next_signal_id is None:
            next_signal_id = signal.id
            dist_to_next = round(dist, 1)
            next_eta = round(timing["vehicle_eta_seconds"], 1)
            clear_time = round(timing["queue_clear_time"], 1)
            threshold = round(timing["trigger_threshold_seconds"], 1)

        is_triggered_here = False
        already_held_by_this_vehicle = (
            signal.is_preempted and signal.preempted_by_vehicle_id == request.vehicle_id
        )
        held_by_another = (
            signal.is_preempted
            and signal.preempted_by_vehicle_id is not None
            and signal.preempted_by_vehicle_id != request.vehicle_id
        )
        if (
            timing["should_trigger_preemption"]
            and not preemption_triggered
            and not already_held_by_this_vehicle
            and not held_by_another
        ):
            await trigger_green_wave(
                db=db,
                signal_id=signal.id,
                vehicle_id=request.vehicle_id,
                hold_duration_seconds=request.hold_duration_seconds,
                performed_by_id=current_user.id,
                source="CORRIDOR",
            )
            preemption_triggered = True
            preempted_signal_id = signal.id
            is_triggered_here = True

        details.append(
            {
                "signal_id": signal.id,
                "signal_name": signal.name,
                "current_phase": signal.current_phase,
                "is_preempted": signal.is_preempted,
                "conflict_held_by": signal.preempted_by_vehicle_id if held_by_another else None,
                "distance_meters": round(dist, 1),
                "vehicle_eta_seconds": round(timing["vehicle_eta_seconds"], 1),
                "queue_clear_time_seconds": round(timing["queue_clear_time"], 1),
                "trigger_threshold_seconds": round(timing["trigger_threshold_seconds"], 1),
                "should_trigger": timing["should_trigger_preemption"],
                "triggered": is_triggered_here,
            }
        )

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


@router.get(
    "/corridor/{emergency_id}",
    response_model=List[SignalResponse],
    summary="Get ordered corridor signals for an emergency (read-only)",
)
def get_corridor_signals_for_emergency(
    emergency_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only endpoint returning signals along the emergency corridor (role- and facility-scoped)."""
    emergency = db.query(Emergency).filter(Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency '{emergency_id}' not found",
        )

    role_upper = (current_user.role or "").upper()
    if role_upper == "HOSPITAL":
        if not current_user.hospital_id or emergency.destination_hospital_id != current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot inspect corridor signals for another hospital's emergency",
            )
    elif role_upper in {"POLICE", "FIRE"}:
        if (emergency.type or "").lower() != role_upper.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot inspect corridor signals for a non-{role_upper.lower()} emergency",
            )
    elif role_upper == "DRIVER":
        if not emergency.assigned_vehicle or emergency.assigned_vehicle.current_driver_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot inspect corridor signals for an emergency not assigned to your vehicle",
            )

    veh = emergency.assigned_vehicle
    origin_lat = veh.current_latitude if veh and veh.current_latitude is not None else emergency.pickup_latitude
    origin_lng = veh.current_longitude if veh and veh.current_longitude is not None else emergency.pickup_longitude

    if (emergency.journey_leg or "TO_SCENE").upper() == "TO_HOSPITAL" and emergency.destination_lat is not None and emergency.destination_lng is not None:
        dest_lat = emergency.destination_lat
        dest_lng = emergency.destination_lng
    elif emergency.pickup_latitude or emergency.pickup_longitude:
        dest_lat = emergency.pickup_latitude
        dest_lng = emergency.pickup_longitude
    else:
        dest_lat = emergency.destination_lat
        dest_lng = emergency.destination_lng

    if dest_lat is None or dest_lng is None:
        return db.query(TrafficSignal).limit(50).all()

    return get_signals_along_corridor(
        db=db,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
    )


@router.get("/{id}", response_model=SignalResponse, summary="Get traffic signal by ID")
def get_signal_by_id(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns detailed status for a specific traffic signal controller."""
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )
    return signal


@router.post(
    "",
    response_model=SignalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a traffic signal",
)
def create_signal(
    signal_in: SignalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Register a new traffic signal controller (Admin only)."""
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
        current_phase=signal_in.current_phase.value
        if hasattr(signal_in.current_phase, "value")
        else str(signal_in.current_phase),
        normal_cycle_seconds=signal_in.normal_cycle_seconds,
        is_preempted=signal_in.is_preempted,
        preempted_by_vehicle_id=signal_in.preempted_by_vehicle_id,
        preemption_end_time=signal_in.preemption_end_time,
    )
    db.add(signal)
    db.commit()
    db.refresh(signal)
    return signal


@router.post(
    "/{id}/override",
    response_model=SignalResponse,
    summary="Manual emergency preemption override",
)
async def override_signal(
    id: str,
    override_data: Optional[SignalOverrideRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
):
    """Manual emergency toggle for dispatchers/admins with metrics and audit logging."""
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )

    now = datetime.now(timezone.utc)
    signal.current_phase = SignalPhase.GREEN.value
    signal.transition_state = SignalTransitionState.PREEMPTED.value
    signal.is_preempted = True
    signal.preemptions_count = (signal.preemptions_count or 0) + 1
    signal.last_preemption_at = now

    if override_data:
        if override_data.vehicle_id:
            signal.preempted_by_vehicle_id = override_data.vehicle_id

        if override_data.preemption_end_time:
            signal.preemption_end_time = override_data.preemption_end_time
        elif override_data.duration_seconds:
            signal.preemption_end_time = now + timedelta(
                seconds=override_data.duration_seconds
            )
        else:
            signal.preemption_end_time = now + timedelta(seconds=60)
    else:
        signal.preemption_end_time = now + timedelta(seconds=60)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="SIGNAL_PREEMPTED_MANUAL",
            performed_by_id=current_user.id,
            details=f"Manual override on signal {id} by {current_user.email}",
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
            "phase": signal.current_phase,
            "is_preempted": True,
        },
    )
    return signal


@router.post(
    "/{id}/reset",
    response_model=SignalResponse,
    summary="Reset traffic signal to normal autonomous cycle",
)
async def reset_signal(
    id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["DISPATCHER", "ADMIN"])),
):
    """Resets signal back to normal autonomous cycle and clears vehicle locks."""
    signal = db.query(TrafficSignal).filter(TrafficSignal.id == id).first()
    if not signal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic signal '{id}' not found",
        )

    return await reset_signal_state(
        db,
        signal,
        reason="MANUAL_RESET",
        performed_by_id=current_user.id,
    )
