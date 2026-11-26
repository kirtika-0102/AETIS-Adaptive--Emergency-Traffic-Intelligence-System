# AETIS — Adaptive Emergency Traffic Intelligence System

Full-stack emergency vehicle corridor prioritization and hospital pre-alert platform built with **FastAPI** (`aetis-backend/`) and **React + TypeScript + Vite** (`Aetis-frontend/`).

## Roles
The platform enforces four canonical roles across REST and WebSocket endpoints:
- `ADMIN`: Fleet, user, signal, camera, and analytics management.
- `DISPATCHER`: Emergency intake, vehicle assignment, camera arming, and manual signal overrides.
- `DRIVER`: Live turn-leg status transitions and GPS telemetry reporting.
- `HOSPITAL`: Inbound ER alert monitoring and trauma-bay acknowledgment.

## Running Locally

### Backend (`aetis-backend/`)
```bash
cd aetis-backend
python -m pip install -r requirements.txt
cp .env.example .env
python scripts/seed_db.py
uvicorn app.main:app --reload
```

### Frontend (`Aetis-frontend/`)
```bash
cd Aetis-frontend
npm install
npm run dev
```
Open `http://localhost:5173` (Vite proxies `/api` and `/ws` to `http://127.0.0.1:8000`).

### Docker Compose
```bash
# Optionally bootstrap the first admin account on an empty database:
# AETIS_BOOTSTRAP_ADMIN_EMAIL=admin@aetis.example AETIS_BOOTSTRAP_ADMIN_PASSWORD="<12+ char password>" docker compose up --build
docker compose up --build

# Or seed demo accounts into the running backend container:
docker compose exec backend python scripts/seed_db.py
```

### Driver GPS Simulator (`aetis-backend/`)
```bash
cd aetis-backend
python scripts/simulate_driver_gps.py --email driver@aetis.gov --password "<password>"
```

## Architecture & Scope Boundaries (Important)
- **Simulated Signal Controllers:** Traffic signal preemptions, clearance transition state (`CLEARANCE_YELLOW` -> `ALL_RED` -> `PREEMPTED`), and auto-expiry sweeps are software simulations stored in the database and broadcast via WebSockets. Deployment on physical intersections requires dedicated local hardware controller interlocks (NTCIP/SCATS).
- **Geometric Corridor Filtering:** Corridor signal selection uses SQL bounding-box pre-filtering plus straight-line bounding-vector projection and compass heading checks, not an OSRM/Valhalla road-network graph.
- **Camera Edge Webhook:** Edge CV nodes must authenticate with `X-AETIS-API-Key` (or dispatcher/admin JWT), and cameras must be armed by a dispatcher (`POST /api/v1/cameras/{id}/arm`) before detections trigger downstream signal preemption.
