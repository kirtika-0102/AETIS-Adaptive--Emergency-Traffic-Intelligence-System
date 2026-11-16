import math
from typing import List
from sqlalchemy.orm import Session

from app.models.signal import TrafficSignal


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS coordinates in meters.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def get_signals_along_corridor(
    db: Session,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    corridor_width_meters: float = 80.0,
) -> List[TrafficSignal]:
    """
    Queries all traffic signals that fall along the bounding vector between origin
    and destination within corridor_width_meters, sorted in order of proximity
    to the approaching vehicle (origin).
    """
    all_signals = db.query(TrafficSignal).all()
    if not all_signals:
        return []

    # Local equirectangular projection centered between origin and destination
    phi_mean = math.radians((origin_lat + dest_lat) / 2.0)
    meters_per_deg_lat = 111320.0
    meters_per_deg_lon = 111320.0 * math.cos(phi_mean)

    # Vector AB from origin to destination in meters
    delta_x = (dest_lng - origin_lng) * meters_per_deg_lon
    delta_y = (dest_lat - origin_lat) * meters_per_deg_lat
    segment_len_sq = delta_x * delta_x + delta_y * delta_y
    segment_len = math.sqrt(segment_len_sq)

    signals_in_corridor: List[TrafficSignal] = []

    # If origin and destination are practically identical, check simple radial distance
    if segment_len < 1.0:
        for signal in all_signals:
            dist = haversine_distance(origin_lat, origin_lng, signal.latitude, signal.longitude)
            if dist <= corridor_width_meters:
                signals_in_corridor.append(signal)
        signals_in_corridor.sort(key=lambda s: haversine_distance(origin_lat, origin_lng, s.latitude, s.longitude))
        return signals_in_corridor

    for signal in all_signals:
        # Vector AP from origin to signal in meters
        dx = (signal.longitude - origin_lng) * meters_per_deg_lon
        dy = (signal.latitude - origin_lat) * meters_per_deg_lat

        # Normalized projection parameter t along segment AB
        t = (dx * delta_x + dy * delta_y) / segment_len_sq

        # Cross-track (perpendicular) distance in meters
        cross_track_dist = abs(dx * delta_y - dy * delta_x) / segment_len

        # Check if signal lies along corridor segment:
        # allow slight buffer before origin (-0.05) and past destination (1.05)
        if -0.05 <= t <= 1.05 and cross_track_dist <= corridor_width_meters:
            signals_in_corridor.append(signal)

    # Sort in order of proximity to approaching vehicle (origin)
    signals_in_corridor.sort(
        key=lambda s: haversine_distance(origin_lat, origin_lng, s.latitude, s.longitude)
    )

    return signals_in_corridor
