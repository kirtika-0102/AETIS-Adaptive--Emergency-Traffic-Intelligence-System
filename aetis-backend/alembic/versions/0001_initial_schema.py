"""Initial schema setup for AETIS

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-11-16 10:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create hospitals table
    op.create_table(
        "hospitals",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("contact_phone", sa.String(length=50), nullable=False),
        sa.Column("trauma_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("available_beds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hospitals_id"), "hospitals", ["id"], unique=False)
    op.create_index(op.f("ix_hospitals_name"), "hospitals", ["name"], unique=False)

    # 2. Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("hospital_id", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.create_index(op.f("ix_users_hospital_id"), "users", ["hospital_id"], unique=False)

    # 3. Create vehicles table
    op.create_table(
        "vehicles",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("call_sign", sa.String(length=100), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("license_plate", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="AVAILABLE"),
        sa.Column("current_latitude", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("current_longitude", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("current_driver_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["current_driver_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("license_plate"),
    )
    op.create_index(op.f("ix_vehicles_id"), "vehicles", ["id"], unique=False)
    op.create_index(op.f("ix_vehicles_call_sign"), "vehicles", ["call_sign"], unique=False)
    op.create_index(op.f("ix_vehicles_type"), "vehicles", ["type"], unique=False)
    op.create_index(op.f("ix_vehicles_status"), "vehicles", ["status"], unique=False)
    op.create_index(op.f("ix_vehicles_current_driver_id"), "vehicles", ["current_driver_id"], unique=False)

    # 4. Create emergencies table
    op.create_table(
        "emergencies",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("incident_number", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("severity", sa.String(length=50), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PENDING"),
        sa.Column("pickup_latitude", sa.Float(), nullable=False),
        sa.Column("pickup_longitude", sa.Float(), nullable=False),
        sa.Column("pickup_address", sa.Text(), nullable=False),
        sa.Column("patient_notes", sa.Text(), nullable=True),
        sa.Column("assigned_vehicle_id", sa.String(length=50), nullable=True),
        sa.Column("destination_hospital_id", sa.String(length=50), nullable=True),
        sa.Column("dispatcher_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_vehicle_id"], ["vehicles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["destination_hospital_id"], ["hospitals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dispatcher_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_emergencies_id"), "emergencies", ["id"], unique=False)
    op.create_index(op.f("ix_emergencies_incident_number"), "emergencies", ["incident_number"], unique=True)
    op.create_index(op.f("ix_emergencies_severity"), "emergencies", ["severity"], unique=False)
    op.create_index(op.f("ix_emergencies_status"), "emergencies", ["status"], unique=False)
    op.create_index(op.f("ix_emergencies_assigned_vehicle_id"), "emergencies", ["assigned_vehicle_id"], unique=False)
    op.create_index(op.f("ix_emergencies_destination_hospital_id"), "emergencies", ["destination_hospital_id"], unique=False)
    op.create_index(op.f("ix_emergencies_dispatcher_id"), "emergencies", ["dispatcher_id"], unique=False)

    # 5. Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=255), nullable=False),
        sa.Column("performed_by_id", sa.String(length=36), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["performed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_performed_by_id"), "audit_logs", ["performed_by_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_timestamp"), "audit_logs", ["timestamp"], unique=False)


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("emergencies")
    op.drop_table("vehicles")
    op.drop_table("users")
    op.drop_table("hospitals")
