"""
Batch 2 Contract Tests: Canonical Backend REST endpoints consumed by the Aetis-frontend.
Verifies pagination headers, normalized compatibility fields, RBAC, and exports.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.main import app
from app.models.camera import Camera
from app.models.hospital import Hospital
from app.models.signal import TrafficSignal
from app.models.user import User

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
            id="HOSP-B2",
            name="Metro Trauma Center",
            address="Main Blvd",
            latitude=28.67,
            longitude=77.45,
            contact_phone="+91-11-22223333",
            trauma_level=1,
            available_beds=15,
        )
    )
    db.flush()
    users = [
        User(
            id="u-b2-admin",
            email="admin@aetis.gov",
            password_hash=get_password_hash("Admin@123"),
            full_name="B2 Admin",
            role="ADMIN",
            is_active=True,
        ),
        User(
            id="u-b2-disp",
            email="dispatcher@aetis.gov",
            password_hash=get_password_hash("Dispatch@123"),
            full_name="B2 Dispatcher",
            role="DISPATCHER",
            is_active=True,
        ),
        User(
            id="u-b2-drv",
            email="driver@aetis.gov",
            password_hash=get_password_hash("Driver@123"),
            full_name="B2 Driver",
            role="DRIVER",
            is_active=True,
        ),
    ]
    db.add_all(users)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def _auth_cookies(client: TestClient, email: str, password: str, role: str) -> dict[str, str]:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "role": role},
    )
    assert resp.status_code == 200, resp.text
    csrf = resp.cookies.get("csrf_token") or ""
    return {"X-CSRF-Token": csrf}


def test_emergencies_filters_headers_and_hospital_ack(client: TestClient):
    headers = _auth_cookies(client, "dispatcher@aetis.gov", "Dispatch@123", "dispatcher")
    create_resp = client.post(
        "/api/v1/emergencies",
        headers=headers,
        json={
            "title": "Highway Collision",
            "type": "medical",
            "severity": "CRITICAL",
            "pickup_latitude": 28.66,
            "pickup_longitude": 77.44,
            "pickup_address": "NH-24 Km 12",
            "patient_notes": "Chest trauma",
            "destination_hospital_id": "HOSP-B2",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    emg = create_resp.json()
    assert emg["type"] == "medical"
    assert emg["createdAt"]
    assert emg["location"]["lat"] == 28.66

    # Paginated filter + X-Total-Count
    list_resp = client.get(
        "/api/v1/emergencies",
        params={"status": "active", "search": "NH-24", "page": 1, "pageSize": 5},
    )
    assert list_resp.status_code == 200
    assert list_resp.headers.get("X-Total-Count") == "1"
    assert len(list_resp.json()) == 1

    # Dispatch vehicle creates HospitalAlert & exposes corridor + tracking snapshots
    admin_hdrs = _auth_cookies(client, "admin@aetis.gov", "Admin@123", "admin")
    v_resp = client.post(
        "/api/v1/vehicles",
        headers=admin_hdrs,
        json={
            "id": "AMB-B2",
            "call_sign": "AMB-B2",
            "type": "AMBULANCE",
            "license_plate": "UP14EV9999",
            "current_latitude": 28.65,
            "current_longitude": 77.43,
            "current_driver_id": "u-b2-drv",
        },
    )
    assert v_resp.status_code == 201, v_resp.text
    v_data = v_resp.json()
    assert v_data["label"] == "AMB-B2"
    assert v_data["registrationNumber"] == "UP14EV9999"
    assert v_data["driver"]["id"] == "u-b2-drv"

    disp_hdrs = _auth_cookies(client, "dispatcher@aetis.gov", "Dispatch@123", "dispatcher")
    assign_resp = client.patch(
        "/api/v1/vehicles/AMB-B2/assign",
        headers=disp_hdrs,
        json={"emergency_id": emg["id"]},
    )
    assert assign_resp.status_code == 200

    # Tracking snapshots
    assert client.get("/api/v1/tracking/active").status_code == 200
    tr_one = client.get(f"/api/v1/tracking/emergency/{emg['id']}")
    assert tr_one.status_code == 200
    assert tr_one.json()["vehicleId"] == "AMB-B2"

    # Corridor query
    corr = client.get(f"/api/v1/signals/corridor/{emg['id']}")
    assert corr.status_code == 200
    assert isinstance(corr.json(), list)

    # Admin acknowledge by emergency_id works cleanly
    admin_hdrs = _auth_cookies(client, "admin@aetis.gov", "Admin@123", "admin")
    alerts = client.get("/api/v1/hospitals/inbound-alerts").json()
    assert len(alerts) == 1
    ack_resp = client.post(
        f"/api/v1/hospitals/alerts/{emg['id']}/acknowledge",
        headers=admin_hdrs,
        json={"trauma_bay_assigned": "TRAUMA-2"},
    )
    assert ack_resp.status_code == 200
    assert ack_resp.json()["status"] == "ACKNOWLEDGED"


def test_admin_overview_audit_users_analytics_and_notifications(client: TestClient):
    admin_hdrs = _auth_cookies(client, "admin@aetis.gov", "Admin@123", "admin")

    ov = client.get("/api/v1/admin/overview")
    assert ov.status_code == 200
    ov_data = ov.json()
    assert "emergenciesToday" in ov_data
    assert isinstance(ov_data["services"], list)

    users_resp = client.get(
        "/api/v1/admin/users",
        params={"role": "DRIVER", "page": 1, "pageSize": 10},
    )
    assert users_resp.status_code == 200
    assert int(users_resp.headers["X-Total-Count"]) >= 1

    # Self-suspension rejected
    self_susp = client.patch(
        "/api/v1/admin/users/u-b2-admin/status",
        headers=admin_hdrs,
        json={"status": "suspended"},
    )
    assert self_susp.status_code == 400

    # Analytics report + CSV export
    rep = client.get("/api/v1/analytics/report", params={"range": "30d"})
    assert rep.status_code == 200
    assert "summary" in rep.json()

    csv_resp = client.get("/api/v1/analytics/report/export", params={"range": "7d"})
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")

    # Audit logs & Notifications
    audit_resp = client.get("/api/v1/admin/audit-logs", params={"page": 1, "pageSize": 5})
    assert audit_resp.status_code == 200
    assert "X-Total-Count" in audit_resp.headers

    notif_resp = client.get("/api/v1/notifications")
    assert notif_resp.status_code == 200
    assert "items" in notif_resp.json()
    assert client.post("/api/v1/notifications/read-all", headers=admin_hdrs).status_code == 200


def test_driver_self_status_and_camera_status_patch(client: TestClient, db_session):
    sig = TrafficSignal(
        id="SIG-B2",
        name="B2 Junction",
        latitude=28.67,
        longitude=77.45,
        normal_cycle_seconds=60,
        current_phase="RED",
        is_preempted=False,
    )
    cam = Camera(
        id="CAM-B2",
        name="B2 Cam",
        latitude=28.67,
        longitude=77.45,
        stream_url="rtsp://cam.local/b2",
        connected_signal_id="SIG-B2",
        view_heading=0,
        status="ONLINE",
    )
    db_session.add_all([sig, cam])
    db_session.commit()

    admin_hdrs = _auth_cookies(client, "admin@aetis.gov", "Admin@123", "admin")
    assert (
        client.post(
            "/api/v1/vehicles",
            headers=admin_hdrs,
            json={
                "id": "AMB-DRV",
                "call_sign": "AMB-DRV",
                "type": "AMBULANCE",
                "current_driver_id": "u-b2-drv",
            },
        ).status_code
        == 201
    )

    cam_patch = client.patch(
        "/api/v1/cameras/CAM-B2/status",
        headers=admin_hdrs,
        json={"status": "OFFLINE"},
    )
    assert cam_patch.status_code == 200
    assert cam_patch.json()["status"] == "OFFLINE"

    drv_hdrs = _auth_cookies(client, "driver@aetis.gov", "Driver@123", "driver")
    st_resp = client.patch(
        "/api/v1/vehicles/AMB-DRV/status",
        headers=drv_hdrs,
        json={"status": "OFFLINE"},
    )
    assert st_resp.status_code == 200
    assert st_resp.json()["retired"] is True
