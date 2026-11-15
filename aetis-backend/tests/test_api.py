import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# In-memory SQLite with StaticPool ensures all connections share the memory database
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_root_and_health(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "operational"

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"


def test_signals_crud_and_override_scenarios(client):
    # 1. Register a new traffic signal
    signal_payload = {
        "id": "SIG-101",
        "name": "Junction 4 - MG Road & Park Ave",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "current_phase": "RED",
        "normal_cycle_seconds": 60,
    }
    create_res = client.post("/api/v1/signals", json=signal_payload)
    assert create_res.status_code == 201
    created_signal = create_res.json()
    assert created_signal["id"] == "SIG-101"
    assert created_signal["name"] == "Junction 4 - MG Road & Park Ave"
    assert created_signal["latitude"] == 12.9716
    assert created_signal["longitude"] == 77.5946
    assert created_signal["current_phase"] == "RED"
    assert created_signal["normal_cycle_seconds"] == 60
    assert created_signal["is_preempted"] is False
    assert created_signal["preempted_by_vehicle_id"] is None
    assert created_signal["preemption_end_time"] is None

    # 2. Duplicate signal ID conflict check
    dup_res = client.post("/api/v1/signals", json=signal_payload)
    assert dup_res.status_code == 409

    # 3. Retrieve all signals
    list_res = client.get("/api/v1/signals")
    assert list_res.status_code == 200
    signals = list_res.json()
    assert len(signals) == 1
    assert signals[0]["id"] == "SIG-101"

    # 4. Retrieve single signal by ID
    get_res = client.get("/api/v1/signals/SIG-101")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Junction 4 - MG Road & Park Ave"

    # 5. Manual emergency override with vehicle and duration
    override_payload = {
        "vehicle_id": "EV-AMB-01",
        "duration_seconds": 120,
    }
    override_res = client.post("/api/v1/signals/SIG-101/override", json=override_payload)
    assert override_res.status_code == 200
    overridden = override_res.json()
    assert overridden["current_phase"] == "GREEN"
    assert overridden["is_preempted"] is True
    assert overridden["preempted_by_vehicle_id"] == "EV-AMB-01"
    assert overridden["preemption_end_time"] is not None

    # 6. Manual override without payload (uses defaults: GREEN, preempted, 60s)
    override_default_res = client.post("/api/v1/signals/SIG-101/override")
    assert override_default_res.status_code == 200
    overridden_default = override_default_res.json()
    assert overridden_default["current_phase"] == "GREEN"
    assert overridden_default["is_preempted"] is True

    # 7. Reset signal back to normal autonomous cycle
    reset_res = client.post("/api/v1/signals/SIG-101/reset")
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert reset_data["current_phase"] == "RED"
    assert reset_data["is_preempted"] is False
    assert reset_data["preempted_by_vehicle_id"] is None
    assert reset_data["preemption_end_time"] is None


def test_cameras_crud_and_validation(client):
    # 1. Reject camera creation if connected signal does not exist
    cam_fail_payload = {
        "id": "CAM-201",
        "name": "Northbound Approach Cam 1",
        "latitude": 12.9718,
        "longitude": 77.5948,
        "stream_url": "rtsp://live.traffic.internal/cam201",
        "connected_signal_id": "SIG-NONEXISTENT",
        "view_heading": 0,
        "status": "ONLINE",
    }
    fail_res = client.post("/api/v1/cameras", json=cam_fail_payload)
    assert fail_res.status_code == 404
    assert "Connected traffic signal" in fail_res.json()["detail"]

    # 2. Create the traffic signal
    signal_payload = {
        "id": "SIG-101",
        "name": "Junction 4 - MG Road & Park Ave",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "current_phase": "RED",
        "normal_cycle_seconds": 60,
    }
    client.post("/api/v1/signals", json=signal_payload)

    # 3. Create the camera successfully
    cam_payload = {
        "id": "CAM-201",
        "name": "Northbound Approach Cam 1",
        "latitude": 12.9718,
        "longitude": 77.5948,
        "stream_url": "rtsp://live.traffic.internal/cam201",
        "connected_signal_id": "SIG-101",
        "view_heading": 0,
        "status": "ONLINE",
    }
    cam_res = client.post("/api/v1/cameras", json=cam_payload)
    assert cam_res.status_code == 201
    cam_data = cam_res.json()
    assert cam_data["id"] == "CAM-201"
    assert cam_data["name"] == "Northbound Approach Cam 1"
    assert cam_data["latitude"] == 12.9718
    assert cam_data["longitude"] == 77.5948
    assert cam_data["stream_url"] == "rtsp://live.traffic.internal/cam201"
    assert cam_data["connected_signal_id"] == "SIG-101"
    assert cam_data["view_heading"] == 0
    assert cam_data["status"] == "ONLINE"

    # 4. Duplicate camera ID conflict check
    dup_cam_res = client.post("/api/v1/cameras", json=cam_payload)
    assert dup_cam_res.status_code == 409

    # 5. List all cameras
    all_cams = client.get("/api/v1/cameras")
    assert all_cams.status_code == 200
    cam_list = all_cams.json()
    assert len(cam_list) == 1
    assert cam_list[0]["id"] == "CAM-201"

    # 6. Retrieve camera by ID
    single_cam = client.get("/api/v1/cameras/CAM-201")
    assert single_cam.status_code == 200
    assert single_cam.json()["name"] == "Northbound Approach Cam 1"


def test_404_not_found_scenarios(client):
    assert client.get("/api/v1/signals/SIG-UNKNOWN").status_code == 404
    assert client.post("/api/v1/signals/SIG-UNKNOWN/override").status_code == 404
    assert client.post("/api/v1/signals/SIG-UNKNOWN/reset").status_code == 404
    assert client.get("/api/v1/cameras/CAM-UNKNOWN").status_code == 404
