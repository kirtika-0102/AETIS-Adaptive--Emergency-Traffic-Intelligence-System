from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
from app.models.camera import Camera, CameraStatus
from app.models.signal import SignalPhase, TrafficSignal
from app.routers.cameras import router as cameras_router
from app.routers.signals import router as signals_router


def seed_initial_data():
    """Seed initial sample signals and cameras if the database is currently empty."""
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
            db.commit()
    finally:
        db.close()


# Ensure tables are created
Base.metadata.create_all(bind=engine)
seed_initial_data()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist on startup
    Base.metadata.create_all(bind=engine)
    seed_initial_data()
    yield


app = FastAPI(
    title="AETIS Real-Time Backend API",
    description="Adaptive Emergency Traffic Intelligence System - Hardware Management & Preemption Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Hardware Management Routers
app.include_router(signals_router)
app.include_router(cameras_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "system": "AETIS Real-Time Backend",
        "status": "operational",
        "docs_url": "/docs",
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}
