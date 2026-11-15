import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.emergency import Emergency
from app.models.vehicle import Vehicle
from app.services.websocket_manager import manager

# Use in-memory SQLite with StaticPool so all threads/sessions share the database
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
    # Seed vehicle and emergency
    veh = Vehicle(
        id="EV-TEST-01",
        label="Ambulance Test 1",
        type="ambulance",
        current_latitude=12.9700,
        current_longitude=77.5900,
        speed=0.0,
        heading=0.0,
        status="dispatched",
    )
    emg = Emergency(
        id="EMG-TEST-100",
        assigned_vehicle_id="EV-TEST-01",
        hospital_id="HOSP-TEST-A",
        hospital_name="Test General Hospital",
        status="en_route",
        severity="CRITICAL",
        destination_lat=12.9780,
        destination_lng=77.6000,
    )
    db.add(veh)
    db.add(emg)
    db.commit()
    db.close()

    # Clear manager rooms
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


def test_websocket_gps_telemetry_ingestion_and_broadcast(client):
    # Connect Dispatcher
    with client.websocket_connect("/ws?client_type=dispatcher") as ws_dispatcher:
        ws_dispatcher.receive_json()  # connection.established

        # Connect Hospital
        with client.websocket_connect("/ws?client_type=hospital&hospital_id=HOSP-TEST-A") as ws_hospital:
            ws_hospital.receive_json()  # connection.established

            # Connect Driver
            with client.websocket_connect("/ws?client_type=driver&emergency_id=EMG-TEST-100") as ws_driver:
                ws_driver.receive_json()  # connection.established

                # Driver emits high-frequency GPS location update
                telemetry_message = {
                    "type": "tracking:update_location",
                    "data": {
                        "vehicle_id": "EV-TEST-01",
                        "emergency_id": "EMG-TEST-100",
                        "latitude": 12.9735,
                        "longitude": 77.5935,
                        "speed": 55.0,
                        "heading": 45.0,
                        "timestamp": 1700000000.0,
                    },
                }
                ws_driver.send_json(telemetry_message)

                # 1. Driver (in emergency:EMG-TEST-100 room) receives location broadcast
                driver_broadcast = ws_driver.receive_json()
                assert driver_broadcast["type"] == "tracking:location_update"
                assert driver_broadcast["data"]["latitude"] == 12.9735
                assert driver_broadcast["data"]["speed"] == 55.0

                # 2. Dispatcher receives location broadcast
                dispatcher_broadcast = ws_dispatcher.receive_json()
                assert dispatcher_broadcast["type"] == "tracking:location_update"
                assert dispatcher_broadcast["data"]["vehicle_id"] == "EV-TEST-01"
                assert dispatcher_broadcast["data"]["latitude"] == 12.9735

                # 3. Hospital receives ETA update
                hospital_broadcast = ws_hospital.receive_json()
                assert hospital_broadcast["type"] in ["tracking:eta_update", "inbound.eta"]
                assert hospital_broadcast["data"]["hospital_id"] == "HOSP-TEST-A"
                assert "eta_seconds" in hospital_broadcast["data"]

    # 5. Check database persistence
    db = TestingSessionLocal()
    vehicle = db.query(Vehicle).filter(Vehicle.id == "EV-TEST-01").first()
    assert vehicle is not None
    assert vehicle.current_latitude == 12.9735
    assert vehicle.current_longitude == 77.5935
    assert vehicle.speed == 55.0
    assert vehicle.heading == 45.0
    db.close()


def test_rest_fallback_update_location_endpoint(client):
    # Connect Dispatcher to verify REST fallback triggers real-time broadcast
    with client.websocket_connect("/ws?client_type=dispatcher") as ws_dispatcher:
        ws_dispatcher.receive_json()  # init

        post_payload = {
            "vehicle_id": "EV-TEST-01",
            "emergency_id": "EMG-TEST-100",
            "latitude": 12.9750,
            "longitude": 77.5960,
            "speed": 62.5,
            "heading": 120.0,
            "timestamp": 1700000005.0,
        }
        res = client.post("/api/v1/tracking/update-location", json=post_payload)
        assert res.status_code == 200
        res_data = res.json()
        assert res_data["status"] == "success"
        assert res_data["vehicle_id"] == "EV-TEST-01"
        assert res_data["current_latitude"] == 12.9750
        assert res_data["destination_hospital_id"] == "HOSP-TEST-A"

        # Dispatcher must receive the live broadcast triggered by HTTP
        disp_msg = ws_dispatcher.receive_json()
        assert disp_msg["type"] == "tracking:location_update"
        assert disp_msg["data"]["latitude"] == 12.9750
        assert disp_msg["data"]["speed"] == 62.5

    # Check vehicle query endpoint
    v_res = client.get("/api/v1/tracking/vehicle/EV-TEST-01")
    assert v_res.status_code == 200
    assert v_res.json()["latitude"] == 12.9750
    assert v_res.json()["speed"] == 62.5
