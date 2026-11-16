"""
AETIS Central Engine — Admin Router
Endpoints for administrative user provisioning and platform oversight.
Restricted exclusively to users with the ADMIN role.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.security import get_password_hash
from app.models.audit import AuditLog
from app.models.hospital import Hospital
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse

router = APIRouter(dependencies=[Depends(require_role(["ADMIN"]))])

VALID_USER_ROLES = {"ADMIN", "DISPATCHER", "DRIVER", "HOSPITAL"}


@router.get(
    "/users",
    response_model=list[UserResponse],
    summary="List Platform Users (Admin Only)",
    description="Retrieve all registered users across all roles with optional filtering by role or search term.",
)
async def list_users(
    role: Optional[str] = Query(None, description="Filter by role: ADMIN, DISPATCHER, DRIVER, HOSPITAL"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
) -> list[UserResponse]:
    """List users in the system."""
    query = db.query(User)

    if role:
        query = query.filter(User.role == role.strip().upper())

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(User.full_name.ilike(term), User.email.ilike(term)))

    users = query.order_by(User.full_name.asc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New User Account (Admin Only)",
    description="Creates a new dispatcher, driver, hospital staff, or administrator account.",
)
async def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
) -> UserResponse:
    """Create a new user account with hashed password and role assignment."""
    role_norm = payload.role.strip().upper()
    if role_norm not in VALID_USER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user role '{payload.role}'. Must be ADMIN, DISPATCHER, DRIVER, or HOSPITAL.",
        )

    # Check for existing email
    existing_user = db.query(User).filter(User.email.ilike(payload.email.strip())).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email '{payload.email}' already exists",
        )

    # If hospital role, ensure hospital_id is valid
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

    # Log audit event
    audit = AuditLog(
        id=str(uuid.uuid4()),
        action="USER_CREATED",
        performed_by_id=current_user.id,
        details=f"Admin {current_user.email} created account {user.email} with role {role_norm}",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
