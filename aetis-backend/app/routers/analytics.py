from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.emergency import Emergency, EmergencyStatus
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.signal import Signal

router = APIRouter()


class AnalyticsKPIsResponse(BaseModel):
    total_emergencies: int
    active_emergencies: int
    avg_response_time_minutes: float
    fleet_utilization_rate: float
    total_signal_preemptions: int


@router.get(
    "/kpis",
    response_model=AnalyticsKPIsResponse,
    summary="Get central intelligence system KPIs"
)
def get_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculates operational metrics across incidents, response times, fleet utilization, and traffic signals:

    - total_emergencies: count of all incidents
    - active_emergencies: count of pending/dispatched/in-transit incidents
    - avg_response_time_minutes: average difference between created_at and completed_at
    - fleet_utilization_rate: percentage of vehicles currently dispatched or busy vs total fleet
    - total_signal_preemptions: count from signals table
    """
    # 1. Total emergencies
    total_emergencies = db.query(Emergency).count()

    # 2. Active emergencies (PENDING, DISPATCHED, IN_TRANSIT, ARRIVED)
    active_emergencies = db.query(Emergency).filter(
        Emergency.status.in_([
            EmergencyStatus.PENDING,
            EmergencyStatus.DISPATCHED,
            EmergencyStatus.IN_TRANSIT,
            EmergencyStatus.ARRIVED,
        ])
    ).count()

    # 3. Average response time in minutes (created_at -> completed_at)
    completed_incidents = db.query(Emergency).filter(
        Emergency.completed_at.isnot(None),
        Emergency.completed_at > Emergency.created_at
    ).all()

    if completed_incidents:
        total_minutes = sum(
            (e.completed_at - e.created_at).total_seconds() / 60.0
            for e in completed_incidents
        )
        avg_response_time_minutes = round(total_minutes / len(completed_incidents), 2)
    else:
        avg_response_time_minutes = 0.0

    # 4. Fleet utilization rate (percentage dispatched or busy)
    total_vehicles = db.query(Vehicle).count()
    busy_vehicles = db.query(Vehicle).filter(
        Vehicle.status.in_([VehicleStatus.DISPATCHED, VehicleStatus.BUSY])
    ).count()

    if total_vehicles > 0:
        fleet_utilization_rate = round((busy_vehicles / total_vehicles) * 100.0, 2)
    else:
        fleet_utilization_rate = 0.0

    # 5. Total traffic signal preemptions
    sum_preemptions = db.query(func.sum(Signal.preemption_count)).scalar()
    total_signal_preemptions = int(sum_preemptions or 0)

    return AnalyticsKPIsResponse(
        total_emergencies=total_emergencies,
        active_emergencies=active_emergencies,
        avg_response_time_minutes=avg_response_time_minutes,
        fleet_utilization_rate=fleet_utilization_rate,
        total_signal_preemptions=total_signal_preemptions,
    )
