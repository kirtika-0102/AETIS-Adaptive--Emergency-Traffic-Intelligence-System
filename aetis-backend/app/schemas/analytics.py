"""
AETIS Central Engine — Analytics Schemas
Pydantic schemas for operational KPIs and analytical reporting.
"""

from pydantic import BaseModel


class AnalyticsKPIResponse(BaseModel):
    """Operational Key Performance Indicators (KPIs) for dispatch & traffic intelligence."""
    total_emergencies: int
    active_emergencies: int
    avg_response_time_minutes: float
    fleet_utilization_rate: float
    total_signal_preemptions: int
