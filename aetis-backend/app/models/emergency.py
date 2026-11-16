"""
AETIS Central Engine — Emergency Model
Combined model supporting incident management, dispatch workflow, hospital coordination, and real-time preemption routing.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class Emergency(Base):
    __tablename__ = "emergencies"

    id: Mapped[str] = mapped_column(
        String(50),
        primary_key=True,
        index=True,
        comment="Human-readable ID, e.g. EMG-01 or EMG-101",
    )
    incident_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Emergency Dispatch")
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="CRITICAL",
        comment="Enum: LOW | MEDIUM | HIGH | CRITICAL",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        comment="Enum: PENDING | DISPATCHED | IN_TRANSIT | ARRIVED | COMPLETED | CANCELLED | active",
    )
    pickup_latitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pickup_longitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pickup_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    patient_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    assigned_vehicle_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("vehicles.id", ondelete="SET NULL"),
        nullable=True,
    )
    destination_hospital_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("hospitals.id", ondelete="SET NULL"),
        nullable=True,
    )
    dispatcher_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Real-time routing & preemption destination attributes
    destination_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    destination_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    destination_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hospital_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=get_utc_now,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ORM Relationships
    assigned_vehicle = relationship("Vehicle", foreign_keys=[assigned_vehicle_id], lazy="joined")
    destination_hospital = relationship("Hospital", foreign_keys=[destination_hospital_id], lazy="joined")
    dispatcher = relationship("User", foreign_keys=[dispatcher_id], lazy="joined")

    def __init__(self, **kwargs):
        if "hospital_id" in kwargs and "destination_hospital_id" not in kwargs:
            kwargs["destination_hospital_id"] = kwargs.pop("hospital_id")
        if "incident_number" not in kwargs:
            inc_id = kwargs.get("id", "EMG-01")
            kwargs["incident_number"] = f"INC-{inc_id}"
        if "title" not in kwargs:
            kwargs["title"] = f"Emergency Incident {kwargs.get('id', '')}"
        if "pickup_latitude" not in kwargs:
            kwargs["pickup_latitude"] = kwargs.get("destination_lat", 0.0) or 0.0
        if "pickup_longitude" not in kwargs:
            kwargs["pickup_longitude"] = kwargs.get("destination_lng", 0.0) or 0.0
        super().__init__(**kwargs)

    @property
    def hospital_id(self) -> Optional[str]:
        return self.destination_hospital_id

    @hospital_id.setter
    def hospital_id(self, val: Optional[str]):
        self.destination_hospital_id = val

    def __repr__(self) -> str:
        return f"<Emergency id={self.id} vehicle={self.assigned_vehicle_id} hospital={self.destination_hospital_id} status={self.status}>"
