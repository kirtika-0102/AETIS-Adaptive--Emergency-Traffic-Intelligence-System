"""
AETIS Central Engine — Routers Package
"""

from app.routers import admin, analytics, auth, emergencies, hospitals, vehicles
from app.routers.cameras import router as cameras_router
from app.routers.detections import router as detections_router
from app.routers.signals import router as signals_router
from app.routers.tracking import router as tracking_router
from app.routers.ws import router as ws_router

__all__ = [
    "admin",
    "analytics",
    "auth",
    "cameras_router",
    "detections_router",
    "emergencies",
    "hospitals",
    "signals_router",
    "tracking_router",
    "vehicles",
    "ws_router",
]
