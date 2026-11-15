import enum
from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class CameraStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


class Camera(Base):
    """SQLAlchemy model representing a traffic monitoring camera."""

    __tablename__ = "cameras"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    stream_url = Column(String, nullable=False)
    connected_signal_id = Column(String, ForeignKey("traffic_signals.id", ondelete="CASCADE"), nullable=False, index=True)
    view_heading = Column(Integer, nullable=False)  # compass degrees 0-360
    status = Column(String, default=CameraStatus.ONLINE.value, nullable=False)

    # Relationships
    signal = relationship("TrafficSignal", back_populates="cameras")

    def __repr__(self) -> str:
        return f"<Camera id={self.id} name={self.name} signal={self.connected_signal_id} status={self.status}>"
