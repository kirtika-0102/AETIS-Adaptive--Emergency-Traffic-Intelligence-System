from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.hospital import Hospital, HospitalAlert
from app.models.emergency import Emergency, EmergencyStatus
from app.models.audit import AuditLog
from app.schemas.hospital import (
    HospitalResponse,
    HospitalAlertResponse,
    HospitalAcknowledgeRequest,
    HospitalAcknowledgeResponse,
)

router = APIRouter()


@router.get(
    "",
    response_model=List[HospitalResponse],
    summary="List all hospitals"
)
def list_hospitals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all registered medical facilities with trauma levels and bed capacities."""
    return db.query(Hospital).all()


@router.get(
    "/inbound-alerts",
    response_model=List[HospitalAlertResponse],
    summary="Get inbound emergency triage alerts for hospital ER"
)
def get_inbound_alerts(
    hospital_id: Optional[str] = Query(None, description="Optional facility filter for administrators"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Protected endpoint for hospital ER teams.

    For users with role 'HOSPITAL', automatically uses current_user.hospital_id
    to query all active emergencies en route to their facility.
    """
    target_hospital_id = None

    user_role_str = str(
        current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    ).upper()

    if user_role_str == "HOSPITAL":
        target_hospital_id = current_user.hospital_id
        if not target_hospital_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current hospital account is not associated with any hospital facility.",
            )
    else:
        target_hospital_id = hospital_id or current_user.hospital_id

    # Automatically ensure active emergencies destined for this hospital have alert records
    if target_hospital_id:
        active_emergencies = db.query(Emergency).filter(
            Emergency.destination_hospital_id == target_hospital_id,
            Emergency.status.in_([
                EmergencyStatus.PENDING,
                EmergencyStatus.DISPATCHED,
                EmergencyStatus.IN_TRANSIT,
                EmergencyStatus.ARRIVED,
            ])
        ).all()

        for emg in active_emergencies:
            existing_alert = db.query(HospitalAlert).filter(
                HospitalAlert.emergency_id == emg.id,
                HospitalAlert.hospital_id == target_hospital_id
            ).first()

            if not existing_alert:
                eta = datetime.now(timezone.utc) + timedelta(minutes=10)
                condition = emg.patient_notes or f"{emg.severity.value} priority case: {emg.title}"
                new_alert = HospitalAlert(
                    emergency_id=emg.id,
                    hospital_id=target_hospital_id,
                    estimated_arrival=eta,
                    patient_condition=condition[:250],
                    acknowledged=False,
                )
                db.add(new_alert)
        db.commit()

    # Query alerts
    query = db.query(HospitalAlert)
    if target_hospital_id:
        query = query.filter(HospitalAlert.hospital_id == target_hospital_id)

    alerts = query.order_by(HospitalAlert.created_at.desc()).all()

    response = []
    now = datetime.now(timezone.utc)
    for alert in alerts:
        # Calculate ETA minutes
        if alert.estimated_arrival:
            diff_seconds = (alert.estimated_arrival - now).total_seconds()
            eta_minutes = max(0, int(diff_seconds / 60))
        else:
            eta_minutes = 10

        emg = alert.emergency
        title = emg.title if emg else "Emergency Alert"
        severity_val = emg.severity.value if emg and hasattr(emg.severity, "value") else "MEDIUM"
        patient_notes = emg.patient_notes if emg else None

        response.append(
            HospitalAlertResponse(
                id=alert.id,
                emergency_id=alert.emergency_id,
                emergency_title=title,
                severity=severity_val,
                estimated_arrival_minutes=eta_minutes,
                patient_notes=patient_notes,
                acknowledged=alert.acknowledged,
                acknowledged_at=alert.acknowledged_at,
                trauma_bay_assigned=alert.trauma_bay_assigned,
                patient_condition=alert.patient_condition,
                created_at=alert.created_at,
            )
        )

    return response


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=HospitalAcknowledgeResponse,
    summary="Acknowledge ER triage inbound alert and assign trauma bay"
)
def acknowledge_alert(
    alert_id: str,
    payload: HospitalAcknowledgeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sets acknowledged=True, acknowledged_by_id=current_user.id, acknowledged_at=datetime.now().

    Assigns the trauma bay and returns the acknowledgment handshake receipt.
    """
    alert = db.query(HospitalAlert).filter(HospitalAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital alert '{alert_id}' not found."
        )

    user_role_str = str(
        current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    ).upper()

    if user_role_str == "HOSPITAL" and current_user.hospital_id != alert.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot acknowledge alerts destined for another hospital facility."
        )

    now = datetime.now(timezone.utc)
    alert.acknowledged = True
    alert.acknowledged_by_id = current_user.id
    alert.acknowledged_at = now
    alert.trauma_bay_assigned = payload.trauma_bay_assigned
    if payload.notes:
        alert.notes = payload.notes

    audit = AuditLog(
        action="HOSPITAL_ALERT_ACKNOWLEDGED",
        performed_by_id=current_user.id,
        details=(
            f"Alert '{alert.id}' acknowledged for emergency '{alert.emergency_id}'. "
            f"Trauma bay assigned: '{payload.trauma_bay_assigned}'."
        ),
    )
    db.add(audit)

    db.commit()
    db.refresh(alert)

    return HospitalAcknowledgeResponse(
        alert_id=alert.id,
        status="ACKNOWLEDGED",
        acknowledged_at=alert.acknowledged_at,
        acknowledged_by=current_user.full_name,
        trauma_bay_assigned=payload.trauma_bay_assigned,
        notes=payload.notes,
        message=f"Triage alert acknowledged and {payload.trauma_bay_assigned} prepared."
    )
