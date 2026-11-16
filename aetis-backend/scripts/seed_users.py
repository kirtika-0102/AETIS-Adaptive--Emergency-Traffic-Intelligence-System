"""
AETIS Central Engine — Database Seed Script
Creates default demo accounts for each of the 4 supported roles,
demo hospital, and demo fleet vehicles.
"""

import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.hospital import Hospital
from app.models.user import User
from app.models.vehicle import Vehicle

DEMO_USERS = [
    {
        "id": "usr-admin-01",
        "email": "admin@aetis.org",
        "full_name": "System Administrator",
        "role": "ADMIN",
        "phone": "+1-555-0100",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-disp-01",
        "email": "dispatcher@aetis.org",
        "full_name": "Central Dispatcher",
        "role": "DISPATCHER",
        "phone": "+1-555-0101",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-driv-01",
        "email": "driver@aetis.org",
        "full_name": "Ambulance Driver One",
        "role": "DRIVER",
        "phone": "+1-555-0102",
        "password": "Password123!",
        "hospital_id": None,
    },
    {
        "id": "usr-hosp-01",
        "email": "hospital@aetis.org",
        "full_name": "City General Hospital Staff",
        "role": "HOSPITAL",
        "phone": "+1-555-0103",
        "password": "Password123!",
        "hospital_id": "HOSP-01",
    },
]

DEMO_HOSPITALS = [
    {
        "id": "HOSP-01",
        "name": "City General Hospital",
        "address": "100 Medical Center Blvd, Metro City",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "contact_phone": "+1-555-0199",
        "trauma_level": 1,
        "available_beds": 24,
    }
]

DEMO_VEHICLES = [
    {
        "id": "AMB-01",
        "call_sign": "Medic One",
        "type": "AMBULANCE",
        "license_plate": "MED-101",
        "status": "AVAILABLE",
        "current_latitude": 37.7750,
        "current_longitude": -122.4180,
        "current_driver_id": "usr-driv-01",
    },
    {
        "id": "AMB-02",
        "call_sign": "Medic Two",
        "type": "AMBULANCE",
        "license_plate": "MED-102",
        "status": "AVAILABLE",
        "current_latitude": 37.7800,
        "current_longitude": -122.4100,
        "current_driver_id": None,
    },
    {
        "id": "FIRE-01",
        "call_sign": "Engine One",
        "type": "FIRE_TRUCK",
        "license_plate": "FIRE-201",
        "status": "AVAILABLE",
        "current_latitude": 37.7650,
        "current_longitude": -122.4200,
        "current_driver_id": None,
    },
    {
        "id": "POL-01",
        "call_sign": "Cruiser One",
        "type": "POLICE",
        "license_plate": "COP-301",
        "status": "AVAILABLE",
        "current_latitude": 37.7900,
        "current_longitude": -122.4050,
        "current_driver_id": None,
    },
]


def seed_database():
    db = SessionLocal()
    try:
        # Seed hospital first (foreign key for hospital user)
        for h_data in DEMO_HOSPITALS:
            existing_h = db.query(Hospital).filter(Hospital.id == h_data["id"]).first()
            if not existing_h:
                hospital = Hospital(**h_data)
                db.add(hospital)
                print(f"Created hospital: {h_data['name']} ({h_data['id']})")
        db.commit()

        # Seed users
        for u_data in DEMO_USERS:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                user = User(
                    id=u_data["id"],
                    email=u_data["email"],
                    password_hash=get_password_hash(u_data["password"]),
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                    phone=u_data["phone"],
                    hospital_id=u_data["hospital_id"],
                    is_active=True,
                )
                db.add(user)
                print(f"Created user: {u_data['email']} [Role: {u_data['role']}]")
            else:
                print(f"User already exists: {u_data['email']}")
        db.commit()

        # Seed fleet vehicles
        for v_data in DEMO_VEHICLES:
            existing_v = db.query(Vehicle).filter(Vehicle.id == v_data["id"]).first()
            if not existing_v:
                vehicle = Vehicle(**v_data)
                db.add(vehicle)
                print(f"Created vehicle: {v_data['id']} ({v_data['call_sign']})")
            else:
                print(f"Vehicle already exists: {v_data['id']}")
        db.commit()

        print("\nDatabase seeding completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
