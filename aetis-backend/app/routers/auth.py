"""
AETIS Central Engine — Authentication Router
Endpoints for user login, current user profile, token refresh, and OAuth2 compatibility.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticate with email/username and password. Returns JWT access token and user profile.",
)
async def login(
    credentials: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Validate user credentials, generate JWT bearer token, and return profile."""
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

    # Verify matching role when role is supplied in login payload
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

    token_payload = {
        "sub": user.email,
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(data=token_payload)

    # Set HttpOnly session cookie for browsers
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    user_resp = UserResponse.model_validate(user)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_resp,
    )


@router.post(
    "/logout",
    summary="User Logout",
    description="Log out the current user and clear the session cookie.",
)
async def logout(response: Response):
    """Clear session cookies."""
    response.delete_cookie(key="access_token", samesite="lax")
    response.delete_cookie(key="token", samesite="lax")
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

    token_payload = {
        "sub": user.email,
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(data=token_payload)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    user_resp = UserResponse.model_validate(user)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_resp,
    )


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
    description="Refreshes an expired or existing JWT access token. Accepts token in Authorization header, body, or cookie.",
)
async def refresh_token(
    request: Request,
    response: Response,
    body: Optional[RefreshTokenRequest] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Decode token (ignoring expiration), verify signature, and issue a refreshed access token."""
    raw_token: Optional[str] = None

    if body and body.token:
        raw_token = body.token.strip()
    elif authorization and authorization.startswith("Bearer "):
        raw_token = authorization[7:].strip()
    else:
        req_auth = request.headers.get("Authorization")
        if req_auth and req_auth.startswith("Bearer "):
            raw_token = req_auth[7:].strip()
        else:
            raw_token = request.cookies.get("access_token") or request.cookies.get("token")

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token is required to refresh session",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
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

    new_token_payload = {
        "sub": user.email,
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    new_access_token = create_access_token(data=new_token_payload)

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    user_resp = UserResponse.model_validate(user)
    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
        user=user_resp,
    )
