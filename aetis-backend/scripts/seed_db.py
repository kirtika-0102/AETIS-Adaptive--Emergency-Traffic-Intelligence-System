#!/usr/bin/env python
"""
AETIS Database Seeder - Phase A5
=================================
Idempotent script that creates all required test data.
Run from aetis-backend/ directory:

    python scripts/seed_db.py

Accounts seeded:
  admin@aetis.gov    / password123  (ADMIN)
  dispatch@aetis.gov / password123  (DISPATCHER)
  driver@aetis.gov   / password123  (DRIVER)
  hospital@aetis.gov / password123  (HOSPITAL -> HOSP-01)
"""

import os
import sys

# Allow running from either aetis-backend/ root or project root
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_THIS_DIR)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.hospital import Hospital
from app.models.vehicle import Vehicle, VehicleStatus, VehicleType
from app.models.emergency import Emergency, EmergencyStatus, EmergencySeverity as SeverityLevel

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create(db: Session, model, filter_kwargs: dict, create_kwargs: dict):
    """Return existing instance or create a new one (idempotent)."""
    instance = db.query(model).filter_by(**filter_kwargs).first()
    if instance:
        return instance, False
    instance = model(**{**filter_kwargs, **create_kwargs})
    db.add(instance)
    return instance, True


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed_hospitals(db: Session):
    print("  → Seeding hospitals...")
    hospitals = [
        {
            "filter": {"id": "HOSP-01"},
            "create": {
                "name": "City Memorial Trauma Center",
                "address": "1 Rajpath Avenue, New Delhi",
                "latitude": 28.6139,
                "longitude": 77.2090,
                "contact_phone": "+91-11-2000-0001",
                "trauma_level": 1,
                "available_beds": 12,
            },
        },
        {
            "filter": {"id": "HOSP-02"},
            "create": {
                "name": "Apex Specialty Emergency Hospital",
                "address": "14 Kasturba Gandhi Marg, New Delhi",
                "latitude": 28.6289,
                "longitude": 77.2065,
                "contact_phone": "+91-11-2000-0002",
                "trauma_level": 2,
                "available_beds": 8,
            },
        },
    ]
    created_count = 0
    for h in hospitals:
        _, created = _get_or_create(db, Hospital, h["filter"], h["create"])
        if created:
            created_count += 1
            print(f"    [+] Created hospital: {h['filter']['id']} - {h['create']['name']}")
        else:
            print(f"    [=] Hospital already exists: {h['filter']['id']}")
    db.commit()
    return created_count


def seed_users(db: Session):
    print("  → Seeding users...")
    users = [
        {
            "email": "admin@aetis.gov",
            "full_name": "AETIS System Administrator",
            "role": UserRole.ADMIN,
            "phone": "+91-98-0000-0001",
            "hospital_id": None,
        },
        {
            "email": "dispatch@aetis.gov",
            "full_name": "Central Dispatcher",
            "role": UserRole.DISPATCHER,
            "phone": "+91-98-0000-0002",
            "hospital_id": None,
        },
        {
            "email": "driver@aetis.gov",
            "full_name": "Emergency Vehicle Driver",
            "role": UserRole.DRIVER,
            "phone": "+91-98-0000-0003",
            "hospital_id": None,
        },
        {
            "email": "hospital@aetis.gov",
            "full_name": "City Memorial ER Coordinator",
            "role": UserRole.HOSPITAL,
            "phone": "+91-98-0000-0004",
            "hospital_id": "HOSP-01",
        },
    ]
    created_count = 0
    for u in users:
        existing = db.query(User).filter_by(email=u["email"]).first()
        if existing:
            print(f"    [=] User already exists: {u['email']}")
            continue
        user = User(
            email=u["email"],
            full_name=u["full_name"],
            password_hash=get_password_hash("password123"),
            role=u["role"],
            phone=u["phone"],
            hospital_id=u["hospital_id"],
            is_active=True,
        )
        db.add(user)
        created_count += 1
        print(f"    [+] Created user: {u['email']} ({u['role'].value})")
    db.commit()
    return created_count


def seed_vehicles(db: Session):
    print("  → Seeding vehicles...")
    vehicles = [
        {
            "id": "AMB-01",
            "call_sign": "Rapid-1",
            "type": VehicleType.AMBULANCE,
            "license_plate": "DL-01-EM-1001",
            "status": VehicleStatus.AVAILABLE,
        },
        {
            "id": "AMB-02",
            "call_sign": "Rapid-2",
            "type": VehicleType.AMBULANCE,
            "license_plate": "DL-01-EM-1002",
            "status": VehicleStatus.AVAILABLE,
        },
        {
            "id": "FIRE-01",
            "call_sign": "Blaze-1",
            "type": VehicleType.FIRE_TRUCK,
            "license_plate": "DL-01-FT-2001",
            "status": VehicleStatus.AVAILABLE,
        },
        {
            "id": "POL-01",
            "call_sign": "Patrol-1",
            "type": VehicleType.POLICE,
            "license_plate": "DL-01-PD-3001",
            "status": VehicleStatus.AVAILABLE,
        },
    ]
    created_count = 0
    for v in vehicles:
        existing = db.query(Vehicle).filter_by(id=v["id"]).first()
        if existing:
            print(f"    [=] Vehicle already exists: {v['id']} ({v['call_sign']})")
            continue
        vehicle = Vehicle(**v)
        db.add(vehicle)
        created_count += 1
        print(f"    [+] Created vehicle: {v['id']} - {v['call_sign']} ({v['type'].value})")
    db.commit()
    return created_count


def seed_emergency(db: Session):
    print("  → Seeding sample emergency...")
    inc_number = "INC-2026-001"
    existing = db.query(Emergency).filter_by(incident_number=inc_number).first()
    if existing:
        print(f"    [=] Emergency already exists: {inc_number}")
        return 0

    # Determine dispatcher id
    dispatcher = db.query(User).filter_by(email="dispatch@aetis.gov").first()
    dispatcher_id = dispatcher.id if dispatcher else None

    emg = Emergency(
        id="EMG-001",
        incident_number=inc_number,
        title="Cardiac Emergency at Central Square",
        severity=SeverityLevel.CRITICAL,
        status=EmergencyStatus.PENDING,
        pickup_latitude=28.6100,
        pickup_longitude=77.2100,
        pickup_address="Central Square, Connaught Place, New Delhi",
        patient_notes="66-year-old male, unresponsive, possible cardiac arrest.",
        destination_hospital_id="HOSP-01",
        dispatcher_id=dispatcher_id,
    )
    db.add(emg)
    db.commit()
    print(f"    [+] Created emergency: {inc_number} - {emg.title} (CRITICAL / PENDING)")
    return 1


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  AETIS Database Seeder — Phase A5")
    print("=" * 60)

    # Ensure all tables exist (safe no-op if already created by Alembic)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        h_created = seed_hospitals(db)
        u_created = seed_users(db)
        v_created = seed_vehicles(db)
        e_created = seed_emergency(db)

        print()
        print("=" * 60)
        print("  Seeding complete!")
        print(f"  Hospitals   : {h_created} created")
        print(f"  Users       : {u_created} created")
        print(f"  Vehicles    : {v_created} created")
        print(f"  Emergencies : {e_created} created")
        print()
        print("  Seeded Credentials (password: password123)")
        print("  ┌─────────────────────────┬──────────────┐")
        print("  │ Email                   │ Role         │")
        print("  ├─────────────────────────┼──────────────┤")
        print("  │ admin@aetis.gov         │ ADMIN        │")
        print("  │ dispatch@aetis.gov      │ DISPATCHER   │")
        print("  │ driver@aetis.gov        │ DRIVER       │")
        print("  │ hospital@aetis.gov      │ HOSPITAL     │")
        print("  └─────────────────────────┴──────────────┘")
        print("=" * 60)
    except Exception as exc:
        db.rollback()
        print(f"\n[ERROR] Seeding failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
