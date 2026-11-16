"""
AETIS Central Engine — Hospitals Router
Endpoints for hospital facility management, inbound ER triage alerts, and trauma acknowledgment handshakes.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.hospital import Hospital, HospitalAlert
from app.models.user import User
from app.schemas.hospital import (
    HospitalAcknowledgeReceipt,
    HospitalAcknowledgeRequest,
    HospitalAlertResponse,
    HospitalResponse,
)

router = APIRouter()


@router.get(
    "/inbound-alerts",
    response_model=list[HospitalAlertResponse],
    summary="Get Hospital Inbound Triage Alerts",
    description="For HOSPITAL users, automatically resolves their hospital_id and returns active emergencies en route. Dispatchers/Admins can query all or filter by hospital_id.",
)
async def get_inbound_alerts(
    hospital_id: Optional[str] = Query(None, description="Optional facility filter for Admin/Dispatcher"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[HospitalAlertResponse]:
    """Retrieve active inbound triage alerts for the authenticated hospital facility."""
    target_hospital_id: Optional[str] = None

    if current_user.role.upper() == "HOSPITAL":
        if not current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User account is not linked to any hospital facility",
            )
        target_hospital_id = current_user.hospital_id
    elif current_user.role.upper() in {"ADMIN", "DISPATCHER"}:
        target_hospital_id = hospital_id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role permissions to access inbound alerts",
        )

    # Automatically generate alerts for any active emergency en route to the target hospital
    # that does not yet have an alert record.
    emg_query = db.query(Emergency).filter(
        Emergency.status.in_(["DISPATCHED", "IN_TRANSIT", "ARRIVED"]),
        Emergency.destination_hospital_id.isnot(None),
    )
    if target_hospital_id:
        emg_query = emg_query.filter(Emergency.destination_hospital_id == target_hospital_id)

    active_emergencies = emg_query.all()
    created_any = False
    for emg in active_emergencies:
        existing_alert = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == emg.id).first()
        if not existing_alert:
            # Default ETA 10 minutes in future
            eta = datetime.now(timezone.utc) + timedelta(minutes=10)
            condition = emg.patient_notes or f"Patient inbound - {emg.title} ({emg.severity})"
            new_alert = HospitalAlert(
                id=str(uuid.uuid4()),
                emergency_id=emg.id,
                hospital_id=emg.destination_hospital_id,
                estimated_arrival=eta,
                patient_condition=condition[:255],
                acknowledged=False,
            )
            db.add(new_alert)
            created_any = True

    if created_any:
        db.commit()

    # Query all active alerts
    query = db.query(HospitalAlert).join(Emergency, HospitalAlert.emergency_id == Emergency.id).filter(
        Emergency.status.in_(["DISPATCHED", "IN_TRANSIT", "ARRIVED", "PENDING"])
    )
    if target_hospital_id:
        query = query.filter(HospitalAlert.hospital_id == target_hospital_id)

    alerts = query.order_by(HospitalAlert.estimated_arrival.asc()).all()
    return [HospitalAlertResponse.model_validate(a) for a in alerts]


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=HospitalAcknowledgeReceipt,
    summary="Acknowledge Inbound Alert (ER Handshake)",
    description="Emergency room staff acknowledges an inbound alert, assigns a trauma bay, and confirms team readiness.",
)
async def acknowledge_alert(
    alert_id: str,
    payload: HospitalAcknowledgeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["HOSPITAL", "ADMIN"])),
) -> HospitalAcknowledgeReceipt:
    """Record hospital acknowledgment of an inbound emergency and trauma bay reservation."""
    alert = db.query(HospitalAlert).filter(HospitalAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital alert '{alert_id}' not found",
        )

    if current_user.role.upper() == "HOSPITAL" and current_user.hospital_id != alert.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot acknowledge an alert assigned to a different hospital facility",
        )

    now = datetime.now(timezone.utc)
    alert.acknowledged = True
    alert.acknowledged_by_id = current_user.id
    alert.acknowledged_at = now
    alert.trauma_bay_assigned = payload.trauma_bay_assigned.strip()
    if payload.notes:
        alert.notes = payload.notes.strip()

    # Log audit event
    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="HOSPITAL_ALERT_ACKNOWLEDGED",
        performed_by_id=current_user.id,
        details=(
            f"Alert {alert.id} for emergency {alert.emergency_id} acknowledged by {current_user.email}. "
            f"Trauma Bay: {alert.trauma_bay_assigned}"
        ),
        timestamp=now,
    )
    db.add(audit)

    db.commit()
    db.refresh(alert)

    return HospitalAcknowledgeReceipt(
        status="ACKNOWLEDGED",
        alert_id=alert.id,
        emergency_id=alert.emergency_id,
        hospital_id=alert.hospital_id,
        trauma_bay_assigned=alert.trauma_bay_assigned,
        acknowledged_by_id=current_user.id,
        acknowledged_at=now,
        notes=alert.notes,
    )


@router.get(
    "",
    response_model=list[HospitalResponse],
    summary="List Hospital Facilities",
    description="Retrieve all registered hospital facilities and trauma centers.",
)
async def list_hospitals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[HospitalResponse]:
    """List all registered hospitals."""
    hospitals = db.query(Hospital).order_by(Hospital.name.asc()).all()
    return [HospitalResponse.model_validate(h) for h in hospitals]
