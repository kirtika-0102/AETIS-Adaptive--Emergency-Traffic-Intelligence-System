"""
AETIS Central Engine — FastAPI Application Entrypoint
Integrates Core REST APIs, Authentication, Fleets, Hospitals, Analytics,
and Real-Time Traffic Signal Preemption, Camera Vision Webhooks, and WebSockets.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.camera import Camera, CameraStatus
from app.models.emergency import Emergency
from app.models.signal import SignalPhase, TrafficSignal
from app.models.vehicle import Vehicle
from app.routers import admin, analytics, auth, emergencies, hospitals, vehicles
from app.routers.cameras import router as cameras_router
from app.routers.detections import router as detections_router
from app.routers.signals import router as signals_router
from app.routers.tracking import router as tracking_router
from app.routers.ws import router as ws_router


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

            # Sample Vehicle and Active Emergency
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
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist on startup
    Base.metadata.create_all(bind=engine)
    seed_initial_data()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Adaptive Emergency Traffic Intelligence System — Central Engine & Real-Time Preemption API",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow Vite dev server and external clients
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Core Management & Admin Routers (Person A)
# Mounted under both /api/v1 and /api for seamless frontend client compatibility
# ---------------------------------------------------------------------------
for pfx in ("/api/v1", "/api"):
    app.include_router(
        auth.router,
        prefix=f"{pfx}/auth",
        tags=["Authentication"],
    )

    app.include_router(
        emergencies.router,
        prefix=f"{pfx}/emergencies",
        tags=["Emergencies"],
    )

    app.include_router(
        vehicles.router,
        prefix=f"{pfx}/vehicles",
        tags=["Vehicles"],
    )

    app.include_router(
        hospitals.router,
        prefix=f"{pfx}/hospitals",
        tags=["Hospitals"],
    )

    app.include_router(
        analytics.router,
        prefix=f"{pfx}/analytics",
        tags=["Analytics"],
    )

    app.include_router(
        admin.router,
        prefix=f"{pfx}/admin",
        tags=["Admin"],
    )

# ---------------------------------------------------------------------------
# Real-Time Telemetry & Hardware Control Routers (Person B)
# ---------------------------------------------------------------------------
app.include_router(signals_router)
app.include_router(cameras_router)
app.include_router(ws_router)
app.include_router(tracking_router)
app.include_router(detections_router)


# ---------------------------------------------------------------------------
# Health-checks & Root
# ---------------------------------------------------------------------------
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
