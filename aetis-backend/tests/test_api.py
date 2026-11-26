import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.user import User

SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def _fk_on(conn, _):
    conn.cursor().execute("PRAGMA foreign_keys=ON")


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    admin = User(
        id="usr-test-admin",
        email="admin.test@aetis.gov",
        password_hash=get_password_hash("password123"),
        full_name="Test Admin",
        role="ADMIN",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def admin_headers(db_session):
    token, _, _ = create_access_token(
        {"sub": "admin.test@aetis.gov", "user_id": "usr-test-admin", "email": "admin.test@aetis.gov", "role": "ADMIN"}
    )
    return {"Authorization": f"Bearer {token}"}


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


def test_signals_crud_and_override_scenarios(client, admin_headers):
    signal_payload = {
        "id": "SIG-101",
        "name": "Junction 4 - MG Road & Park Ave",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "current_phase": "RED",
        "normal_cycle_seconds": 60,
    }
    create_res = client.post("/api/v1/signals", json=signal_payload, headers=admin_headers)
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

    dup_res = client.post("/api/v1/signals", json=signal_payload, headers=admin_headers)
    assert dup_res.status_code == 409

    list_res = client.get("/api/v1/signals", headers=admin_headers)
    assert list_res.status_code == 200
    signals = list_res.json()
    assert len(signals) == 1
    assert signals[0]["id"] == "SIG-101"

    get_res = client.get("/api/v1/signals/SIG-101", headers=admin_headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Junction 4 - MG Road & Park Ave"

    override_payload = {"vehicle_id": "EV-AMB-01", "duration_seconds": 120}
    override_res = client.post("/api/v1/signals/SIG-101/override", json=override_payload, headers=admin_headers)
    assert override_res.status_code == 200
    overridden = override_res.json()
    assert overridden["current_phase"] == "GREEN"
    assert overridden["is_preempted"] is True
    assert overridden["preempted_by_vehicle_id"] == "EV-AMB-01"
    assert overridden["preemption_end_time"] is not None

    override_default_res = client.post("/api/v1/signals/SIG-101/override", headers=admin_headers)
    assert override_default_res.status_code == 200
    assert override_default_res.json()["current_phase"] == "GREEN"
    assert override_default_res.json()["is_preempted"] is True

    reset_res = client.post("/api/v1/signals/SIG-101/reset", headers=admin_headers)
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert reset_data["current_phase"] == "RED"
    assert reset_data["is_preempted"] is False
    assert reset_data["preempted_by_vehicle_id"] is None
    assert reset_data["preemption_end_time"] is None


def test_cameras_crud_and_validation(client, admin_headers):
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
    fail_res = client.post("/api/v1/cameras", json=cam_fail_payload, headers=admin_headers)
    assert fail_res.status_code == 404
    assert "Connected traffic signal" in fail_res.json()["detail"]

    signal_payload = {
        "id": "SIG-101",
        "name": "Junction 4 - MG Road & Park Ave",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "current_phase": "RED",
        "normal_cycle_seconds": 60,
    }
    client.post("/api/v1/signals", json=signal_payload, headers=admin_headers)

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
    cam_res = client.post("/api/v1/cameras", json=cam_payload, headers=admin_headers)
    assert cam_res.status_code == 201
    cam_data = cam_res.json()
    assert cam_data["id"] == "CAM-201"
    assert cam_data["connected_signal_id"] == "SIG-101"
    assert cam_data["status"] == "ONLINE"

    dup_cam_res = client.post("/api/v1/cameras", json=cam_payload, headers=admin_headers)
    assert dup_cam_res.status_code == 409

    all_cams = client.get("/api/v1/cameras", headers=admin_headers)
    assert all_cams.status_code == 200
    assert len(all_cams.json()) == 1

    single_cam = client.get("/api/v1/cameras/CAM-201", headers=admin_headers)
    assert single_cam.status_code == 200
    assert single_cam.json()["name"] == "Northbound Approach Cam 1"


def test_404_not_found_scenarios(client, admin_headers):
    assert client.get("/api/v1/signals/SIG-UNKNOWN", headers=admin_headers).status_code == 404
    assert client.post("/api/v1/signals/SIG-UNKNOWN/override", headers=admin_headers).status_code == 404
    assert client.post("/api/v1/signals/SIG-UNKNOWN/reset", headers=admin_headers).status_code == 404
    assert client.get("/api/v1/cameras/CAM-UNKNOWN", headers=admin_headers).status_code == 404
