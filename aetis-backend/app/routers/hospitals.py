"""
AETIS Central Engine — Hospitals Router
Read-only inbound ER triage alerts, hospital listing, and trauma acknowledgment handshakes.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.enums import ACTIVE_EMERGENCY_STATUSES
from app.models.hospital import Hospital, HospitalAlert
from app.models.user import User
from app.schemas.hospital import (
    HospitalAcknowledgeReceipt,
    HospitalAcknowledgeRequest,
    HospitalAlertResponse,
    HospitalResponse,
)

router = APIRouter()


def _unit_alert_from_emergency(
    emg: Emergency,
    alert: Optional[HospitalAlert],
    unit_role: str,
) -> HospitalAlertResponse:
    if alert is not None:
        return HospitalAlertResponse.model_validate(alert)
    return HospitalAlertResponse(
        id=str(emg.id),
        emergency_id=str(emg.id),
        emergency_title=emg.title,
        severity=emg.severity,
        estimated_arrival_minutes=None,
        patient_notes=emg.patient_notes,
        acknowledged=False,
        acknowledged_at=None,
        trauma_bay_assigned=None,
        notes=emg.patient_notes,
        hospital_id=emg.destination_hospital_id or unit_role,
        patient_condition=emg.severity,
        estimated_arrival=emg.created_at,
    )


@router.get(
    "/inbound-alerts",
    response_model=list[HospitalAlertResponse],
    summary="Get Hospital Inbound Triage Alerts",
    description="Read-only query returning inbound triage alerts for active emergencies.",
)
async def get_inbound_alerts(
    hospital_id: Optional[str] = Query(None, description="Optional facility filter for Admin/Dispatcher"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[HospitalAlertResponse]:
    """Retrieve active inbound triage alerts without mutating DB state on GET."""
    target_hospital_id: Optional[str] = None
    role_upper = (current_user.role or "").upper()

    if role_upper in {"POLICE", "FIRE"}:
        unit_emergencies = (
            db.query(Emergency)
            .filter(
                Emergency.status.in_(ACTIVE_EMERGENCY_STATUSES),
                Emergency.type == role_upper.lower(),
            )
            .order_by(Emergency.created_at.desc())
            .all()
        )
        emg_ids = [e.id for e in unit_emergencies]
        alerts_by_emg = (
            {
                a.emergency_id: a
                for a in db.query(HospitalAlert)
                .filter(HospitalAlert.emergency_id.in_(emg_ids))
                .all()
            }
            if emg_ids
            else {}
        )
        return [
            _unit_alert_from_emergency(e, alerts_by_emg.get(e.id), role_upper)
            for e in unit_emergencies
        ]

    if role_upper == "HOSPITAL":
        if not current_user.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User account is not linked to any hospital facility",
            )
        target_hospital_id = current_user.hospital_id
    elif role_upper in {"ADMIN", "DISPATCHER"}:
        target_hospital_id = hospital_id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role permissions to access inbound alerts",
        )

    query = (
        db.query(HospitalAlert)
        .join(Emergency, HospitalAlert.emergency_id == Emergency.id)
        .filter(Emergency.status.in_(ACTIVE_EMERGENCY_STATUSES))
    )
    if target_hospital_id:
        query = query.filter(HospitalAlert.hospital_id == target_hospital_id)

    alerts = query.order_by(HospitalAlert.estimated_arrival.asc()).all()
    return [HospitalAlertResponse.model_validate(a) for a in alerts]


@router.get(
    "/inbound-alerts/{emergency_id}",
    response_model=HospitalAlertResponse,
    summary="Get Single Inbound Alert by Emergency ID",
)
async def get_inbound_alert_by_emergency(
    emergency_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HospitalAlertResponse:
    """Retrieve a single inbound alert by emergency ID (role-scoped)."""
    role_upper = (current_user.role or "").upper()
    if role_upper not in {"HOSPITAL", "POLICE", "FIRE", "ADMIN", "DISPATCHER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role permissions",
        )
    alert = (
        db.query(HospitalAlert)
        .filter(HospitalAlert.emergency_id == emergency_id)
        .first()
    )
    if role_upper in {"POLICE", "FIRE"}:
        emg = db.query(Emergency).filter(Emergency.id == emergency_id).first()
        if not emg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inbound alert for emergency '{emergency_id}' not found",
            )
        if (emg.type or "").lower() != role_upper.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot inspect alert for a non-{role_upper.lower()} emergency",
            )
        return _unit_alert_from_emergency(emg, alert, role_upper)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inbound alert for emergency '{emergency_id}' not found",
        )
    if role_upper == "HOSPITAL" and current_user.hospital_id != alert.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot inspect alert assigned to another hospital facility",
        )
    return HospitalAlertResponse.model_validate(alert)


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=HospitalAcknowledgeReceipt,
    summary="Acknowledge Inbound Alert (ER Handshake)",
    description="Emergency room or station staff acknowledges an inbound alert (accepts alert ID or emergency ID).",
)
async def acknowledge_alert(
    alert_id: str,
    payload: Optional[HospitalAcknowledgeRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["HOSPITAL", "POLICE", "FIRE", "ADMIN"])),
) -> HospitalAcknowledgeReceipt:
    """Record hospital or unit acknowledgment of an inbound emergency."""
    from sqlalchemy import or_

    role_upper = current_user.role.upper()
    alert = (
        db.query(HospitalAlert)
        .filter(or_(HospitalAlert.id == alert_id, HospitalAlert.emergency_id == alert_id))
        .first()
    )
    if not alert and role_upper in {"POLICE", "FIRE", "ADMIN"}:
        emg = db.query(Emergency).filter(Emergency.id == alert_id).first()
        if emg:
            if role_upper in {"POLICE", "FIRE"} and (emg.type or "").lower() != role_upper.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Cannot acknowledge a non-{role_upper.lower()} emergency",
                )
            now = datetime.now(timezone.utc)
            bay = payload.trauma_bay_assigned.strip() if payload and payload.trauma_bay_assigned else f"{role_upper}-UNIT-1"
            db.add(
                AuditLog(
                    id=str(uuid.uuid4()),
                    action=f"{role_upper}_ALERT_ACKNOWLEDGED",
                    performed_by_id=current_user.id,
                    details=f"Emergency {emg.id} acknowledged by {current_user.email}. Unit: {bay}",
                    timestamp=now,
                )
            )
            db.commit()
            return HospitalAcknowledgeReceipt(
                status="ACKNOWLEDGED",
                alert_id=str(emg.id),
                emergency_id=str(emg.id),
                hospital_id=emg.destination_hospital_id or role_upper,
                trauma_bay_assigned=bay,
                acknowledged_by_id=current_user.id,
                acknowledged_at=now,
                notes=payload.notes.strip() if payload and payload.notes else None,
            )

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital alert '{alert_id}' not found",
        )

    if role_upper == "HOSPITAL" and current_user.hospital_id != alert.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot acknowledge an alert assigned to a different hospital facility",
        )
    if role_upper in {"POLICE", "FIRE"}:
        emg = db.query(Emergency).filter(Emergency.id == alert.emergency_id).first()
        if not emg or (emg.type or "").lower() != role_upper.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot acknowledge a non-{role_upper.lower()} emergency",
            )

    now = datetime.now(timezone.utc)
    bay = payload.trauma_bay_assigned.strip() if payload and payload.trauma_bay_assigned else "ER-BAY-1"
    alert.acknowledged = True
    alert.acknowledged_by_id = current_user.id
    alert.acknowledged_at = now
    alert.trauma_bay_assigned = bay
    if payload and payload.notes:
        alert.notes = payload.notes.strip()

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="HOSPITAL_ALERT_ACKNOWLEDGED",
            performed_by_id=current_user.id,
            details=(
                f"Alert {alert.id} for emergency {alert.emergency_id} acknowledged by {current_user.email}. "
                f"Trauma Bay: {alert.trauma_bay_assigned}"
            ),
            timestamp=now,
        )
    )

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
