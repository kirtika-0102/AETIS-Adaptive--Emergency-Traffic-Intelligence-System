"""Add hospital_alerts and signals tables

Revision ID: 0002_hospital_alerts_and_signals
Revises: 0001_initial
Create Date: 2026-11-16 14:33:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_hospital_alerts_and_signals"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- hospital_alerts ---
    op.create_table(
        "hospital_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("emergency_id", sa.String(20), sa.ForeignKey("emergencies.id"), nullable=False),
        sa.Column("hospital_id", sa.String(20), sa.ForeignKey("hospitals.id"), nullable=False),
        sa.Column("estimated_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("patient_condition", sa.String(255), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("acknowledged_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trauma_bay_assigned", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # --- signals ---
    op.create_table(
        "signals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="NORMAL", comment="Enum: NORMAL | PRIORITY | PENDING | FAULT"),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("preemptions_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_preemption_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("signals")
    op.drop_table("hospital_alerts")
