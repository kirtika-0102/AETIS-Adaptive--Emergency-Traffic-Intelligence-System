"""
Batch 3 Regression Suite:
AETIS-001 (auto-expiry), AETIS-002 (clearance stage machine), AETIS-003 (heading & priority arbitration),
AETIS-004 (two-leg TO_SCENE -> ARRIVED -> TO_HOSPITAL), AETIS-005 (camera arming), BE-004 (telemetry auto-preemption).
"""

import asyncio
from datetime import datetime, timedelta, timezone
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.main import app
from app.models.camera import Camera
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.preemption_service import expire_due_preemptions, trigger_green_wave
from app.services.routing_service import get_signals_along_corridor
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
    db.add(
        Hospital(
            id="HOSP-B3",
            name="B3 Trauma Hospital",
            address="100 Ring Road",
            latitude=12.9730,
            longitude=77.6150,
            contact_phone="+91-80-9999-0000",
            trauma_level=1,
            available_beds=12,
        )
    )
    db.flush()

    db.add_all(
        [
            User(
                id="u-b3-disp",
                email="disp.b3@aetis.gov",
                password_hash=get_password_hash("Dispatch@123"),
                full_name="B3 Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            User(
                id="u-b3-drv",
                email="drv.b3@aetis.gov",
                password_hash=get_password_hash("Driver@123"),
                full_name="B3 Driver",
                role="DRIVER",
                is_active=True,
            ),
            TrafficSignal(
                id="SIG-B3-FWD",
                name="Forward Junction",
                latitude=12.9718,
                longitude=77.5965,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
            TrafficSignal(
                id="SIG-B3-BACK",
                name="Behind Vehicle Junction",
                latitude=12.9710,
                longitude=77.5850,
                current_phase=SignalPhase.RED.value,
                normal_cycle_seconds=60,
                is_preempted=False,
            ),
            Camera(
                id="CAM-B3",
                name="B3 Eastbound Cam",
                latitude=12.9718,
                longitude=77.5966,
                stream_url="rtsp://cam.local/b3",
                connected_signal_id="SIG-B3-FWD",
                view_heading=90,
                status="ONLINE",
            ),
            Vehicle(
                id="AMB-B3",
                call_sign="AMB-B3",
                label="B3 Ambulance",
                type="AMBULANCE",
                current_latitude=12.9715,
                current_longitude=77.5920,
                speed=54.0,
                heading=90.0,
                status="DISPATCHED",
                current_driver_id="u-b3-drv",
            ),
        ]
    )
    db.flush()
    db.add(
        Emergency(
            id="EMG-B3",
            incident_number="INC-2026-B301",
            title="Corridor Test Emergency",
            type="medical",
            severity="CRITICAL",
            pickup_latitude=12.9722,
            pickup_longitude=77.6020,
            pickup_address="Sector 14",
            destination_hospital_id="HOSP-B3",
            hospital_id="HOSP-B3",
            destination_lat=12.9730,
            destination_lng=77.6150,
            assigned_vehicle_id="AMB-B3",
            status="DISPATCHED",
            journey_leg="TO_SCENE",
        )
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


def test_aetis001_preemption_auto_expiry_and_aetis002_staged_clearance():
    db = TestingSessionLocal()
    sig = db.query(TrafficSignal).filter(TrafficSignal.id == "SIG-B3-FWD").first()
    assert sig is not None

    updated = asyncio.run(
        trigger_green_wave(
            db,
            signal_id="SIG-B3-FWD",
            vehicle_id="AMB-B3",
            hold_duration_seconds=30,
            staged_clearance=True,
        )
    )
    assert updated is not None
    assert updated.transition_state == "PREEMPTED"
    assert updated.current_phase == "GREEN"

    # Simulate overdue preemption_end_time
    updated.preemption_end_time = datetime.now(timezone.utc) - timedelta(seconds=5)
    db.commit()

    expired = asyncio.run(expire_due_preemptions(db))
    assert len(expired) == 1
    assert expired[0].id == "SIG-B3-FWD"
    assert expired[0].is_preempted is False
    assert expired[0].transition_state == "NORMAL"
    assert expired[0].current_phase == "RED"
    db.close()


def test_aetis003_heading_alignment_excludes_behind_signal():
    db = TestingSessionLocal()
    # Heading East (90 deg) towards destination excludes SIG-B3-BACK (West)
    fwd = get_signals_along_corridor(
        db=db,
        origin_lat=12.9715,
        origin_lng=77.5920,
        dest_lat=12.9730,
        dest_lng=77.6150,
        corridor_width_meters=250.0,
        heading=90.0,
    )
    ids = [s.id for s in fwd]
    assert "SIG-B3-FWD" in ids
    assert "SIG-B3-BACK" not in ids

    # Heading West (270 deg) away from SIG-B3-FWD filters it out
    opp = get_signals_along_corridor(
        db=db,
        origin_lat=12.9715,
        origin_lng=77.5920,
        dest_lat=12.9730,
        dest_lng=77.6150,
        corridor_width_meters=250.0,
        heading=270.0,
    )
    assert "SIG-B3-FWD" not in [s.id for s in opp]
    db.close()


def test_be004_telemetry_auto_preemption_and_aetis004_two_leg_hospital_transition(client: TestClient):
    drv_hdrs = _login(client, "drv.b3@aetis.gov", "Driver@123", "driver")

    # Start trip -> IN_TRANSIT
    assert (
        client.patch(
            "/api/v1/emergencies/EMG-B3/status",
            headers=drv_hdrs,
            json={"status": "IN_TRANSIT"},
        ).status_code
        == 200
    )

    # Report telemetry approaching SIG-B3-FWD (approx 450m away at 60 km/h) -> triggers BE-004 preemption
    tel_res = client.post(
        "/api/v1/tracking/update-location",
        headers=drv_hdrs,
        json={
            "vehicle_id": "AMB-B3",
            "emergency_id": "EMG-B3",
            "latitude": 12.9717,
            "longitude": 77.5940,
            "speed": 60.0,
            "heading": 85.0,
            "timestamp": time.time(),
            "hospital_id": "HOSP-B3",
        },
    )
    assert tel_res.status_code == 200, tel_res.text
    assert "SIG-B3-FWD" in tel_res.json()["preempted_signal_ids"]

    # Arrive at scene -> leg transitions from TO_SCENE to TO_HOSPITAL
    arr_res = client.patch(
        "/api/v1/emergencies/EMG-B3/status",
        headers=drv_hdrs,
        json={"status": "ARRIVED"},
    )
    assert arr_res.status_code == 200
    assert arr_res.json()["journey_leg"] == "TO_HOSPITAL"


def test_aetis005_camera_arm_and_disarm_endpoints(client: TestClient):
    disp_hdrs = _login(client, "disp.b3@aetis.gov", "Dispatch@123", "dispatcher")
    arm = client.post(
        "/api/v1/cameras/CAM-B3/arm",
        headers=disp_hdrs,
        json={"emergency_id": "EMG-B3"},
    )
    assert arm.status_code == 200
    assert arm.json()["is_armed"] is True
    assert arm.json()["armed_emergency_id"] == "EMG-B3"

    disarm = client.delete("/api/v1/cameras/CAM-B3/arm", headers=disp_hdrs)
    assert disarm.status_code == 200
    assert disarm.json()["is_armed"] is False
