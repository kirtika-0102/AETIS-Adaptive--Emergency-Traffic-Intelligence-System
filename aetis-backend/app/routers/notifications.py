"""
AETIS Central Engine — Notifications Router
Serves role-scoped operational notifications derived from AuditLog events.
Note: Per-user read state (_READ_BY_USER) is stored in-memory per process to avoid
requiring a dedicated notifications table migration in this targeted fix.
"""

from typing import Any, Dict, List, Set

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.user import User
from app.models.vehicle import Vehicle

router = APIRouter()

_READ_BY_USER: dict[str, Set[str]] = {}


def _map_audit_type(action: str) -> tuple[str, str, bool]:
    a = (action or "").upper()
    if "PREEMPT" in a:
        return "signal_fault", "Signal preemption triggered", False
    if "EMERGENCY" in a:
        return "emergency_assigned", "Emergency update", True
    if "HOSPITAL" in a:
        return "emergency_incoming", "Hospital alert updated", False
    return "system", "System event", False


def _filter_logs_for_user(db: Session, current_user: User, limit: int) -> List[AuditLog]:
    role_upper = (current_user.role or "").strip().upper()
    candidates = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(min(limit * 4, 250))
        .all()
    )

    if role_upper == "ADMIN":
        return candidates[:limit]

    if role_upper == "DISPATCHER":
        # Dispatchers see operational traffic/emergency/hospital events, not admin user-account actions
        filtered = [
            e for e in candidates
            if not (e.action or "").upper().startswith("USER_")
        ]
        return filtered[:limit]

    if role_upper == "DRIVER":
        veh_ids = {
            v[0]
            for v in db.query(Vehicle.id)
            .filter(Vehicle.current_driver_id == current_user.id)
            .all()
        }
        emgs = (
            db.query(Emergency.id, Emergency.incident_number)
            .filter(Emergency.assigned_vehicle_id.in_(veh_ids))
            .all()
            if veh_ids
            else []
        )
        tokens = veh_ids | {e[0] for e in emgs} | {e[1] for e in emgs if e[1]}
        results: List[AuditLog] = []
        for e in candidates:
            act = (e.action or "").upper()
            if act.startswith("USER_") or act.startswith("CAMERA_"):
                continue
            details = e.details or ""
            if e.performed_by_id == current_user.id or any(tok in details for tok in tokens):
                results.append(e)
            if len(results) >= limit:
                break
        return results

    if role_upper == "HOSPITAL":
        if not current_user.hospital_id:
            return []
        emgs = (
            db.query(Emergency.id, Emergency.incident_number)
            .filter(Emergency.destination_hospital_id == current_user.hospital_id)
            .all()
        )
        tokens = {current_user.hospital_id} | {e[0] for e in emgs} | {e[1] for e in emgs if e[1]}
        results = []
        for e in candidates:
            act = (e.action or "").upper()
            if not (act.startswith("HOSPITAL_") or act.startswith("EMERGENCY_")):
                continue
            details = e.details or ""
            if e.performed_by_id == current_user.id or any(tok in details for tok in tokens):
                results.append(e)
            if len(results) >= limit:
                break
        return results

    if role_upper in {"POLICE", "FIRE"}:
        emgs = (
            db.query(Emergency.id, Emergency.incident_number)
            .filter(Emergency.type == role_upper.lower())
            .all()
        )
        tokens = {e[0] for e in emgs} | {e[1] for e in emgs if e[1]}
        results = []
        for e in candidates:
            act = (e.action or "").upper()
            if not (act.startswith(f"{role_upper}_") or act.startswith("EMERGENCY_")):
                continue
            details = e.details or ""
            if e.performed_by_id == current_user.id or any(tok in details for tok in tokens):
                results.append(e)
            if len(results) >= limit:
                break
        return results

    return []


@router.get("", summary="List Recent Notifications")
def get_notifications(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return recent role-scoped operational notifications for the signed-in user."""
    logs = _filter_logs_for_user(db, current_user, limit)
    read_ids = _READ_BY_USER.get(current_user.id, set())
    items = []
    unread_count = 0

    for entry in logs:
        ntype, title, urgent = _map_audit_type(entry.action)
        is_read = entry.id in read_ids
        if not is_read:
            unread_count += 1
        items.append(
            {
                "id": entry.id,
                "type": ntype,
                "title": title,
                "message": entry.details or entry.action,
                "createdAt": entry.timestamp.isoformat(),
                "read": is_read,
                "urgent": urgent,
            }
        )

    return {"items": items, "unreadCount": unread_count}


@router.post("/{notification_id}/read", summary="Mark Notification Read")
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    _READ_BY_USER.setdefault(current_user.id, set()).add(notification_id)
    return {"status": "ok"}


@router.post("/read-all", summary="Mark All Notifications Read")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    visible = _filter_logs_for_user(db, current_user, 100)
    _READ_BY_USER.setdefault(current_user.id, set()).update(e.id for e in visible)
    return {"status": "ok"}
