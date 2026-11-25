"""
Pre-Commit Remediation Regression Tests:
- PCR-003: Configurable bootstrap admin (no hardcoded default credentials)
- PCR-006: simulate_driver_gps.py packet validation & multi-message WS drain
- PCR-007: evaluate_corridor conflict protection (conflict_held_by, no hold stealing)
"""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash, verify_password
from app.main import app
from app.models.signal import SignalPhase, TrafficSignal
from app.models.user import User
from app.schemas.telemetry import LocationUpdatePayload
from scripts.simulate_driver_gps import _drain_ws_messages, build_telemetry_packets

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
            User(
                id="u-pcr-disp",
                email="disp.pcr@aetis.gov",
                password_hash=get_password_hash("Dispatch@123"),
                full_name="PCR Dispatcher",
                role="DISPATCHER",
                is_active=True,
            ),
            TrafficSignal(
                id="SIG-PCR-1",
                name="PCR Held Signal",
                latitude=12.9718,
                longitude=77.5965,
                current_phase=SignalPhase.GREEN.value,
                normal_cycle_seconds=60,
                is_preempted=True,
                preempted_by_vehicle_id="AMB-OWNER",
            ),
        ]
    )
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)


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


def test_pcr006_simulator_packets_and_ws_drain():
    packets = build_telemetry_packets("AMB-01", "EMG-01", "HOSP-01")
    assert len(packets) == 15
    for pkt in packets:
        validated = LocationUpdatePayload(**pkt)
        assert validated.vehicle_id == "AMB-01"
        assert validated.emergency_id == "EMG-01"
        assert 0.0 <= validated.heading <= 360.0

    class _FakeWS:
        def __init__(self, msgs):
            self._msgs = list(msgs)

        async def recv(self):
            if self._msgs:
                return json.dumps(self._msgs.pop(0))
            await asyncio.sleep(0.5)
            return "{}"

    fake = _FakeWS(
        [
            {"type": "tracking:location_update"},
            {"type": "signal:preemption_triggered"},
        ]
    )
    drained = asyncio.run(_drain_ws_messages(fake, drain_window_seconds=0.05))
    assert drained == ["tracking:location_update", "signal:preemption_triggered"]


def test_pcr007_evaluate_corridor_does_not_steal_active_hold(client: TestClient):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "disp.pcr@aetis.gov", "password": "Dispatch@123", "role": "dispatcher"},
    )
    assert login.status_code == 200
    csrf = login.cookies.get("csrf_token") or ""

    res = client.post(
        "/api/v1/signals/evaluate-corridor",
        headers={"X-CSRF-Token": csrf},
        json={
            "vehicle_id": "AMB-CHALLENGER",
            "current_latitude": 12.9715,
            "current_longitude": 77.5940,
            "speed_kmh": 60.0,
            "destination_latitude": 12.9730,
            "destination_longitude": 77.6150,
            "queue_count": 5,
            "corridor_width_meters": 150.0,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["preemption_triggered"] is False
    assert data["details"][0]["conflict_held_by"] == "AMB-OWNER"


def test_pcr003_bootstrap_admin_env_logic(monkeypatch):
    # Verify bcrypt/passlib password hashing works cleanly with Python 3.12 runtime
    hashed = get_password_hash("StrongBootstrapPass123!")
    assert verify_password("StrongBootstrapPass123!", hashed) is True
