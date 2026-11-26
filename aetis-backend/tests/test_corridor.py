import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.emergency import Emergency
from app.models.hospital import Hospital
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.preemption_service import calculate_queue_dissipation, trigger_green_wave
from app.services.routing_service import get_signals_along_corridor
from app.services.websocket_manager import manager
from app.utils.geo import haversine_distance

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
            id="usr-disp-corr",
            email="disp.corr@aetis.gov",
            password_hash=get_password_hash("password123"),
            full_name="Corridor Dispatcher",
            role="DISPATCHER",
            is_active=True,
        )
    )
    db.add(
        Hospital(
            id="HOSP-EAST",
            name="Eastside Trauma Hospital",
            address="100 East Blvd",
            latitude=12.9730,
            longitude=77.6150,
            contact_phone="+91-80-1111-2222",
            trauma_level=1,
            available_beds=10,
        )
    )
    db.flush()

    sig_a = TrafficSignal(
        id="SIG-A",
        name="Corridor Junction 1",
        latitude=12.9716,
        longitude=77.5946,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    sig_b = TrafficSignal(
        id="SIG-B",
        name="Corridor Junction 2",
        latitude=12.9725,
        longitude=77.6075,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    sig_c = TrafficSignal(
        id="SIG-C",
        name="Off Corridor Junction",
        latitude=12.9900,
        longitude=77.5946,
        current_phase=SignalPhase.RED.value,
        normal_cycle_seconds=60,
        is_preempted=False,
    )
    db.add_all([sig_a, sig_b, sig_c])

    veh = Vehicle(
        id="EV-TEST-99",
        label="Rapid Ambulance 99",
        type="AMBULANCE",
        current_latitude=12.9714,
        current_longitude=77.5920,
        speed=54.0,
        heading=90.0,
        status="EN_ROUTE",
    )
    db.add(veh)
    db.flush()

    emg = Emergency(
        id="EMG-TEST-99",
        assigned_vehicle_id="EV-TEST-99",
        hospital_id="HOSP-EAST",
        status="IN_TRANSIT",
        destination_lat=12.9730,
        destination_lng=77.6150,
    )
    db.add(emg)
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


def _dispatcher_token() -> str:
    token, _, _ = create_access_token(
        {
            "sub": "disp.corr@aetis.gov",
            "user_id": "usr-disp-corr",
            "email": "disp.corr@aetis.gov",
            "role": "DISPATCHER",
        }
    )
    return token


def test_haversine_distance():
    dist = haversine_distance(12.9716, 77.5946, 12.9725, 77.6075)
    assert 1380 < dist < 1430
    assert haversine_distance(12.9716, 77.5946, 12.9716, 77.5946) == 0.0


def test_corridor_filtering_and_ordering():
    db = TestingSessionLocal()
    corridor = get_signals_along_corridor(
        db=db,
        origin_lat=12.9710,
        origin_lng=77.5920,
        dest_lat=12.9730,
        dest_lng=77.6150,
        corridor_width_meters=150.0,
    )
    signal_ids = [s.id for s in corridor]
    assert "SIG-A" in signal_ids
    assert "SIG-B" in signal_ids
    assert "SIG-C" not in signal_ids
    assert signal_ids[0] == "SIG-A"
    assert signal_ids[1] == "SIG-B"
    db.close()


def test_predictive_queue_dissipation_math():
    speed_mps = 15.0
    timing_trigger = calculate_queue_dissipation(distance_to_signal=300.0, speed_mps=speed_mps, queue_count=5)
    assert timing_trigger["queue_clear_time"] == 25.0
    assert timing_trigger["trigger_threshold_seconds"] == 30.0
    assert timing_trigger["vehicle_eta_seconds"] == 20.0
    assert timing_trigger["should_trigger_preemption"] is True

    timing_hold = calculate_queue_dissipation(distance_to_signal=750.0, speed_mps=speed_mps, queue_count=5)
    assert timing_hold["vehicle_eta_seconds"] == 50.0
    assert timing_hold["should_trigger_preemption"] is False


def test_trigger_green_wave_state_and_broadcasting(client):
    db = TestingSessionLocal()
    token = _dispatcher_token()
    with client.websocket_connect(f"/ws?token={token}") as ws_disp:
        ws_disp.receive_json()

        updated_signal = asyncio.run(
            trigger_green_wave(
                db=db,
                signal_id="SIG-A",
                vehicle_id="EV-TEST-99",
                hold_duration_seconds=40,
            )
        )
        assert updated_signal is not None
        assert updated_signal.current_phase == "GREEN"
        assert updated_signal.is_preempted is True
        assert updated_signal.preempted_by_vehicle_id == "EV-TEST-99"

        disp_events = [ws_disp.receive_json() for _ in range(2)]
        event_types = [e["type"] for e in disp_events]
        assert "signal:phase_changed" in event_types
        assert "signal:preemption_triggered" in event_types

    db.close()


def test_evaluate_corridor_endpoint(client):
    token = _dispatcher_token()
    headers = {"Authorization": f"Bearer {token}"}
    with client.websocket_connect(f"/ws?token={token}") as ws_disp:
        ws_disp.receive_json()

        eval_payload = {
            "vehicle_id": "EV-TEST-99",
            "current_latitude": 12.9715,
            "current_longitude": 77.5930,
            "speed_kmh": 54.0,
            "destination_latitude": 12.9730,
            "destination_longitude": 77.6150,
            "queue_count": 5,
            "hold_duration_seconds": 45,
        }
        res = client.post("/api/v1/signals/evaluate-corridor", json=eval_payload, headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert data["vehicle_id"] == "EV-TEST-99"
        assert data["evaluated_signals_count"] >= 2
        assert data["preemption_triggered"] is True
        assert data["preempted_signal_id"] == "SIG-A"
        assert data["next_signal_id"] == "SIG-A"
        assert data["vehicle_eta_seconds"] < data["trigger_threshold_seconds"]

        event = ws_disp.receive_json()
        assert event["type"] in ["signal:phase_changed", "signal:preemption_triggered"]
