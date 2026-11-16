"""
AETIS Central Engine — Analytics Router
Endpoints for operational KPIs, system efficiency metrics, and traffic intelligence reporting.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.signal import Signal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.analytics import AnalyticsKPIResponse

router = APIRouter()


@router.get(
    "/kpis",
    response_model=AnalyticsKPIResponse,
    summary="Get System Operational KPIs",
    description=(
        "Calculates system-wide performance indicators: total emergencies, active incidents, "
        "average response time in minutes, fleet vehicle utilization percentage, and total signal preemptions."
    ),
)
async def get_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalyticsKPIResponse:
    """Calculate and return operational intelligence KPIs."""
    # 1. Total Emergencies: count of all incidents ever recorded
    total_emergencies = db.query(Emergency).count()

    # 2. Active Emergencies: count of currently pending, dispatched, or in-transit incidents
    active_emergencies = db.query(Emergency).filter(
        Emergency.status.in_(["PENDING", "DISPATCHED", "IN_TRANSIT"])
    ).count()

    # 3. Average Response Time (minutes): mean duration between created_at and completed_at
    completed = db.query(Emergency).filter(
        Emergency.status == "COMPLETED",
        Emergency.completed_at.isnot(None),
    ).all()

    if completed:
        durations = [
            (e.completed_at - e.created_at).total_seconds() / 60.0
            for e in completed
            if e.completed_at and e.created_at and e.completed_at > e.created_at
        ]
        avg_response_time = round(sum(durations) / len(durations), 2) if durations else 0.0
    else:
        avg_response_time = 0.0

    # 4. Fleet Utilization Rate: percentage of vehicles currently DISPATCHED or BUSY vs total fleet
    total_vehicles = db.query(Vehicle).count()
    busy_vehicles = db.query(Vehicle).filter(
        Vehicle.status.in_(["DISPATCHED", "BUSY"])
    ).count()

    utilization_rate = (
        round((busy_vehicles / total_vehicles) * 100.0, 2)
        if total_vehicles > 0
        else 0.0
    )

    # 5. Total Signal Preemptions: sum from signals table or preemption audit logs
    signal_preemptions = db.query(func.coalesce(func.sum(Signal.preemptions_count), 0)).scalar() or 0
    audit_preemptions = db.query(AuditLog).filter(AuditLog.action.ilike("%PREEMPT%")).count()
    total_preemptions = int(max(signal_preemptions, audit_preemptions))

    return AnalyticsKPIResponse(
        total_emergencies=total_emergencies,
        active_emergencies=active_emergencies,
        avg_response_time_minutes=avg_response_time,
        fleet_utilization_rate=utilization_rate,
        total_signal_preemptions=total_preemptions,
    )
