import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class SignalPhase(str, enum.Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


class TrafficSignal(Base):
    """SQLAlchemy model representing a traffic signal controller."""

    __tablename__ = "traffic_signals"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    current_phase = Column(String, default=SignalPhase.RED.value, nullable=False)
    normal_cycle_seconds = Column(Integer, default=60, nullable=False)
    is_preempted = Column(Boolean, default=False, nullable=False)
    preempted_by_vehicle_id = Column(String, nullable=True)
    preemption_end_time = Column(DateTime, nullable=True)

    # Relationships
    cameras = relationship("Camera", back_populates="signal", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<TrafficSignal id={self.id} name={self.name} phase={self.current_phase} preempted={self.is_preempted}>"
