"""
Regression test suite for Batch 1 findings:
SEC-001..003, CSRF, BE-001..011, DB-001..002, and AETIS-006 telemetry validation.
"""

from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

from app.core.config import _load_secret_key, _parse_origins
from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.hospital import Hospital, HospitalAlert
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
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

    hosp1 = Hospital(
        id="HOSP-01",
        name="City Trauma 1",
        address="100 First Ave",
        latitude=12.9784,
        longitude=77.6408,
        contact_phone="+91-80-1111-1111",
        trauma_level=1,
        available_beds=10,
    )
    hosp2 = Hospital(
        id="HOSP-02",
        name="Metro Care 2",
        address="200 Second Ave",
        latitude=12.9900,
        longitude=77.6600,
        contact_phone="+91-80-2222-2222",
        trauma_level=2,
        available_beds=5,
    )
    db.add_all([hosp1, hosp2])
    db.flush()

    users = [
        User(
            id="u-admin",
            email="admin@test.gov",
            password_hash=get_password_hash("password123"),
            full_name="Admin User",
            role="ADMIN",
            is_active=True,
        ),
        User(
            id="u-disp",
            email="disp@test.gov",
            password_hash=get_password_hash("password123"),
            full_name="Dispatcher User",
            role="DISPATCHER",
            is_active=True,
        ),
        User(
            id="u-driv1",
            email="driver1@test.gov",
            password_hash=get_password_hash("password123"),
            full_name="Driver One",
            role="DRIVER",
            is_active=True,
        ),
        User(
            id="u-driv2",
            email="driver2@test.gov",
            password_hash=get_password_hash("password123"),
            full_name="Driver Two",
            role="DRIVER",
            is_active=True,
        ),
        User(
            id="u-hosp1",
            email="hosp1@test.gov",
            password_hash=get_password_hash("password123"),
            full_name="Hospital Staff 1",
            role="HOSPITAL",
            hospital_id="HOSP-01",
            is_active=True,
        ),
    ]
    db.add_all(users)

    sig = TrafficSignal(
        id="SIG-01",
        name="Signal 1",
        latitude=12.9720,
        longitude=77.6000,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    db.add(sig)
    db.flush()

    cam = Camera(
        id="CAM-01",
        name="Cam 1",
        latitude=12.9718,
        longitude=77.5990,
        stream_url="rtsp://cam/1",
        connected_signal_id="SIG-01",
        view_heading=90,
        status="ONLINE",
    )
    veh1 = Vehicle(
        id="AMB-01",
        call_sign="Medic 1",
        label="Medic 1",
        type="AMBULANCE",
        license_plate="KA-01-001",
        status="AVAILABLE",
        current_latitude=12.9710,
        current_longitude=77.5950,
        current_driver_id="u-driv1",
    )
    veh2 = Vehicle(
        id="AMB-02",
        call_sign="Medic 2",
        label="Medic 2",
        type="AMBULANCE",
        license_plate="KA-01-002",
        status="AVAILABLE",
        current_latitude=12.9710,
        current_longitude=77.5950,
        current_driver_id="u-driv2",
    )
    db.add_all([cam, veh1, veh2])
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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _bearer(email: str, uid: str, role: str) -> dict[str, str]:
    tok, _, _ = create_access_token({"sub": email, "user_id": uid, "email": email, "role": role})
    return {"Authorization": f"Bearer {tok}"}


def test_sec003_config_rejects_missing_secret_and_wildcard_cors(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        _load_secret_key("production")
    with pytest.raises(RuntimeError):
        _parse_origins("http://localhost:5173,*")


def test_sec001_and_be001_rbac_enforcement(client):
    # Unauthenticated access blocked (401)
    assert client.get("/api/v1/signals").status_code == 401
    assert client.post("/api/v1/signals/SIG-01/override").status_code == 401
    assert client.post("/api/v1/signals/SIG-01/reset").status_code == 401
    assert client.get("/api/v1/cameras").status_code == 401
    assert client.post("/api/v1/detections/camera-alert", json={
        "camera_id": "CAM-01",
        "detected_vehicle_type": "AMBULANCE",
        "confidence": 0.95,
        "estimated_queue_count": 3,
        "timestamp": 1700000000.0,
    }).status_code == 401
    assert client.post("/api/v1/tracking/update-location", json={
        "vehicle_id": "AMB-01",
        "emergency_id": "EMG-01",
        "latitude": 12.97,
        "longitude": 77.59,
        "speed": 40.0,
        "heading": 90.0,
        "timestamp": 1700000000.0,
    }).status_code == 401
    assert client.get("/api/v1/ws/stats").status_code == 401

    driv_hdrs = _bearer("driver1@test.gov", "u-driv1", "DRIVER")
    hosp_hdrs = _bearer("hosp1@test.gov", "u-hosp1", "HOSPITAL")

    # Wrong roles blocked (403)
    assert client.post("/api/v1/signals/SIG-01/override", headers=driv_hdrs).status_code == 403
    assert client.post("/api/v1/emergencies", json={
        "title": "Unauth",
        "severity": "HIGH",
        "pickup_latitude": 12.97,
        "pickup_longitude": 77.59,
    }, headers=driv_hdrs).status_code == 403
    assert client.post("/api/v1/emergencies", json={
        "title": "Unauth",
        "severity": "HIGH",
        "pickup_latitude": 12.97,
        "pickup_longitude": 77.59,
    }, headers=hosp_hdrs).status_code == 403
    assert client.patch("/api/v1/vehicles/AMB-01/assign", json={"emergency_id": "EMG-01"}, headers=driv_hdrs).status_code == 403
    assert client.post("/api/v1/tracking/update-location", json={
        "vehicle_id": "AMB-02",
        "emergency_id": "EMG-01",
        "latitude": 12.97,
        "longitude": 77.59,
        "speed": 40.0,
        "heading": 90.0,
        "timestamp": 1700000000.0,
    }, headers=driv_hdrs).status_code == 403

    # WS unauthenticated closes with 4401; wrong hospital closes with 4403
    with pytest.raises(WebSocketDisconnect) as exc_unauth:
        with client.websocket_connect("/ws") as ws:
            ws.receive_json()
    assert exc_unauth.value.code == 4401

    hosp_tok, _, _ = create_access_token({"sub": "hosp1@test.gov", "user_id": "u-hosp1", "email": "hosp1@test.gov", "role": "HOSPITAL"})
    with pytest.raises(WebSocketDisconnect) as exc_forb:
        with client.websocket_connect(f"/ws?token={hosp_tok}&hospital_id=HOSP-02") as ws:
            ws.receive_json()
    assert exc_forb.value.code == 4403


def test_sec002_refresh_expiry_rotation_and_logout_revocation_with_csrf(client):
    login_res = client.post("/api/v1/auth/login", json={
        "email": "disp@test.gov",
        "password": "password123",
        "role": "DISPATCHER",
    })
    assert login_res.status_code == 200
    body = login_res.json()
    access_tok = body["access_token"]
    refresh_tok = body["refresh_token"]
    csrf_tok = body["csrf_token"]
    assert csrf_tok and refresh_tok

    # Cookie-based mutation WITHOUT X-CSRF-Token is blocked by CSRF middleware (403)
    client.cookies.set("access_token", access_tok)
    client.cookies.set("refresh_token", refresh_tok)
    client.cookies.set("csrf_token", csrf_tok)

    csrf_fail = client.post("/api/v1/emergencies", json={
        "title": "CSRF Test",
        "severity": "HIGH",
        "pickup_latitude": 12.97,
        "pickup_longitude": 77.59,
    })
    assert csrf_fail.status_code == 403

    # With matching X-CSRF-Token succeeds
    csrf_ok = client.post(
        "/api/v1/emergencies",
        json={
            "title": "CSRF OK",
            "severity": "HIGH",
            "pickup_latitude": 12.97,
            "pickup_longitude": 77.59,
        },
        headers={"X-CSRF-Token": csrf_tok},
    )
    assert csrf_ok.status_code == 201

    # Sending ACCESS token or EXPIRED token to /refresh is rejected (401)
    assert client.post("/api/v1/auth/refresh", json={"token": access_tok}, headers={"X-CSRF-Token": csrf_tok}).status_code == 401
    expired_tok, _, _ = create_access_token(
        {"sub": "disp@test.gov", "user_id": "u-disp", "email": "disp@test.gov", "role": "DISPATCHER"},
        expires_delta=timedelta(minutes=-5),
    )
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", json={"token": expired_tok}).status_code == 401

    # Valid refresh token works once (rotation), replay fails (401)
    rot1 = client.post("/api/v1/auth/refresh", json={"token": refresh_tok})
    assert rot1.status_code == 200
    new_access = rot1.json()["access_token"]
    client.cookies.clear()
    assert client.post("/api/v1/auth/refresh", json={"token": refresh_tok}).status_code == 401

    # Logout revokes access token immediately
    logout_res = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {new_access}"})
    assert logout_res.status_code == 200
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"}).status_code == 401


def test_be002_be003_be005_be007_be008_be009_and_aetis006(client):
    disp_hdrs = _bearer("disp@test.gov", "u-disp", "DISPATCHER")
    hosp_hdrs = _bearer("hosp1@test.gov", "u-hosp1", "HOSPITAL")

    # BE-009: emergency type persisted + hospital coords resolved
    create_res = client.post("/api/v1/emergencies", json={
        "title": "Industrial Fire Injury",
        "type": "fire",
        "severity": "CRITICAL",
        "pickup_latitude": 12.9712,
        "pickup_longitude": 77.5950,
        "destination_hospital_id": "HOSP-01",
    }, headers=disp_hdrs)
    assert create_res.status_code == 201
    emg = create_res.json()
    assert emg["type"] == "fire"
    assert emg["destination_lat"] == 12.9784
    assert emg["destination_lng"] == 77.6408

    # BE-005: GET inbound-alerts is idempotent and does not insert duplicate rows
    alerts_1 = client.get("/api/v1/hospitals/inbound-alerts", headers=hosp_hdrs)
    assert alerts_1.status_code == 200
    assert len(alerts_1.json()) == 1

    # Assign vehicle -> DISPATCHED, keeps single HospitalAlert
    assign_res = client.patch("/api/v1/vehicles/AMB-01/assign", json={"emergency_id": emg["id"]}, headers=disp_hdrs)
    assert assign_res.status_code == 200
    assert assign_res.json()["status"] == "DISPATCHED"

    # BE-003: evaluate-corridor finds active DISPATCHED emergency without explicit destination coords
    eval_res = client.post("/api/v1/signals/evaluate-corridor", json={
        "vehicle_id": "AMB-01",
        "current_latitude": 12.9718,
        "current_longitude": 77.5990,
        "speed_kmh": 54.0,
        "queue_count": 5,
    }, headers=disp_hdrs)
    assert eval_res.status_code == 200
    assert eval_res.json()["preemption_triggered"] is True
    assert eval_res.json()["preempted_signal_id"] == "SIG-01"

    # AETIS-006: unregistered vehicle telemetry returns 404 (no phantom DB row created)
    bad_trk = client.post("/api/v1/tracking/update-location", json={
        "vehicle_id": "GHOST-999",
        "emergency_id": emg["id"],
        "latitude": 12.9720,
        "longitude": 77.6000,
        "speed": 45.0,
        "heading": 90.0,
        "timestamp": 1700000010.0,
    }, headers=disp_hdrs)
    assert bad_trk.status_code == 404

    # BE-002 + BE-007: KPI endpoint counts automated signal preemptions and handles timestamps safely
    kpi_mid = client.get("/api/v1/analytics/kpis", headers=disp_hdrs).json()
    assert kpi_mid["total_signal_preemptions"] >= 1
    assert kpi_mid["active_emergencies"] == 1

    # Advance DISPATCHED -> IN_TRANSIT -> COMPLETED -> BE-008 releases SIG-01 back to RED / is_preempted=False
    assert client.patch(f"/api/v1/emergencies/{emg['id']}/status", json={"status": "IN_TRANSIT"}, headers=disp_hdrs).status_code == 200
    comp_res = client.patch(f"/api/v1/emergencies/{emg['id']}/status", json={"status": "COMPLETED"}, headers=disp_hdrs)
    assert comp_res.status_code == 200
    sig_after = client.get("/api/v1/signals/SIG-01", headers=disp_hdrs).json()
    assert sig_after["is_preempted"] is False
    assert sig_after["current_phase"] == "RED"

    # Mix naive created_at directly in DB to ensure BE-007 UTC normalization never raises TypeError
    db = TestingSessionLocal()
    db_emg = db.query(Emergency).filter(Emergency.id == emg["id"]).first()
    db_emg.created_at = (datetime.now(timezone.utc) - timedelta(minutes=12)).replace(tzinfo=None)
    db.commit()
    db.close()

    kpi_end = client.get("/api/v1/analytics/kpis", headers=disp_hdrs)
    assert kpi_end.status_code == 200
    assert kpi_end.json()["avg_response_time_minutes"] >= 11.5


def test_be006_collision_safe_id_after_deletion(client):
    disp_hdrs = _bearer("disp@test.gov", "u-disp", "DISPATCHER")
    r1 = client.post("/api/v1/emergencies", json={
        "id": "EMG-01", "incident_number": "INC-2026-001", "title": "E1", "severity": "LOW",
        "pickup_latitude": 12.97, "pickup_longitude": 77.59,
    }, headers=disp_hdrs)
    r2 = client.post("/api/v1/emergencies", json={
        "id": "EMG-02", "incident_number": "INC-2026-002", "title": "E2", "severity": "LOW",
        "pickup_latitude": 12.97, "pickup_longitude": 77.59,
    }, headers=disp_hdrs)
    assert r1.status_code == 201 and r2.status_code == 201

    db = TestingSessionLocal()
    db.query(Emergency).filter(Emergency.id == "EMG-01").delete()
    db.commit()
    db.close()

    # Next auto-generated emergency ID must avoid colliding with EMG-02
    r3 = client.post("/api/v1/emergencies", json={
        "title": "E3", "severity": "LOW", "pickup_latitude": 12.97, "pickup_longitude": 77.59,
    }, headers=disp_hdrs)
    assert r3.status_code == 201
    assert r3.json()["id"] != "EMG-02"


def test_db002_sqlite_foreign_keys_and_cascade(db_session=None):
    # Verify PRAGMA foreign_keys=ON enforces FK integrity and CASCADE delete
    db = TestingSessionLocal()
    bad_cam = Camera(
        id="CAM-BAD",
        name="Orphan Cam",
        latitude=12.97,
        longitude=77.59,
        stream_url="rtsp://bad",
        connected_signal_id="SIG-DOES-NOT-EXIST",
        view_heading=0,
        status="ONLINE",
    )
    db.add(bad_cam)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # Deleting TrafficSignal cascades to Camera CAM-01
    sig = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-01").first()
    db.delete(sig)
    db.commit()
    assert db.query(Camera).filter(Camera.id == "CAM-01").first() is None
    db.close()

    # Verify all canonical ORM tables exist
    tables = set(inspect(test_engine).get_table_names())
    assert {
        "users", "hospitals", "hospital_alerts", "vehicles", "emergencies",
        "traffic_signals", "signals", "cameras", "audit_logs", "revoked_tokens", "refresh_tokens",
    }.issubset(tables)


def test_be010_telemetry_500_does_not_leak_exception(client, monkeypatch):
    disp_hdrs = _bearer("disp@test.gov", "u-disp", "DISPATCHER")

    async def boom(*args, **kwargs):
        raise RuntimeError("sensitive internal db connection string secret")

    monkeypatch.setattr("app.routers.tracking.process_location_update", boom)
    res = client.post("/api/v1/tracking/update-location", json={
        "vehicle_id": "AMB-01",
        "emergency_id": "EMG-01",
        "latitude": 12.97,
        "longitude": 77.59,
        "speed": 45.0,
        "heading": 90.0,
        "timestamp": 1700000000.0,
    }, headers=disp_hdrs)
    assert res.status_code == 500
    assert "sensitive internal db connection string secret" not in res.text
