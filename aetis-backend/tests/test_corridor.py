import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.emergency import Emergency
from app.models.signal import SignalPhase, TrafficSignal
from app.models.vehicle import Vehicle
from app.services.preemption_service import calculate_queue_dissipation, trigger_green_wave
from app.services.routing_service import get_signals_along_corridor, haversine_distance
from app.services.websocket_manager import manager

# Shared in-memory SQLite database
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    # Seed 3 sequential signals along a corridor
    # SIG-A is at (12.9716, 77.5946)
    # SIG-B is at (12.9725, 77.6075) (~1.4 km east)
    # SIG-C is off-corridor at (12.9900, 77.5946) (~2 km north)
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

    # Seed vehicle and emergency
    veh = Vehicle(
        id="EV-TEST-99",
        label="Rapid Ambulance 99",
        type="ambulance",
        current_latitude=12.9714,
        current_longitude=77.5920,
        speed=54.0,
        heading=90.0,
        status="en_route",
    )
    emg = Emergency(
        id="EMG-TEST-99",
        assigned_vehicle_id="EV-TEST-99",
        hospital_id="HOSP-EAST",
        status="en_route",
        destination_lat=12.9730,
        destination_lng=77.6150,
    )
    db.add(veh)
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


def test_haversine_distance():
    # Distance between MG Road (12.9716, 77.5946) and Brigade Road (12.9725, 77.6075) is ~1400m
    dist = haversine_distance(12.9716, 77.5946, 12.9725, 77.6075)
    assert 1380 < dist < 1430

    # Distance to identical point is 0
    assert haversine_distance(12.9716, 77.5946, 12.9716, 77.5946) == 0.0


def test_corridor_filtering_and_ordering():
    db = TestingSessionLocal()
    # Route corridor from (12.9710, 77.5920) east to (12.9730, 77.6150)
    corridor = get_signals_along_corridor(
        db=db,
        origin_lat=12.9710,
        origin_lng=77.5920,
        dest_lat=12.9730,
        dest_lng=77.6150,
        corridor_width_meters=150.0,
    )

    # Should find SIG-A and SIG-B, but NOT SIG-C (off-corridor north)
    signal_ids = [s.id for s in corridor]
    assert "SIG-A" in signal_ids
    assert "SIG-B" in signal_ids
    assert "SIG-C" not in signal_ids

    # Should be sorted in order of proximity to origin
    assert signal_ids[0] == "SIG-A"
    assert signal_ids[1] == "SIG-B"
    db.close()


def test_predictive_queue_dissipation_math():
    # 5 queued cars: clear_time = (5 * 2.0) + 15.0 = 25s; threshold = 25 + 5 = 30s
    speed_mps = 15.0  # 54 km/h

    # Case 1: Distance = 300m -> ETA = 300 / 15 = 20s <= 30s -> Preemption TRIGGERED
    timing_trigger = calculate_queue_dissipation(distance_to_signal=300.0, speed_mps=speed_mps, queue_count=5)
    assert timing_trigger["queue_clear_time"] == 25.0
    assert timing_trigger["trigger_threshold_seconds"] == 30.0
    assert timing_trigger["vehicle_eta_seconds"] == 20.0
    assert timing_trigger["should_trigger_preemption"] is True

    # Case 2: Distance = 750m -> ETA = 750 / 15 = 50s > 30s -> Preemption NOT triggered yet
    timing_hold = calculate_queue_dissipation(distance_to_signal=750.0, speed_mps=speed_mps, queue_count=5)
    assert timing_hold["vehicle_eta_seconds"] == 50.0
    assert timing_hold["should_trigger_preemption"] is False


def test_trigger_green_wave_state_and_broadcasting():
    db = TestingSessionLocal()
    client = TestClient(app)

    # Connect WebSocket listeners to signals and dispatchers rooms
    with client.websocket_connect("/ws?client_type=dispatcher") as ws_disp:
        ws_disp.receive_json()  # init greeting

        # Trigger green wave on SIG-A
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

        # Dispatcher must receive preemption event and phase change
        disp_events = []
        for _ in range(2):
            disp_events.append(ws_disp.receive_json())

        event_types = [e["type"] for e in disp_events]
        assert "signal:phase_changed" in event_types
        assert "signal:preemption_triggered" in event_types

    db.close()


def test_evaluate_corridor_endpoint(client):
    with client.websocket_connect("/ws?client_type=dispatcher") as ws_disp:
        ws_disp.receive_json()

        # Vehicle is at (12.9715, 77.5930), ~170m from SIG-A (12.9716, 77.5946)
        # At 54 km/h (15 m/s), ETA is ~11.3s <= 30s threshold -> should trigger green wave on SIG-A
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
        res = client.post("/api/v1/signals/evaluate-corridor", json=eval_payload)
        assert res.status_code == 200
        data = res.json()

        assert data["vehicle_id"] == "EV-TEST-99"
        assert data["evaluated_signals_count"] >= 2
        assert data["preemption_triggered"] is True
        assert data["preempted_signal_id"] == "SIG-A"
        assert data["next_signal_id"] == "SIG-A"
        assert data["vehicle_eta_seconds"] < data["trigger_threshold_seconds"]

        # Verify dispatcher received real-time WebSocket event
        event = ws_disp.receive_json()
        assert event["type"] in ["signal:phase_changed", "signal:preemption_triggered"]
