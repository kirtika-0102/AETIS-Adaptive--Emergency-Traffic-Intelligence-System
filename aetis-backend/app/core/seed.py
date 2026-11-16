"""Database seeding utility for initial demonstration users, vehicles, and entities."""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.hospital import Hospital
from app.models.vehicle import Vehicle, VehicleType, VehicleStatus
from app.models.emergency import Emergency, EmergencySeverity, EmergencyStatus


DEMO_USERS = [
    {
        "id": "usr-admin-01",
        "email": "admin@aetis.example",
        "full_name": "Admin User",
        "role": UserRole.ADMIN,
        "phone": "+91 9876543210",
        "hospital_id": None,
        "password": "Demo@1234",
    },
    {
        "id": "usr-dispatcher-01",
        "email": "dispatcher@aetis.example",
        "full_name": "Dispatcher Jane",
        "role": UserRole.DISPATCHER,
        "phone": "+91 9876543211",
        "hospital_id": None,
        "password": "Demo@1234",
    },
    {
        "id": "usr-driver-01",
        "email": "driver@aetis.example",
        "full_name": "Driver Alex",
        "role": UserRole.DRIVER,
        "phone": "+91 9876543212",
        "hospital_id": None,
        "password": "Demo@1234",
    },
    {
        "id": "usr-hospital-01",
        "email": "hospital@aetis.example",
        "full_name": "City General Hospital Staff",
        "role": UserRole.HOSPITAL,
        "phone": "+91 9876543213",
        "hospital_id": "HOSP-01",
        "password": "Demo@1234",
    },
]

DEMO_VEHICLES = [
    {
        "id": "AMB-01",
        "call_sign": "Ambulance 01",
        "type": VehicleType.AMBULANCE,
        "license_plate": "DL-01-EA-1081",
        "status": VehicleStatus.AVAILABLE,
        "current_latitude": 28.4595,
        "current_longitude": 77.0266,
    },
    {
        "id": "AMB-02",
        "call_sign": "Ambulance 02",
        "type": VehicleType.AMBULANCE,
        "license_plate": "DL-01-EA-1082",
        "status": VehicleStatus.AVAILABLE,
        "current_latitude": 28.4700,
        "current_longitude": 77.0300,
    },
    {
        "id": "FIRE-01",
        "call_sign": "Fire Engine 01",
        "type": VehicleType.FIRE_TRUCK,
        "license_plate": "DL-01-EF-1011",
        "status": VehicleStatus.AVAILABLE,
        "current_latitude": 28.4650,
        "current_longitude": 77.0200,
    },
    {
        "id": "POL-01",
        "call_sign": "Interceptor 01",
        "type": VehicleType.POLICE,
        "license_plate": "DL-01-EP-1001",
        "status": VehicleStatus.AVAILABLE,
        "current_latitude": 28.4550,
        "current_longitude": 77.0350,
    },
]


def seed_database(db: Session = None) -> None:
    """Seed sample hospital, vehicles, and demonstration users into the database if missing."""
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True

    try:
        # 1. Ensure default demo hospital exists
        hosp = db.query(Hospital).filter(Hospital.id == "HOSP-01").first()
        if not hosp:
            hosp = Hospital(
                id="HOSP-01",
                name="Apollo Multi-Specialty Hospital",
                address="Plot 15, Sector 44, Gurugram, HR",
                latitude=28.4595,
                longitude=77.0266,
                contact_phone="+91 124 4567890",
                trauma_level=1,
                available_beds=14,
            )
            db.add(hosp)
            db.commit()

        # 2. Seed demo users
        for u_data in DEMO_USERS:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                user = User(
                    id=u_data["id"],
                    email=u_data["email"],
                    full_name=u_data["full_name"],
                    password_hash=get_password_hash(u_data["password"]),
                    role=u_data["role"],
                    phone=u_data["phone"],
                    hospital_id=u_data["hospital_id"],
                    is_active=True,
                )
                db.add(user)
        db.commit()

        # 3. Seed demo fleet vehicles
        for v_data in DEMO_VEHICLES:
            existing_v = db.query(Vehicle).filter(Vehicle.id == v_data["id"]).first()
            if not existing_v:
                veh = Vehicle(
                    id=v_data["id"],
                    call_sign=v_data["call_sign"],
                    type=v_data["type"],
                    license_plate=v_data["license_plate"],
                    status=v_data["status"],
                    current_latitude=v_data["current_latitude"],
                    current_longitude=v_data["current_longitude"],
                )
                db.add(veh)
        db.commit()

        # 4. Seed sample emergency if none exists
        if db.query(Emergency).count() == 0:
            sample_emg = Emergency(
                id="EMG-001",
                incident_number="INC-2026-001",
                title="Cardiac Arrest reported at Golf Course Road",
                severity=EmergencySeverity.CRITICAL,
                status=EmergencyStatus.PENDING,
                pickup_latitude=28.4682,
                pickup_longitude=77.0913,
                pickup_address="Building 9B, Cyber City, DLF Phase 2",
                patient_notes="58 y/o male with sudden chest pain, unresponsive.",
                destination_hospital_id="HOSP-01",
                dispatcher_id="usr-dispatcher-01",
            )
            db.add(sample_emg)
            db.commit()

        print("Database seeded successfully with demo users, vehicles, and emergencies!")
    finally:
        if close_after:
            db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_database()
