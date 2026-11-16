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
