"""Database seeding utility for initial demonstration users and entities."""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.hospital import Hospital


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


def seed_database(db: Session = None) -> None:
    """Seed sample hospital and demonstration users into the database if missing."""
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True

    try:
        # Ensure default demo hospital exists
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

        # Seed demo users
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
        print("Database seeded successfully with demo users!")
    finally:
        if close_after:
            db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_database()
