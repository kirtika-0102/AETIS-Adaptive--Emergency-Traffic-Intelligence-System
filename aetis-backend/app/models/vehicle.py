import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.emergency import Emergency


class VehicleType(str, enum.Enum):
    AMBULANCE = "AMBULANCE"
    FIRE_TRUCK = "FIRE_TRUCK"
    POLICE = "POLICE"


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    DISPATCHED = "DISPATCHED"
    BUSY = "BUSY"
    MAINTENANCE = "MAINTENANCE"


class Vehicle(Base):
    __tablename__ = "vehicles"

    # ID e.g. 'AMB-01'
    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    call_sign: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    type: Mapped[VehicleType] = mapped_column(
        SAEnum(VehicleType, name="vehicle_type", native_enum=False),
        nullable=False,
        index=True
    )
    license_plate: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    status: Mapped[VehicleStatus] = mapped_column(
        SAEnum(VehicleStatus, name="vehicle_status", native_enum=False),
        default=VehicleStatus.AVAILABLE,
        nullable=False,
        index=True
    )
    current_latitude: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_longitude: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_driver_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    current_driver: Mapped[Optional["User"]] = relationship(
        "User", back_populates="driven_vehicles", foreign_keys=[current_driver_id]
    )
    emergencies: Mapped[List["Emergency"]] = relationship(
        "Emergency", back_populates="assigned_vehicle"
    )

    def __repr__(self) -> str:
        return f"<Vehicle id={self.id} call_sign='{self.call_sign}' status={self.status}>"
