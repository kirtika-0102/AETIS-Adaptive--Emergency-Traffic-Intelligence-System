"""
AETIS Central Engine — Security & Authentication Dependencies
FastAPI dependencies for JWT extraction, database sessions, and RBAC authorization.
"""

from typing import Callable, Optional, Sequence

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

# OAuth2 scheme configured for OpenAPI docs and token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decode JWT token, verify signature, and retrieve authenticated User from DB.

    Extracts token from Authorization header (Bearer) or session cookies (access_token).
    Raises HTTP 401 if token is expired, invalid, or user does not exist.
    Raises HTTP 403 if the user account is marked inactive.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = token or request.cookies.get("access_token") or request.cookies.get("token")
    if not raw_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()
        elif auth_header:
            raw_token = auth_header.strip()

    if not raw_token:
        raise credentials_exception

    try:
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        email: str | None = payload.get("email") or payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


def require_role(allowed_roles: Sequence[str]) -> Callable[[User], User]:
    """Dependency factory checking whether current_user.role is within allowed_roles.

    Performs case-insensitive matching (e.g., 'ADMIN', 'admin').
    Raises HTTP 403 Forbidden if user role is not permitted.
    """
    normalized_allowed = {r.strip().upper() for r in allowed_roles}

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.strip().upper() not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return current_user

    return role_checker
