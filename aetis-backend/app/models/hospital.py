from sqlalchemy import String, Text, Float, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import List, TYPE_CHECKING
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

    def __repr__(self) -> str:
        return f"<Hospital id={self.id} name='{self.name}' beds={self.available_beds}>"
