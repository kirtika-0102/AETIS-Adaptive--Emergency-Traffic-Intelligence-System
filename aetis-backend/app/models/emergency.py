from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, ForeignKey, String

from app.database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class Emergency(Base):
    """SQLAlchemy model representing an active or past emergency incident."""

    __tablename__ = "emergencies"

    id = Column(String, primary_key=True, index=True)
    assigned_vehicle_id = Column(String, ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    hospital_id = Column(String, nullable=True, index=True)
    hospital_name = Column(String, nullable=True)
    status = Column(String, default="active", nullable=False)
    severity = Column(String, default="CRITICAL", nullable=False)
    destination_lat = Column(Float, nullable=True)
    destination_lng = Column(Float, nullable=True)
    destination_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)

    def __repr__(self) -> str:
        return f"<Emergency id={self.id} vehicle={self.assigned_vehicle_id} hospital={self.hospital_id} status={self.status}>"
