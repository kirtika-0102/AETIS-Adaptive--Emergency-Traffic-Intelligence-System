# AETIS — Work Done Log

## Phase A1 Completed: Project Scaffolding, Core Database Models & Alembic Configuration

- **Timestamp:** 2026-11-16T14:00:00+05:30
- **Executed by:** Person A
- **Status:** ✅ Complete

---

### Summary

Set up the complete backend scaffolding for the AETIS (Adaptive Emergency Traffic Intelligence System) inside the `aetis-backend/` directory. This includes the FastAPI application entrypoint with CORS configured for the Vite frontend, Pydantic settings management, SQLAlchemy ORM models for all five core tables, Pydantic request/response schemas, password hashing and JWT token utilities, and a fully configured Alembic migration environment with the initial migration script.

---

### Files Created

| # | Path | Description |
|---|------|-------------|
| 1 | `aetis-backend/.env` | Environment variables (DB URL, secret key, etc.) |
| 2 | `aetis-backend/requirements.txt` | Python dependency list (FastAPI, SQLAlchemy, Alembic, etc.) |
| 3 | `aetis-backend/alembic.ini` | Alembic configuration file |
| 4 | `aetis-backend/app/__init__.py` | App package init |
| 5 | `aetis-backend/app/main.py` | FastAPI app with CORS middleware & `/health` endpoint |
| 6 | `aetis-backend/app/core/__init__.py` | Core package init |
| 7 | `aetis-backend/app/core/config.py` | Pydantic BaseSettings (PROJECT_NAME, DATABASE_URL, SECRET_KEY, etc.) |
| 8 | `aetis-backend/app/core/database.py` | SQLAlchemy engine, sessionmaker, DeclarativeBase, `get_db()` dependency |
| 9 | `aetis-backend/app/core/security.py` | bcrypt password hashing, JWT access token creation |
| 10 | `aetis-backend/app/models/__init__.py` | Model registry — imports all models for Alembic discovery |
| 11 | `aetis-backend/app/models/user.py` | `User` ORM model (table: `users`) |
| 12 | `aetis-backend/app/models/vehicle.py` | `Vehicle` ORM model (table: `vehicles`) |
| 13 | `aetis-backend/app/models/hospital.py` | `Hospital` ORM model (table: `hospitals`) |
| 14 | `aetis-backend/app/models/emergency.py` | `Emergency` ORM model (table: `emergencies`) |
| 15 | `aetis-backend/app/models/audit.py` | `AuditLog` ORM model (table: `audit_logs`) |
| 16 | `aetis-backend/app/schemas/__init__.py` | Schemas package init |
| 17 | `aetis-backend/app/schemas/auth.py` | `LoginRequest`, `Token`, `TokenData` schemas |
| 18 | `aetis-backend/app/schemas/user.py` | `UserCreate`, `UserUpdate`, `UserResponse` schemas |
| 19 | `aetis-backend/app/schemas/vehicle.py` | `VehicleCreate`, `VehicleUpdate`, `VehicleResponse` schemas |
| 20 | `aetis-backend/app/schemas/emergency.py` | `EmergencyCreate`, `EmergencyUpdate`, `EmergencyResponse` schemas |
| 21 | `aetis-backend/app/routers/__init__.py` | Routers package init (placeholder) |
| 22 | `aetis-backend/alembic/env.py` | Alembic environment — imports Base & all models |
| 23 | `aetis-backend/alembic/script.py.mako` | Alembic migration template |
| 24 | `aetis-backend/alembic/versions/0001_initial_schema.py` | Initial migration — creates all 5 tables |

---

### Database Schema Summary

#### Table: `hospitals`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(20)` | **PK** — e.g. `HOSP-01` |
| `name` | `String(255)` | NOT NULL |
| `address` | `Text` | NOT NULL |
| `latitude` | `Float` | NOT NULL |
| `longitude` | `Float` | NOT NULL |
| `contact_phone` | `String(20)` | NOT NULL |
| `trauma_level` | `Integer` | NOT NULL |
| `available_beds` | `Integer` | NOT NULL, default `0` |

#### Table: `users`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | **PK** — UUID |
| `email` | `String(255)` | UNIQUE, NOT NULL, indexed |
| `password_hash` | `String(255)` | NOT NULL |
| `full_name` | `String(255)` | NOT NULL |
| `role` | `String(20)` | NOT NULL — `ADMIN \| DISPATCHER \| DRIVER \| HOSPITAL` |
| `phone` | `String(20)` | nullable |
| `hospital_id` | `String(36)` | **FK → hospitals.id**, nullable |
| `is_active` | `Boolean` | NOT NULL, default `true` |

#### Table: `vehicles`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(20)` | **PK** — e.g. `AMB-01` |
| `call_sign` | `String(50)` | NOT NULL |
| `type` | `String(20)` | NOT NULL — `AMBULANCE \| FIRE_TRUCK \| POLICE` |
| `license_plate` | `String(20)` | NOT NULL |
| `status` | `String(20)` | NOT NULL, default `AVAILABLE` — `AVAILABLE \| DISPATCHED \| BUSY \| MAINTENANCE` |
| `current_latitude` | `Float` | nullable |
| `current_longitude` | `Float` | nullable |
| `current_driver_id` | `String(36)` | **FK → users.id**, nullable |

#### Table: `emergencies`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(20)` | **PK** — e.g. `EMG-01` |
| `incident_number` | `String(50)` | UNIQUE, NOT NULL, indexed |
| `title` | `String(255)` | NOT NULL |
| `severity` | `String(10)` | NOT NULL — `LOW \| MEDIUM \| HIGH \| CRITICAL` |
| `status` | `String(20)` | NOT NULL, default `PENDING` — `PENDING \| DISPATCHED \| IN_TRANSIT \| ARRIVED \| COMPLETED \| CANCELLED` |
| `pickup_latitude` | `Float` | NOT NULL |
| `pickup_longitude` | `Float` | NOT NULL |
| `pickup_address` | `Text` | nullable |
| `patient_notes` | `Text` | nullable |
| `assigned_vehicle_id` | `String(20)` | **FK → vehicles.id**, nullable |
| `destination_hospital_id` | `String(20)` | **FK → hospitals.id**, nullable |
| `dispatcher_id` | `String(36)` | **FK → users.id**, nullable |
| `created_at` | `DateTime(tz)` | NOT NULL, default `now()` |
| `completed_at` | `DateTime(tz)` | nullable |

#### Table: `audit_logs`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `String(36)` | **PK** — UUID |
| `action` | `String(100)` | NOT NULL |
| `performed_by_id` | `String(36)` | **FK → users.id**, NOT NULL |
| `details` | `Text` | nullable |
| `timestamp` | `DateTime(tz)` | NOT NULL, default `now()` |

#### Foreign Key Map

```
users.hospital_id        → hospitals.id
vehicles.current_driver_id → users.id
emergencies.assigned_vehicle_id    → vehicles.id
emergencies.destination_hospital_id → hospitals.id
emergencies.dispatcher_id          → users.id
audit_logs.performed_by_id         → users.id
```

---

### How to Start PostgreSQL & Run Migrations

#### 1. Start PostgreSQL

Make sure PostgreSQL is running on `localhost:5432`. Create the database if it doesn't exist:

```bash
# Using psql
psql -U postgres -c "CREATE DATABASE aetis_db;"
```

Or use pgAdmin / Docker:

```bash
docker run -d --name aetis-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=aetis_db \
  -p 5432:5432 postgres:16
```

#### 2. Install Python Dependencies

```bash
cd aetis-backend
pip install -r requirements.txt
```

#### 3. Run Alembic Migrations

```bash
cd aetis-backend
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 0001_initial, Initial schema – users, vehicles, hospitals, emergencies, audit_logs
```

---

### Verification Test Instructions

#### 1. Start the Development Server

```bash
cd aetis-backend
uvicorn app.main:app --reload
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process ...
INFO:     Started server process ...
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

#### 2. Test the Health Endpoint

Open a browser or use curl:

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "ok"}
```

#### 3. Check OpenAPI Docs

Visit [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger UI.

---


## Phase A2 Completed: Authentication & Role-Based Access Control (RBAC)

- **Timestamp:** 2026-11-16T14:22:00+05:30
- **Executed by:** Person A
- **Status:** ✅ Complete

---

### Summary
Built the authentication system, password security with bcrypt, JWT token generation with python-jose, and Role-Based Access Control (RBAC) middleware for the AETIS backend. Registered the `/api/v1/auth` router with routes for logging in, fetching the current user profile, and refreshing tokens. Added OAuth2 compatibility for Swagger UI and built a demo database seeding script for all 4 roles.

---

### Exact List of Files Created / Modified

| Action | Path | Description |
|---|---|---|
| Modified | `aetis-backend/app/core/security.py` | Added `get_password_hash`, `verify_password`, and `create_access_token` embedding `user_id`, `email`, and `role` |
| Modified | `aetis-backend/app/schemas/auth.py` | Created `LoginRequest`, `UserResponse`, `TokenResponse` (matching Redux authSlice format), and `RefreshTokenRequest` |
| Created | `aetis-backend/app/core/dependencies.py` | Created `oauth2_scheme`, `get_current_user` JWT validation dependency, and `require_role(allowed_roles)` RBAC dependency factory |
| Created | `aetis-backend/app/routers/auth.py` | Built `/login` (POST), `/me` (GET), `/refresh` (POST), and OAuth2 `/token` routes |
| Modified | `aetis-backend/app/routers/__init__.py` | Exported `auth` router |
| Modified | `aetis-backend/app/main.py` | Included `auth.router` under `/api/v1/auth` with tag `Authentication` |
| Created | `aetis-backend/scripts/seed_users.py` | Seed script to populate demo users for each of the 4 roles and demo hospital |

---

### API Endpoints Added

#### 1. POST `/api/v1/auth/login`
- **Summary:** Authenticates a user using email/username and password.
- **Request Body JSON:**
```json
{
  "email": "dispatcher@aetis.org",
  "password": "Password123!"
}
```
*(Also accepts `username` in place of `email`)*
- **Response JSON (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer",
  "user": {
    "id": "usr-disp-01",
    "email": "dispatcher@aetis.org",
    "full_name": "Central Dispatcher",
    "name": "Central Dispatcher",
    "role": "DISPATCHER",
    "phone": "+1-555-0101",
    "hospital_id": null,
    "is_active": true
  },
  "id": "usr-disp-01",
  "role": "DISPATCHER",
  "name": "Central Dispatcher",
  "email": "dispatcher@aetis.org"
}
```

#### 2. GET `/api/v1/auth/me`
- **Summary:** Retrieves authenticated user's profile.
- **Headers Required:** `Authorization: Bearer <access_token>`
- **Response JSON (200 OK):**
```json
{
  "id": "usr-disp-01",
  "email": "dispatcher@aetis.org",
  "full_name": "Central Dispatcher",
  "name": "Central Dispatcher",
  "role": "DISPATCHER",
  "phone": "+1-555-0101",
  "hospital_id": null,
  "is_active": true
}
```

#### 3. POST `/api/v1/auth/refresh`
- **Summary:** Refreshes an expired or existing JWT access token.
- **Headers / Body:** Accepts either `Authorization: Bearer <token>` header or JSON body:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn..."
}
```
- **Response JSON (200 OK):** Refreshed `TokenResponse` with a new JWT access token.

---

### Details on the 4 Supported Roles

| Role | Target Persona | Key Capabilities & RBAC Scope | Demo Account |
|---|---|---|---|
| **ADMIN** | System Administrator | Full platform management, user provisioning, system audits, and fleet configuration. | `admin@aetis.org` |
| **DISPATCHER** | Emergency Operations Dispatcher | Incident intake, emergency dispatching, vehicle assignment, hospital routing, and route preemption monitoring. | `dispatcher@aetis.org` |
| **DRIVER** | Ambulance / Emergency Vehicle Driver | Vehicle telemetry reporting, navigation guidance, route preemption status viewing, and incident arrival updates. | `driver@aetis.org` |
| **HOSPITAL** | Hospital Staff / ER Coordinator | Bed capacity updates, inbound emergency tracking, trauma readiness acknowledgment, and patient triage notes. | `hospital@aetis.org` |

*Default password for all demo accounts: `Password123!`*

---

### How to Test Login via Swagger UI at http://localhost:8000/docs

1. **Start Database and Run Migrations (if not already running):**
   ```bash
   cd aetis-backend
   alembic upgrade head
   ```

2. **Seed Demo Accounts:**
   ```bash
   cd aetis-backend
   python scripts/seed_users.py
   ```

3. **Start the FastAPI Backend:**
   ```bash
   cd aetis-backend
   uvicorn app.main:app --reload
   ```

4. **Test via Swagger UI (`http://localhost:8000/docs`):**
   - Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.
   - Expand `POST /api/v1/auth/login`.
   - Click **Try it out**.
   - Enter credentials in the Request Body:
     ```json
     {
       "email": "dispatcher@aetis.org",
       "password": "Password123!"
     }
     ```
   - Click **Execute** and verify the `200 OK` response with `access_token` and `user` object.
   - Copy the `access_token` value.
   - Click the **Authorize** button (lock icon at the top of the Swagger page).
   - Enter `Bearer <your_token>` or log in using the OAuth2 form.
   - Expand `GET /api/v1/auth/me`, click **Try it out**, then **Execute**.
   - Verify that your user profile is returned successfully (`200 OK`).
   - Test `POST /api/v1/auth/refresh` to confirm token renewal.


---

## Phase A3 Completed: Emergency Lifecycle State Machine & Fleet Management APIs

- **Timestamp:** 2026-11-16T14:30:00+05:30
- **Executed by:** Person A
- **Status:** ✅ Complete

---

### Summary
Implemented the Emergency Incident State Machine API and Fleet Vehicle Management Endpoints. This includes strict lifecycle state transition validation (`PENDING` -> `DISPATCHED` -> `IN_TRANSIT` -> `ARRIVED` -> `COMPLETED`, plus `CANCELLED`), automatic freeing of assigned vehicles upon incident completion/cancellation, vehicle registration and dispatch assignment, full nested Pydantic responses, and audit logging.

---

### Exact List of Files Created / Modified

| Action | Path | Description |
|---|---|---|
| Modified | `aetis-backend/app/models/emergency.py` | Added ORM relationships for `assigned_vehicle`, `destination_hospital`, and `dispatcher` |
| Modified | `aetis-backend/app/models/vehicle.py` | Added ORM relationship for `current_driver` |
| Created | `aetis-backend/app/schemas/hospital.py` | Created `HospitalResponse` and base schemas |
| Modified | `aetis-backend/app/schemas/vehicle.py` | Updated `VehicleCreate`, added `VehicleAssignRequest`, and enriched `VehicleResponse` with frontend compatibility |
| Modified | `aetis-backend/app/schemas/emergency.py` | Updated `EmergencyCreate`, added `EmergencyStatusUpdate`, and enriched `EmergencyResponse` with nested models and compatibility |
| Modified | `aetis-backend/app/schemas/__init__.py` | Exported all emergency and vehicle schemas |
| Created | `aetis-backend/app/routers/emergencies.py` | Implemented POST create, GET list, GET by ID, and PATCH status transition endpoints |
| Created | `aetis-backend/app/routers/vehicles.py` | Implemented GET list with filters, POST admin register, and PATCH assign endpoints |
| Modified | `aetis-backend/app/routers/__init__.py` | Exported `emergencies` and `vehicles` routers |
| Modified | `aetis-backend/app/main.py` | Registered `/api/v1/emergencies` and `/api/v1/vehicles` routers |
| Modified | `aetis-backend/scripts/seed_users.py` | Added demo fleet vehicles (`AMB-01`, `AMB-02`, `FIRE-01`, `POL-01`) for instant testing |

---

### Complete List of Endpoints Added

#### 1. POST `/api/v1/emergencies`
- **Summary:** Creates a new emergency incident in `PENDING` status. Auto-generates `incident_number` (`INC-YYYY-XXX`) and records the authenticated dispatcher.
- **Headers:** `Authorization: Bearer <access_token>`
- **Request JSON:**
```json
{
  "title": "Severe Traffic Collision with Entrapment",
  "severity": "CRITICAL",
  "pickup_latitude": 37.7749,
  "pickup_longitude": -122.4194,
  "pickup_address": "Market St & 5th St, San Francisco, CA",
  "patient_notes": "Two patients, one unconscious with head trauma",
  "destination_hospital_id": "HOSP-01"
}
```
- **Response JSON (201 Created):**
```json
{
  "id": "EMG-01",
  "incident_number": "INC-2026-001",
  "title": "Severe Traffic Collision with Entrapment",
  "severity": "CRITICAL",
  "status": "PENDING",
  "pickup_latitude": 37.7749,
  "pickup_longitude": -122.4194,
  "pickup_address": "Market St & 5th St, San Francisco, CA",
  "patient_notes": "Two patients, one unconscious with head trauma",
  "assigned_vehicle_id": null,
  "destination_hospital_id": "HOSP-01",
  "dispatcher_id": "usr-disp-01",
  "created_at": "2026-11-16T14:30:00.000000Z",
  "completed_at": null,
  "assigned_vehicle": null,
  "destination_hospital": {
    "id": "HOSP-01",
    "name": "City General Hospital",
    "address": "100 Medical Center Blvd, Metro City",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "contact_phone": "+1-555-0199",
    "trauma_level": 1,
    "available_beds": 24
  },
  "type": "medical",
  "createdAt": "2026-11-16T14:30:00.000000Z",
  "location": {
    "address": "Market St & 5th St, San Francisco, CA",
    "lat": 37.7749,
    "lng": -122.4194
  }
}
```

#### 2. GET `/api/v1/emergencies`
- **Summary:** Lists emergency incidents. Supports query parameters:
  - `?status=active`: Retrieves all non-completed incidents (`PENDING`, `DISPATCHED`, `IN_TRANSIT`, `ARRIVED`).
  - `?status=all`: Retrieves all incidents.
  - `?status=PENDING` (or any valid state): Exact status match.
- **Headers:** `Authorization: Bearer <access_token>`
- **Response JSON (200 OK):**
```json
[
  {
    "id": "EMG-01",
    "incident_number": "INC-2026-001",
    "title": "Severe Traffic Collision with Entrapment",
    "severity": "CRITICAL",
    "status": "DISPATCHED",
    "pickup_latitude": 37.7749,
    "pickup_longitude": -122.4194,
    "pickup_address": "Market St & 5th St, San Francisco, CA",
    "assigned_vehicle_id": "AMB-01",
    "destination_hospital_id": "HOSP-01",
    "dispatcher_id": "usr-disp-01",
    "created_at": "2026-11-16T14:30:00.000000Z",
    "completed_at": null
  }
]
```

#### 3. GET `/api/v1/emergencies/{id}`
- **Summary:** Detailed view of an emergency incident by ID (e.g. `EMG-01`).
- **Headers:** `Authorization: Bearer <access_token>`
- **Response JSON (200 OK):** Detailed `EmergencyResponse` including nested vehicle and hospital records.

#### 4. PATCH `/api/v1/emergencies/{id}/status`
- **Summary:** Validates and executes state transitions across the incident lifecycle.
- **Headers:** `Authorization: Bearer <access_token>`
- **Request JSON:**
```json
{
  "status": "COMPLETED",
  "patient_notes": "Patient handed over to ER Trauma Team 1. Vitals stabilized."
}
```
- **Response JSON (200 OK):**
```json
{
  "id": "EMG-01",
  "incident_number": "INC-2026-001",
  "title": "Severe Traffic Collision with Entrapment",
  "severity": "CRITICAL",
  "status": "COMPLETED",
  "assigned_vehicle_id": "AMB-01",
  "destination_hospital_id": "HOSP-01",
  "created_at": "2026-11-16T14:30:00.000000Z",
  "completed_at": "2026-11-16T14:45:12.000000Z"
}
```

#### 5. GET `/api/v1/vehicles`
- **Summary:** Lists fleet vehicles with optional filtering by `?status=AVAILABLE` and `?type=AMBULANCE`.
- **Headers:** `Authorization: Bearer <access_token>`
- **Response JSON (200 OK):**
```json
[
  {
    "id": "AMB-01",
    "call_sign": "Medic One",
    "type": "AMBULANCE",
    "license_plate": "MED-101",
    "status": "AVAILABLE",
    "current_latitude": 37.775,
    "current_longitude": -122.418,
    "current_driver_id": "usr-driv-01",
    "label": "Medic One",
    "location": {
      "lat": 37.775,
      "lng": -122.418
    }
  }
]
```

#### 6. POST `/api/v1/vehicles`
- **Summary:** Admin registration of a new emergency unit. Enforces `ADMIN` role.
- **Headers:** `Authorization: Bearer <access_token>`
- **Request JSON:**
```json
{
  "call_sign": "Rescue Medic 3",
  "type": "AMBULANCE",
  "license_plate": "MED-103",
  "status": "AVAILABLE",
  "current_latitude": 37.785,
  "current_longitude": -122.415
}
```
- **Response JSON (201 Created):**
```json
{
  "id": "AMB-03",
  "call_sign": "Rescue Medic 3",
  "type": "AMBULANCE",
  "license_plate": "MED-103",
  "status": "AVAILABLE",
  "current_latitude": 37.785,
  "current_longitude": -122.415,
  "label": "Rescue Medic 3"
}
```

#### 7. PATCH `/api/v1/vehicles/{id}/assign`
- **Summary:** Assigns an available vehicle to an active emergency incident. Automatically updates vehicle status to `DISPATCHED` and emergency status to `DISPATCHED`.
- **Headers:** `Authorization: Bearer <access_token>`
- **Request JSON:**
```json
{
  "emergency_id": "EMG-01"
}
```
- **Response JSON (200 OK):**
```json
{
  "id": "AMB-01",
  "call_sign": "Medic One",
  "type": "AMBULANCE",
  "license_plate": "MED-101",
  "status": "DISPATCHED",
  "current_latitude": 37.775,
  "current_longitude": -122.418,
  "current_driver_id": "usr-driv-01"
}
```

---

### Emergency State Machine Lifecycle & Auto-Free Vehicle Logic

```
               [ Incident Reported ]
                         │
                         ▼
                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         │ (Assign Vehicle)
                         ▼
                  ┌────────────┐
                  │ DISPATCHED │ ──┐
                  └──────┬─────┘   │
                         │         │
                         ▼         │
                 ┌────────────┐    │
                 │ IN_TRANSIT │ ───┤  (At any point before completion)
                 └──────┬─────┘    │
                         │         │
                         ▼         │
                   ┌─────────┐     │
                   │ ARRIVED │ ────┤
                   └────┬────┘     │
                        │          │
                        ▼          ▼
                 ┌───────────┐ ┌───────────┐
                 │ COMPLETED │ │ CANCELLED │
                 └───────────┘ └───────────┘
                       │             │
                       └──────┬──────┘
                              ▼
           [ Auto-Free Assigned Vehicle ]
          (vehicle.status -> "AVAILABLE")
           (emergency.completed_at -> now)
```

#### 1. Transition Matrix
- **`PENDING`** -> `DISPATCHED`, `CANCELLED`
- **`DISPATCHED`** -> `IN_TRANSIT`, `ARRIVED`, `CANCELLED`
- **`IN_TRANSIT`** -> `ARRIVED`, `COMPLETED`, `CANCELLED`
- **`ARRIVED`** -> `COMPLETED`, `CANCELLED`
- **`COMPLETED` / `CANCELLED`** -> Terminal states (no further transitions permitted)

#### 2. Auto-Free Vehicle Mechanism
Whenever an incident enters either terminal state (`COMPLETED` or `CANCELLED`):
1. `emergency.completed_at` is set to the current UTC timestamp (`datetime.now(timezone.utc)`).
2. The system checks `emergency.assigned_vehicle_id`.
3. If a vehicle is assigned, its record is retrieved and its status is automatically changed back to **`AVAILABLE`**.
4. An immutable `AuditLog` entry is written logging the completion and unit release.

---

### Testing Commands for Swagger UI

1. **Start the Database & Seed Data:**
   ```bash
   cd aetis-backend
   alembic upgrade head
   python scripts/seed_users.py
   ```

2. **Start the API Server:**
   ```bash
   uvicorn app.main:app --reload
   ```

3. **Open Swagger UI:**
   Navigate to [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.

4. **Authenticate in Swagger UI:**
   - Execute `POST /api/v1/auth/login` with:
     ```json
     {
       "email": "dispatcher@aetis.org",
       "password": "Password123!"
     }
     ```
   - Copy `access_token` and click the green **Authorize** button at the top to paste the token (`Bearer <token>`).

5. **Test Incident Creation:**
   - Execute `POST /api/v1/emergencies` with a valid title, severity (`HIGH` or `CRITICAL`), coordinates, and `destination_hospital_id: "HOSP-01"`.
   - Note the generated incident `id` (e.g., `EMG-01`).

6. **Test Vehicle Assignment:**
   - Execute `PATCH /api/v1/vehicles/AMB-01/assign` with:
     ```json
     {
       "emergency_id": "EMG-01"
     }
     ```
   - Verify `AMB-01` status becomes `DISPATCHED` and `EMG-01` status becomes `DISPATCHED`.

7. **Test State Machine Progression & Auto-Free:**
   - Advance to transit: `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "IN_TRANSIT"}`.
   - Advance to arrival: `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "ARRIVED"}`.
   - Complete incident: `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "COMPLETED"}`.
   - Query `GET /api/v1/vehicles?status=AVAILABLE` and confirm `AMB-01` has been automatically restored to `AVAILABLE`.


---

## Phase A4 Completed: Hospital Triage Handshake, ER Alerts & Analytics Reporting

- **Timestamp:** 2026-11-16T14:36:00+05:30
- **Executed by:** Person A
- **Status:** ✅ Complete

---

### Summary
Built the Hospital Inbound Triage Alerts system, Emergency Room (ER) Acknowledgment Handshake protocol, Analytics KPI intelligence calculations, and Admin user provisioning endpoints. Created the `HospitalAlert` and `Signal` database models and corresponding Alembic migration script (`0002_hospital_alerts_and_signals.py`). Registered `/api/v1/hospitals`, `/api/v1/analytics`, and `/api/v1/admin` in `app/main.py`.

---

### Exact List of Files Created / Modified

| Action | Path | Description |
|---|---|---|
| Modified | `aetis-backend/app/models/hospital.py` | Added `HospitalAlert` model with fields for trauma bay reservation, ETA, patient condition, and acknowledgment |
| Created | `aetis-backend/app/models/signal.py` | Created `Signal` model for traffic signal monitoring and preemption event metrics |
| Modified | `aetis-backend/app/models/__init__.py` | Exported `HospitalAlert` and `Signal` models in registry |
| Created | `aetis-backend/alembic/versions/0002_hospital_alerts_and_signals.py` | Alembic migration for `hospital_alerts` and `signals` tables |
| Modified | `aetis-backend/app/schemas/hospital.py` | Added `HospitalAlertResponse`, `HospitalAcknowledgeRequest`, and `HospitalAcknowledgeReceipt` |
| Created | `aetis-backend/app/schemas/analytics.py` | Created `AnalyticsKPIResponse` schema |
| Modified | `aetis-backend/app/schemas/user.py` | Enriched `UserResponse` with auto-syncing `name` field |
| Created | `aetis-backend/app/routers/hospitals.py` | Implemented `GET /inbound-alerts` and `POST /alerts/{alert_id}/acknowledge` |
| Created | `aetis-backend/app/routers/analytics.py` | Implemented `GET /kpis` operational intelligence calculations |
| Created | `aetis-backend/app/routers/admin.py` | Implemented `GET /users` and `POST /users` user provisioning (Admin only) |
| Modified | `aetis-backend/app/routers/__init__.py` | Exported `admin`, `analytics`, `hospitals` routers |
| Modified | `aetis-backend/app/main.py` | Registered `/api/v1/hospitals`, `/api/v1/analytics`, `/api/v1/admin` routers |
| Modified | `aetis-backend/scripts/seed_users.py` | Added demo traffic signals (`SIG-01`, `SIG-02`, `SIG-03`) with preemption statistics |

---

### Hospital Alert Acknowledgment Flow Documentation

```
[ Active Incident En Route to Hospital ]
 (Emergency destination_hospital_id = HOSP-01)
                    │
                    ▼
       ┌────────────────────────┐
       │ Inbound Alert Created  │  ──> System calculates ETA & patient condition
       │  (acknowledged = False)│
       └───────────┬────────────┘
                   │
                   ▼ (Hospital Staff Polling / Inbound View)
       ┌────────────────────────┐
       │ GET /inbound-alerts    │  ──> Resolves user.hospital_id automatically
       └───────────┬────────────┘
                   │
                   ▼ (ER Staff Readiness Handshake)
       ┌────────────────────────┐
       │ POST /alerts/{id}/ack  │  ──> Submits trauma_bay_assigned ("Bay-02")
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Acknowledgment Receipt │
       │  • acknowledged = True │
       │  • acknowledged_by_id  │
       │  • acknowledged_at=now │
       │  • trauma_bay_assigned │
       │  • audit log recorded  │
       └────────────────────────┘
```

1. **Alert Creation & Resolution:**
   When an incident is routed to a hospital (`destination_hospital_id`), an inbound triage alert is tracked with the estimated arrival time (`estimated_arrival`) and patient notes.
2. **Context-Aware Alert Retrieval:**
   When hospital staff call `GET /api/v1/hospitals/inbound-alerts`, the endpoint automatically derives `target_hospital_id` from the JWT token's `current_user.hospital_id`, ensuring strict tenant isolation between hospital facilities.
3. **Trauma Bay Handshake:**
   The hospital ER team acknowledges inbound alerts via `POST /api/v1/hospitals/alerts/{alert_id}/acknowledge`, providing `trauma_bay_assigned` (e.g. `"Bay-02"`) and readiness notes. The system marks `acknowledged=True`, stamps `acknowledged_at=datetime.now(timezone.utc)`, logs an audit event, and returns a verified `HospitalAcknowledgeReceipt`.

---

### Analytics KPI Mathematical Formulas Implemented

The `GET /api/v1/analytics/kpis` endpoint computes 5 real-time operational metrics:

| KPI | Mathematical Formula / Query Definition | Output Type |
|---|---|---|
| **Total Emergencies** | $$\text{Count}(\text{emergencies})$$ | `integer` |
| **Active Emergencies** | $$\text{Count}(\text{emergencies where status} \in \{\text{PENDING}, \text{DISPATCHED}, \text{IN\_TRANSIT}\})$$ | `integer` |
| **Average Response Time** | $$\frac{1}{N} \sum_{i=1}^{N} \frac{\text{completed\_at}_i - \text{created\_at}_i}{60\text{ seconds}}$$ <br> *(Calculated over completed incidents where $\text{completed\_at} > \text{created\_at}$)* | `float` (minutes, 2 decimals) |
| **Fleet Utilization Rate** | $$\left( \frac{\text{Count}(\text{vehicles where status} \in \{\text{DISPATCHED}, \text{BUSY}\})}{\text{Total Vehicles}} \right) \times 100$$ | `float` (percentage, 0.00–100.00) |
| **Total Signal Preemptions** | $$\sum(\text{signals.preemptions\_count})$$ *(or preemption audit log events)* | `integer` |

---

### Instructions to Test the Hospital Workflow in Swagger UI

1. **Start PostgreSQL, Migrate & Seed Demo Data:**
   ```bash
   cd aetis-backend
   alembic upgrade head
   python scripts/seed_users.py
   ```

2. **Launch the FastAPI Server:**
   ```bash
   uvicorn app.main:app --reload
   ```

3. **Navigate to Swagger UI:**
   Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.

4. **Step 1: Dispatcher Creates & Routes an Emergency:**
   - Log in as Dispatcher (`dispatcher@aetis.org` / `Password123!`) via `POST /api/v1/auth/login`.
   - Authorize with the token.
   - Execute `POST /api/v1/emergencies`:
     ```json
     {
       "title": "Severe Multi-Vehicle Collision",
       "severity": "CRITICAL",
       "pickup_latitude": 37.7749,
       "pickup_longitude": -122.4194,
       "pickup_address": "4th & Market St",
       "patient_notes": "Multiple traumas, immediate ICU intake required",
       "destination_hospital_id": "HOSP-01"
     }
     ```
     *(Note the returned incident `id`, e.g. `EMG-01`)*
   - Assign vehicle: `PATCH /api/v1/vehicles/AMB-01/assign` with `{"emergency_id": "EMG-01"}`.

5. **Step 2: Hospital Staff Views Inbound Alerts:**
   - Log in as Hospital ER User (`hospital@aetis.org` / `Password123!`) via `POST /api/v1/auth/login`.
   - Click **Authorize** and enter the new token.
   - Execute `GET /api/v1/hospitals/inbound-alerts`.
   - Confirm that the inbound alert for `EMG-01` appears with:
     - `emergency_title`: `"Severe Multi-Vehicle Collision"`
     - `severity`: `"CRITICAL"`
     - `acknowledged`: `false`
     - Copy the alert `id` (UUID).

6. **Step 3: Hospital Staff Acknowledges Alert & Assigns Trauma Bay:**
   - Execute `POST /api/v1/hospitals/alerts/{alert_id}/acknowledge` with:
     ```json
     {
       "trauma_bay_assigned": "Trauma Bay 2",
       "notes": "Trauma surgery team and rapid blood transfusion unit ready."
     }
     ```
   - Verify `200 OK` receipt confirming `status: "ACKNOWLEDGED"`, `trauma_bay_assigned: "Trauma Bay 2"`, and timestamp.

7. **Step 4: Verify Analytics KPIs:**
   - Execute `GET /api/v1/analytics/kpis`.
   - Verify non-zero operational metrics:
     ```json
     {
       "total_emergencies": 1,
       "active_emergencies": 1,
       "avg_response_time_minutes": 0.0,
       "fleet_utilization_rate": 25.0,
       "total_signal_preemptions": 49
     }
     ```

8. **Step 5: Admin User Management:**
   - Log in as Administrator (`admin@aetis.org` / `Password123!`).
   - Query `GET /api/v1/admin/users` to view all active platform staff.
   - Provision a new driver account via `POST /api/v1/admin/users`:
     ```json
     {
       "email": "driver2@aetis.org",
       "full_name": "Secondary Driver",
       "role": "DRIVER",
       "phone": "+1-555-0144",
       "password": "Password123!"
     }
     ```
