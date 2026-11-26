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
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    db.add_all(
        [
            User(
                id="usr-disp-trk",
                email="disp.trk@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="Tracking Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            User(
                id="usr-driv-trk",
                email="driv.trk@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="Tracking Driver",
                role="DRIVER",
                is_active=True,
            ),
            Hospital(
                id="HOSP-TEST-A",
                name="Test General Hospital",
                address="100 Test Road",
                latitude=12.9780,
                longitude=77.6000,
                contact_phone="+91-80-3333-4444",
                trauma_level=1,
                available_beds=10,
            ),
        ]
    )
    db.flush()

    db.add(
        User(
            id="usr-hosp-trk",
            email="hosp.trk@aetis.gov",
            password_hash=get_password_hash("password123"),
            full_name="Hospital Staff",
            role="HOSPITAL",
            hospital_id="HOSP-TEST-A",
            is_active=True,
        )
    )

    veh = Vehicle(
        id="EV-TEST-01",
        label="Ambulance Test 1",
        type="AMBULANCE",
        current_latitude=12.9700,
        current_longitude=77.5900,
        speed=0.0,
        heading=0.0,
        status="DISPATCHED",
        current_driver_id="usr-driv-trk",
    )
    db.add(veh)
    db.flush()

    emg = Emergency(
        id="EMG-TEST-100",
        assigned_vehicle_id="EV-TEST-01",
        hospital_id="HOSP-TEST-A",
        hospital_name="Test General Hospital",
        status="IN_TRANSIT",
        severity="CRITICAL",
        destination_lat=12.9780,
        destination_lng=77.6000,
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


def _token(email: str, user_id: str, role: str) -> str:
    t, _, _ = create_access_token({"sub": email, "user_id": user_id, "email": email, "role": role})
    return t


def test_websocket_gps_telemetry_ingestion_and_broadcast(client):
    disp_token = _token("disp.trk@aetis.gov", "usr-disp-trk", "DISPATCHER")
    hosp_token = _token("hosp.trk@aetis.gov", "usr-hosp-trk", "HOSPITAL")
    driv_token = _token("driv.trk@aetis.gov", "usr-driv-trk", "DRIVER")

    with client.websocket_connect(f"/ws?token={disp_token}") as ws_dispatcher:
        ws_dispatcher.receive_json()

        with client.websocket_connect(f"/ws?token={hosp_token}&hospital_id=HOSP-TEST-A") as ws_hospital:
            ws_hospital.receive_json()

            with client.websocket_connect(f"/ws?token={driv_token}&emergency_id=EMG-TEST-100") as ws_driver:
                ws_driver.receive_json()

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

                driver_broadcast = ws_driver.receive_json()
                assert driver_broadcast["type"] == "tracking:location_update"
                assert driver_broadcast["data"]["latitude"] == 12.9735
                assert driver_broadcast["data"]["speed"] == 55.0

                dispatcher_broadcast = ws_dispatcher.receive_json()
                assert dispatcher_broadcast["type"] == "tracking:location_update"
                assert dispatcher_broadcast["data"]["vehicle_id"] == "EV-TEST-01"

                hospital_broadcast = ws_hospital.receive_json()
                assert hospital_broadcast["type"] in ["tracking:eta_update", "inbound.eta"]
                assert hospital_broadcast["data"]["hospital_id"] == "HOSP-TEST-A"
                assert "eta_seconds" in hospital_broadcast["data"]

    db = TestingSessionLocal()
    vehicle = db.query(Vehicle).filter(Vehicle.id == "EV-TEST-01").first()
    assert vehicle is not None
    assert vehicle.current_latitude == 12.9735
    assert vehicle.current_longitude == 77.5935
    assert vehicle.speed == 55.0
    assert vehicle.heading == 45.0
    db.close()


def test_rest_fallback_update_location_endpoint(client):
    disp_token = _token("disp.trk@aetis.gov", "usr-disp-trk", "DISPATCHER")
    driv_token = _token("driv.trk@aetis.gov", "usr-driv-trk", "DRIVER")

    with client.websocket_connect(f"/ws?token={disp_token}") as ws_dispatcher:
        ws_dispatcher.receive_json()

        post_payload = {
            "vehicle_id": "EV-TEST-01",
            "emergency_id": "EMG-TEST-100",
            "latitude": 12.9750,
            "longitude": 77.5960,
            "speed": 62.5,
            "heading": 120.0,
            "timestamp": 1700000005.0,
        }
        res = client.post(
            "/api/v1/tracking/update-location",
            json=post_payload,
            headers={"Authorization": f"Bearer {driv_token}"},
        )
        assert res.status_code == 200
        res_data = res.json()
        assert res_data["status"] == "success"
        assert res_data["vehicle_id"] == "EV-TEST-01"
        assert res_data["current_latitude"] == 12.9750
        assert res_data["destination_hospital_id"] == "HOSP-TEST-A"

        disp_msg = ws_dispatcher.receive_json()
        assert disp_msg["type"] == "tracking:location_update"
        assert disp_msg["data"]["latitude"] == 12.9750
        assert disp_msg["data"]["speed"] == 62.5

    v_res = client.get(
        "/api/v1/tracking/vehicle/EV-TEST-01",
        headers={"Authorization": f"Bearer {disp_token}"},
    )
    assert v_res.status_code == 200
    assert v_res.json()["latitude"] == 12.9750
    assert v_res.json()["speed"] == 62.5
