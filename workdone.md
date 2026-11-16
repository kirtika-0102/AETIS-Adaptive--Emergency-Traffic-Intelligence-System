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


---

## Phase A5 Completed: Database Seeder & Person A Final Deliverables

- **Timestamp:** 2026-11-16T14:43:00+05:30
- **Executed by:** Person A
- **Status:** ✅ Complete & Verified

---

### Summary
Built the comprehensive, idempotent database seeder script `scripts/seed_db.py` to populate baseline testing data across all system layers: 4 role-based accounts (Admin, Dispatcher, Driver, Hospital), 2 emergency trauma hospitals, 4 fleet response units, sample traffic signals, and an active emergency incident with an inbound ER triage alert. Performed complete end-to-end Swagger UI verification across all routers.

---

### Seeded Accounts Credentials Table

| Email | Password | Role | Bound Facility / Unit | Primary Purpose |
|---|---|---|---|---|
| `admin@aetis.gov` | `password123` | **ADMIN** | System-wide | User administration, fleet management, and system-wide audits |
| `dispatch@aetis.gov` | `password123` | **DISPATCHER** | Central Dispatch | Incident intake, unit assignment, preemption, and routing |
| `driver@aetis.gov` | `password123` | **DRIVER** | `AMB-01` (Rapid-1) | Vehicle telemetry, transit updates, and incident response |
| `hospital@aetis.gov` | `password123` | **HOSPITAL** | `HOSP-01` (City Memorial) | Inbound ER alert tracking, triage bay reservation, and trauma handshake |

---

### Seeded Domain Entities Summary

#### 1. Hospital Facilities
- **`HOSP-01`**: City Memorial Trauma Center (Lat: `28.6139`, Lng: `77.2090`, Beds: `12`, Trauma Level: `1`)
- **`HOSP-02`**: Apex Specialty Emergency Hospital (Lat: `28.6289`, Lng: `77.2065`, Beds: `8`, Trauma Level: `2`)

#### 2. Emergency Fleet Vehicles
- **`AMB-01`**: Call Sign `Rapid-1`, Type `AMBULANCE`, License `DL-01-EM-1001`, Status `AVAILABLE`, Driver `driver@aetis.gov`
- **`AMB-02`**: Call Sign `Rapid-2`, Type `AMBULANCE`, License `DL-01-EM-1002`, Status `AVAILABLE`
- **`FIRE-01`**: Call Sign `Blaze-1`, Type `FIRE_TRUCK`, License `DL-01-FT-2001`, Status `AVAILABLE`
- **`POL-01`**: Call Sign `Patrol-1`, Type `POLICE`, License `DL-01-PD-3001`, Status `AVAILABLE`

#### 3. Traffic Signals
- **`SIG-DEL-01`**: Rajiv Chowk Outer Intersection (Preemptions: `19`)
- **`SIG-DEL-02`**: Barakhamba Junction (Preemptions: `31`)

#### 4. Active Emergency Incident
- **`EMG-01`** (`INC-2026-001`): *"Cardiac Emergency at Central Square"*, Severity `CRITICAL`, Status `PENDING`, Location: `(28.6100, 77.2100)`, Destination Hospital: `HOSP-01`.

---

### Command to Run the Database Seeder

Run the following command from the `aetis-backend/` root:

```bash
cd aetis-backend
python scripts/seed_db.py
```

*Note: The script is fully idempotent. If executed multiple times, existing records are updated in place without duplicate key or unique constraint errors.*

---

### Step-by-Step Verification Checklist for Swagger UI (`http://localhost:8000/docs`)

1. **Start Backend Server:**
   ```bash
   uvicorn app.main:app --reload
   ```
   Open `http://localhost:8000/docs` in your browser.

2. **[Checklist 1: Healthcheck]**
   - Execute `GET /health` → Verify `{"status": "ok"}` (200 OK).

3. **[Checklist 2: Authentication]**
   - Execute `POST /api/v1/auth/login` with:
     ```json
     {"email": "dispatch@aetis.gov", "password": "password123"}
     ```
   - Verify `200 OK` returning `access_token` and `user` profile (`role: "DISPATCHER"`).
   - Click the green **Authorize** button at the top of Swagger UI and paste the token (`Bearer <token>`).
   - Execute `GET /api/v1/auth/me` → Verify user profile returned successfully.

4. **[Checklist 3: Emergency Management & State Machine]**
   - Execute `GET /api/v1/emergencies?status=active` → Verify `EMG-01` (`INC-2026-001`) is returned with `status: "PENDING"`.
   - Execute `PATCH /api/v1/vehicles/AMB-01/assign` with:
     ```json
     {"emergency_id": "EMG-01"}
     ```
     → Verify both `AMB-01` and `EMG-01` status become `DISPATCHED`.
   - Execute `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "IN_TRANSIT"}` → Verified.
   - Execute `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "ARRIVED"}` → Verified.
   - Execute `PATCH /api/v1/emergencies/EMG-01/status` with `{"status": "COMPLETED"}` → Verify `completed_at` is set and `AMB-01` is automatically restored to `AVAILABLE`.

5. **[Checklist 4: Hospital Inbound Alerts & ER Handshake]**
   - Log in as Hospital ER user: `POST /api/v1/auth/login` with `hospital@aetis.gov` / `password123`.
   - Update Authorization token in Swagger UI.
   - Execute `GET /api/v1/hospitals/inbound-alerts` → Verify inbound alert for `EMG-01` is returned bound to `HOSP-01`.
   - Execute `POST /api/v1/hospitals/alerts/{alert_id}/acknowledge` with:
     ```json
     {"trauma_bay_assigned": "Trauma Bay 1", "notes": "Cardiology team on standby."}
     ```
     → Verify acknowledgment receipt with `acknowledged: true` and timestamp.

6. **[Checklist 5: Fleet Vehicle Operations]**
   - Execute `GET /api/v1/vehicles` → Verify list of 4 vehicles (`AMB-01`, `AMB-02`, `FIRE-01`, `POL-01`).
   - Filter `GET /api/v1/vehicles?type=AMBULANCE` → Returns only ambulances.

7. **[Checklist 6: Analytics KPIs]**
   - Execute `GET /api/v1/analytics/kpis` → Verify all metrics computed:
     - `total_emergencies >= 1`
     - `active_emergencies >= 0`
     - `avg_response_time_minutes >= 0.0`
     - `fleet_utilization_rate >= 0.0`
     - `total_signal_preemptions >= 50`

8. **[Checklist 7: Admin Privileged Management]**
   - Log in as Administrator: `POST /api/v1/auth/login` with `admin@aetis.gov` / `password123`.
   - Authorize with admin token.
   - Execute `GET /api/v1/admin/users` → Returns all registered accounts.
   - Execute `POST /api/v1/admin/users` → Successfully provisions new user accounts.

---

### Person A SIGN-OFF

| Milestone | Deliverable Scope | Status |
|---|---|---|
| **Phase A1** | Project Scaffolding, Core Models (User, Vehicle, Hospital, Emergency, AuditLog), Alembic Migrations | **COMPLETED & VERIFIED** |
| **Phase A2** | Bcrypt Password Hashing, JWT Bearer Tokens, OAuth2 Scheme, RBAC Middleware (`require_role`) | **COMPLETED & VERIFIED** |
| **Phase A3** | Emergency Incident Lifecycle State Machine, Fleet Vehicle Assignment, Auto-Free Unit Logic | **COMPLETED & VERIFIED** |
| **Phase A4** | Hospital Inbound Alerts, ER Handshake Protocol, Analytics KPIs, Admin User Provisioning | **COMPLETED & VERIFIED** |
| **Phase A5** | Idempotent Database Seeder (`scripts/seed_db.py`), End-to-End Swagger UI Verification | **COMPLETED & VERIFIED** |

**PERSON A SIGN-OFF CONFIRMED:**
All backend REST APIs, ORM models, Alembic migrations, RBAC security filters, and idempotent seed scripts for the AETIS Central Engine are complete, verified, and ready for **Sync Gate 2** merge.

---

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
