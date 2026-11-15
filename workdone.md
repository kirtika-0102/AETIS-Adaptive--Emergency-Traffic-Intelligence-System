# AETIS Development Work Log

## Phase B1 Completed: Traffic Hardware Models & Signal/Camera CRUD APIs
- **Timestamp**: 2026-11-15T23:37:00+05:30
- **Executed by**: Person B
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
