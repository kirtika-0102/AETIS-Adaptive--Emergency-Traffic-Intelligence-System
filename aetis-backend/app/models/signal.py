"""
AETIS Central Engine — Traffic Signal Model
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default="NORMAL",
        comment="Enum: NORMAL | PRIORITY | PENDING | FAULT",
    )
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    preemptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_preemption_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
