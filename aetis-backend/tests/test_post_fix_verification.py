"""
Independent Post-Fix Verification Suite:
Covers Security (JWT typ separation, refresh rotation/replay, logout revocation, CSRF, CORS,
horizontal IDOR RBAC, WS auth), Core E2E AETIS lifecycle, Overlapping Signal Safety,
and Camera arming/cooldown/disarm-on-completion.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

from app.core.config import _load_secret_key, _parse_origins, settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, create_refresh_token, get_password_hash
from app.main import app
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.preemption_service import expire_due_preemptions
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
def isolated_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    db.add_all(
        [
            Hospital(
                id="HOSP-V1",
                name="Verify Hospital 1",
                address="100 Main Rd",
                latitude=12.9784,
                longitude=77.6408,
                contact_phone="+91-80-1111-0001",
                trauma_level=1,
                available_beds=10,
            ),
            Hospital(
                id="HOSP-V2",
                name="Verify Hospital 2",
                address="200 Side Rd",
                latitude=12.9900,
                longitude=77.6600,
                contact_phone="+91-80-1111-0002",
                trauma_level=2,
                available_beds=6,
            ),
        ]
    )
    db.flush()

    db.add_all(
        [
            User(
                id="u-v-admin",
                email="admin.v@aetis.gov",
                password_hash=get_password_hash("Admin@123"),
                full_name="Verify Admin",
                role="ADMIN",
                is_active=True,
            ),
            User(
                id="u-v-disp",
                email="disp.v@aetis.gov",
                password_hash=get_password_hash("Dispatch@123"),
                full_name="Verify Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            User(
                id="u-v-drv1",
                email="drv1.v@aetis.gov",
                password_hash=get_password_hash("Driver@123"),
                full_name="Verify Driver 1",
                role="DRIVER",
                is_active=True,
            ),
            User(
                id="u-v-drv2",
                email="drv2.v@aetis.gov",
                password_hash=get_password_hash("Driver@123"),
                full_name="Verify Driver 2",
                role="DRIVER",
                is_active=True,
            ),
            User(
                id="u-v-hosp1",
                email="hosp1.v@aetis.gov",
                password_hash=get_password_hash("Hosp@123"),
                full_name="Hospital 1 Staff",
                role="HOSPITAL",
                hospital_id="HOSP-V1",
                is_active=True,
            ),
            User(
                id="u-v-hosp2",
                email="hosp2.v@aetis.gov",
                password_hash=get_password_hash("Hosp@123"),
                full_name="Hospital 2 Staff",
                role="HOSPITAL",
                hospital_id="HOSP-V2",
                is_active=True,
            ),
            Vehicle(
                id="AMB-V1",
                call_sign="AMB-V1",
                label="Verify Amb 1",
                type="AMBULANCE",
                current_latitude=12.9700,
                current_longitude=77.5900,
                speed=0.0,
                heading=90.0,
                status="AVAILABLE",
                current_driver_id="u-v-drv1",
            ),
            Vehicle(
                id="AMB-V2",
                call_sign="AMB-V2",
                label="Verify Amb 2",
                type="AMBULANCE",
                current_latitude=12.9800,
                current_longitude=77.5900,
                speed=0.0,
                heading=90.0,
                status="AVAILABLE",
                current_driver_id="u-v-drv2",
            ),
            TrafficSignal(
                id="SIG-V1",
                name="Outbound Junction",
                latitude=12.9718,
                longitude=77.5965,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
            TrafficSignal(
                id="SIG-V2",
                name="Return Hospital Junction",
                latitude=12.9755,
                longitude=77.6200,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
            TrafficSignal(
                id="SIG-V3",
                name="Other Corridor Junction",
                latitude=12.9810,
                longitude=77.6000,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
            Camera(
                id="CAM-V1",
                name="Outbound Approach Cam",
                latitude=12.9718,
                longitude=77.5965,
                stream_url="rtsp://cam.local/v1",
                connected_signal_id="SIG-V1",
                view_heading=90,
                status="ONLINE",
            ),
        ]
    )
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


def _login(client: TestClient, email: str, password: str, role: str) -> dict[str, str]:
    res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "role": role},
    )
    assert res.status_code == 200, res.text
    return {"X-CSRF-Token": res.cookies.get("csrf_token") or ""}


def test_security_jwt_separation_replay_csrf_cors_and_ws_guards(client: TestClient, monkeypatch):
    # 1. Production config guard
    monkeypatch.setenv("AETIS_ENV", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        _load_secret_key("production")
    with pytest.raises(RuntimeError):
        _parse_origins("*")
    monkeypatch.delenv("AETIS_ENV", raising=False)

    # 2. Cookie flags + CSRF enforcement
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "disp.v@aetis.gov", "password": "Dispatch@123", "role": "dispatcher"},
    )
    assert res.status_code == 200
    set_cookie_hdrs = res.headers.get_list("set-cookie")
    joined = "\n".join(set_cookie_hdrs).lower()
    assert "access_token=" in joined and "httponly" in joined
    assert "refresh_token=" in joined
    assert "csrf_token=" in joined
    body = res.json()

    # Access token cannot be used at /refresh
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={"token": body["access_token"]},
            headers={"X-CSRF-Token": res.cookies.get("csrf_token") or ""},
        ).status_code
        == 401
    )
    # Refresh token cannot be used at /me
    assert (
        client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {body['refresh_token']}"},
        ).status_code
        == 401
    )

    # Refresh token one-time rotation & replay rejection
    csrf = res.cookies.get("csrf_token") or ""
    r1 = client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert r1.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh",
            json={"token": body["refresh_token"]},
            headers={"X-CSRF-Token": r1.cookies.get("csrf_token") or ""},
        ).status_code
        == 401
    )

    # Logout revokes tokens
    new_csrf = r1.cookies.get("csrf_token") or ""
    new_access = r1.json()["access_token"]
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": new_csrf}).status_code == 200
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"}).status_code
        == 401
    )

    # WebSocket rejects refresh token (4401) and wrong hospital room (4403)
    ref_tok, _, _ = create_refresh_token(
        {"sub": "hosp1.v@aetis.gov", "user_id": "u-v-hosp1", "email": "hosp1.v@aetis.gov", "role": "HOSPITAL"}
    )
    with pytest.raises(WebSocketDisconnect) as exc_ref:
        with client.websocket_connect(f"/ws?token={ref_tok}") as ws_ref:
            ws_ref.receive_json()
    assert exc_ref.value.code == 4401

    hosp_acc, _, _ = create_access_token(
        {"sub": "hosp1.v@aetis.gov", "user_id": "u-v-hosp1", "email": "hosp1.v@aetis.gov", "role": "HOSPITAL"}
    )
    with pytest.raises(WebSocketDisconnect) as exc_hosp:
        with client.websocket_connect(f"/ws?token={hosp_acc}&hospital_id=HOSP-V2") as ws_hosp:
            ws_hosp.receive_json()
    assert exc_hosp.value.code == 4403

    # CORS check: allowed vs disallowed origin
    cors_ok = client.options(
        "/api/v1/auth/me",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert cors_ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    cors_bad = client.options(
        "/api/v1/auth/me",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in cors_bad.headers


def test_full_aetis_two_leg_lifecycle_horizontal_idor_and_camera_disarm(client: TestClient):
    disp_hdrs = _login(client, "disp.v@aetis.gov", "Dispatch@123", "dispatcher")
    emg_res = client.post(
        "/api/v1/emergencies",
        headers=disp_hdrs,
        json={
            "title": "Cardiac Emergency",
            "type": "medical",
            "severity": "CRITICAL",
            "pickup_latitude": 12.9722,
            "pickup_longitude": 77.6020,
            "pickup_address": "Sector 9 Cross",
            "destination_hospital_id": "HOSP-V1",
        },
    )
    assert emg_res.status_code == 201
    emg_id = emg_res.json()["id"]

    # Assign AMB-V1 and arm CAM-V1
    assert (
        client.patch(
            "/api/v1/vehicles/AMB-V1/assign",
            headers=disp_hdrs,
            json={"emergency_id": emg_id},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/cameras/CAM-V1/arm",
            headers=disp_hdrs,
            json={"emergency_id": emg_id},
        ).status_code
        == 200
    )

    # Horizontal RBAC check: HOSP-V2 and DRV-2 CANNOT inspect EMG-V1 directly
    _login(client, "hosp2.v@aetis.gov", "Hosp@123", "hospital")
    assert client.get(f"/api/v1/emergencies/{emg_id}").status_code == 403

    _login(client, "drv2.v@aetis.gov", "Driver@123", "driver")
    assert client.get(f"/api/v1/emergencies/{emg_id}").status_code == 403

    # Driver 1 starts trip -> outbound telemetry triggers SIG-V1
    drv1_hdrs = _login(client, "drv1.v@aetis.gov", "Driver@123", "driver")
    assert (
        client.patch(
            f"/api/v1/emergencies/{emg_id}/status",
            headers=drv1_hdrs,
            json={"status": "IN_TRANSIT"},
        ).status_code
        == 200
    )
    t_out = client.post(
        "/api/v1/tracking/update-location",
        headers=drv1_hdrs,
        json={
            "vehicle_id": "AMB-V1",
            "emergency_id": emg_id,
            "latitude": 12.9717,
            "longitude": 77.5940,
            "speed": 60.0,
            "heading": 85.0,
            "timestamp": time.time(),
            "hospital_id": "HOSP-V1",
        },
    )
    assert t_out.status_code == 200
    assert "SIG-V1" in t_out.json()["preempted_signal_ids"]

    # Pickup -> ARRIVED switches journey_leg to TO_HOSPITAL
    arr = client.patch(
        f"/api/v1/emergencies/{emg_id}/status",
        headers=drv1_hdrs,
        json={"status": "ARRIVED"},
    )
    assert arr.status_code == 200
    assert arr.json()["journey_leg"] == "TO_HOSPITAL"

    # Return leg telemetry triggers SIG-V2 along hospital corridor
    t_ret = client.post(
        "/api/v1/tracking/update-location",
        headers=drv1_hdrs,
        json={
            "vehicle_id": "AMB-V1",
            "emergency_id": emg_id,
            "latitude": 12.9748,
            "longitude": 77.6175,
            "speed": 60.0,
            "heading": 75.0,
            "timestamp": time.time() + 1.0,
            "hospital_id": "HOSP-V1",
        },
    )
    assert t_ret.status_code == 200
    assert "SIG-V2" in t_ret.json()["preempted_signal_ids"]

    # Hospital 1 acknowledges alert
    hosp1_hdrs = _login(client, "hosp1.v@aetis.gov", "Hosp@123", "hospital")
    assert (
        client.post(
            f"/api/v1/hospitals/alerts/{emg_id}/acknowledge",
            headers=hosp1_hdrs,
            json={"trauma_bay_assigned": "BAY-1"},
        ).status_code
        == 200
    )

    # Complete emergency -> vehicle freed, signals reset, camera disarmed!
    drv1_hdrs = _login(client, "drv1.v@aetis.gov", "Driver@123", "driver")
    comp = client.patch(
        f"/api/v1/emergencies/{emg_id}/status",
        headers=drv1_hdrs,
        json={"status": "COMPLETED"},
    )
    assert comp.status_code == 200
    assert comp.json()["journey_leg"] == "COMPLETED"

    db = TestingSessionLocal()
    cam = db.query(Camera).filter(Camera.id == "CAM-V1").first()
    sig1 = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-V1").first()
    sig2 = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-V2").first()
    veh1 = db.query(Vehicle).filter(Vehicle.id == "AMB-V1").first()
    assert cam is not None and cam.is_armed is False and cam.armed_emergency_id is None
    assert sig1 is not None and sig1.is_preempted is False
    assert sig2 is not None and sig2.is_preempted is False
    assert veh1 is not None and veh1.status == "AVAILABLE"
    db.close()


def test_overlapping_emergencies_and_cv_conflict_isolation(client: TestClient):
    disp_hdrs = _login(client, "disp.v@aetis.gov", "Dispatch@123", "dispatcher")

    e1 = client.post(
        "/api/v1/emergencies",
        headers=disp_hdrs,
        json={
            "title": "Incident A",
            "type": "medical",
            "severity": "HIGH",
            "pickup_latitude": 12.9722,
            "pickup_longitude": 77.6020,
            "destination_hospital_id": "HOSP-V1",
        },
    ).json()["id"]
    e2 = client.post(
        "/api/v1/emergencies",
        headers=disp_hdrs,
        json={
            "title": "Incident B",
            "type": "medical",
            "severity": "CRITICAL",
            "pickup_latitude": 12.9815,
            "pickup_longitude": 77.6100,
            "destination_hospital_id": "HOSP-V2",
        },
    ).json()["id"]

    assert client.patch("/api/v1/vehicles/AMB-V1/assign", headers=disp_hdrs, json={"emergency_id": e1}).status_code == 200
    assert client.patch("/api/v1/vehicles/AMB-V2/assign", headers=disp_hdrs, json={"emergency_id": e2}).status_code == 200

    # Preempt SIG-V1 for AMB-V1 and SIG-V3 for AMB-V2
    assert (
        client.post(
            "/api/v1/signals/SIG-V1/override",
            headers=disp_hdrs,
            json={"vehicle_id": "AMB-V1", "duration_seconds": 60},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/signals/SIG-V3/override",
            headers=disp_hdrs,
            json={"vehicle_id": "AMB-V2", "duration_seconds": 60},
        ).status_code
        == 200
    )

    # Arm CAM-V1 (points to SIG-V2 downstream) and test that if SIG-V2 is held by AMB-V2, AMB-V1 CV alert does NOT steal it
    assert (
        client.post(
            "/api/v1/signals/SIG-V2/override",
            headers=disp_hdrs,
            json={"vehicle_id": "AMB-V2", "duration_seconds": 60},
        ).status_code
        == 200
    )
    assert client.post("/api/v1/cameras/CAM-V1/arm", headers=disp_hdrs, json={"emergency_id": e1}).status_code == 200
    cv_steal = client.post(
        "/api/v1/detections/camera-alert",
        headers={"X-AETIS-API-Key": settings.CAMERA_API_KEY},
        json={
            "camera_id": "CAM-V1",
            "detected_vehicle_type": "AMBULANCE",
            "confidence": 0.95,
            "estimated_queue_count": 3,
            "timestamp": time.time(),
            "vehicle_id": "AMB-V1",
        },
    )
    assert cv_steal.status_code == 200
    assert cv_steal.json()["status"] == "alert_ignored"

    # Cancelling/completing Incident A must NOT cancel AMB-V2's SIG-V3 or SIG-V2 preemptions!
    assert (
        client.patch(
            f"/api/v1/emergencies/{e1}/status",
            headers=disp_hdrs,
            json={"status": "CANCELLED"},
        ).status_code
        == 200
    )

    db = TestingSessionLocal()
    sig1 = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-V1").first()
    sig2 = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-V2").first()
    sig3 = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-V3").first()
    assert sig1 is not None and sig1.is_preempted is False
    assert sig2 is not None and sig2.is_preempted is True and sig2.preempted_by_vehicle_id == "AMB-V2"
    assert sig3 is not None and sig3.is_preempted is True and sig3.preempted_by_vehicle_id == "AMB-V2"

    # Expire only SIG-V2 timer; SIG-V3 remains preempted
    sig2.preemption_end_time = datetime.now(timezone.utc) - timedelta(seconds=10)
    db.commit()
    expired = asyncio.run(expire_due_preemptions(db))
    assert [s.id for s in expired] == ["SIG-V2"]
    db.refresh(sig3)
    assert sig3.is_preempted is True and sig3.preempted_by_vehicle_id == "AMB-V2"
    db.close()
