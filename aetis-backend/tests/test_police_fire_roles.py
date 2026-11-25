"""
Regression tests for POLICE and FIRE roles across auth, admin provisioning,
role-scoped emergencies, inbound alerts, acknowledgments, and notifications.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.main import app
from app.models.user import User


def _setup_test_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    with TestingSession() as db:
        db.add_all(
            [
                User(
                    id="adm-pf-1",
                    email="admin-pf@aetis.gov",
                    password_hash=get_password_hash("AdminPass123!"),
                    full_name="Admin PF",
                    role="ADMIN",
                    is_active=True,
                ),
                User(
                    id="disp-pf-1",
                    email="disp-pf@aetis.gov",
                    password_hash=get_password_hash("DispPass123!"),
                    full_name="Dispatcher PF",
                    role="DISPATCHER",
                    is_active=True,
                ),
            ]
        )
        db.commit()

    app.dependency_overrides[get_db] = override_get_db
    return engine, TestClient(app, raise_server_exceptions=True)


def test_police_and_fire_login_alerts_and_scoping():
    engine, client = _setup_test_app()
    try:
        adm_login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin-pf@aetis.gov", "password": "AdminPass123!", "role": "admin"},
        )
        assert adm_login.status_code == 200
        adm_hdr = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Admin creates POLICE and FIRE users
        p_res = client.post(
            "/api/v1/admin/users",
            headers=adm_hdr,
            json={
                "email": "police@aetis.gov",
                "password": "password123",
                "full_name": "Police Control",
                "role": "POLICE",
            },
        )
        assert p_res.status_code == 201
        assert p_res.json()["role"] == "POLICE"

        f_res = client.post(
            "/api/v1/admin/users",
            headers=adm_hdr,
            json={
                "email": "fire@aetis.gov",
                "password": "password123",
                "full_name": "Fire Station",
                "role": "FIRE",
            },
        )
        assert f_res.status_code == 201
        assert f_res.json()["role"] == "FIRE"

        # Dispatcher creates one police emergency and one fire emergency
        disp_login = client.post(
            "/api/v1/auth/login",
            json={"email": "disp-pf@aetis.gov", "password": "DispPass123!", "role": "dispatcher"},
        )
        disp_hdr = {"Authorization": f"Bearer {disp_login.json()['access_token']}"}

        emg_pol = client.post(
            "/api/v1/emergencies",
            headers=disp_hdr,
            json={
                "title": "Highway Collision",
                "type": "police",
                "severity": "HIGH",
                "pickup_latitude": 28.61,
                "pickup_longitude": 77.21,
            },
        ).json()
        emg_fire = client.post(
            "/api/v1/emergencies",
            headers=disp_hdr,
            json={
                "title": "Warehouse Fire",
                "type": "fire",
                "severity": "CRITICAL",
                "pickup_latitude": 28.62,
                "pickup_longitude": 77.22,
            },
        ).json()

        # Login as POLICE (wrong role rejected, right role accepted)
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "police@aetis.gov", "password": "password123", "role": "fire"},
            ).status_code
            == 401
        )
        pol_login = client.post(
            "/api/v1/auth/login",
            json={"email": "police@aetis.gov", "password": "password123", "role": "police"},
        )
        assert pol_login.status_code == 200
        pol_hdr = {"Authorization": f"Bearer {pol_login.json()['access_token']}"}

        # Login as FIRE
        fire_login = client.post(
            "/api/v1/auth/login",
            json={"email": "fire@aetis.gov", "password": "password123", "role": "fire"},
        )
        assert fire_login.status_code == 200
        fire_hdr = {"Authorization": f"Bearer {fire_login.json()['access_token']}"}

        # Scoped inbound alerts & emergencies
        pol_alerts = client.get("/api/v1/hospitals/inbound-alerts", headers=pol_hdr)
        assert pol_alerts.status_code == 200
        assert [a["emergency_id"] for a in pol_alerts.json()] == [emg_pol["id"]]

        fire_alerts = client.get("/api/v1/hospitals/inbound-alerts", headers=fire_hdr)
        assert fire_alerts.status_code == 200
        assert [a["emergency_id"] for a in fire_alerts.json()] == [emg_fire["id"]]

        # Cross-unit emergency access is forbidden
        assert client.get(f"/api/v1/emergencies/{emg_fire['id']}", headers=pol_hdr).status_code == 403
        assert client.get(f"/api/v1/emergencies/{emg_pol['id']}", headers=fire_hdr).status_code == 403

        # Acknowledge & notifications
        ack_pol = client.post(f"/api/v1/hospitals/alerts/{emg_pol['id']}/acknowledge", headers=pol_hdr)
        assert ack_pol.status_code == 200
        assert ack_pol.json()["status"] == "ACKNOWLEDGED"

        assert client.get("/api/v1/notifications?limit=50", headers=pol_hdr).status_code == 200
        assert client.get("/api/v1/notifications?limit=50", headers=fire_hdr).status_code == 200
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
