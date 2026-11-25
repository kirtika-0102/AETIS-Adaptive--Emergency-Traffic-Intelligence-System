"""
AETIS Central Engine — Authentication Router
Secure login, bounded refresh token rotation, server-side logout revocation,
CSRF double-submit cookie issuance, and current user inspection.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
    verify_password,
)
from app.models.auth import RefreshToken, RevokedToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _issue_session_tokens(user: User, response: Response, db: Session) -> TokenResponse:
    token_payload = {
        "sub": user.email,
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token, _, _ = create_access_token(data=token_payload)
    refresh_token, refresh_jti, refresh_exp = create_refresh_token(data=token_payload)
    csrf_token = generate_csrf_token()

    db.add(
        RefreshToken(
            jti=refresh_jti,
            user_id=user.id,
            expires_at=refresh_exp,
            revoked=False,
        )
    )
    db.commit()

    _set_auth_cookies(response, access_token, refresh_token, csrf_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        csrf_token=csrf_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


def _record_revoked_jti(
    raw_token: Optional[str],
    db: Session,
) -> None:
    if not raw_token:
        return
    try:
        # Signature MUST still match SECRET_KEY; verify_exp=False only lets already-expired
        # tokens logged out cleanly be recorded if they carry a JTI.
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},
        )
    except JWTError:
        return

    jti = payload.get("jti")
    typ = payload.get("typ", "access")
    user_id = payload.get("user_id")
    exp_ts = payload.get("exp")
    expires_at = (
        datetime.fromtimestamp(exp_ts, tz=timezone.utc)
        if isinstance(exp_ts, (int, float))
        else datetime.now(timezone.utc)
    )

    if typ == "refresh" and jti:
        db_rt = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if db_rt:
            db_rt.revoked = True
    elif jti:
        existing = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        if not existing:
            db.add(
                RevokedToken(
                    jti=jti,
                    user_id=str(user_id) if user_id else None,
                    token_type=str(typ),
                    expires_at=expires_at,
                )
            )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticate with email/username and password. Returns JWT access/refresh tokens, CSRF cookie, and user profile.",
)
async def login(
    credentials: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Validate user credentials, issue access/refresh tokens, and set secure cookies."""
    identifier = (credentials.email or credentials.username or "").strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required",
        )

    user = db.query(User).filter(User.email.ilike(identifier)).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email, password or role",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.role and credentials.role.strip().lower() not in ("string", ""):
        expected_role = credentials.role.strip().upper()
        user_role = (user.role or "").strip().upper()
        if user_role != expected_role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email, password or role",
                headers={"WWW-Authenticate": "Bearer"},
            )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return _issue_session_tokens(user, response, db)


@router.post(
    "/logout",
    summary="User Logout",
    description="Revoke active access/refresh JWTs server-side and clear session cookies.",
)
async def logout(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Revoke tokens in DB and clear cookies."""
    access_raw: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        access_raw = authorization[7:].strip()
    else:
        access_raw = request.cookies.get("access_token") or request.cookies.get("token")

    refresh_raw = request.cookies.get("refresh_token")

    _record_revoked_jti(access_raw, db)
    _record_revoked_jti(refresh_raw, db)
    db.commit()

    response.delete_cookie(key="access_token", path="/", samesite=settings.COOKIE_SAMESITE)
    response.delete_cookie(key="refresh_token", path="/", samesite=settings.COOKIE_SAMESITE)
    response.delete_cookie(key="csrf_token", path="/", samesite=settings.COOKIE_SAMESITE)
    response.delete_cookie(key="token", path="/", samesite=settings.COOKIE_SAMESITE)
    return {"status": "ok", "message": "Successfully logged out"}


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 Form Login",
    description="OAuth2-compatible endpoint for Swagger UI Authorization dialog.",
    include_in_schema=False,
)
async def login_oauth2_form(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Support standard OAuth2 application/x-www-form-urlencoded login for Swagger UI."""
    identifier = form_data.username.strip()
    user = db.query(User).filter(User.email.ilike(identifier)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email, password or role",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return _issue_session_tokens(user, response, db)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User Profile",
    description="Retrieve the profile of the authenticated user from the verified JWT access token.",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return authenticated user profile."""
    return UserResponse.model_validate(current_user)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh Access Token",
    description="Rotate an unexpired, non-revoked refresh token for a fresh access/refresh pair.",
)
async def refresh_token(
    request: Request,
    response: Response,
    body: Optional[RefreshTokenRequest] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Strictly verify unexpired refresh token, rotate it once, and issue new session tokens."""
    raw_token: Optional[str] = None
    if body and body.token:
        raw_token = body.token.strip()
    elif authorization and authorization.startswith("Bearer "):
        raw_token = authorization[7:].strip()
    else:
        raw_token = request.cookies.get("refresh_token")

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid refresh token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("typ") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a valid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token identifier",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db_refresh = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if not db_refresh or db_refresh.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is revoked or unknown",
            headers={"WWW-Authenticate": "Bearer"},
        )

    exp = db_refresh.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp <= datetime.now(timezone.utc):
        db_refresh.revoked = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("email") or payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email.ilike(email)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    # Rotate: invalidate the used refresh token before issuing replacement
    db_refresh.revoked = True
    return _issue_session_tokens(user, response, db)
