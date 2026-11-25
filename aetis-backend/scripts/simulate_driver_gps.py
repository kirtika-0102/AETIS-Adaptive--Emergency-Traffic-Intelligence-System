#!/usr/bin/env python3
"""
AETIS Authenticated Driver GPS Stream Simulator
Logs in via POST /api/v1/auth/login, then streams GPS waypoints over WebSocket
with non-blocking multi-event drain and authenticated HTTP + CSRF fallback.
"""

import argparse
import asyncio
import json
import math
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

try:
    import websockets
except ImportError:
    websockets = None

try:
    import httpx
except ImportError:
    httpx = None

SIMULATION_PATH: List[Tuple[float, float, float]] = [
    (12.9710, 77.5920, 42.0),
    (12.9714, 77.5942, 48.5),
    (12.9716, 77.5960, 56.0),
    (12.9718, 77.5990, 62.0),
    (12.9720, 77.6020, 64.5),
    (12.9723, 77.6050, 58.0),
    (12.9726, 77.6080, 60.5),
    (12.9732, 77.6120, 65.0),
    (12.9740, 77.6165, 63.0),
    (12.9748, 77.6210, 59.5),
    (12.9758, 77.6250, 55.0),
    (12.9768, 77.6285, 52.0),
    (12.9775, 77.6315, 45.0),
    (12.9780, 77.6335, 30.0),
    (12.9785, 77.6350, 10.0),
]


def calculate_compass_heading(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates bearing heading (0-360 degrees) between consecutive waypoints."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return round(bearing, 1)


def build_telemetry_packets(
    vehicle_id: str,
    emergency_id: str,
    hospital_id: str,
) -> List[Dict[str, Any]]:
    packets: List[Dict[str, Any]] = []
    base_ts = time.time()
    for idx, (lat, lng, speed) in enumerate(SIMULATION_PATH):
        if idx + 1 < len(SIMULATION_PATH):
            next_lat, next_lng, _ = SIMULATION_PATH[idx + 1]
            heading = calculate_compass_heading(lat, lng, next_lat, next_lng)
        else:
            heading = 90.0

        packets.append(
            {
                "vehicle_id": vehicle_id,
                "emergency_id": emergency_id,
                "latitude": lat,
                "longitude": lng,
                "speed": speed,
                "heading": heading,
                "timestamp": round(base_ts + idx, 3),
                "hospital_id": hospital_id,
            }
        )
    return packets


def authenticate_driver(
    base_url: str,
    email: str,
    password: str,
    role: str,
) -> Tuple[str, dict, Optional[str]]:
    if httpx is None:
        raise RuntimeError("httpx library is required to run simulate_driver_gps.py")

    resp = httpx.post(
        f"{base_url.rstrip('/')}/api/v1/auth/login",
        json={"email": email, "password": password, "role": role},
        timeout=10.0,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("access_token") or resp.cookies.get("access_token")
    csrf = resp.cookies.get("csrf_token")
    if not token:
        raise RuntimeError("Login succeeded but no access token was returned.")
    return token, dict(resp.cookies), csrf


async def _drain_ws_messages(ws: Any, drain_window_seconds: float = 0.2) -> List[str]:
    """Drain all queued server broadcasts within a bounded window without blocking."""
    received_types: List[str] = []
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=drain_window_seconds)
            parsed = json.loads(raw)
            received_types.append(str(parsed.get("type", "unknown")))
        except asyncio.TimeoutError:
            break
    return received_types


async def run_websocket_simulation(
    ws_base: str,
    token: str,
    vehicle_id: str,
    emergency_id: str,
    hospital_id: str,
    interval: float,
) -> None:
    if websockets is None:
        raise RuntimeError("websockets package not installed")

    ws_url = f"{ws_base.rstrip('/')}/ws?token={token}&emergency_id={emergency_id}"
    packets = build_telemetry_packets(vehicle_id, emergency_id, hospital_id)

    async with websockets.connect(ws_url) as ws:
        handshake = json.loads(await ws.recv())
        print(f"[CONNECTED] Server handshake: {handshake.get('type')} rooms={handshake.get('data', {}).get('rooms')}")

        for idx, data in enumerate(packets, 1):
            data["timestamp"] = round(time.time(), 3)
            await ws.send(json.dumps({"type": "tracking:update_location", "data": data}))
            events = await _drain_ws_messages(ws)
            print(f"[{data['timestamp']}] STEP {idx:02d}/{len(packets)} -> events={events or ['sent']}")
            await asyncio.sleep(interval)


def run_http_fallback(
    base_url: str,
    cookies: dict,
    csrf_token: Optional[str],
    vehicle_id: str,
    emergency_id: str,
    hospital_id: str,
    interval: float,
) -> None:
    if httpx is None:
        raise RuntimeError("httpx package not installed")

    url = f"{base_url.rstrip('/')}/api/v1/tracking/update-location"
    headers = {"X-CSRF-Token": csrf_token} if csrf_token else {}
    packets = build_telemetry_packets(vehicle_id, emergency_id, hospital_id)

    with httpx.Client(cookies=cookies, headers=headers, timeout=10.0) as client:
        for idx, payload in enumerate(packets, 1):
            payload["timestamp"] = round(time.time(), 3)
            res = client.post(url, json=payload)
            res.raise_for_status()
            print(f"[HTTP] STEP {idx:02d}/{len(packets)} -> {res.json().get('status')}")
            time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="Authenticated AETIS Driver GPS Simulator")
    parser.add_argument("--base-url", default=os.getenv("AETIS_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--ws-url", default=os.getenv("AETIS_WS_URL", "ws://127.0.0.1:8000"))
    parser.add_argument("--email", default=os.getenv("AETIS_SIM_EMAIL", "driver@aetis.gov"))
    parser.add_argument("--password", default=os.getenv("AETIS_SIM_PASSWORD", ""))
    parser.add_argument("--role", default=os.getenv("AETIS_SIM_ROLE", "driver"))
    parser.add_argument("--vehicle-id", default=os.getenv("AETIS_VEHICLE_ID", "AMB-01"))
    parser.add_argument("--emergency-id", default=os.getenv("AETIS_EMERGENCY_ID", "EMG-01"))
    parser.add_argument("--hospital-id", default=os.getenv("AETIS_HOSPITAL_ID", "HOSP-01"))
    parser.add_argument("--interval", type=float, default=1.5)
    parser.add_argument("--dry-run", action="store_true", help="Print sample packets without network calls")
    args = parser.parse_args()

    if args.dry_run:
        packets = build_telemetry_packets(args.vehicle_id, args.emergency_id, args.hospital_id)
        print(f"[DRY-RUN] Generated {len(packets)} valid telemetry packets for {args.vehicle_id}/{args.emergency_id}")
        return 0

    if not args.password:
        print("Error: --password or AETIS_SIM_PASSWORD is required.", file=sys.stderr)
        return 1

    token, cookies, csrf_token = authenticate_driver(
        args.base_url, args.email, args.password, args.role
    )

    if websockets is not None:
        try:
            asyncio.run(
                run_websocket_simulation(
                    args.ws_url,
                    token,
                    args.vehicle_id,
                    args.emergency_id,
                    args.hospital_id,
                    args.interval,
                )
            )
            return 0
        except Exception as exc:
            print(f"[WS FALLBACK] WebSocket failed ({exc}); switching to authenticated HTTP REST.", file=sys.stderr)

    run_http_fallback(
        args.base_url,
        cookies,
        csrf_token,
        args.vehicle_id,
        args.emergency_id,
        args.hospital_id,
        args.interval,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
