from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

# OAuth2 scheme configured with tokenUrl for Swagger UI authorization
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/token",
    auto_error=False
)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Decodes JWT, verifies signature, extracts email, queries DB, raises HTTP 401 if invalid."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    email: Optional[str] = payload.get("email") or payload.get("sub")
    if not email:
        raise credentials_exception

    user = db.query(User).filter(User.email.ilike(email)).first()
    if user is None:
        user = db.query(User).filter(User.id == email).first()
        if user is None:
            raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_role(allowed_roles: List[str]):
    """Dependency factory that checks if current_user.role is in allowed_roles.

    If not, raises HTTPException(status_code=403, detail="Insufficient role permissions").
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role_str = str(
            current_user.role.value if hasattr(current_user.role, "value") else current_user.role
        ).upper()
        normalized_allowed = [r.upper() for r in allowed_roles]

        if user_role_str not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions"
            )
        return current_user

    return role_checker
