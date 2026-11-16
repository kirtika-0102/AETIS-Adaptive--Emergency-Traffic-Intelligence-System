"""Database seeding utility for initial demonstration users, vehicles, hospitals, alerts, and signals."""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.hospital import Hospital, HospitalAlert
from app.models.vehicle import Vehicle, VehicleType, VehicleStatus
from app.models.emergency import Emergency, EmergencySeverity, EmergencyStatus
from app.models.signal import Signal


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
        "full_name": "Apollo ER Triage Team",
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

DEMO_SIGNALS = [
    {
        "id": "SIG-01",
        "name": "Cyber Hub Main Signal",
        "intersection": "Cyber City & NH-48",
        "latitude": 28.4900,
        "longitude": 77.0900,
        "status": "NORMAL",
        "preemption_count": 14,
    },
    {
        "id": "SIG-02",
        "name": "IFFCO Chowk Crossing",
        "intersection": "MG Road & NH-48",
        "latitude": 28.4720,
        "longitude": 77.0710,
        "status": "NORMAL",
        "preemption_count": 8,
    },
    {
        "id": "SIG-03",
        "name": "Golf Course Junction",
        "intersection": "Golf Course Rd & Sector 54",
        "latitude": 28.4410,
        "longitude": 77.1050,
        "status": "NORMAL",
        "preemption_count": 12,
    },
]


def seed_database(db: Session = None) -> None:
    """Seed sample hospitals, vehicles, signals, and demonstration users into the database if missing."""
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

        # 4. Seed traffic signals
        for s_data in DEMO_SIGNALS:
            existing_s = db.query(Signal).filter(Signal.id == s_data["id"]).first()
            if not existing_s:
                sig = Signal(
                    id=s_data["id"],
                    name=s_data["name"],
                    intersection=s_data["intersection"],
                    latitude=s_data["latitude"],
                    longitude=s_data["longitude"],
                    status=s_data["status"],
                    preemption_count=s_data["preemption_count"],
                )
                db.add(sig)
        db.commit()

        # 5. Seed sample emergency if none exists
        emg = db.query(Emergency).filter(Emergency.id == "EMG-001").first()
        if not emg:
            emg = Emergency(
                id="EMG-001",
                incident_number="INC-2026-001",
                title="Cardiac Arrest reported at Golf Course Road",
                severity=EmergencySeverity.CRITICAL,
                status=EmergencyStatus.DISPATCHED,
                pickup_latitude=28.4682,
                pickup_longitude=77.0913,
                pickup_address="Building 9B, Cyber City, DLF Phase 2",
                patient_notes="58 y/o male with sudden chest pain, unresponsive.",
                destination_hospital_id="HOSP-01",
                dispatcher_id="usr-dispatcher-01",
                assigned_vehicle_id="AMB-01",
            )
            db.add(emg)
            db.commit()

        # 6. Seed sample hospital alert
        alert = db.query(HospitalAlert).filter(HospitalAlert.emergency_id == "EMG-001").first()
        if not alert:
            h_alert = HospitalAlert(
                emergency_id="EMG-001",
                hospital_id="HOSP-01",
                estimated_arrival=datetime.now(timezone.utc) + timedelta(minutes=8),
                patient_condition="Critical - 58 y/o male cardiac arrest, CPR ongoing",
                acknowledged=False,
            )
            db.add(h_alert)
            db.commit()

        print("Database seeded successfully with demo users, vehicles, signals, and alerts!")
    finally:
        if close_after:
            db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_database()
