import uuid
import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.hospital import Hospital
    from app.models.vehicle import Vehicle
    from app.models.emergency import Emergency
    from app.models.audit import AuditLog


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    DISPATCHER = "DISPATCHER"
    DRIVER = "DRIVER"
    HOSPITAL = "HOSPITAL"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=False),
        default=UserRole.DISPATCHER,
        nullable=False,
        index=True
    )
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    hospital_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("hospitals.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    hospital: Mapped[Optional["Hospital"]] = relationship("Hospital", back_populates="users")
    driven_vehicles: Mapped[List["Vehicle"]] = relationship(
        "Vehicle", back_populates="current_driver", foreign_keys="Vehicle.current_driver_id"
    )
    dispatched_emergencies: Mapped[List["Emergency"]] = relationship(
        "Emergency", back_populates="dispatcher", foreign_keys="Emergency.dispatcher_id"
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog", back_populates="performed_by"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email='{self.email}' role={self.role}>"
