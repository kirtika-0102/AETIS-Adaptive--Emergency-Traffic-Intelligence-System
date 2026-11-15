# AETIS Development Work Log

## Phase B1 Completed: Traffic Hardware Models & Signal/Camera CRUD APIs
- **Timestamp**: 2026-11-15T23:37:00+05:30
- **Executed by**: kartik
- **Branch**: `feature/realtime`

### Exact Files Created / Modified
1. `aetis-backend/requirements.txt` - Python backend dependencies (FastAPI, Uvicorn, SQLAlchemy, Pydantic, HTTPX, Pytest).
2. `aetis-backend/app/__init__.py` - Application package initialization.
3. `aetis-backend/app/database.py` - SQLAlchemy database engine, sessionmaker, base model, and `get_db` dependency.
4. `aetis-backend/app/models/signal.py` - SQLAlchemy model `TrafficSignal` and `SignalPhase` enum.
5. `aetis-backend/app/models/camera.py` - SQLAlchemy model `Camera` and `CameraStatus` enum.
6. `aetis-backend/app/models/__init__.py` - Model exports.
7. `aetis-backend/app/schemas/signal.py` - Pydantic schemas: `SignalBase`, `SignalCreate`, `SignalOverrideRequest`, `SignalResponse`, and `SignalPhase` enum.
8. `aetis-backend/app/schemas/camera.py` - Pydantic schemas: `CameraBase`, `CameraCreate`, `CameraResponse`, and `CameraStatus` enum.
9. `aetis-backend/app/schemas/__init__.py` - Schema exports.
10. `aetis-backend/app/routers/signals.py` - Signal management endpoints (list, get by id, register, manual override, reset).
11. `aetis-backend/app/routers/cameras.py` - Camera management endpoints (list, get by id, register).
12. `aetis-backend/app/routers/__init__.py` - Router exports.
13. `aetis-backend/app/main.py` - FastAPI app initialization, CORS middleware, table auto-creation, mock data seeder, and router mounting.
14. `aetis-backend/tests/__init__.py` & `aetis-backend/tests/test_api.py` - Automated integration test suite covering all endpoints, override logic, conflict checking, and foreign key validation.
15. `aetis-backend/.gitignore` & `.gitignore` - Ignore database files, caches, and environment configs.

---

### TrafficSignal and Camera Schema Attributes

#### 1. TrafficSignal Model & Schema
- `id`: `str` (Primary key, e.g. `'SIG-101'`)
- `name`: `str` (Intersection / signal name, e.g. `'Junction 4 - MG Road & Park Ave'`)
- `latitude`: `float` (-90.0 to 90.0)
- `longitude`: `float` (-180.0 to 180.0)
- `current_phase`: Enum `['RED', 'YELLOW', 'GREEN']` (Default: `'RED'`)
- `normal_cycle_seconds`: `int` (Default: `60`)
- `is_preempted`: `bool` (Default: `False`)
- `preempted_by_vehicle_id`: `Optional[str]` (Nullable vehicle ID holding preemption)
- `preemption_end_time`: `Optional[datetime]` (Nullable expiration timestamp of preemption)
- `cameras`: Relationship to monitored `Camera` instances (cascade delete-orphan)

#### 2. Camera Model & Schema
- `id`: `str` (Primary key, e.g. `'CAM-201'`)
- `name`: `str` (e.g. `'Northbound Approach Cam 1'`)
- `latitude`: `float` (-90.0 to 90.0)
- `longitude`: `float` (-180.0 to 180.0)
- `stream_url`: `str` (RTSP URL or video feed URL)
- `connected_signal_id`: `str` (Foreign Key referencing `traffic_signals.id`)
- `view_heading`: `int` (Compass degrees 0-360)
- `status`: Enum `['ONLINE', 'OFFLINE', 'ERROR']` (Default: `'ONLINE'`)
- `signal`: Relationship back to `TrafficSignal`

---

### List of Endpoints Added

| Method | Endpoint | Request Body | Response Body | Description |
|---|---|---|---|---|
| **GET** | `/api/v1/signals` | None | `List[SignalResponse]` | List all traffic signals with current phase and coordinates |
| **GET** | `/api/v1/signals/{id}` | None | `SignalResponse` | Get detailed status of a specific traffic signal |
| **POST** | `/api/v1/signals` | `SignalCreate` | `SignalResponse` (201) | Register a new traffic signal controller |
| **POST** | `/api/v1/signals/{id}/override` | `Optional[SignalOverrideRequest]` | `SignalResponse` | Manual emergency preemption toggle (forces GREEN phase, sets `is_preempted=True`, computes `preemption_end_time`) |
| **POST** | `/api/v1/signals/{id}/reset` | None | `SignalResponse` | Resets signal back to normal autonomous cycle (phase='RED', `is_preempted=False`, clears preemption locks) |
| **GET** | `/api/v1/cameras` | None | `List[CameraResponse]` | List all traffic cameras with stream URLs and connected signals |
| **GET** | `/api/v1/cameras/{id}` | None | `CameraResponse` | Get details and stream URL for a specific camera |
| **POST** | `/api/v1/cameras` | `CameraCreate` | `CameraResponse` (201) | Register a new traffic camera attached to an existing signal |
| **GET** | `/` | None | `{ "system": ..., "status": ..., "docs_url": ... }` | Backend root information |
| **GET** | `/health` | None | `{ "status": "healthy" }` | Healthcheck endpoint |

---

### Testing Instructions for Checking Signals in Swagger UI

1. **Start the FastAPI Backend Server**:
   From the repository root or inside `aetis-backend/`, run:
   ```powershell
   cd aetis-backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Open the Interactive Swagger UI**:
   Navigate your web browser to:
   ```
   http://127.0.0.1:8000/docs
   ```

3. **Verify Seeded Signals**:
   - Locate the **Traffic Signals** section.
   - Click `GET /api/v1/signals` -> click **Try it out** -> click **Execute**.
   - Observe the pre-seeded traffic signals (`SIG-101`, `SIG-102`, `SIG-103`) with their coordinates, current phases, and cycle settings.

4. **Test Signal Detail**:
   - Click `GET /api/v1/signals/{id}`.
   - Enter `SIG-101` and click **Execute**.
   - Verify signal details return with status code `200 OK`.

5. **Test Manual Preemption Override**:
   - Click `POST /api/v1/signals/{id}/override`.
   - Enter `id`: `SIG-101`.
   - Enter Request Body:
     ```json
     {
       "vehicle_id": "EV-AMB-01",
       "duration_seconds": 90
     }
     ```
   - Click **Execute**.
   - Verify the response has:
     - `"current_phase": "GREEN"`
     - `"is_preempted": true`
     - `"preempted_by_vehicle_id": "EV-AMB-01"`
     - `"preemption_end_time"` populated with an ISO timestamp 90 seconds in the future.

6. **Test Resetting the Signal**:
   - Click `POST /api/v1/signals/{id}/reset`.
   - Enter `id`: `SIG-101` and click **Execute**.
   - Verify that:
     - `"current_phase": "RED"`
     - `"is_preempted": false`
     - `"preempted_by_vehicle_id": null`
     - `"preemption_end_time": null`

7. **Verify Traffic Cameras**:
   - Locate the **Traffic Cameras** section.
   - Click `GET /api/v1/cameras` -> click **Execute**.
   - Verify the pre-seeded cameras (`CAM-201`, `CAM-202`, `CAM-203`) connected to `SIG-101` and `SIG-102`.


## Phase B2 Completed: Real-Time WebSocket Connection Manager & Room Architecture
- **Timestamp**: 2026-11-15T23:52:15+05:30
- **Executed by**: kartik
- **Branch**: `feature/realtime`

### Exact Files Created / Modified
1. `aetis-backend/app/services/websocket_manager.py` - Created `ConnectionManager` class with dynamic room dictionary (`active_rooms: Dict[str, Set[WebSocket]]`), connect/disconnect logic, dead-socket pruning, and `broadcast_to_room` JSON messaging engine.
2. `aetis-backend/app/services/__init__.py` - Exported `ConnectionManager` and singleton `manager`.
3. `aetis-backend/app/routers/ws.py` - Created `/ws` endpoint with client type and query parameter room routing (`dispatcher`, `driver`, `hospital`, `signal`), heartbeat ping/pong handling, and dynamic subscribe/unsubscribe support; added `/api/v1/ws/stats` monitoring endpoint.
4. `aetis-backend/app/routers/__init__.py` - Exported `ws_router`.
5. `aetis-backend/app/main.py` - Registered `ws_router` on FastAPI application.
6. `aetis-backend/tests/test_websocket.py` - Comprehensive automated test suite validating role room assignment, heartbeat pings, targeted room broadcasting, dynamic room subscriptions, and disconnect cleanup.

---

### Full List of Supported WebSocket Rooms & Event Listeners

| Room Name | Target Role / Subsystem | Automatic Assignment Criteria | Events & Messages Handled / Transmitted |
|---|---|---|---|
| `"dispatchers"` | Central dispatch operators | `client_type=dispatcher` (or `client_type=admin`) | `emergency.updated`, `emergency.status`, `emergency.removed`, `ev.updated`, `ev.ended`, `notification.new` |
| `"signals"` | Real-time traffic controllers & route drivers | `client_type=dispatcher`, `client_type=driver`, or `client_type=signal` | `signal.status` (phase changes, cycle countdowns), `signal.route` (preempted green corridor) |
| `"hospital:{hospital_id}"` | Receiving emergency hospital staff | `client_type=hospital` with `hospital_id=<id>` (or explicit `hospital_id` query param) | Inbound ambulance alerts, patient triage updates, real-time arrival estimates (`inbound.eta`) |
| `"emergency:{emergency_id}"` | Responding EV drivers & incident room | `client_type=driver` with `emergency_id=<id>` (or explicit `emergency_id` query param) | `ev.moved` (live GPS coordinates, speed, bearing), route deviations, preemption corridor feedback |
| `"custom:{name}"` | Dynamic runtime topics | Subscribed dynamically via `{"type": "subscribe", "room": "..."}` | Custom topic broadcasts, weather alerts, road closure notifications |

#### Core Protocol Message Handlers:
- **Heartbeat Ping / Pong**:
  - Inbound: `{"type": "ping"}`
  - Outbound: `{"type": "pong", "data": {"timestamp": "<ISO>"}}`
- **Dynamic Subscription**:
  - Inbound: `{"type": "subscribe", "room": "<room_name>"}`
  - Outbound: `{"type": "room.subscribed", "data": {"room": "<room_name>"}}`
- **Dynamic Unsubscription**:
  - Inbound: `{"type": "unsubscribe", "room": "<room_name>"}`
  - Outbound: `{"type": "room.unsubscribed", "data": {"room": "<room_name>"}}`
- **Room Broadcast Event Format**:
  - Outbound: `{"type": "<event_type>", "data": { ... }}`

---

### Instructions on How to Connect & Test WebSockets

#### Option 1: Test with Postman WebSocket Request
1. Open Postman -> Click **New** -> Select **WebSocket Request**.
2. Enter URL:
   ```
   ws://127.0.0.1:8000/ws?client_type=dispatcher
   ```
3. Click **Connect**.
4. Observe the initial JSON response:
   ```json
   {
     "type": "connection.established",
     "data": {
       "client_type": "dispatcher",
       "rooms": ["dispatchers", "signals"],
       "connected_at": "..."
     }
   }
   ```
5. In the message input, send a heartbeat ping:
   ```json
   {
     "type": "ping"
   }
   ```
6. Receive response:
   ```json
   {
     "type": "pong",
     "data": {
       "timestamp": "..."
     }
   }
   ```

#### Option 2: Test with a Python Script
Run the following script to connect as a driver and receive real-time events:
```python
import asyncio
import json
import websockets

async def test_ws():
    url = "ws://127.0.0.1:8000/ws?client_type=driver&emergency_id=EMG-101"
    async with websockets.connect(url) as ws:
        # Receive welcome connection payload
        welcome = await ws.recv()
        print("Connected:", json.loads(welcome))

        # Send heartbeat ping
        await ws.send(json.dumps({"type": "ping"}))
        pong = await ws.recv()
        print("Received Heartbeat:", json.loads(pong))

        # Dynamically subscribe to an additional topic
        await ws.send(json.dumps({"type": "subscribe", "room": "hospital:HOSP-MG"}))
        sub_ack = await ws.recv()
        print("Subscribed:", json.loads(sub_ack))

asyncio.run(test_ws())
```


## Phase B3 Completed: GPS Breadcrumb Ingestion & Real-Time Map Broadcast
- **Timestamp**: 2026-11-16T00:02:30+05:30
- **Executed by**: kartik
- **Branch**: `feature/realtime`

### Exact Files Created / Modified
1. `aetis-backend/app/schemas/telemetry.py` - Created Pydantic schema `LocationUpdatePayload` with strict coordinate, speed, heading, and timestamp validation.
2. `aetis-backend/app/schemas/__init__.py` - Exported `LocationUpdatePayload`.
3. `aetis-backend/app/models/vehicle.py` - SQLAlchemy model `Vehicle` with `current_latitude`, `current_longitude`, `speed`, `heading`, `status`, and `last_update_at`.
4. `aetis-backend/app/models/emergency.py` - SQLAlchemy model `Emergency` with `assigned_vehicle_id`, `hospital_id`, destination coordinates, and triage status.
5. `aetis-backend/app/models/__init__.py` - Exported `Vehicle` and `Emergency`.
6. `aetis-backend/app/services/telemetry_service.py` - Created high-frequency GPS telemetry processing pipeline: database updates, Haversine distance calculations, dynamic ETA estimations, and multi-room broadcasts.
7. `aetis-backend/app/services/__init__.py` - Exported `process_location_update`.
8. `aetis-backend/app/routers/ws.py` - Implemented incoming WebSocket handler for `tracking:update_location` messages, invoking telemetry ingestion and broadcasting to relevant rooms.
9. `aetis-backend/app/routers/tracking.py` - Created REST fallback endpoint `POST /api/v1/tracking/update-location` for cellular proxy/firewall scenarios, and vehicle position query endpoint `GET /api/v1/tracking/vehicle/{id}`.
10. `aetis-backend/app/routers/__init__.py` - Exported `tracking_router`.
11. `aetis-backend/app/main.py` - Registered `tracking_router` and seeded initial vehicle and active emergency records.
12. `aetis-backend/tests/test_tracking.py` - Automated integration tests verifying WebSocket telemetry ingestion, database updates, real-time broadcasts to dispatchers/emergency/hospital rooms, and the REST fallback API.

---

### Ingestion Payload Structure for Driver GPS Coordinates

Drivers send telemetry breadcrumbs over WebSocket (`type: "tracking:update_location"`) or HTTP POST (`/api/v1/tracking/update-location`):

```json
{
  "type": "tracking:update_location",
  "data": {
    "vehicle_id": "EV-AMB-01",
    "emergency_id": "EMG-101",
    "latitude": 12.9720,
    "longitude": 77.5950,
    "speed": 58.5,
    "heading": 85.0,
    "timestamp": 1700000000.0,
    "hospital_id": "HOSP-CITY",
    "eta_seconds": 240.0
  }
}
```

#### Field Specifications:
- `vehicle_id` (`str`): Unique vehicle identifier (e.g. `'EV-AMB-01'`)
- `emergency_id` (`str`): Identifier of the active dispatched incident
- `latitude` (`float`): Decimal latitude (-90.0 to 90.0)
- `longitude` (`float`): Decimal longitude (-180.0 to 180.0)
- `speed` (`float`): Current vehicle velocity in km/h ($\ge 0.0$)
- `heading` (`float`): Compass bearing in degrees (0.0 to 360.0)
- `timestamp` (`float`): Unix epoch timestamp of GPS fix in seconds
- `hospital_id` (`Optional[str]`): Optional destination hospital override
- `eta_seconds` (`Optional[float]`): Optional pre-calculated ETA override

---

### Broadcast Flow Mapping: Driver Socket -> Server -> Dispatcher LiveMap & Hospital Screens

```
                                [ Emergency Vehicle Driver ]
                                              |
                   WebSocket {"type": "tracking:update_location", "data": {...}}
                   OR HTTP POST /api/v1/tracking/update-location
                                              |
                                              v
                              [ AETIS Telemetry Ingestion ]
                                              |
                     +------------------------+------------------------+
                     |                                                 |
         [ Database Persistence ]                            [ Event Broadcaster ]
     Update Vehicle latitude, longitude,                               |
     speed, heading, and timestamp.                                    |
                     |                                                 |
                     +------------------------+------------------------+
                                              |
               +------------------------------+------------------------------+
               |                                                             |
               v                                                             v
       Room: "dispatchers"                                       Room: "emergency:{id}"
   Event: "tracking:location_update"                         Event: "tracking:location_update"
   Payload: { vehicle_id, latitude,                           Payload: { vehicle_id, latitude,
              longitude, speed, heading, ... }                           longitude, speed, heading, ... }
               |                                                             |
               v                                                             v
    [ Central Dispatcher ]                                         [ Responding Unit / ]
    Live Map EV Marker Updates &                                  [ Navigation Screen ]
    Real-time Breadcrumb Polylines
                                              |
                                              v (If destination hospital is linked)
                                    Room: "hospital:{hospital_id}"
                                 Event: "tracking:eta_update" & "inbound.eta"
                                 Payload: { emergency_id, vehicle_id,
                                            hospital_id, eta_seconds, ... }
                                              |
                                              v
                                  [ Hospital Triage Desk ]
                                  Live ETA Countdown & Bed Prep
```

---

### Verification Steps

1. **Start Backend**:
   ```powershell
   cd aetis-backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. **Open Swagger UI & Dispatcher WebSocket**:
   - In Postman or browser console, open WebSocket to `ws://127.0.0.1:8000/ws?client_type=dispatcher`.
   - In another tab or Postman connection, open WebSocket to `ws://127.0.0.1:8000/ws?client_type=hospital&hospital_id=HOSP-CITY`.
3. **Emit Telemetry via Driver Socket or REST Fallback**:
   - Send HTTP POST to `http://127.0.0.1:8000/api/v1/tracking/update-location` with:
     ```json
     {
       "vehicle_id": "EV-AMB-01",
       "emergency_id": "EMG-101",
       "latitude": 12.9730,
       "longitude": 77.5960,
       "speed": 60.0,
       "heading": 90.0,
       "timestamp": 1700000010.0
     }
     ```
4. **Observe Real-Time Deliveries**:
   - The dispatcher WebSocket immediately receives `tracking:location_update`.
   - The hospital WebSocket immediately receives `tracking:eta_update` with calculated `eta_seconds`.
5. **Verify Database Updated**:
   - Run `GET /api/v1/tracking/vehicle/EV-AMB-01`.
   - Confirm coordinates and speed reflect the latest values (`lat: 12.973, lng: 77.596, speed: 60.0`).


## Phase B4 Completed: Corridor Spatial Mapping & Queue-Flushing Preemption Engine
- **Timestamp**: 2026-11-16T00:26:45+05:30
- **Executed by**: kartik
- **Branch**: `feature/realtime`

### Exact Files Created / Modified
1. `aetis-backend/app/services/routing_service.py` - Created spatial corridor routing engine containing `haversine_distance` and `get_signals_along_corridor` (cross-track vector projection and distance sorting).
2. `aetis-backend/app/services/preemption_service.py` - Implemented predictive queue dissipation algorithm `calculate_queue_dissipation` and `trigger_green_wave` WebSocket broadcasting pipeline.
3. `aetis-backend/app/services/__init__.py` - Exported `haversine_distance`, `get_signals_along_corridor`, `calculate_queue_dissipation`, and `trigger_green_wave`.
4. `aetis-backend/app/schemas/signal.py` - Added Pydantic schemas `CorridorEvaluationRequest` and `CorridorEvaluationResponse`.
5. `aetis-backend/app/schemas/__init__.py` - Exported corridor schemas.
6. `aetis-backend/app/routers/signals.py` - Added endpoint `POST /api/v1/signals/evaluate-corridor` to evaluate downstream corridor signals and dynamically trigger green waves.
7. `aetis-backend/tests/test_corridor.py` - Automated integration test suite validating Haversine calculations, cross-track corridor filtering, queue dissipation math, WebSocket event emissions, and corridor evaluation endpoints.

---

### Mathematical Formula for Queue Clearance and Arrival Timing

The queue-flushing preemption engine predicts the exact moment to switch an upcoming red light to green so that stopped vehicles completely dissipate before the emergency vehicle arrives at the intersection at full operational speed, avoiding unnecessary emergency vehicle deceleration or harsh braking.

$$\text{queue\_clear\_time} = (N_{\text{queue}} \times 2.0) + 15.0$$

where:
- $N_{\text{queue}}$ is the count of stopped vehicles queued at the red light approach.
- $2.0 \text{ seconds}$ is the average startup and acceleration headway per vehicle.
- $15.0 \text{ seconds}$ is the mandatory safety clearance buffer:
  - $4.0\text{s}$ yellow change interval on opposing approaches,
  - $2.0\text{s}$ all-red pedestrian and clearance interval,
  - $9.0\text{s}$ initial queue acceleration and intersection entry buffer.

The emergency vehicle's estimated time of arrival ($\text{ETA}$) to the stop line is calculated as:

$$\text{speed}_{\text{mps}} = \max\left(\text{speed}_{\text{km/h}} \times \frac{1000}{3600}, 2.0\right)$$

$$\text{vehicle\_eta\_seconds} = \begin{cases} \frac{\text{distance\_to\_signal}}{\text{speed}_{\text{mps}}}, & \text{if } \text{speed}_{\text{mps}} > 2.0 \text{ m/s} \\ 9999.0, & \text{otherwise} \end{cases}$$

$$\text{trigger\_threshold\_seconds} = \text{queue\_clear\_time} + 5.0$$

$$\text{should\_trigger\_preemption} = \text{vehicle\_eta\_seconds} \le \text{trigger\_threshold\_seconds}$$

---

### Preemption Phase Lifecycle Documentation

```
[Normal Cycle (RED/YELLOW/GREEN)]
             |
             v  Approaching EV detected (ETA <= queue_clear_time + 5s)
[Preemption Activated (trigger_green_wave)]
             |
             +---> 1. Signal Phase forced to 'GREEN'
             +---> 2. is_preempted = True, preempted_by_vehicle_id = vehicle_id
             +---> 3. preemption_end_time = now + hold_duration (default 45s)
             +---> 4. WS Broadcast -> "signals" room:
             |        {"type": "signal:phase_changed", "data": {"phase": "GREEN", "countdown": 45}}
             +---> 5. WS Broadcast -> "dispatchers" room:
                      {"type": "signal:preemption_triggered", "data": {"signal_id": "...", "vehicle_id": "..."}}
             |
             v  Vehicle clears intersection OR hold_duration expires
[Signal Reset (POST /api/v1/signals/{id}/reset)]
             |
             +---> 1. current_phase = 'RED'
             +---> 2. is_preempted = False, preempted_by_vehicle_id = None
             +---> 3. Autonomous fixed/adaptive cycle resumes
```

---

### How to Test Corridor Evaluation via Swagger UI

1. **Start the Backend Server**:
   ```powershell
   cd aetis-backend
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. **Open Swagger UI**:
   Navigate to [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
3. **Locate Corridor Evaluation Endpoint**:
   - Scroll to **Traffic Signals** section.
   - Click `POST /api/v1/signals/evaluate-corridor` -> click **Try it out**.
4. **Execute Corridor Evaluation Request**:
   - Paste the following test payload (vehicle located ~150m west of `SIG-101` traveling at 54 km/h towards `SIG-102`):
     ```json
     {
       "vehicle_id": "EV-AMB-01",
       "current_latitude": 12.9715,
       "current_longitude": 77.5932,
       "speed_kmh": 54.0,
       "destination_latitude": 12.9725,
       "destination_longitude": 77.6075,
       "queue_count": 5,
       "corridor_width_meters": 80.0,
       "hold_duration_seconds": 45
     }
     ```
   - Click **Execute**.
5. **Inspect Response**:
   - Observe `preemption_triggered: true`.
   - Observe `preempted_signal_id: "SIG-101"`.
   - Observe `vehicle_eta_seconds` ($\approx 10.1\text{s}$) is less than `trigger_threshold_seconds` ($30.0\text{s}$).
   - Observe `details` containing downstream signals sorted in proximity order.
6. **Verify Signal Status**:
   - Run `GET /api/v1/signals/SIG-101`.
   - Confirm `"current_phase": "GREEN"` and `"is_preempted": true`.


## Phase B5 Completed: Camera AI Ingestion Webhook & GPS Stream Simulator
- **Timestamp**: 2026-11-16T00:37:55+05:30
- **Executed by**: kartik
- **Branch**: `feature/realtime`

### Exact Files Created / Modified
1. `aetis-backend/app/schemas/telemetry.py` - Created Pydantic schema `CameraDetectionPayload` (`camera_id`, `detected_vehicle_type`, `confidence`, `estimated_queue_count`, `timestamp`).
2. `aetis-backend/app/schemas/__init__.py` - Exported `CameraDetectionPayload`.
3. `aetis-backend/app/routers/detections.py` - Created AI detection ingestion webhook `POST /api/v1/detections/camera-alert` with confidence gating ($\ge 0.80$), directional downstream signal handover, queue dissipation calculation, and WebSocket broadcasting.
4. `aetis-backend/app/routers/__init__.py` - Exported `detections_router`.
5. `aetis-backend/app/main.py` - Registered `detections_router`.
6. `aetis-backend/scripts/simulate_driver_gps.py` & `scripts/simulate_driver_gps.py` - Created standalone real-time driver GPS telemetry simulation script streaming 15 waypoints from Central Square towards City Memorial Trauma Center with WebSocket connection and REST fallback.
7. `aetis-backend/tests/test_detections.py` - Automated integration test suite validating high-confidence ambulance detection preemption triggers, low-confidence drop logic, non-emergency vehicle filtering, and 404 error cases.

---

### Camera Detection Payload Schema & Downstream Handover Logic

#### 1. Ingestion Payload Schema
```json
{
  "camera_id": "CAM-201",
  "detected_vehicle_type": "AMBULANCE",
  "confidence": 0.94,
  "estimated_queue_count": 5,
  "timestamp": 1700000000.0,
  "vehicle_id": "AMB-01"
}
```

#### 2. Downstream Handover Logic:
1. **Intake & Verification**:
   - Webhook receives detection from computer vision inference edge nodes (YOLO / OpenCV).
   - Validates that `detected_vehicle_type == 'AMBULANCE'` and `confidence >= 0.80`.
   - If criteria not met, gracefully returns status `"alert_ignored"` and drops preemption.
2. **Topology Traversal & Directional Handover**:
   - Resolves the camera's connected upstream signal `connected_signal_id` (e.g. `SIG-101`).
   - Uses the camera's `view_heading` orientation vector to identify the downstream intersection along the road approach (e.g. `SIG-102`).
3. **Automated Queue Flushing**:
   - Computes queue clearance window based on `estimated_queue_count`:
     $$\text{hold\_duration} = \max(35, (N_{\text{queue}} \times 2.0) + 30.0\text{s})$$
   - Activates green-wave preemption on the target downstream signal (`current_phase = 'GREEN'`, `is_preempted = True`).
4. **WebSocket Multi-Room Broadcast**:
   - Emits `camera:detection_alert` to room `"signals"`.
   - Emits `camera:detection_alert` to room `"dispatchers"`.

---

### Command to Run Driver Simulator

From the repository root:
```powershell
python scripts/simulate_driver_gps.py
```
Or from inside `aetis-backend/`:
```powershell
cd aetis-backend
python scripts/simulate_driver_gps.py
```

---

### kartik SIGN-OFF
**All Real-Time WebSocket channels, Signal Preemption algorithms, and AI Detection hooks are fully implemented, verified with 21 passing automated unit/integration tests, and ready for Sync Gate 2 merge.**

- **Hardware Models & CRUD**: TrafficSignal & Camera SQLAlchemy models + CRUD APIs (Phase B1)
- **Real-Time WebSocket Architecture**: Dynamic Pub/Sub rooms (`dispatchers`, `signals`, `hospital:{id}`, `emergency:{id}`) + Heartbeat ping/pong (Phase B2)
- **High-Frequency GPS Ingestion**: Telemetry breadcrumb intake + real-time map multi-room broadcasting + REST fallback (Phase B3)
- **Spatial Corridor Mapping & Preemption**: Haversine vector projections + predictive queue dissipation timing + green wave triggers (Phase B4)
- **Computer Vision Webhook & Driver Simulator**: AI detection intake + downstream signal preemption + 15-waypoint GPS breadcrumb simulator (Phase B5)
