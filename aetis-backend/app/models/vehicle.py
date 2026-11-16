"""
AETIS Central Engine — Vehicle Model
Combined model supporting fleet management, driver assignment, and real-time GPS telemetry.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(
        String(50),
        primary_key=True,
        comment="Human-readable ID, e.g. AMB-01 or EV-AMB-01",
    )
    call_sign: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="AMBULANCE",
        comment="Enum: AMBULANCE | FIRE_TRUCK | POLICE",
    )
    license_plate: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="AVAILABLE",
        comment="Enum: AVAILABLE | DISPATCHED | BUSY | MAINTENANCE | EN_ROUTE",
    )
    current_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    heading: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_driver_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
    )
    last_update_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # ORM Relationships
    current_driver = relationship("User", foreign_keys=[current_driver_id], lazy="joined")

    def __repr__(self) -> str:
        return f"<Vehicle id={self.id} call_sign={self.call_sign or self.label} status={self.status} loc=({self.current_latitude},{self.current_longitude})>"
