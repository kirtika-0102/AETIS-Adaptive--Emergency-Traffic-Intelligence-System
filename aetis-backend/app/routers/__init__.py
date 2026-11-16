"""
AETIS Central Engine — Routers Package
"""

from app.routers import admin, analytics, auth, emergencies, hospitals, vehicles

__all__ = [
    "admin",
    "analytics",
    "auth",
    "emergencies",
    "hospitals",
    "vehicles",
]
