"""
AETIS — Traffic Signal Models
Unified TrafficSignal model for real-time phase transitions, preemption, cameras,
and analytics, plus backward-compatible Signal reference alias if needed.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import SignalPhase, SignalTransitionState


class TrafficSignal(Base):
    """SQLAlchemy model representing a traffic signal controller."""

    __tablename__ = "traffic_signals"

    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    current_phase: Mapped[str] = mapped_column(
        String(15), default=SignalPhase.RED.value, nullable=False
    )
    transition_state: Mapped[str] = mapped_column(
        String(25), default=SignalTransitionState.NORMAL.value, nullable=False
    )
    normal_cycle_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    is_preempted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preempted_by_vehicle_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preemption_end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    preemptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_preemption_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    cameras = relationship("Camera", back_populates="signal", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<TrafficSignal id={self.id} name={self.name} "
            f"phase={self.current_phase} state={self.transition_state} preempted={self.is_preempted}>"
        )


class Signal(Base):
    """Legacy high-level signal table preserved for schema migration compatibility."""

    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default="NORMAL",
        comment="Enum: NORMAL | PRIORITY | PENDING | FAULT",
    )
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    preemptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_preemption_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Signal id={self.id} name={self.name} status={self.status}>"
