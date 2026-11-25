"""
AETIS Central Engine — Admin Router
Endpoints for administrative user provisioning, audit inspection, and system overview.
Restricted exclusively to users with the ADMIN role.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.security import get_password_hash
from app.models.audit import AuditLog
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.enums import CameraStatus, EmergencyStatus
from app.models.hospital import Hospital
from app.models.signal import TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()

require_admin = require_role(["ADMIN"])
VALID_USER_ROLES = {"ADMIN", "DISPATCHER", "DRIVER", "HOSPITAL"}


class AdminUserStatusUpdate(BaseModel):
    status: str  # "active" | "suspended"


@router.get(
    "/overview",
    summary="Get System Overview Metrics (Admin Only)",
)
async def get_admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Dict[str, Any]:
    """Return real DB counts across fleet, signals, cameras, and emergencies."""
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    emergencies_today = (
        db.query(func.count(Emergency.id))
        .filter(Emergency.created_at >= today_start)
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
    for c_at, f_at in completed_rows:
        c_utc = c_at.replace(tzinfo=timezone.utc) if c_at.tzinfo is None else c_at
        f_utc = f_at.replace(tzinfo=timezone.utc) if f_at.tzinfo is None else f_at
        if f_utc > c_utc:
            durations.append((f_utc - c_utc).total_seconds())
    avg_sec = round(sum(durations) / len(durations)) if durations else None

    pending_verifications = (
        db.query(func.count(User.id)).filter(User.is_active.is_(False)).scalar() or 0
    )
    vehicles_total = db.query(func.count(Vehicle.id)).scalar() or 0
    vehicles_online = (
        db.query(func.count(Vehicle.id))
        .filter(Vehicle.status != "MAINTENANCE")
        .scalar()
        or 0
    )
    signals_total = db.query(func.count(TrafficSignal.id)).scalar() or 0
    signals_online = signals_total
    cameras_total = db.query(func.count(Camera.id)).scalar() or 0
    cameras_online = (
        db.query(func.count(Camera.id))
        .filter(Camera.status == CameraStatus.ONLINE.value)
        .scalar()
        or 0
    )

    return {
        "emergenciesToday": int(emergencies_today),
        "avgResponseSeconds": avg_sec,
        "pendingVerifications": int(pending_verifications),
        "vehiclesOnline": int(vehicles_online),
        "vehiclesTotal": int(vehicles_total),
        "signalsOnline": int(signals_online),
        "signalsTotal": int(signals_total),
        "camerasOnline": int(cameras_online),
        "camerasTotal": int(cameras_total),
        "services": [
            {"name": "API & Auth", "status": "operational"},
            {"name": "Signal Engine", "status": "operational"},
            {
                "name": "Camera Webhook",
                "status": "operational" if cameras_online == cameras_total else "degraded",
            },
        ],
    }


@router.get(
    "/audit-logs",
    summary="List System Audit Logs (Admin Only)",
)
async def get_audit_logs(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[Dict[str, Any]]:
    """Return paginated audit log entries formatted for admin activity inspection."""
    total = db.query(func.count(AuditLog.id)).scalar() or 0
    response.headers["X-Total-Count"] = str(total)

    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    user_ids = {l.performed_by_id for l in logs if l.performed_by_id}
    user_map = {}
    if user_ids:
        user_map = {
            u.id: u.full_name
            for u in db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()
        }

    return [
        {
            "id": l.id,
            "actor": user_map.get(l.performed_by_id, "System") if l.performed_by_id else "System",
            "action": l.action.replace("_", " ").lower(),
            "target": l.details,
            "timestamp": l.timestamp.isoformat(),
        }
        for l in logs
    ]


@router.get(
    "/users",
    response_model=list[UserResponse],
    summary="List Platform Users (Admin Only)",
)
async def list_users(
    response: Response,
    role: Optional[str] = Query(None, description="Filter by role: ADMIN, DISPATCHER, DRIVER, HOSPITAL"),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, alias="pageSize", ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[UserResponse]:
    """List users in the system with pagination headers."""
    query = db.query(User)

    if role:
        query = query.filter(User.role == role.strip().upper())

    if status_filter:
        sf = status_filter.strip().lower()
        if sf == "active":
            query = query.filter(User.is_active.is_(True))
        elif sf in {"suspended", "pending"}:
            query = query.filter(User.is_active.is_(False))

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(User.full_name.ilike(term), User.email.ilike(term)))

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    ordered = query.order_by(User.full_name.asc())
    if page is not None and page_size is not None:
        ordered = ordered.offset((page - 1) * page_size).limit(page_size)

    users = ordered.all()
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New User Account (Admin Only)",
)
async def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserResponse:
    """Create a new user account with hashed password and role assignment."""
    role_norm = payload.role.strip().upper()
    if role_norm not in VALID_USER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user role '{payload.role}'. Must be ADMIN, DISPATCHER, DRIVER, or HOSPITAL.",
        )

    existing_user = db.query(User).filter(User.email.ilike(payload.email.strip())).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email '{payload.email}' already exists",
        )

    if role_norm == "HOSPITAL":
        if not payload.hospital_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="hospital_id is required for users with the HOSPITAL role",
            )
        hosp = db.query(Hospital).filter(Hospital.id == payload.hospital_id).first()
        if not hosp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hospital facility '{payload.hospital_id}' not found",
            )

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=payload.email.strip().lower(),
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        role=role_norm,
        phone=payload.phone.strip() if payload.phone else None,
        hospital_id=payload.hospital_id.strip() if payload.hospital_id else None,
        is_active=True,
    )
    db.add(user)

    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="USER_CREATED",
            performed_by_id=current_user.id,
            details=f"Admin {current_user.email} created account {user.email} with role {role_norm}",
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch(
    "/users/{user_id}/status",
    response_model=UserResponse,
    summary="Activate or Suspend User (Admin Only)",
)
async def set_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserResponse:
    """Toggle user active/suspended state while preventing self-suspension."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found",
        )
    next_status = payload.status.strip().lower()
    if next_status not in {"active", "suspended"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'active' or 'suspended'",
        )
    if target.id == current_user.id and next_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot suspend their own account",
        )

    target.is_active = next_status == "active"
    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            action="USER_STATUS_UPDATED",
            performed_by_id=current_user.id,
            details=f"Admin {current_user.email} set user {target.email} status to {next_status}",
            timestamp=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)
