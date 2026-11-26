import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.camera import Camera, CameraStatus
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.services.websocket_manager import manager

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


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    db.add(
        User(
            id="usr-disp-det",
            email="disp.det@aetis.gov",
            password_hash=get_password_hash("password123"),
            full_name="Detection Dispatcher",
            role="DISPATCHER",
            is_active=True,
        )
    )
    sig1 = TrafficSignal(
        id="SIG-101",
        name="Junction 4 - MG Road & Park Ave",
        latitude=12.9716,
        longitude=77.5946,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    cam1 = Camera(
        id="CAM-201",
        name="Northbound Approach Cam 1",
        latitude=12.9718,
        longitude=77.5948,
        stream_url="rtsp://traffic.internal/live/cam201",
        connected_signal_id="SIG-101",
        view_heading=90,
        status=CameraStatus.ONLINE.value,
    )
    sig2 = TrafficSignal(
        id="SIG-102",
        name="Junction 5 - Brigade Rd & Residency Rd",
        latitude=12.9725,
        longitude=77.6075,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    cam2 = Camera(
        id="CAM-203",
        name="Eastbound Approach Cam 1",
        latitude=12.9727,
        longitude=77.6078,
        stream_url="rtsp://traffic.internal/live/cam203",
        connected_signal_id="SIG-102",
        view_heading=90,
        status=CameraStatus.ONLINE.value,
    )

    db.add_all([sig1, cam1, sig2, cam2])
    db.commit()
    db.close()

    manager.active_rooms.clear()
    yield
    Base.metadata.drop_all(bind=test_engine)
    manager.active_rooms.clear()


@pytest.fixture
def client():
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _cam_headers():
    return {"X-AETIS-API-Key": settings.CAMERA_API_KEY}


def _dispatcher_token():
    token, _, _ = create_access_token(
        {"sub": "disp.det@aetis.gov", "user_id": "usr-disp-det", "email": "disp.det@aetis.gov", "role": "DISPATCHER"}
    )
    return token


def test_camera_alert_ambulance_triggers_downstream_preemption(client):
    token = _dispatcher_token()
    arm_res = client.post(
        "/api/v1/cameras/CAM-201/arm",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert arm_res.status_code == 200
    assert arm_res.json()["is_armed"] is True

    now_ts = time.time()
    with client.websocket_connect(f"/ws?token={token}") as ws_disp:
        ws_disp.receive_json()

        alert_payload = {
            "camera_id": "CAM-201",
            "detected_vehicle_type": "AMBULANCE",
            "confidence": 0.92,
            "estimated_queue_count": 6,
            "timestamp": now_ts,
            "vehicle_id": "AMB-01",
        }
        res = client.post("/api/v1/detections/camera-alert", json=alert_payload, headers=_cam_headers())
        assert res.status_code == 200
        data = res.json()

        assert data["status"] == "alert_dispatched"
        assert data["downstream_signaled"] is True
        assert data["connected_signal_id"] == "SIG-101"
        assert data["target_signal_id"] == "SIG-102"
        assert data["estimated_queue_count"] == 6

        db = TestingSessionLocal()
        target_sig = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-102").first()
        assert target_sig.is_preempted is True
        assert target_sig.current_phase == "GREEN"
        assert target_sig.preempted_by_vehicle_id == "AMB-01"
        db.close()

        ws_event = ws_disp.receive_json()
        assert ws_event["type"] in ["camera:detection_alert", "signal:phase_changed", "signal:preemption_triggered"]

        # Duplicate within 30s cooldown window is suppressed
        dup_res = client.post("/api/v1/detections/camera-alert", json=alert_payload, headers=_cam_headers())
        assert dup_res.status_code == 200
        assert dup_res.json()["status"] == "alert_ignored"


def test_camera_alert_ignored_when_unarmed_or_stale(client):
    res_unarmed = client.post(
        "/api/v1/detections/camera-alert",
        json={
            "camera_id": "CAM-201",
            "detected_vehicle_type": "AMBULANCE",
            "confidence": 0.95,
            "estimated_queue_count": 3,
            "timestamp": time.time(),
        },
        headers=_cam_headers(),
    )
    assert res_unarmed.status_code == 200
    assert res_unarmed.json()["status"] == "alert_ignored"
    assert "not armed" in res_unarmed.json()["reason"].lower()

    token = _dispatcher_token()
    assert (
        client.post(
            "/api/v1/cameras/CAM-201/arm",
            headers={"Authorization": f"Bearer {token}"},
        ).status_code
        == 200
    )

    res_stale = client.post(
        "/api/v1/detections/camera-alert",
        json={
            "camera_id": "CAM-201",
            "detected_vehicle_type": "AMBULANCE",
            "confidence": 0.95,
            "estimated_queue_count": 3,
            "timestamp": 1700000000.0,
        },
        headers=_cam_headers(),
    )
    assert res_stale.status_code == 200
    assert res_stale.json()["status"] == "alert_ignored"
    assert "stale" in res_stale.json()["reason"].lower()


def test_camera_alert_ignored_when_low_confidence(client):
    token = _dispatcher_token()
    client.post("/api/v1/cameras/CAM-201/arm", headers={"Authorization": f"Bearer {token}"})
    low_conf_payload = {
        "camera_id": "CAM-201",
        "detected_vehicle_type": "AMBULANCE",
        "confidence": 0.65,
        "estimated_queue_count": 3,
        "timestamp": time.time(),
    }
    res = client.post("/api/v1/detections/camera-alert", json=low_conf_payload, headers=_cam_headers())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "alert_ignored"
    assert data["downstream_signaled"] is False


def test_camera_alert_ignored_when_non_emergency_vehicle(client):
    token = _dispatcher_token()
    client.post("/api/v1/cameras/CAM-201/arm", headers={"Authorization": f"Bearer {token}"})
    car_payload = {
        "camera_id": "CAM-201",
        "detected_vehicle_type": "SEDAN",
        "confidence": 0.95,
        "estimated_queue_count": 2,
        "timestamp": time.time(),
    }
    res = client.post("/api/v1/detections/camera-alert", json=car_payload, headers=_cam_headers())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "alert_ignored"
    assert data["downstream_signaled"] is False


def test_camera_alert_404_for_unknown_camera(client):
    unknown_cam_payload = {
        "camera_id": "CAM-UNKNOWN-99",
        "detected_vehicle_type": "AMBULANCE",
        "confidence": 0.90,
        "estimated_queue_count": 4,
        "timestamp": 1700000000.0,
    }
    res = client.post("/api/v1/detections/camera-alert", json=unknown_cam_payload, headers=_cam_headers())
    assert res.status_code == 404
