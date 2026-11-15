from app.routers.signals import router as signals_router
from app.routers.cameras import router as cameras_router
from app.routers.ws import router as ws_router

__all__ = ["signals_router", "cameras_router", "ws_router"]
