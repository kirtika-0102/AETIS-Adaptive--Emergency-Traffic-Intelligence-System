"""
AETIS Central Engine — Hospital & Hospital Alert Models
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        comment="Human-readable ID, e.g. HOSP-01",
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    trauma_level: Mapped[int] = mapped_column(Integer, nullable=False)
    available_beds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class HospitalAlert(Base):
    __tablename__ = "hospital_alerts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    emergency_id: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("emergencies.id"),
        nullable=False,
    )
    hospital_id: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("hospitals.id"),
        nullable=False,
    )
    estimated_arrival: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    patient_condition: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    acknowledged: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    acknowledged_by_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    trauma_bay_assigned: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ORM Relationships
    emergency = relationship("Emergency", foreign_keys=[emergency_id], lazy="joined")
    hospital = relationship("Hospital", foreign_keys=[hospital_id], lazy="joined")
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_id], lazy="joined")
