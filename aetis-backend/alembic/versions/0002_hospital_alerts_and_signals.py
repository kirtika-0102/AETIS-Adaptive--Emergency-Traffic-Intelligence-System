"""Add hospital alerts and traffic signals tables

Revision ID: 0002_hospital_alerts_and_signals
Revises: 0001_initial_schema
Create Date: 2026-11-16 11:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_hospital_alerts_and_signals"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create hospital_alerts table
    op.create_table(
        "hospital_alerts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("emergency_id", sa.String(length=50), nullable=False),
        sa.Column("hospital_id", sa.String(length=50), nullable=False),
        sa.Column("estimated_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_condition", sa.String(length=255), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("acknowledged_by_id", sa.String(length=36), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trauma_bay_assigned", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["emergency_id"], ["emergencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hospital_id"], ["hospitals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["acknowledged_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hospital_alerts_id"), "hospital_alerts", ["id"], unique=False)
    op.create_index(op.f("ix_hospital_alerts_emergency_id"), "hospital_alerts", ["emergency_id"], unique=False)
    op.create_index(op.f("ix_hospital_alerts_hospital_id"), "hospital_alerts", ["hospital_id"], unique=False)
    op.create_index(op.f("ix_hospital_alerts_acknowledged_by_id"), "hospital_alerts", ["acknowledged_by_id"], unique=False)

    # 2. Create signals table
    op.create_table(
        "signals",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("intersection", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="NORMAL"),
        sa.Column("preemption_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_preempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_signals_id"), "signals", ["id"], unique=False)


def downgrade() -> None:
    op.drop_table("signals")
    op.drop_table("hospital_alerts")
