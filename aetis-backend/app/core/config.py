"""
AETIS Central Engine — Application Configuration
Fails fast on insecure configuration in staging/production environments and avoids
embedded production secrets in source control.
"""

import logging
import os
import secrets
from pathlib import Path
from typing import List

logger = logging.getLogger("aetis.config")

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "aetis.db"

_PRODUCTION_ENVS = {"production", "prod", "staging"}


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_origins(raw: str | None) -> List[str]:
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    if not raw:
        return default_origins
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if "*" in origins:
        raise RuntimeError(
            "Wildcard '*' CORS origin is disallowed when allow_credentials=True. "
            "Configure explicit origins in CORS_ORIGINS."
        )
    return origins or default_origins


def _load_secret_key(env_name: str) -> str:
    env_val = os.getenv("SECRET_KEY", "").strip()
    if env_val:
        if env_name in _PRODUCTION_ENVS and len(env_val) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters in production.")
        return env_val
    if env_name in _PRODUCTION_ENVS:
        raise RuntimeError(
            "SECRET_KEY environment variable is required when ENVIRONMENT is production/staging."
        )
    logger.warning(
        "SECRET_KEY is not set; generating an ephemeral cryptographic key for '%s' mode.",
        env_name,
    )
    return secrets.token_urlsafe(48)


def _load_camera_api_key(env_name: str) -> str:
    env_val = os.getenv("CAMERA_API_KEY", "").strip()
    if env_val:
        return env_val
    if env_name in _PRODUCTION_ENVS:
        raise RuntimeError(
            "CAMERA_API_KEY environment variable is required when ENVIRONMENT is production/staging."
        )
    return secrets.token_urlsafe(32)


def _load_dotenv_if_present() -> None:
    env_path = BACKEND_DIR / ".env"
    if not env_path.is_file():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, val = stripped.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


_load_dotenv_if_present()


class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "AETIS Central Engine")
    ENVIRONMENT: str = (
        os.getenv("ENVIRONMENT") or os.getenv("AETIS_ENV") or "development"
    ).strip().lower()
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")
    CORS_ORIGINS: List[str] = _parse_origins(os.getenv("CORS_ORIGINS"))
    COOKIE_SECURE: bool = _parse_bool(
        os.getenv("COOKIE_SECURE"),
        default=ENVIRONMENT in _PRODUCTION_ENVS,
    )
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
    SECRET_KEY: str = _load_secret_key(ENVIRONMENT)
    CAMERA_API_KEY: str = _load_camera_api_key(ENVIRONMENT)


settings = Settings()
