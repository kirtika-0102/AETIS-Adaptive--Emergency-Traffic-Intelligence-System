"""
AETIS Central Engine — Emergency Model
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Emergency(Base):
    __tablename__ = "emergencies"

    id: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        comment="Human-readable ID, e.g. EMG-01",
    )
    incident_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        comment="Enum: LOW | MEDIUM | HIGH | CRITICAL",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        comment="Enum: PENDING | DISPATCHED | IN_TRANSIT | ARRIVED | COMPLETED | CANCELLED",
    )
    pickup_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=True)
    patient_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_vehicle_id: Mapped[str | None] = mapped_column(
        String(20),
        ForeignKey("vehicles.id"),
        nullable=True,
    )
    destination_hospital_id: Mapped[str | None] = mapped_column(
        String(20),
        ForeignKey("hospitals.id"),
        nullable=True,
    )
    dispatcher_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
