from app.routers.signals import router as signals_router
from app.routers.cameras import router as cameras_router
from app.routers.ws import router as ws_router
from app.routers.tracking import router as tracking_router

__all__ = ["signals_router", "cameras_router", "ws_router", "tracking_router"]
