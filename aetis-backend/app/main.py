"""
AETIS Central Engine — FastAPI Application Entrypoint
Integrates Core REST APIs, Authentication, Fleets, Hospitals, Analytics,
CSRF protection for cookie sessions, and Real-Time Traffic Signal Preemption & WebSockets.
"""

import asyncio
from contextlib import asynccontextmanager
import hmac
import logging
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, get_db
from app.core.security import get_password_hash
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.enums import CameraStatus, SignalPhase
from app.models.hospital import Hospital
from app.models.signal import TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.routers import admin, analytics, auth, emergencies, hospitals, notifications, vehicles
from app.routers.cameras import router as cameras_router
from app.routers.detections import router as detections_router
from app.routers.signals import router as signals_router
from app.routers.tracking import router as tracking_router
from app.routers.ws import router as ws_router
from app.services.preemption_service import expire_due_preemptions

logger = logging.getLogger("aetis.main")

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
_CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/auth/login",
    "/api/v1/auth/token",
    "/api/auth/token",
}


def seed_initial_data():
    """Seed initial sample signals, cameras, vehicles, and emergencies if empty."""
    db = SessionLocal()
    try:
        signal_count = db.query(TrafficSignal).count()
        if signal_count == 0:
            sample_signals = [
                TrafficSignal(
                    id="SIG-101",
                    name="Junction 4 - MG Road & Park Ave",
                    latitude=12.9716,
                    longitude=77.5946,
                    current_phase=SignalPhase.RED.value,
                    normal_cycle_seconds=60,
                    is_preempted=False,
                    preempted_by_vehicle_id=None,
                    preemption_end_time=None,
                ),
                TrafficSignal(
                    id="SIG-102",
                    name="Junction 5 - Brigade Rd & Residency Rd",
                    latitude=12.9725,
                    longitude=77.6075,
                    current_phase=SignalPhase.GREEN.value,
                    normal_cycle_seconds=45,
                    is_preempted=False,
                    preempted_by_vehicle_id=None,
                    preemption_end_time=None,
                ),
                TrafficSignal(
                    id="SIG-103",
                    name="Junction 9 - Indiranagar 100ft Rd & CMH Rd",
                    latitude=12.9784,
                    longitude=77.6408,
                    current_phase=SignalPhase.RED.value,
                    normal_cycle_seconds=60,
                    is_preempted=False,
                    preempted_by_vehicle_id=None,
                    preemption_end_time=None,
                ),
            ]
            db.add_all(sample_signals)
            db.commit()

            sample_cameras = [
                Camera(
                    id="CAM-201",
                    name="Northbound Approach Cam 1",
                    latitude=12.9718,
                    longitude=77.5948,
                    stream_url="rtsp://traffic.aetis.city/live/cam201",
                    connected_signal_id="SIG-101",
                    view_heading=0,
                    status=CameraStatus.ONLINE.value,
                ),
                Camera(
                    id="CAM-202",
                    name="Southbound Approach Cam 2",
                    latitude=12.9714,
                    longitude=77.5944,
                    stream_url="rtsp://traffic.aetis.city/live/cam202",
                    connected_signal_id="SIG-101",
                    view_heading=180,
                    status=CameraStatus.ONLINE.value,
                ),
                Camera(
                    id="CAM-203",
                    name="Eastbound Approach Cam 1",
                    latitude=12.9727,
                    longitude=77.6078,
                    stream_url="rtsp://traffic.aetis.city/live/cam203",
                    connected_signal_id="SIG-102",
                    view_heading=90,
                    status=CameraStatus.ONLINE.value,
                ),
            ]
            db.add_all(sample_cameras)

            sample_hospital = Hospital(
                id="HOSP-CITY",
                name="City Central Emergency Care",
                address="Indiranagar 100ft Rd, Bengaluru",
                latitude=12.9784,
                longitude=77.6408,
                contact_phone="+91-80-2222-0100",
                trauma_level=1,
                available_beds=14,
            )
            db.add(sample_hospital)
            db.flush()

            sample_vehicle = Vehicle(
                id="EV-AMB-01",
                call_sign="AMB-01",
                label="City Hospital Ambulance 1",
                type="AMBULANCE",
                current_latitude=12.9716,
                current_longitude=77.5946,
                speed=48.0,
                heading=90.0,
                status="AVAILABLE",
            )
            sample_emergency = Emergency(
                id="EMG-101",
                incident_number="INC-2026-0001",
                title="City Central Trauma Incident",
                assigned_vehicle_id="EV-AMB-01",
                hospital_id="HOSP-CITY",
                hospital_name="City Central Emergency Care",
                status="DISPATCHED",
                severity="CRITICAL",
                destination_lat=12.9784,
                destination_lng=77.6408,
                destination_name="City Central Hospital Trauma Center",
            )
            db.add(sample_vehicle)
            db.add(sample_emergency)
            db.commit()

        # Optional initial admin bootstrap: only runs when users table is empty
        # and explicit env vars with a >=12-char password are provided.
        if db.query(User).count() == 0:
            boot_email = os.getenv("AETIS_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
            boot_pw = os.getenv("AETIS_BOOTSTRAP_ADMIN_PASSWORD", "")
            if boot_email and len(boot_pw) >= 12:
                db.add(
                    User(
                        id=str(uuid.uuid4()),
                        email=boot_email,
                        password_hash=get_password_hash(boot_pw),
                        full_name="Initial Administrator",
                        role="ADMIN",
                        is_active=True,
                    )
                )
                db.commit()
                logger.info("Bootstrapped initial ADMIN account for %s", boot_email)
    finally:
        db.close()


def reconcile_legacy_sqlite_columns() -> None:
    """
    Non-destructively add new nullable/defaulted columns on existing local SQLite dev DBs
    (since SQLAlchemy create_all skips ALTER TABLE and alembic CLI may not be run locally).
    """
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    table_cols = {
        table: {c["name"] for c in inspector.get_columns(table)}
        for table in inspector.get_table_names()
    }
    alter_stmts: list[tuple[str, str, str]] = [
        ("traffic_signals", "transition_state", "ALTER TABLE traffic_signals ADD COLUMN transition_state VARCHAR(25) NOT NULL DEFAULT 'NORMAL'"),
        ("traffic_signals", "preemptions_count", "ALTER TABLE traffic_signals ADD COLUMN preemptions_count INTEGER NOT NULL DEFAULT 0"),
        ("traffic_signals", "last_preemption_at", "ALTER TABLE traffic_signals ADD COLUMN last_preemption_at DATETIME"),
        ("cameras", "is_armed", "ALTER TABLE cameras ADD COLUMN is_armed BOOLEAN NOT NULL DEFAULT 0"),
        ("cameras", "armed_emergency_id", "ALTER TABLE cameras ADD COLUMN armed_emergency_id VARCHAR(50)"),
        ("cameras", "last_triggered_at", "ALTER TABLE cameras ADD COLUMN last_triggered_at DATETIME"),
        ("emergencies", "type", "ALTER TABLE emergencies ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'medical'"),
        ("emergencies", "journey_leg", "ALTER TABLE emergencies ADD COLUMN journey_leg VARCHAR(20) NOT NULL DEFAULT 'TO_SCENE'"),
    ]
    with engine.begin() as conn:
        for table, col, ddl in alter_stmts:
            if table in table_cols and col not in table_cols[table]:
                conn.execute(text(ddl))


async def _preemption_expiry_loop(interval_seconds: int = 5) -> None:
    """Background sweeper ensuring preempted signals auto-expire after hold_duration."""
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            if get_db in app.dependency_overrides:
                continue
            db = SessionLocal()
            try:
                await expire_due_preemptions(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Error during preemption expiry sweep")


@asynccontextmanager
async def lifespan(app: FastAPI):
    expiry_task: asyncio.Task | None = None
    # Skip touching workspace aetis.db when tests override get_db with an in-memory DB
    if get_db not in app.dependency_overrides:
        Base.metadata.create_all(bind=engine)
        reconcile_legacy_sqlite_columns()
        seed_initial_data()
        expiry_task = asyncio.create_task(_preemption_expiry_loop())
    try:
        yield
    finally:
        if expiry_task is not None:
            expiry_task.cancel()
            try:
                await expiry_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Adaptive Emergency Traffic Intelligence System — Central Engine & Real-Time Preemption API",
    lifespan=lifespan,
)


@app.middleware("http")
async def csrf_double_submit_middleware(request: Request, call_next):
    """
    Protect cookie-authenticated state-changing requests against CSRF using double-submit
    cookie validation (`csrf_token` cookie == `X-CSRF-Token` header).
    Explicit Authorization Bearer or verified edge API-Key requests are exempt.
    """
    if request.method.upper() not in _CSRF_SAFE_METHODS:
        path = request.url.path.rstrip("/")
        if path not in _CSRF_EXEMPT_PATHS:
            has_bearer = bool(request.headers.get("Authorization"))
            has_api_key = bool(request.headers.get("X-AETIS-API-Key"))
            has_session_cookie = bool(
                request.cookies.get("access_token")
                or request.cookies.get("refresh_token")
                or request.cookies.get("token")
            )
            if has_session_cookie and not has_bearer and not has_api_key:
                cookie_csrf = request.cookies.get("csrf_token", "")
                header_csrf = request.headers.get("X-CSRF-Token", "")
                if not cookie_csrf or not header_csrf or not hmac.compare_digest(cookie_csrf, header_csrf):
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Invalid or missing CSRF token"},
                    )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-AETIS-API-Key"],
)

for pfx in ("/api/v1", "/api"):
    app.include_router(auth.router, prefix=f"{pfx}/auth", tags=["Authentication"])
    app.include_router(emergencies.router, prefix=f"{pfx}/emergencies", tags=["Emergencies"])
    app.include_router(vehicles.router, prefix=f"{pfx}/vehicles", tags=["Vehicles"])
    app.include_router(hospitals.router, prefix=f"{pfx}/hospitals", tags=["Hospitals"])
    app.include_router(analytics.router, prefix=f"{pfx}/analytics", tags=["Analytics"])
    app.include_router(admin.router, prefix=f"{pfx}/admin", tags=["Admin"])
    app.include_router(notifications.router, prefix=f"{pfx}/notifications", tags=["Notifications"])

app.include_router(signals_router)
app.include_router(cameras_router)
app.include_router(ws_router)
app.include_router(tracking_router)
app.include_router(detections_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "system": "AETIS Central Engine & Real-Time Backend",
        "status": "operational",
        "docs_url": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Simple liveness probe."""
    return {"status": "healthy"}
