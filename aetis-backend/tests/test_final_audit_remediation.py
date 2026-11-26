"""
Final Pre-Commit Audit Remediation Regression Tests:
1. Unassigned & cross-driver vehicle rejection on REST & WebSocket paths.
2. Role-scoped notification visibility (preventing USER_/CAMERA_/cross-facility audit leaks).
3. Hospital facility scoping on /tracking/* and /signals/corridor/{emergency_id}.
4. Direct bcrypt hashing without passlib.
"""

from datetime import datetime, timezone
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.main import app
from app.models.audit import AuditLog
from app.models.emergency import Emergency
from app.models.hospital import Hospital
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
    db.add_all(
        [
            Hospital(
                id="HOSP-A1",
                name="Hospital A1",
                address="100 First Ave",
                latitude=12.9784,
                longitude=77.6408,
                contact_phone="+91-80-1111-1111",
                trauma_level=1,
                available_beds=10,
            ),
            Hospital(
                id="HOSP-A2",
                name="Hospital A2",
                address="200 Second Ave",
                latitude=12.9900,
                longitude=77.6600,
                contact_phone="+91-80-2222-2222",
                trauma_level=2,
                available_beds=8,
            ),
        ]
    )
    db.flush()

    db.add_all(
        [
            User(
                id="u-fa-admin",
                email="admin.fa@aetis.gov",
                password_hash=get_password_hash("Admin@123"),
                full_name="FA Admin",
                role="ADMIN",
                is_active=True,
            ),
            User(
                id="u-fa-disp",
                email="disp.fa@aetis.gov",
                password_hash=get_password_hash("Dispatch@123"),
                full_name="FA Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            User(
                id="u-fa-drv1",
                email="drv1.fa@aetis.gov",
                password_hash=get_password_hash("Driver@123"),
                full_name="FA Driver 1",
                role="DRIVER",
                is_active=True,
            ),
            User(
                id="u-fa-drv2",
                email="drv2.fa@aetis.gov",
                password_hash=get_password_hash("Driver@123"),
                full_name="FA Driver 2",
                role="DRIVER",
                is_active=True,
            ),
            User(
                id="u-fa-hosp1",
                email="hosp1.fa@aetis.gov",
                password_hash=get_password_hash("Hosp@123"),
                full_name="FA Hospital 1",
                role="HOSPITAL",
                hospital_id="HOSP-A1",
                is_active=True,
            ),
            User(
                id="u-fa-hosp2",
                email="hosp2.fa@aetis.gov",
                password_hash=get_password_hash("Hosp@123"),
                full_name="FA Hospital 2",
                role="HOSPITAL",
                hospital_id="HOSP-A2",
                is_active=True,
            ),
            Vehicle(
                id="AMB-ASSIGNED",
                call_sign="AMB-ASSIGNED",
                label="Assigned Amb",
                type="AMBULANCE",
                current_latitude=12.9715,
                current_longitude=77.5940,
                speed=45.0,
                heading=90.0,
                status="DISPATCHED",
                current_driver_id="u-fa-drv1",
            ),
            Vehicle(
                id="AMB-UNASSIGNED",
                call_sign="AMB-UNASSIGNED",
                label="Unassigned Amb",
                type="AMBULANCE",
                current_latitude=12.9715,
                current_longitude=77.5940,
                speed=0.0,
                heading=0.0,
                status="AVAILABLE",
                current_driver_id=None,
            ),
            TrafficSignal(
                id="SIG-FA-1",
                name="FA Corridor Signal",
                latitude=12.9720,
                longitude=77.5980,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
        ]
    )
    db.flush()

    db.add_all(
        [
            Emergency(
                id="EMG-FA-1",
                incident_number="INC-2026-FA01",
                title="HOSP-A1 Cardiac",
                type="medical",
                severity="CRITICAL",
                pickup_latitude=12.9730,
                pickup_longitude=77.6050,
                destination_hospital_id="HOSP-A1",
                hospital_id="HOSP-A1",
                destination_lat=12.9784,
                destination_lng=77.6408,
                assigned_vehicle_id="AMB-ASSIGNED",
                status="IN_TRANSIT",
                journey_leg="TO_SCENE",
            ),
            Emergency(
                id="EMG-FA-UNASSIGNED",
                incident_number="INC-2026-FA02",
                title="Unassigned Veh Incident",
                type="medical",
                severity="HIGH",
                pickup_latitude=12.9800,
                pickup_longitude=77.6100,
                destination_hospital_id="HOSP-A2",
                hospital_id="HOSP-A2",
                assigned_vehicle_id="AMB-UNASSIGNED",
                status="DISPATCHED",
                journey_leg="TO_SCENE",
            ),
        ]
    )
    db.flush()

    now = datetime.now(timezone.utc)
    db.add_all(
        [
            AuditLog(
                id=str(uuid.uuid4()),
                action="USER_CREATED",
                performed_by_id="u-fa-admin",
                details="Admin created secret user account sec@aetis.gov",
                timestamp=now,
            ),
            AuditLog(
                id=str(uuid.uuid4()),
                action="CAMERA_DETECTION_RECORDED",
                performed_by_id=None,
                details='{"camera_id":"CAM-1","signal_id":"SIG-FA-1"}',
                timestamp=now,
            ),
            AuditLog(
                id=str(uuid.uuid4()),
                action="EMERGENCY_STATUS_UPDATED",
                performed_by_id="u-fa-disp",
                details="Incident INC-2026-FA01 updated for AMB-ASSIGNED",
                timestamp=now,
            ),
            AuditLog(
                id=str(uuid.uuid4()),
                action="EMERGENCY_STATUS_UPDATED",
                performed_by_id="u-fa-disp",
                details="Incident INC-2026-FA02 updated for HOSP-A2",
                timestamp=now,
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


def test_driver_cannot_act_on_unassigned_or_other_driver_vehicle(client: TestClient):
    drv1_hdrs = _login(client, "drv1.fa@aetis.gov", "Driver@123", "driver")

    # 1. Unassigned vehicle telemetry via REST -> 403
    r_unassigned = client.post(
        "/api/v1/tracking/update-location",
        headers=drv1_hdrs,
        json={
            "vehicle_id": "AMB-UNASSIGNED",
            "emergency_id": "EMG-FA-UNASSIGNED",
            "latitude": 12.9716,
            "longitude": 77.5945,
            "speed": 40.0,
            "heading": 90.0,
            "timestamp": time.time(),
        },
    )
    assert r_unassigned.status_code == 403

    # 2. Unassigned vehicle emergency status update -> 403
    r_emg_unassigned = client.patch(
        "/api/v1/emergencies/EMG-FA-UNASSIGNED/status",
        headers=drv1_hdrs,
        json={"status": "IN_TRANSIT"},
    )
    assert r_emg_unassigned.status_code == 403

    # 3. Other driver cannot submit telemetry or status update for AMB-ASSIGNED -> 403
    drv2_hdrs = _login(client, "drv2.fa@aetis.gov", "Driver@123", "driver")
    r_other = client.post(
        "/api/v1/tracking/update-location",
        headers=drv2_hdrs,
        json={
            "vehicle_id": "AMB-ASSIGNED",
            "emergency_id": "EMG-FA-1",
            "latitude": 12.9716,
            "longitude": 77.5945,
            "speed": 40.0,
            "heading": 90.0,
            "timestamp": time.time(),
        },
    )
    assert r_other.status_code == 403

    # 4. WebSocket rejects unassigned vehicle for driver
    drv1_tok, _, _ = create_access_token(
        {"sub": "drv1.fa@aetis.gov", "user_id": "u-fa-drv1", "email": "drv1.fa@aetis.gov", "role": "DRIVER"}
    )
    with client.websocket_connect(f"/ws?token={drv1_tok}") as ws:
        ws.receive_json()
        ws.send_json(
            {
                "type": "tracking:update_location",
                "data": {
                    "vehicle_id": "AMB-UNASSIGNED",
                    "emergency_id": "EMG-FA-UNASSIGNED",
                    "latitude": 12.9716,
                    "longitude": 77.5945,
                    "speed": 40.0,
                    "heading": 90.0,
                    "timestamp": time.time(),
                },
            }
        )
        err = ws.receive_json()
        assert err["type"] == "error"
        assert err["data"]["code"] == "FORBIDDEN"

    # 5. Legitimate driver telemetry & dispatcher override still work
    drv1_hdrs = _login(client, "drv1.fa@aetis.gov", "Driver@123", "driver")
    ok_drv = client.post(
        "/api/v1/tracking/update-location",
        headers=drv1_hdrs,
        json={
            "vehicle_id": "AMB-ASSIGNED",
            "emergency_id": "EMG-FA-1",
            "latitude": 12.9716,
            "longitude": 77.5945,
            "speed": 50.0,
            "heading": 90.0,
            "timestamp": time.time(),
        },
    )
    assert ok_drv.status_code == 200

    disp_hdrs = _login(client, "disp.fa@aetis.gov", "Dispatch@123", "dispatcher")
    ok_disp = client.patch(
        "/api/v1/emergencies/EMG-FA-UNASSIGNED/status",
        headers=disp_hdrs,
        json={"status": "IN_TRANSIT"},
    )
    assert ok_disp.status_code == 200


def test_role_scoped_notifications_and_hospital_facility_scoping(client: TestClient):
    # Notification scoping:
    _login(client, "drv1.fa@aetis.gov", "Driver@123", "driver")
    drv_msgs = [n["message"] for n in client.get("/api/v1/notifications").json()["items"]]
    assert any("INC-2026-FA01" in m for m in drv_msgs)
    assert not any("sec@aetis.gov" in m for m in drv_msgs)
    assert not any("CAM-1" in m for m in drv_msgs)
    assert not any("INC-2026-FA02" in m for m in drv_msgs)

    _login(client, "hosp1.fa@aetis.gov", "Hosp@123", "hospital")
    hosp1_msgs = [n["message"] for n in client.get("/api/v1/notifications").json()["items"]]
    assert any("INC-2026-FA01" in m for m in hosp1_msgs)
    assert not any("sec@aetis.gov" in m for m in hosp1_msgs)
    assert not any("INC-2026-FA02" in m for m in hosp1_msgs)

    _login(client, "disp.fa@aetis.gov", "Dispatch@123", "dispatcher")
    disp_msgs = [n["message"] for n in client.get("/api/v1/notifications").json()["items"]]
    assert not any("sec@aetis.gov" in m for m in disp_msgs)
    assert any("INC-2026-FA01" in m for m in disp_msgs)

    _login(client, "admin.fa@aetis.gov", "Admin@123", "admin")
    admin_msgs = [n["message"] for n in client.get("/api/v1/notifications").json()["items"]]
    assert any("sec@aetis.gov" in m for m in admin_msgs)

    # Hospital facility scoping on /tracking/* and /signals/corridor/*
    _login(client, "hosp2.fa@aetis.gov", "Hosp@123", "hospital")
    assert client.get("/api/v1/tracking/emergency/EMG-FA-1").status_code == 403
    assert client.get("/api/v1/tracking/vehicle/AMB-ASSIGNED").status_code == 403
    assert client.get("/api/v1/signals/corridor/EMG-FA-1").status_code == 403
    active_h2 = client.get("/api/v1/tracking/active").json()
    assert all(ev["emergencyId"] != "EMG-FA-1" for ev in active_h2)

    # Legitimate HOSP-A1, DRIVER-1, DISPATCHER access succeeds
    _login(client, "hosp1.fa@aetis.gov", "Hosp@123", "hospital")
    assert client.get("/api/v1/tracking/emergency/EMG-FA-1").status_code == 200
    assert client.get("/api/v1/tracking/vehicle/AMB-ASSIGNED").status_code == 200
    assert client.get("/api/v1/signals/corridor/EMG-FA-1").status_code == 200
    assert len(client.get("/api/v1/tracking/active").json()) == 1

    _login(client, "drv1.fa@aetis.gov", "Driver@123", "driver")
    assert client.get("/api/v1/signals/corridor/EMG-FA-1").status_code == 200

    # Direct bcrypt hashing works cleanly without passlib
    hashed = get_password_hash("VerifyBcrypt123!")
    assert verify_password("VerifyBcrypt123!", hashed) is True
