"""add product registration and serial numbers

Revision ID: b91d4e7f2a36
Revises: 304eb98a2792, 6d1bfb4224dc
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b91d4e7f2a36"
down_revision: Union[str, Sequence[str], None] = ("304eb98a2792", "6d1bfb4224dc")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable identifiers without changing existing rows."""
    op.add_column(
        "software_products",
        sa.Column("registration_number", sa.String(), nullable=True),
    )
    op.create_check_constraint(
        "ck_software_products_registration_number_not_blank",
        "software_products",
        "registration_number IS NULL OR btrim(registration_number) <> ''",
    )
    op.create_unique_constraint(
        "uq_software_products_registration_number",
        "software_products",
        ["registration_number"],
    )

    op.add_column(
        "counterparty_products",
        sa.Column("serial_number", sa.String(), nullable=True),
    )
    op.create_check_constraint(
        "ck_counterparty_products_serial_number_not_blank",
        "counterparty_products",
        "serial_number IS NULL OR btrim(serial_number) <> ''",
    )
    op.create_unique_constraint(
        "uq_counterparty_products_serial_number",
        "counterparty_products",
        ["serial_number"],
    )
    op.create_index(
        "ix_counterparty_products_counterparty_id",
        "counterparty_products",
        ["counterparty_id"],
    )
    op.create_index(
        "ix_counterparty_products_product_id",
        "counterparty_products",
        ["product_id"],
    )


def downgrade() -> None:
    """Remove product registration and serial identifiers."""
    op.drop_index("ix_counterparty_products_product_id", table_name="counterparty_products")
    op.drop_index(
        "ix_counterparty_products_counterparty_id", table_name="counterparty_products"
    )
    op.drop_constraint(
        "uq_counterparty_products_serial_number",
        "counterparty_products",
        type_="unique",
    )
    op.drop_constraint(
        "ck_counterparty_products_serial_number_not_blank",
        "counterparty_products",
        type_="check",
    )
    op.drop_column("counterparty_products", "serial_number")

    op.drop_constraint(
        "uq_software_products_registration_number",
        "software_products",
        type_="unique",
    )
    op.drop_constraint(
        "ck_software_products_registration_number_not_blank",
        "software_products",
        type_="check",
    )
    op.drop_column("software_products", "registration_number")
