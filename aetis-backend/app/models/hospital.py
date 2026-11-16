import uuid
from sqlalchemy import String, Text, Float, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.emergency import Emergency


class Hospital(Base):
    __tablename__ = "hospitals"

    # ID e.g. 'HOSP-01'
    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    trauma_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    available_beds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    users: Mapped[List["User"]] = relationship(
        "User", back_populates="hospital", cascade="all, delete-orphan"
    )
    emergencies: Mapped[List["Emergency"]] = relationship(
        "Emergency", back_populates="destination_hospital"
    )
    alerts: Mapped[List["HospitalAlert"]] = relationship(
        "HospitalAlert", back_populates="hospital", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Hospital id={self.id} name='{self.name}' beds={self.available_beds}>"


class HospitalAlert(Base):
    __tablename__ = "hospital_alerts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        index=True
    )
    emergency_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("emergencies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    hospital_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    estimated_arrival: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    patient_condition: Mapped[str] = mapped_column(String(255), nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_by_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    trauma_bay_assigned: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # Relationships
    emergency: Mapped["Emergency"] = relationship("Emergency")
    hospital: Mapped["Hospital"] = relationship("Hospital", back_populates="alerts")
    acknowledged_by: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<HospitalAlert id={self.id} emg={self.emergency_id} hosp={self.hospital_id} ack={self.acknowledged}>"
