"""add counterparty product indexes

Revision ID: a992a2a9054a
Revises: 215f3aad3e52
Create Date: 2026-09-03 14:05:15.426093

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a992a2a9054a'
down_revision: Union[str, Sequence[str], None] = '215f3aad3e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "ix_counterparty_products_product_id",
        "counterparty_products",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        "ix_counterparty_products_counterparty_id_product_id",
        "counterparty_products",
        ["counterparty_id", "product_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_counterparty_products_counterparty_id_product_id",
        table_name="counterparty_products",
    )
    op.drop_index(
        "ix_counterparty_products_product_id",
        table_name="counterparty_products",
    )
