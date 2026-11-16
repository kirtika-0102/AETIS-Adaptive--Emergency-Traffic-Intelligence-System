import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "aetis.db"

try:
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        PROJECT_NAME: str = "AETIS Central Engine"
        SECRET_KEY: str = os.getenv("SECRET_KEY", "aetis-super-secret-production-key-change-in-prod-1234567890")
        ALGORITHM: str = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
        DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")

        model_config = {
            "env_file": ".env",
            "extra": "ignore",
        }
except ImportError:
    class Settings:
        PROJECT_NAME: str = "AETIS Central Engine"
        SECRET_KEY: str = os.getenv("SECRET_KEY", "aetis-super-secret-production-key-change-in-prod-1234567890")
        ALGORITHM: str = "HS256"
        ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
        DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")


settings = Settings()
