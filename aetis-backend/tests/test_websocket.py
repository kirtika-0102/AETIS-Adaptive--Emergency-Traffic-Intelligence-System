import asyncio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.hospital import Hospital
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
def setup_isolated_ws_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    db.add(
        Hospital(
            id="HOSP-CITY",
            name="City Hospital",
            address="Main Road",
            latitude=12.97,
            longitude=77.59,
            contact_phone="+91-80-1234-5678",
            trauma_level=1,
            available_beds=5,
        )
    )
    db.add(
        Hospital(
            id="HOSP-99",
            name="Metro Trauma 99",
            address="Ring Road",
            latitude=12.98,
            longitude=77.60,
            contact_phone="+91-80-8765-4321",
            trauma_level=1,
            available_beds=5,
        )
    )
    db.flush()
    db.add_all(
        [
            User(
                id="ws-disp",
                email="ws.disp@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="WS Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            User(
                id="ws-driv",
                email="ws.driv@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="WS Driver",
                role="DRIVER",
                is_active=True,
            ),
            User(
                id="ws-hosp-city",
                email="ws.hosp@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="WS Hospital",
                role="HOSPITAL",
                hospital_id="HOSP-CITY",
                is_active=True,
            ),
            User(
                id="ws-hosp-99",
                email="ws.hosp99@aetis.gov",
                password_hash=get_password_hash("password123"),
                full_name="WS Hospital 99",
                role="HOSPITAL",
                hospital_id="HOSP-99",
                is_active=True,
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


def _tok(email: str, uid: str, role: str) -> str:
    t, _, _ = create_access_token({"sub": email, "user_id": uid, "email": email, "role": role})
    return t


def test_dispatcher_websocket_connection_and_heartbeat(client):
    token = _tok("ws.disp@aetis.gov", "ws-disp", "DISPATCHER")
    with client.websocket_connect(f"/ws?token={token}") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "dispatchers" in init_data["data"]["rooms"]
        assert "signals" in init_data["data"]["rooms"]

        assert manager.get_room_clients_count("dispatchers") == 1
        assert manager.get_room_clients_count("signals") == 1

        ws.send_json({"type": "ping"})
        pong_data = ws.receive_json()
        assert pong_data["type"] == "pong"
        assert "timestamp" in pong_data["data"]

    assert manager.get_room_clients_count("dispatchers") == 0
    assert manager.get_room_clients_count("signals") == 0


def test_driver_websocket_connection_rooms(client):
    token = _tok("ws.driv@aetis.gov", "ws-driv", "DRIVER")
    with client.websocket_connect(f"/ws?token={token}&emergency_id=EMG-5001") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "signals" in init_data["data"]["rooms"]
        assert "emergency:EMG-5001" in init_data["data"]["rooms"]
        assert "dispatchers" not in init_data["data"]["rooms"]

        assert manager.get_room_clients_count("emergency:EMG-5001") == 1
        assert manager.get_room_clients_count("signals") == 1


def test_hospital_websocket_connection_rooms(client):
    token = _tok("ws.hosp@aetis.gov", "ws-hosp-city", "HOSPITAL")
    with client.websocket_connect(f"/ws?token={token}&hospital_id=HOSP-CITY") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "hospital:HOSP-CITY" in init_data["data"]["rooms"]
        assert manager.get_room_clients_count("hospital:HOSP-CITY") == 1


def test_room_based_broadcasting(client):
    disp_token = _tok("ws.disp@aetis.gov", "ws-disp", "DISPATCHER")
    hosp_token = _tok("ws.hosp99@aetis.gov", "ws-hosp-99", "HOSPITAL")

    with client.websocket_connect(f"/ws?token={disp_token}") as ws_disp:
        ws_disp.receive_json()

        with client.websocket_connect(f"/ws?token={hosp_token}&hospital_id=HOSP-99") as ws_hosp:
            ws_hosp.receive_json()

            asyncio.run(
                manager.broadcast_to_room(
                    "dispatchers",
                    "emergency.updated",
                    {"id": "EMG-701", "severity": "CRITICAL"},
                )
            )
            disp_msg = ws_disp.receive_json()
            assert disp_msg["type"] == "emergency.updated"
            assert disp_msg["data"]["id"] == "EMG-701"

            asyncio.run(
                manager.broadcast_to_room(
                    "hospital:HOSP-99",
                    "inbound.eta",
                    {"emergency_id": "EMG-701", "eta_seconds": 180},
                )
            )
            hosp_msg = ws_hosp.receive_json()
            assert hosp_msg["type"] == "inbound.eta"
            assert hosp_msg["data"]["eta_seconds"] == 180


def test_dynamic_subscribe_and_unsubscribe(client):
    driv_token = _tok("ws.driv@aetis.gov", "ws-driv", "DRIVER")
    with client.websocket_connect(f"/ws?token={driv_token}") as ws:
        ws.receive_json()

        ws.send_json({"type": "subscribe", "room": "custom:zone-north"})
        sub_ack = ws.receive_json()
        assert sub_ack["type"] == "room.subscribed"
        assert sub_ack["data"]["room"] == "custom:zone-north"
        assert manager.get_room_clients_count("custom:zone-north") == 1

        asyncio.run(
            manager.broadcast_to_room(
                "custom:zone-north",
                "weather.alert",
                {"condition": "HEAVY_RAIN"},
            )
        )
        msg = ws.receive_json()
        assert msg["type"] == "weather.alert"
        assert msg["data"]["condition"] == "HEAVY_RAIN"

        ws.send_json({"type": "unsubscribe", "room": "custom:zone-north"})
        unsub_ack = ws.receive_json()
        assert unsub_ack["type"] == "room.unsubscribed"
        assert manager.get_room_clients_count("custom:zone-north") == 0


def test_ws_stats_endpoint(client):
    disp_token = _tok("ws.disp@aetis.gov", "ws-disp", "DISPATCHER")
    headers = {"Authorization": f"Bearer {disp_token}"}

    stats_res = client.get("/api/v1/ws/stats", headers=headers)
    assert stats_res.status_code == 200
    assert stats_res.json()["total_active_subscriptions"] == 0

    with client.websocket_connect(f"/ws?token={disp_token}") as ws:
        ws.receive_json()
        stats_active = client.get("/api/v1/ws/stats", headers=headers)
        assert stats_active.status_code == 200
        assert stats_active.json()["total_active_subscriptions"] == 2
        assert "dispatchers" in stats_active.json()["rooms"]
        assert "signals" in stats_active.json()["rooms"]
