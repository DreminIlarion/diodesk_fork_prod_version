"""add_contracts_module

Revision ID: e82ba1dde3c4
Revises: 38525d040bc5
Create Date: 2026-11-13 08:21:36.479971

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e82ba1dde3c4'
down_revision: Union[str, Sequence[str], None] = '38525d040bc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("counterparty_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("date_start", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("period", sa.String(length=64), nullable=True),
        sa.Column("sum", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("date_end IS NULL OR date_end >= date_start", name="ck_contracts_date_range"),
        sa.CheckConstraint("sum IS NULL OR sum >= 0", name="ck_contracts_sum_non_negative"),
        sa.ForeignKeyConstraint(["counterparty_id"], ["counterparties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contracts_counterparty_id", "contracts", ["counterparty_id"])
    op.create_index("ix_contracts_status", "contracts", ["status"])

    op.create_table(
        "contract_rates",
        sa.Column("contract_id", sa.UUID(), nullable=False),
        sa.Column("type_rate", sa.String(length=64), nullable=False),
        sa.Column("rate", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("unit_measurement_rate", sa.String(length=32), nullable=False),
        sa.Column("hours_subscription", sa.Integer(), nullable=True),
        sa.Column("hours_its", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("rate >= 0", name="ck_contract_rates_rate_non_negative"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contract_rates_contract_id", "contract_rates", ["contract_id"])


def downgrade() -> None:
    op.drop_index("ix_contract_rates_contract_id", table_name="contract_rates")
    op.drop_table("contract_rates")
    op.drop_index("ix_contracts_status", table_name="contracts")
    op.drop_index("ix_contracts_counterparty_id", table_name="contracts")
    op.drop_table("contracts")
