"""Initial schema – users, vehicles, hospitals, emergencies, audit_logs

Revision ID: 0001_initial
Revises: 
Create Date: 2026-11-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- hospitals (referenced by users and emergencies) ---
    op.create_table(
        "hospitals",
        sa.Column("id", sa.String(20), primary_key=True, comment="Human-readable ID, e.g. HOSP-01"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.Text, nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("contact_phone", sa.String(20), nullable=False),
        sa.Column("trauma_level", sa.Integer, nullable=False),
        sa.Column("available_beds", sa.Integer, nullable=False, server_default="0"),
    )

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, comment="Enum: ADMIN | DISPATCHER | DRIVER | HOSPITAL"),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("hospital_id", sa.String(36), sa.ForeignKey("hospitals.id"), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )

    # --- vehicles ---
    op.create_table(
        "vehicles",
        sa.Column("id", sa.String(20), primary_key=True, comment="Human-readable ID, e.g. AMB-01"),
        sa.Column("call_sign", sa.String(50), nullable=False),
        sa.Column("type", sa.String(20), nullable=False, comment="Enum: AMBULANCE | FIRE_TRUCK | POLICE"),
        sa.Column("license_plate", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="AVAILABLE", comment="Enum: AVAILABLE | DISPATCHED | BUSY | MAINTENANCE"),
        sa.Column("current_latitude", sa.Float, nullable=True),
        sa.Column("current_longitude", sa.Float, nullable=True),
        sa.Column("current_driver_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )

    # --- emergencies ---
    op.create_table(
        "emergencies",
        sa.Column("id", sa.String(20), primary_key=True, comment="Human-readable ID, e.g. EMG-01"),
        sa.Column("incident_number", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False, comment="Enum: LOW | MEDIUM | HIGH | CRITICAL"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING", comment="Enum: PENDING | DISPATCHED | IN_TRANSIT | ARRIVED | COMPLETED | CANCELLED"),
        sa.Column("pickup_latitude", sa.Float, nullable=False),
        sa.Column("pickup_longitude", sa.Float, nullable=False),
        sa.Column("pickup_address", sa.Text, nullable=True),
        sa.Column("patient_notes", sa.Text, nullable=True),
        sa.Column("assigned_vehicle_id", sa.String(20), sa.ForeignKey("vehicles.id"), nullable=True),
        sa.Column("destination_hospital_id", sa.String(20), sa.ForeignKey("hospitals.id"), nullable=True),
        sa.Column("dispatcher_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("performed_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("emergencies")
    op.drop_table("vehicles")
    op.drop_table("users")
    op.drop_table("hospitals")
