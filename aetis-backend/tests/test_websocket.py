import asyncio
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.websocket_manager import manager


@pytest.fixture(autouse=True)
def clean_manager():
    # Clear all rooms before and after each test
    manager.active_rooms.clear()
    yield
    manager.active_rooms.clear()


def test_dispatcher_websocket_connection_and_heartbeat():
    client = TestClient(app)
    with client.websocket_connect("/ws?client_type=dispatcher") as ws:
        # 1. Connection established greeting
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "dispatchers" in init_data["data"]["rooms"]
        assert "signals" in init_data["data"]["rooms"]

        # Verify manager state
        assert manager.get_room_clients_count("dispatchers") == 1
        assert manager.get_room_clients_count("signals") == 1

        # 2. Heartbeat ping / pong
        ws.send_json({"type": "ping"})
        pong_data = ws.receive_json()
        assert pong_data["type"] == "pong"
        assert "timestamp" in pong_data["data"]

    # On exit, client should be removed from all rooms
    assert manager.get_room_clients_count("dispatchers") == 0
    assert manager.get_room_clients_count("signals") == 0


def test_driver_websocket_connection_rooms():
    client = TestClient(app)
    with client.websocket_connect("/ws?client_type=driver&emergency_id=EMG-5001") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "signals" in init_data["data"]["rooms"]
        assert "emergency:EMG-5001" in init_data["data"]["rooms"]

        assert manager.get_room_clients_count("emergency:EMG-5001") == 1
        assert manager.get_room_clients_count("signals") == 1


def test_hospital_websocket_connection_rooms():
    client = TestClient(app)
    with client.websocket_connect("/ws?client_type=hospital&hospital_id=HOSP-CITY") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "connection.established"
        assert "hospital:HOSP-CITY" in init_data["data"]["rooms"]

        assert manager.get_room_clients_count("hospital:HOSP-CITY") == 1


def test_room_based_broadcasting():
    client = TestClient(app)
    with client.websocket_connect("/ws?client_type=dispatcher") as ws_disp:
        # consume init
        ws_disp.receive_json()

        with client.websocket_connect("/ws?client_type=hospital&hospital_id=HOSP-99") as ws_hosp:
            # consume init
            ws_hosp.receive_json()

            # Broadcast to dispatchers room
            asyncio.run(
                manager.broadcast_to_room(
                    "dispatchers",
                    "emergency.updated",
                    {"id": "EMG-701", "severity": "CRITICAL"},
                )
            )

            # Dispatcher must receive the message
            disp_msg = ws_disp.receive_json()
            assert disp_msg["type"] == "emergency.updated"
            assert disp_msg["data"]["id"] == "EMG-701"

            # Broadcast to hospital room
            asyncio.run(
                manager.broadcast_to_room(
                    "hospital:HOSP-99",
                    "inbound.eta",
                    {"emergency_id": "EMG-701", "eta_seconds": 180},
                )
            )

            # Hospital must receive the message
            hosp_msg = ws_hosp.receive_json()
            assert hosp_msg["type"] == "inbound.eta"
            assert hosp_msg["data"]["eta_seconds"] == 180


def test_dynamic_subscribe_and_unsubscribe():
    client = TestClient(app)
    with client.websocket_connect("/ws?client_type=driver") as ws:
        ws.receive_json()  # init

        # Subscribe to custom room
        ws.send_json({"type": "subscribe", "room": "custom:zone-north"})
        sub_ack = ws.receive_json()
        assert sub_ack["type"] == "room.subscribed"
        assert sub_ack["data"]["room"] == "custom:zone-north"
        assert manager.get_room_clients_count("custom:zone-north") == 1

        # Broadcast to that custom room
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

        # Unsubscribe
        ws.send_json({"type": "unsubscribe", "room": "custom:zone-north"})
        unsub_ack = ws.receive_json()
        assert unsub_ack["type"] == "room.unsubscribed"
        assert manager.get_room_clients_count("custom:zone-north") == 0


def test_ws_stats_endpoint():
    client = TestClient(app)
    # When no sockets are connected
    stats_res = client.get("/api/v1/ws/stats")
    assert stats_res.status_code == 200
    assert stats_res.json()["total_active_subscriptions"] == 0

    with client.websocket_connect("/ws?client_type=dispatcher") as ws:
        ws.receive_json()
        stats_active = client.get("/api/v1/ws/stats")
        assert stats_active.status_code == 200
        assert stats_active.json()["total_active_subscriptions"] == 2
        assert "dispatchers" in stats_active.json()["rooms"]
        assert "signals" in stats_active.json()["rooms"]
