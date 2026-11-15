from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, String

from app.database import Base


class Vehicle(Base):
    """SQLAlchemy model representing an emergency response vehicle."""

    __tablename__ = "vehicles"

    id = Column(String, primary_key=True, index=True)
    label = Column(String, nullable=True)
    type = Column(String, default="ambulance", nullable=False)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    speed = Column(Float, default=0.0, nullable=False)
    heading = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="available", nullable=False)
    last_update_at = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<Vehicle id={self.id} type={self.type} status={self.status} loc=({self.current_latitude},{self.current_longitude})>"
