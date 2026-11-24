"""
AETIS Central Engine — Comprehensive Database Seeder Script
Phase A5 Deliverable

Idempotent seed script that initializes:
- 2 Hospitals (HOSP-01, HOSP-02)
- 4 Role-based Users (admin, dispatch, driver, hospital)
- 4 Emergency Vehicles (AMB-01, AMB-02, FIRE-01, POL-01)
- 1 Sample Active Emergency (INC-2026-001)
- Inbound Hospital Triage Alert & Traffic Signals
"""

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import Base, SessionLocal, engine
from app.models import *  # ensure all models registered
from app.core.security import get_password_hash
from app.models.emergency import Emergency
from app.models.hospital import Hospital, HospitalAlert
from app.models.signal import Signal
from app.models.user import User
from app.models.vehicle import Vehicle

SEED_HOSPITALS = [
    {
        "id": "HOSP-01",
        "name": "City Memorial Trauma Center",
        "address": "Connaught Place Outer Circle, New Delhi",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "contact_phone": "+91-11-2345-6789",
        "trauma_level": 1,
        "available_beds": 12,
    },
    {
        "id": "HOSP-02",
        "name": "Apex Specialty Emergency Hospital",
        "address": "Barakhamba Road, New Delhi",
        "latitude": 28.6289,
        "longitude": 77.2065,
        "contact_phone": "+91-11-2345-6790",
        "trauma_level": 2,
        "available_beds": 8,
    },
]

SEED_USERS = [
    {
        "id": "usr-admin-01",
        "email": "admin@aetis.gov",
        "full_name": "Chief System Administrator",
        "role": "ADMIN",
        "phone": "+91-98111-00001",
        "password": "password123",
        "hospital_id": None,
    },
    {
        "id": "usr-disp-01",
        "email": "dispatch@aetis.gov",
        "full_name": "Senior Traffic Dispatcher",
        "role": "DISPATCHER",
        "phone": "+91-98111-00002",
        "password": "password123",
        "hospital_id": None,
    },
    {
        "id": "usr-driv-01",
        "email": "driver@aetis.gov",
        "full_name": "Emergency Ambulance Pilot",
        "role": "DRIVER",
        "phone": "+91-98111-00003",
        "password": "password123",
        "hospital_id": None,
    },
    {
        "id": "usr-hosp-01",
        "email": "hospital@aetis.gov",
        "full_name": "ER Triage Chief Coordinator",
        "role": "HOSPITAL",
        "phone": "+91-98111-00004",
        "password": "password123",
        "hospital_id": "HOSP-01",
    },
    {
        "id": "usr-admin-02",
        "email": "admin@aetis.org",
        "full_name": "System Administrator",
        "role": "ADMIN",
        "phone": "+1-555-0100",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-disp-02",
        "email": "dispatcher@aetis.org",
        "full_name": "Central Dispatcher",
        "role": "DISPATCHER",
        "phone": "+1-555-0101",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-driv-02",
        "email": "driver@aetis.org",
        "full_name": "Ambulance Driver One",
        "role": "DRIVER",
        "phone": "+1-555-0102",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-hosp-02",
        "email": "hospital@aetis.org",
        "full_name": "City General Hospital Staff",
        "role": "HOSPITAL",
        "phone": "+1-555-0103",
        "password": "Password123!",
        "hospital_id": "HOSP-01",
    },
]

SEED_VEHICLES = [
    {
        "id": "AMB-01",
        "call_sign": "Rapid-1",
        "type": "AMBULANCE",
        "license_plate": "DL-01-EM-1001",
        "status": "AVAILABLE",
        "current_latitude": 28.6145,
        "current_longitude": 77.2085,
        "current_driver_id": "usr-driv-01",
    },
    {
        "id": "AMB-02",
        "call_sign": "Rapid-2",
        "type": "AMBULANCE",
        "license_plate": "DL-01-EM-1002",
        "status": "AVAILABLE",
        "current_latitude": 28.6250,
        "current_longitude": 77.2150,
        "current_driver_id": None,
    },
    {
        "id": "FIRE-01",
        "call_sign": "Blaze-1",
        "type": "FIRE_TRUCK",
        "license_plate": "DL-01-FT-2001",
        "status": "AVAILABLE",
        "current_latitude": 28.6180,
        "current_longitude": 77.2000,
        "current_driver_id": None,
    },
    {
        "id": "POL-01",
        "call_sign": "Patrol-1",
        "type": "POLICE",
        "license_plate": "DL-01-PD-3001",
        "status": "AVAILABLE",
        "current_latitude": 28.6300,
        "current_longitude": 77.2200,
        "current_driver_id": None,
    },
]

SEED_SIGNALS = [
    {
        "id": "SIG-DEL-01",
        "name": "Rajiv Chowk Outer Intersection",
        "status": "NORMAL",
        "latitude": 28.6128,
        "longitude": 77.2095,
        "preemptions_count": 19,
        "last_preemption_at": datetime.now(timezone.utc) - timedelta(hours=1),
    },
    {
        "id": "SIG-DEL-02",
        "name": "Barakhamba Junction",
        "status": "PRIORITY",
        "latitude": 28.6280,
        "longitude": 77.2070,
        "preemptions_count": 31,
        "last_preemption_at": datetime.now(timezone.utc) - timedelta(minutes=20),
    },
]


def seed_database():
    """Seed initial records idempotently without duplicate key collisions."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    print("=" * 60)
    print("AETIS Central Engine — Database Seeder (Phase A5)")
    print("=" * 60)

    try:
        # 1. Hospitals
        print("\n[1/5] Seeding Hospitals...")
        for h_data in SEED_HOSPITALS:
            h = db.query(Hospital).filter(Hospital.id == h_data["id"]).first()
            if not h:
                h = Hospital(**h_data)
                db.add(h)
                print(f"  + Created Hospital: {h_data['id']} - {h_data['name']}")
            else:
                for k, v in h_data.items():
                    setattr(h, k, v)
                print(f"  * Updated Hospital: {h_data['id']} - {h_data['name']}")
        db.commit()

        # 2. Users
        print("\n[2/5] Seeding Users with Bcrypt Hashes...")
        for u_data in SEED_USERS:
            u = db.query(User).filter(User.email == u_data["email"]).first()
            if not u:
                u = User(
                    id=u_data["id"],
                    email=u_data["email"],
                    password_hash=get_password_hash(u_data["password"]),
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                    phone=u_data["phone"],
                    hospital_id=u_data["hospital_id"],
                    is_active=True,
                )
                db.add(u)
                print(f"  + Created User: {u_data['email']} [{u_data['role']}]")
            else:
                u.password_hash = get_password_hash(u_data["password"])
                u.full_name = u_data["full_name"]
                u.role = u_data["role"]
                u.phone = u_data["phone"]
                u.hospital_id = u_data["hospital_id"]
                u.is_active = True
                print(f"  * Updated User: {u_data['email']} [{u_data['role']}]")
        db.commit()

        # 3. Vehicles
        print("\n[3/5] Seeding Fleet Emergency Vehicles...")
        for v_data in SEED_VEHICLES:
            v = db.query(Vehicle).filter(Vehicle.id == v_data["id"]).first()
            if not v:
                v = Vehicle(**v_data)
                db.add(v)
                print(f"  + Created Vehicle: {v_data['id']} ({v_data['call_sign']}) - {v_data['type']}")
            else:
                for k, val in v_data.items():
                    setattr(v, k, val)
                print(f"  * Updated Vehicle: {v_data['id']} ({v_data['call_sign']}) - {v_data['type']}")
        db.commit()

        # 4. Traffic Signals
        print("\n[4/5] Seeding Traffic Signals...")
        for s_data in SEED_SIGNALS:
            s = db.query(Signal).filter(Signal.id == s_data["id"]).first()
            if not s:
                s = Signal(**s_data)
                db.add(s)
                print(f"  + Created Signal: {s_data['id']} ({s_data['name']})")
            else:
                for k, val in s_data.items():
                    setattr(s, k, val)
                print(f"  * Updated Signal: {s_data['id']} ({s_data['name']})")
        db.commit()

        # 5. Sample Active Emergency
        print("\n[5/5] Seeding Sample Active Emergency (INC-2026-001)...")
        emg = db.query(Emergency).filter(Emergency.incident_number == "INC-2026-001").first()
        if not emg:
            emg = Emergency(
                id="EMG-01",
                incident_number="INC-2026-001",
                title="Cardiac Emergency at Central Square",
                severity="CRITICAL",
                status="PENDING",
                pickup_latitude=28.6100,
                pickup_longitude=77.2100,
                pickup_address="Central Square, Rajiv Chowk, New Delhi",
                patient_notes="Elderly patient with acute chest distress and shortness of breath",
                assigned_vehicle_id=None,
                destination_hospital_id="HOSP-01",
                dispatcher_id="usr-disp-01",
                created_at=datetime.now(timezone.utc),
            )
            db.add(emg)
            print("  + Created Incident: INC-2026-001 (EMG-01) [Status: PENDING]")
        else:
            emg.title = "Cardiac Emergency at Central Square"
            emg.severity = "CRITICAL"
            emg.status = "PENDING"
            emg.pickup_latitude = 28.6100
            emg.pickup_longitude = 77.2100
            emg.pickup_address = "Central Square, Rajiv Chowk, New Delhi"
            emg.patient_notes = "Elderly patient with acute chest distress and shortness of breath"
            emg.destination_hospital_id = "HOSP-01"
            emg.dispatcher_id = "usr-disp-01"
            print("  * Updated Incident: INC-2026-001 (EMG-01) [Status: PENDING]")
        db.commit()

        # Also create initial Inbound Hospital Alert for HOSP-01
        alert = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == "EMG-01").first()
        if not alert:
            alert = HospitalAlert(
                id=str(uuid.uuid4()),
                emergency_id="EMG-01",
                hospital_id="HOSP-01",
                estimated_arrival=datetime.now(timezone.utc) + timedelta(minutes=12),
                patient_condition="Cardiac emergency - acute chest distress",
                acknowledged=False,
            )
            db.add(alert)
            print("  + Created Inbound Alert for HOSP-01 bound to EMG-01")
        db.commit()

        print("\n" + "=" * 60)
        print("DATABASE SEEDING SUCCESSFUL!")
        print("All records created/verified without duplicate errors.")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Database seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
