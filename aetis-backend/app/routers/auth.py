from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_access_token
from app.core.dependencies import get_current_user, oauth2_scheme
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse, RefreshTokenRequest

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and obtain JWT access token"
)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
):
    """Accepts credentials (email/username and password), validates password,

    generates JWT, and returns TokenResponse (access_token, token_type, user).
    """
    identifier = credentials.identifier
    password = credentials.password
    role_hint = credentials.role

    if not identifier or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username/email and password are required",
        )

    # Query user by email (case-insensitive)
    user = db.query(User).filter(User.email.ilike(identifier)).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact administrator.",
        )

    user_role_str = str(
        user.role.value if hasattr(user.role, "value") else user.role
    ).upper()

    # Optional role check if client requested a specific role login
    if role_hint and str(role_hint).upper() != user_role_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User role mismatch. Account role is '{user_role_str}'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate JWT payload embedding id, email, role
    token_payload = {
        "sub": user.email,
        "id": user.id,
        "email": user.email,
        "role": user_role_str,
    }
    access_token = create_access_token(data=token_payload)

    user_response = UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user_role_str,
        phone=user.phone,
        hospital_id=user.hospital_id,
        name=user.full_name,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response,
    )


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 password form login endpoint for Swagger UI"
)
def login_oauth2(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Standard OAuth2 form login endpoint utilized by Swagger UI 'Authorize' modal."""
    credentials = LoginRequest(
        username=form_data.username,
        password=form_data.password
    )
    return login(credentials=credentials, db=db)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile"
)
def get_me(current_user: User = Depends(get_current_user)):
    """Protected by get_current_user, returns current user's profile."""
    user_role_str = str(
        current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    ).upper()

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=user_role_str,
        phone=current_user.phone,
        hospital_id=current_user.hospital_id,
        name=current_user.full_name,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token"
)
def refresh(
    body: Optional[RefreshTokenRequest] = None,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Refreshes an existing token.

    Token can be provided via Authorization Bearer header or JSON body.
    """
    raw_token = token if isinstance(token, str) else None
    if not raw_token and body and body.token:
        raw_token = body.token

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required for refresh",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(raw_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
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
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_role_str = str(
        user.role.value if hasattr(user.role, "value") else user.role
    ).upper()

    new_payload = {
        "sub": user.email,
        "id": user.id,
        "email": user.email,
        "role": user_role_str,
    }
    new_token = create_access_token(data=new_payload)

    user_response = UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user_role_str,
        phone=user.phone,
        hospital_id=user.hospital_id,
        name=user.full_name,
    )

    return TokenResponse(
        access_token=new_token,
        token_type="bearer",
        user=user_response,
    )


@router.post(
    "/logout",
    summary="Log out active session"
)
def logout():
    """Logout endpoint matching frontend authApi requirements."""
    return {"message": "Successfully logged out"}
