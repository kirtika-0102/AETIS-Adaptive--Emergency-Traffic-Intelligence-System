"""
AETIS Central Engine — Security & Authentication Dependencies
FastAPI dependencies for strict JWT validation, revocation checks, camera API keys,
and role-based access control (RBAC).
"""

import hmac
from typing import Callable, Optional, Sequence

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import RevokedToken
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _extract_raw_token(
    request: Optional[Request],
    bearer_token: Optional[str] = None,
) -> Optional[str]:
    if bearer_token:
        return bearer_token.strip()
    if request is not None:
        auth_header = request.headers.get("Authorization")
        if auth_header:
            if auth_header.startswith("Bearer "):
                return auth_header[7:].strip()
            return auth_header.strip()
        cookie_token = request.cookies.get("access_token") or request.cookies.get("token")
        if cookie_token:
            return cookie_token.strip()
    return None


def authenticate_access_token(raw_token: str, db: Session) -> User:
    """Validate an access JWT strictly (signature, exp, typ, revocation, active status)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not raw_token:
        raise credentials_exception

    try:
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise credentials_exception

    token_type = payload.get("typ")
    if token_type is not None and token_type != "access":
        raise credentials_exception

    jti = payload.get("jti")
    if jti:
        revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        if revoked is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

    email: Optional[str] = payload.get("email") or payload.get("sub")
    if not email:
        raise credentials_exception

    user = db.query(User).filter(User.email.ilike(email)).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency returning the authenticated User from Bearer header or HttpOnly cookie."""
    raw_token = _extract_raw_token(request, token)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authenticate_access_token(raw_token, db)


def require_role(allowed_roles: Sequence[str]) -> Callable[[User], User]:
    """Dependency factory checking whether current_user.role is within allowed_roles."""
    normalized_allowed = {r.strip().upper() for r in allowed_roles}

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if (current_user.role or "").strip().upper() not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return current_user

    return role_checker


def require_camera_or_dispatcher(
    request: Request,
    x_aetis_api_key: Optional[str] = Header(default=None, alias="X-AETIS-API-Key"),
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Authorize camera detection ingestion via verified edge API key OR Dispatcher/Admin JWT."""
    if x_aetis_api_key:
        if hmac.compare_digest(x_aetis_api_key.strip(), settings.CAMERA_API_KEY):
            return None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid camera API key",
        )

    raw_token = _extract_raw_token(request, token)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for camera detection webhook",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = authenticate_access_token(raw_token, db)
    if (user.role or "").strip().upper() not in {"ADMIN", "DISPATCHER"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role permissions",
        )
    return user
