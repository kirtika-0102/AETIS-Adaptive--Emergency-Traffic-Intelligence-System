"""
AETIS Central Engine — ORM Model Registry
Import all models here so that Alembic and other tooling can discover them
from a single import of this package.
"""

from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.user import User
from app.models.vehicle import Vehicle

__all__ = [
    "AuditLog",
    "Emergency",
    "Hospital",
    "User",
    "Vehicle",
]
