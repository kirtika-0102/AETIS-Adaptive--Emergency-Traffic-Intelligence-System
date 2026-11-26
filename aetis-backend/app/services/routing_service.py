import math
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.signal import TrafficSignal
from app.utils.geo import haversine_distance


def get_signals_along_corridor(
    db: Session,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    corridor_width_meters: float = 80.0,
    heading: Optional[float] = None,
) -> List[TrafficSignal]:
    """
    Queries traffic signals that fall along the straight-line corridor vector between
    origin and destination within corridor_width_meters, sorted in order of proximity
    to the approaching vehicle (origin).
    Note: Straight-line geometric filtering only (not road-network graph shortest-path).
    """
    # SQL bounding-box pre-filter (~corridor buffer + ~500m margin) to avoid unnecessary Python math
    lat_pad = max(0.005, (corridor_width_meters + 250.0) / 111320.0)
    cos_lat = max(0.1, abs(math.cos(math.radians((origin_lat + dest_lat) / 2.0))))
    lng_pad = max(0.005, (corridor_width_meters + 250.0) / (111320.0 * cos_lat))

    min_lat = min(origin_lat, dest_lat) - lat_pad
    max_lat = max(origin_lat, dest_lat) + lat_pad
    min_lng = min(origin_lng, dest_lng) - lng_pad
    max_lng = max(origin_lng, dest_lng) + lng_pad

    candidate_signals = (
        db.query(TrafficSignal)
        .filter(
            TrafficSignal.latitude >= min_lat,
            TrafficSignal.latitude <= max_lat,
            TrafficSignal.longitude >= min_lng,
            TrafficSignal.longitude <= max_lng,
        )
        .all()
    )
    if not candidate_signals:
        return []

    phi_mean = math.radians((origin_lat + dest_lat) / 2.0)
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(phi_mean)

    delta_x = (dest_lng - origin_lng) * meters_per_deg_lon
    delta_y = (dest_lat - origin_lat) * meters_per_deg_lat
    segment_len_sq = delta_x * delta_x + delta_y * delta_y
    segment_len = math.sqrt(segment_len_sq)

    signals_in_corridor: List[TrafficSignal] = []

    if segment_len < 1.0:
        for signal in candidate_signals:
            dist = haversine_distance(origin_lat, origin_lng, signal.latitude, signal.longitude)
            if dist <= corridor_width_meters:
                signals_in_corridor.append(signal)
        signals_in_corridor.sort(
            key=lambda s: haversine_distance(origin_lat, origin_lng, s.latitude, s.longitude)
        )
        return signals_in_corridor

    head_dx = math.sin(math.radians(heading)) if heading is not None else None
    head_dy = math.cos(math.radians(heading)) if heading is not None else None

    for signal in candidate_signals:
        dx = (signal.longitude - origin_lng) * meters_per_deg_lon
        dy = (signal.latitude - origin_lat) * meters_per_deg_lat

        t = (dx * delta_x + dy * delta_y) / segment_len_sq
        cross_track_dist = abs(dx * delta_y - dy * delta_x) / segment_len

        if head_dx is not None and head_dy is not None:
            sig_norm = math.sqrt(dx * dx + dy * dy)
            if sig_norm > 1.0:
                heading_dot = (dx * head_dx + dy * head_dy) / sig_norm
                if heading_dot < 0.0:
                    continue

        # Only match signals ahead of the approaching vehicle (0.0 <= t <= 1.05)
        if 0.0 <= t <= 1.05 and cross_track_dist <= corridor_width_meters:
            signals_in_corridor.append(signal)

    signals_in_corridor.sort(
        key=lambda s: haversine_distance(origin_lat, origin_lng, s.latitude, s.longitude)
    )
    return signals_in_corridor
