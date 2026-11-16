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
