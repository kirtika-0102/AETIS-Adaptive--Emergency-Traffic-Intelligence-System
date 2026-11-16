import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Text, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.vehicle import Vehicle
    from app.models.hospital import Hospital
    from app.models.user import User


class EmergencySeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EmergencyStatus(str, enum.Enum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    ARRIVED = "ARRIVED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Emergency(Base):
    __tablename__ = "emergencies"

    # ID e.g. 'EMG-01'
    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    incident_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[EmergencySeverity] = mapped_column(
        SAEnum(EmergencySeverity, name="emergency_severity", native_enum=False),
        default=EmergencySeverity.MEDIUM,
        nullable=False,
        index=True
    )
    status: Mapped[EmergencyStatus] = mapped_column(
        SAEnum(EmergencyStatus, name="emergency_status", native_enum=False),
        default=EmergencyStatus.PENDING,
        nullable=False,
        index=True
    )
    pickup_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)
    patient_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    assigned_vehicle_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("vehicles.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    destination_hospital_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("hospitals.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    dispatcher_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    assigned_vehicle: Mapped[Optional["Vehicle"]] = relationship(
        "Vehicle", back_populates="emergencies"
    )
    destination_hospital: Mapped[Optional["Hospital"]] = relationship(
        "Hospital", back_populates="emergencies"
    )
    dispatcher: Mapped[Optional["User"]] = relationship(
        "User", back_populates="dispatched_emergencies", foreign_keys=[dispatcher_id]
    )

    def __repr__(self) -> str:
        return f"<Emergency id={self.id} incident='{self.incident_number}' status={self.status}>"
