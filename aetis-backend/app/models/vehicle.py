"""
AETIS Central Engine — Vehicle Model
"""

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        comment="Human-readable ID, e.g. AMB-01",
    )
    call_sign: Mapped[str] = mapped_column(String(50), nullable=False)
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Enum: AMBULANCE | FIRE_TRUCK | POLICE",
    )
    license_plate: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="AVAILABLE",
        comment="Enum: AVAILABLE | DISPATCHED | BUSY | MAINTENANCE",
    )
    current_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_driver_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
    )

    # ORM Relationships
    current_driver = relationship("User", foreign_keys=[current_driver_id], lazy="joined")
