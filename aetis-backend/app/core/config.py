"""
AETIS Central Engine — Application Settings
Loaded from environment variables / .env file via Pydantic BaseSettings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide configuration."""

    PROJECT_NAME: str = "AETIS Central Engine"
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aetis_db"
    SECRET_KEY: str = "aetis-super-secret-jwt-key-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
