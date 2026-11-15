#!/usr/bin/env python3
"""
AETIS Driver GPS Stream Simulator (Ambulance AMB-01)
Simulates high-frequency GPS breadcrumb telemetry from Central Square
towards City Memorial Trauma Center, transmitting over WebSocket with REST fallback.
"""

import asyncio
import json
import math
import sys
import time
from typing import List, Tuple

try:
    import websockets
except ImportError:
    websockets = None

try:
    import httpx
except ImportError:
    httpx = None


WS_SERVER_URL = "ws://127.0.0.1:8000/ws?client_type=driver&emergency_id=EMG-101"
HTTP_FALLBACK_URL = "http://127.0.0.1:8000/api/v1/tracking/update-location"

# 15 GPS Waypoints from Central Square (12.9710, 77.5920) to City Memorial Trauma Center (12.9785, 77.6350)
SIMULATION_PATH: List[Tuple[float, float, float]] = [
    # (latitude, longitude, speed_kmh)
    (12.9710, 77.5920, 42.0),  # Waypoint 1: Departure Central Square
    (12.9714, 77.5942, 48.5),  # Waypoint 2: Approaching Junction 4 (SIG-101)
    (12.9716, 77.5960, 56.0),  # Waypoint 3: MG Road Corridor Entry
    (12.9718, 77.5990, 62.0),  # Waypoint 4: Green wave acceleration
    (12.9720, 77.6020, 64.5),  # Waypoint 5: Mid MG Road
    (12.9723, 77.6050, 58.0),  # Waypoint 6: Approaching Brigade Rd Junction (SIG-102)
    (12.9726, 77.6080, 60.5),  # Waypoint 7: Crossing Junction 5
    (12.9732, 77.6120, 65.0),  # Waypoint 8: East Approach Expressway
    (12.9740, 77.6165, 63.0),  # Waypoint 9: Inner Ring Road Turn
    (12.9748, 77.6210, 59.5),  # Waypoint 10: Approaching Indiranagar Corridor
    (12.9758, 77.6250, 55.0),  # Waypoint 11: 100ft Road Approach
    (12.9768, 77.6285, 52.0),  # Waypoint 12: Near Hospital Perimeter
    (12.9775, 77.6315, 45.0),  # Waypoint 13: Deceleration on Hospital Ave
    (12.9780, 77.6335, 30.0),  # Waypoint 14: Emergency Bay Gate
    (12.9785, 77.6350, 10.0),  # Waypoint 15: City Memorial Trauma Center Arrival
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


async def run_websocket_simulation():
    print(f"\n=======================================================")
    print(f" AETIS Real-Time GPS Driver Simulator (Ambulance AMB-01)")
    print(f" Connecting to: {WS_SERVER_URL}")
    print(f" Total Waypoints: {len(SIMULATION_PATH)} | Interval: 1.5s")
    print(f"=======================================================\n")

    try:
        async with websockets.connect(WS_SERVER_URL) as ws:
            # 1. Receive server connection handshake
            handshake = await ws.recv()
            handshake_data = json.loads(handshake)
            print(f"[CONNECTED] Server handshake accepted: {handshake_data.get('type')}")
            print(f"[ROOMS] Joined dynamic rooms: {handshake_data.get('data', {}).get('rooms')}\n")

            # 2. Iterate and stream waypoints
            for idx, (lat, lng, speed) in enumerate(SIMULATION_PATH, 1):
                # Calculate heading towards next waypoint
                if idx < len(SIMULATION_PATH):
                    next_lat, next_lng, _ = SIMULATION_PATH[idx]
                    heading = calculate_compass_heading(lat, lng, next_lat, next_lng)
                else:
                    heading = 90.0

                now_ts = round(time.time(), 3)
                telemetry_packet = {
                    "type": "tracking:update_location",
                    "data": {
                        "vehicle_id": "AMB-01",
                        "emergency_id": "EMG-101",
                        "latitude": lat,
                        "longitude": lng,
                        "speed": speed,
                        "heading": heading,
                        "timestamp": now_ts,
                        "hospital_id": "HOSP-CITY",
                    },
                }

                # Transmit over WebSocket
                await ws.send(json.dumps(telemetry_packet))

                # Receive acknowledgment or broadcast echo
                ack_response = await ws.recv()
                ack_data = json.loads(ack_response)

                print(
                    f"[{now_ts}] STEP {idx:02d}/15 | "
                    f"Coords: ({lat:.5f}, {lng:.5f}) | "
                    f"Speed: {speed:4.1f} km/h | "
                    f"Heading: {heading:5.1f}\u00b0 | "
                    f"Server Event: {ack_data.get('type')}"
                )

                await asyncio.sleep(1.5)

            print(f"\n[COMPLETED] Ambulance AMB-01 arrived at City Memorial Trauma Center.")

    except Exception as e:
        print(f"\n[WS ERROR] Could not stream over WebSocket ({e}). Switching to HTTP fallback...")
        await run_http_fallback_simulation()


async def run_http_fallback_simulation():
    if not httpx:
        print("[ERROR] httpx library not installed for HTTP fallback.")
        return

    print(f"[HTTP FALLBACK] Posting GPS telemetry to {HTTP_FALLBACK_URL}...")
    async with httpx.AsyncClient() as client:
        for idx, (lat, lng, speed) in enumerate(SIMULATION_PATH, 1):
            heading = 90.0
            if idx < len(SIMULATION_PATH):
                next_lat, next_lng, _ = SIMULATION_PATH[idx]
                heading = calculate_compass_heading(lat, lng, next_lat, next_lng)

            payload = {
                "vehicle_id": "AMB-01",
                "emergency_id": "EMG-101",
                "latitude": lat,
                "longitude": lng,
                "speed": speed,
                "heading": heading,
                "timestamp": round(time.time(), 3),
                "hospital_id": "HOSP-CITY",
            }

            resp = await client.post(HTTP_FALLBACK_URL, json=payload)
            print(
                f"[HTTP POST] STEP {idx:02d}/15 | "
                f"Coords: ({lat:.5f}, {lng:.5f}) | "
                f"Speed: {speed:4.1f} km/h | "
                f"Status: {resp.status_code}"
            )
            await asyncio.sleep(1.5)


if __name__ == "__main__":
    try:
        asyncio.run(run_websocket_simulation())
    except KeyboardInterrupt:
        print("\n[STOPPED] Simulator interrupted by user.")
        sys.exit(0)
