"""Reconcile Phase B models, enums, security token tables, and schema alignment.

Revision ID: 0003_reconcile_models_and_security
Revises: 0002_hospital_alerts_and_signals
Create Date: 2026-11-25 11:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_reconcile_models_and_security"
down_revision: Union[str, None] = "0002_hospital_alerts_and_signals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create missing Phase B & security tables
    op.create_table(
        "traffic_signals",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("current_phase", sa.String(15), nullable=False, server_default="RED"),
        sa.Column("transition_state", sa.String(25), nullable=False, server_default="NORMAL"),
        sa.Column("normal_cycle_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("is_preempted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("preempted_by_vehicle_id", sa.String(50), nullable=True),
        sa.Column("preemption_end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preemptions_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_preemption_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_traffic_signals_id", "traffic_signals", ["id"], unique=False)

    op.create_table(
        "cameras",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("stream_url", sa.String(255), nullable=False),
        sa.Column(
            "connected_signal_id",
            sa.String(50),
            sa.ForeignKey("traffic_signals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("view_heading", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ONLINE"),
        sa.Column("is_armed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "armed_emergency_id",
            sa.String(50),
            sa.ForeignKey("emergencies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cameras_id", "cameras", ["id"], unique=False)
    op.create_index(
        "ix_cameras_connected_signal_id", "cameras", ["connected_signal_id"], unique=False
    )

    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("token_type", sa.String(20), nullable=False, server_default="access"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_revoked_tokens_user_id", "revoked_tokens", ["user_id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)

    # 2. Reconcile vehicles table columns
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.alter_column("id", existing_type=sa.String(20), type_=sa.String(50))
        batch_op.alter_column("call_sign", existing_type=sa.String(50), nullable=True)
        batch_op.alter_column("license_plate", existing_type=sa.String(20), nullable=True)
        batch_op.add_column(sa.Column("label", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("speed", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("heading", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("last_update_at", sa.DateTime(), nullable=True))

    # 3. Reconcile emergencies table columns
    with op.batch_alter_table("emergencies") as batch_op:
        batch_op.alter_column("id", existing_type=sa.String(20), type_=sa.String(50))
        batch_op.alter_column("severity", existing_type=sa.String(10), type_=sa.String(20))
        batch_op.alter_column("assigned_vehicle_id", existing_type=sa.String(20), type_=sa.String(50))
        batch_op.alter_column("destination_hospital_id", existing_type=sa.String(20), type_=sa.String(50))
        batch_op.add_column(sa.Column("type", sa.String(20), nullable=False, server_default="medical"))
        batch_op.add_column(sa.Column("journey_leg", sa.String(20), nullable=False, server_default="TO_SCENE"))
        batch_op.add_column(sa.Column("destination_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("destination_lng", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("destination_name", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("hospital_name", sa.String(255), nullable=True))
    op.create_index("ix_emergencies_id", "emergencies", ["id"], unique=False)

    # 4. Reconcile hospital_alerts table (matching String(50), unique emergency_id, nullable ETA)
    with op.batch_alter_table("hospital_alerts") as batch_op:
        batch_op.alter_column("emergency_id", existing_type=sa.String(20), type_=sa.String(50))
        batch_op.alter_column("estimated_arrival", existing_type=sa.DateTime(timezone=True), nullable=True)
        batch_op.create_unique_constraint("uq_hospital_alerts_emergency_id", ["emergency_id"])

    # 5. Reconcile audit_logs nullable performed_by_id for automated preemption logs
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column("performed_by_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column("performed_by_id", existing_type=sa.String(36), nullable=False)

    with op.batch_alter_table("hospital_alerts") as batch_op:
        batch_op.drop_constraint("uq_hospital_alerts_emergency_id", type_="unique")
        batch_op.alter_column("estimated_arrival", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch_op.alter_column("emergency_id", existing_type=sa.String(50), type_=sa.String(20))

    op.drop_index("ix_emergencies_id", table_name="emergencies")
    with op.batch_alter_table("emergencies") as batch_op:
        batch_op.drop_column("hospital_name")
        batch_op.drop_column("destination_name")
        batch_op.drop_column("destination_lng")
        batch_op.drop_column("destination_lat")
        batch_op.drop_column("journey_leg")
        batch_op.drop_column("type")
        batch_op.alter_column("destination_hospital_id", existing_type=sa.String(50), type_=sa.String(20))
        batch_op.alter_column("assigned_vehicle_id", existing_type=sa.String(50), type_=sa.String(20))
        batch_op.alter_column("severity", existing_type=sa.String(20), type_=sa.String(10))
        batch_op.alter_column("id", existing_type=sa.String(50), type_=sa.String(20))

    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_column("last_update_at")
        batch_op.drop_column("heading")
        batch_op.drop_column("speed")
        batch_op.drop_column("label")
        batch_op.alter_column("license_plate", existing_type=sa.String(20), nullable=False)
        batch_op.alter_column("call_sign", existing_type=sa.String(50), nullable=False)
        batch_op.alter_column("id", existing_type=sa.String(50), type_=sa.String(20))

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_revoked_tokens_user_id", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
    op.drop_index("ix_cameras_connected_signal_id", table_name="cameras")
    op.drop_index("ix_cameras_id", table_name="cameras")
    op.drop_table("cameras")
    op.drop_index("ix_traffic_signals_id", table_name="traffic_signals")
    op.drop_table("traffic_signals")
