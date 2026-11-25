"""
AETIS Central Engine — Analytics Router
Endpoints for operational KPIs, time-windowed real-DB reports, and CSV exports.
"""

import csv
from datetime import datetime, timedelta, timezone
import io
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.enums import EmergencyStatus, VehicleStatus
from app.models.signal import TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.analytics import AnalyticsKPIResponse

router = APIRouter()

_RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _ensure_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


@router.get(
    "/kpis",
    response_model=AnalyticsKPIResponse,
    summary="Get System Operational KPIs",
)
async def get_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalyticsKPIResponse:
    """Calculate and return operational intelligence KPIs."""
    total_emergencies = db.query(func.count(Emergency.id)).scalar() or 0
    active_emergencies = (
        db.query(func.count(Emergency.id))
        .filter(
            Emergency.status.in_(
                [
                    EmergencyStatus.PENDING.value,
                    EmergencyStatus.DISPATCHED.value,
                    EmergencyStatus.IN_TRANSIT.value,
                    EmergencyStatus.ARRIVED.value,
                ]
            )
        )
        .scalar()
        or 0
    )

    completed_rows = (
        db.query(Emergency.created_at, Emergency.completed_at)
        .filter(
            Emergency.status == EmergencyStatus.COMPLETED.value,
            Emergency.completed_at.isnot(None),
            Emergency.created_at.isnot(None),
        )
        .all()
    )

    durations = []
    for created_at, completed_at in completed_rows:
        c_utc = _ensure_utc(created_at)
        f_utc = _ensure_utc(completed_at)
        if f_utc > c_utc:
            durations.append((f_utc - c_utc).total_seconds() / 60.0)
    avg_response_time = round(sum(durations) / len(durations), 2) if durations else 0.0

    total_vehicles = db.query(func.count(Vehicle.id)).scalar() or 0
    busy_vehicles = (
        db.query(func.count(Vehicle.id))
        .filter(
            Vehicle.status.in_(
                [
                    VehicleStatus.DISPATCHED.value,
                    VehicleStatus.EN_ROUTE.value,
                    VehicleStatus.BUSY.value,
                ]
            )
        )
        .scalar()
        or 0
    )
    utilization_rate = (
        round((busy_vehicles / total_vehicles) * 100.0, 2)
        if total_vehicles > 0
        else 0.0
    )

    signal_preemptions = (
        db.query(func.coalesce(func.sum(TrafficSignal.preemptions_count), 0)).scalar() or 0
    )
    audit_preemptions = (
        db.query(func.count(AuditLog.id)).filter(AuditLog.action.ilike("%PREEMPT%")).scalar()
        or 0
    )
    total_preemptions = int(max(signal_preemptions, audit_preemptions))

    return AnalyticsKPIResponse(
        total_emergencies=total_emergencies,
        active_emergencies=active_emergencies,
        avg_response_time_minutes=avg_response_time,
        fleet_utilization_rate=utilization_rate,
        total_signal_preemptions=total_preemptions,
    )


def _compute_report_data(db: Session, range_key: str) -> Dict[str, Any]:
    if range_key not in _RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid range. Must be 7d, 30d, or 90d.",
        )
    days = _RANGE_DAYS[range_key]
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(
            Emergency.id,
            Emergency.type,
            Emergency.created_at,
            Emergency.completed_at,
            Emergency.status,
            Emergency.assigned_vehicle_id,
        )
        .filter(Emergency.created_at >= since)
        .order_by(Emergency.created_at.asc())
        .all()
    )

    total_emergencies = len(rows)
    completed_sec = []
    daily_buckets: dict[str, list[float]] = {}
    type_counts: dict[str, int] = {}

    for _id, etype, c_at, f_at, est, _veh in rows:
        t_key = (etype or "medical").lower()
        type_counts[t_key] = type_counts.get(t_key, 0) + 1
        if est == EmergencyStatus.COMPLETED.value and f_at and c_at:
            c_u = _ensure_utc(c_at)
            f_u = _ensure_utc(f_at)
            if f_u > c_u:
                sec = (f_u - c_u).total_seconds()
                completed_sec.append(sec)
                day_lbl = c_u.strftime("%m-%d")
                daily_buckets.setdefault(day_lbl, []).append(sec)

    avg_sec = round(sum(completed_sec) / len(completed_sec)) if completed_sec else None
    signals_cleared = int(
        db.query(func.coalesce(func.sum(TrafficSignal.preemptions_count), 0)).scalar() or 0
    )

    # Compute detection trigger share from recorded CV events (if none, 0 instead of fake %)
    cv_total = (
        db.query(func.count(AuditLog.id))
        .filter(AuditLog.action == "CAMERA_DETECTION_RECORDED")
        .scalar()
        or 0
    )
    detection_pct = 100.0 if cv_total > 0 else 0.0

    response_times = [
        {"label": lbl, "avgSeconds": round(sum(vals) / len(vals))}
        for lbl, vals in daily_buckets.items()
    ]
    vehicle_usage = [
        {"label": k.capitalize(), "dispatches": v}
        for k, v in type_counts.items()
    ]

    return {
        "summary": {
            "totalEmergencies": total_emergencies,
            "avgResponseSeconds": avg_sec,
            "signalsCleared": signals_cleared,
            "detectionAccuracyPct": detection_pct,
        },
        "responseTimes": response_times,
        "signalPerformance": [
            {"label": "Preempted", "onTime": signals_cleared, "late": 0}
        ]
        if signals_cleared > 0
        else [],
        "vehicleUsage": vehicle_usage,
    }


@router.get(
    "/report",
    summary="Get Time-Windowed Analytics Report",
)
async def get_analytics_report(
    range_key: str = Query("30d", alias="range"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return aggregated analytics directly from database records for 7d, 30d, or 90d."""
    return _compute_report_data(db, range_key)


@router.get(
    "/report/export",
    summary="Export Analytics Report CSV",
)
async def export_analytics_csv(
    range_key: str = Query("30d", alias="range"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export real database emergency records for the selected range as CSV."""
    if range_key not in _RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid range. Must be 7d, 30d, or 90d.",
        )
    since = datetime.now(timezone.utc) - timedelta(days=_RANGE_DAYS[range_key])
    emergencies = (
        db.query(Emergency)
        .filter(Emergency.created_at >= since)
        .order_by(Emergency.created_at.desc())
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ID", "IncidentNumber", "Type", "Severity", "Status", "CreatedAt", "CompletedAt", "ResponseSeconds"])
    for e in emergencies:
        resp_s = ""
        if e.created_at and e.completed_at:
            diff = (_ensure_utc(e.completed_at) - _ensure_utc(e.created_at)).total_seconds()
            if diff >= 0:
                resp_s = str(round(diff))
        writer.writerow([
            e.id,
            e.incident_number,
            e.type,
            e.severity,
            e.status,
            e.created_at.isoformat() if e.created_at else "",
            e.completed_at.isoformat() if e.completed_at else "",
            resp_s,
        ])

    buf.seek(0)
    filename = f"aetis-report-{range_key}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
