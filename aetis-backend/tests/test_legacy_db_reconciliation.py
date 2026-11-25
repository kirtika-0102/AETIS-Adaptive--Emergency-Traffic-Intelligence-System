"""
Regression tests for non-destructive SQLite legacy schema reconciliation
(ensuring pre-existing local aetis.db files missing newer columns do not 500).
"""

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

import app.main as main_mod
from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.models.user import User


def test_reconcile_legacy_revoked_tokens_and_endpoints(tmp_path: Path, monkeypatch):
    db_file = tmp_path / "legacy_aetis.db"
    test_engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=test_engine)

    # Simulate a pre-remediation legacy revoked_tokens table missing user_id & token_type
    with sqlite3.connect(db_file) as raw:
        raw.execute("DROP TABLE revoked_tokens")
        raw.execute(
            """
            CREATE TABLE revoked_tokens (
                jti VARCHAR(64) PRIMARY KEY,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NOT NULL
            )
            """
        )
        raw.commit()

    monkeypatch.setattr(main_mod, "engine", test_engine)
    main_mod.reconcile_legacy_sqlite_columns()
    # Idempotency check: running a second time must succeed cleanly
    main_mod.reconcile_legacy_sqlite_columns()

    cols = {c["name"] for c in inspect(test_engine).get_columns("revoked_tokens")}
    assert {"jti", "user_id", "token_type", "expires_at", "revoked_at"}.issubset(cols)

    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    with TestingSession() as db:
        dispatcher = User(
            id="disp-legacy-1",
            email="legacy-disp@aetis.gov",
            password_hash=get_password_hash("DispatcherPass123!"),
            full_name="Legacy Dispatcher",
            role="DISPATCHER",
            is_active=True,
        )
        db.add(dispatcher)
        db.commit()

    token, _, _ = create_access_token(data={"sub": "legacy-disp@aetis.gov", "role": "DISPATCHER"})
    headers = {"Authorization": f"Bearer {token}"}

    main_mod.app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(main_mod.app, raise_server_exceptions=True)

        notif_res = client.get("/api/v1/notifications?limit=50", headers=headers)
        assert notif_res.status_code == 200

        create_res = client.post(
            "/api/v1/emergencies",
            headers=headers,
            json={
                "title": "Cardiac Arrest — Sector 62",
                "type": "medical",
                "severity": "HIGH",
                "pickup_latitude": 28.6279,
                "pickup_longitude": 77.3649,
                "pickup_address": "Sector 62, Noida",
                "patient_notes": "Conscious, chest pain",
            },
        )
        assert create_res.status_code == 201
        created = create_res.json()
        assert created["title"] == "Cardiac Arrest — Sector 62"
        assert created["status"] == "PENDING"

        vehicles_res = client.get("/api/v1/vehicles", headers=headers)
        assert vehicles_res.status_code == 200
    finally:
        main_mod.app.dependency_overrides.clear()
        test_engine.dispose()
