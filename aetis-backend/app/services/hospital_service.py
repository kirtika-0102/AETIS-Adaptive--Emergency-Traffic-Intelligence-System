"""
AETIS Central Engine — Hospital Alert Service
Handles atomic, idempotent creation and live ETA synchronization of inbound hospital alerts.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.emergency import Emergency
from app.models.hospital import Hospital, HospitalAlert
from app.models.vehicle import Vehicle
from app.utils.geo import haversine_distance


def estimate_eta_datetime(
    db: Session,
    emergency: Emergency,
    eta_seconds: Optional[float] = None,
) -> Optional[datetime]:
    """Calculate real ETA timestamp from vehicle position to destination hospital, or None if unavailable."""
    if eta_seconds is not None and eta_seconds >= 0:
        return datetime.now(timezone.utc) + timedelta(seconds=float(eta_seconds))

    if not emergency.destination_hospital_id or not emergency.assigned_vehicle_id:
        return None

    hospital = db.query(Hospital).filter(Hospital.id == emergency.destination_hospital_id).first()
    vehicle = db.query(Vehicle).filter(Vehicle.id == emergency.assigned_vehicle_id).first()
    if (
        not hospital
        or not vehicle
        or vehicle.current_latitude is None
        or vehicle.current_longitude is None
    ):
        return None

    dist_meters = haversine_distance(
        vehicle.current_latitude,
        vehicle.current_longitude,
        hospital.latitude,
        hospital.longitude,
    )
    speed_mps = max((vehicle.speed or 0.0) * (1000.0 / 3600.0), 5.56)
    computed_seconds = dist_meters / speed_mps
    return datetime.now(timezone.utc) + timedelta(seconds=computed_seconds)


def upsert_hospital_alert_for_emergency(
    db: Session,
    emergency: Emergency,
    eta_seconds: Optional[float] = None,
) -> Optional[HospitalAlert]:
    """Create or update the single HospitalAlert for an active emergency with a destination hospital."""
    if not emergency.destination_hospital_id:
        return None

    condition = emergency.patient_notes or f"Patient inbound - {emergency.title} ({emergency.severity})"
    eta_dt = estimate_eta_datetime(db, emergency, eta_seconds=eta_seconds)

    existing = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == emergency.id).first()
    if existing:
        existing.hospital_id = emergency.destination_hospital_id
        existing.patient_condition = condition[:255]
        if eta_dt is not None:
            existing.estimated_arrival = eta_dt
        return existing

    alert = HospitalAlert(
        id=str(uuid.uuid4()),
        emergency_id=emergency.id,
        hospital_id=emergency.destination_hospital_id,
        estimated_arrival=eta_dt,
        patient_condition=condition[:255],
        acknowledged=False,
    )
    db.add(alert)
    return alert


def update_hospital_alert_eta(
    db: Session,
    emergency_id: str,
    eta_seconds: Optional[float],
) -> None:
    """Update dynamic estimated_arrival on an existing HospitalAlert from live telemetry."""
    if eta_seconds is None or eta_seconds < 0:
        return
    alert = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == emergency_id).first()
    if alert:
        alert.estimated_arrival = datetime.now(timezone.utc) + timedelta(seconds=float(eta_seconds))


def close_hospital_alerts_for_emergency(
    db: Session,
    emergency_id: str,
    terminal_status: str,
) -> None:
    """Annotate open alerts when the associated emergency reaches COMPLETED or CANCELLED."""
    alert = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == emergency_id).first()
    if not alert:
        return
    note_tag = f"[Incident {terminal_status} at {datetime.now(timezone.utc).isoformat()}]"
    alert.notes = f"{alert.notes}\n{note_tag}".strip() if alert.notes else note_tag
