from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.hospital import Hospital
from app.models.audit import AuditLog
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()


@router.get(
    "/users",
    response_model=List[UserResponse],
    summary="List all users across the system (Admin only)"
)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Admin-only endpoint returning all accounts across the system."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision a new user account (Admin only)"
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Admin-only endpoint creating new Dispatcher, Driver, Hospital, or Administrator accounts."""
    # Check email uniqueness
    existing = db.query(User).filter(User.email.ilike(payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{payload.email}' already exists."
        )

    # Validate hospital affiliation if provided
    if payload.hospital_id:
        hosp = db.query(Hospital).filter(Hospital.id == payload.hospital_id).first()
        if not hosp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hospital facility '{payload.hospital_id}' not found."
            )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        phone=payload.phone,
        hospital_id=payload.hospital_id,
        is_active=payload.is_active,
    )

    db.add(user)

    audit = AuditLog(
        action="USER_PROVISIONED_BY_ADMIN",
        performed_by_id=current_user.id,
        details=f"Admin created account '{user.email}' with role '{user.role.value}'",
    )
    db.add(audit)

    db.commit()
    db.refresh(user)
    return user
