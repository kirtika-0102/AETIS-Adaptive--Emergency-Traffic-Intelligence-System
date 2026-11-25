"""
AETIS Central Engine — Traffic Camera Model
Supports signal linkage, dispatcher corridor issue-flag arming, and duplicate suppression.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CameraStatus


class Camera(Base):
    """SQLAlchemy model representing a traffic monitoring camera."""

    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    stream_url: Mapped[str] = mapped_column(String(255), nullable=False)
    connected_signal_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("traffic_signals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    view_heading: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=CameraStatus.ONLINE.value, nullable=False
    )
    is_armed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    armed_emergency_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("emergencies.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    signal = relationship("TrafficSignal", back_populates="cameras")

    def __repr__(self) -> str:
        return (
            f"<Camera id={self.id} signal={self.connected_signal_id} "
            f"status={self.status} armed={self.is_armed}>"
        )
