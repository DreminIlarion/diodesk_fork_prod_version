"""add article to software products

Revision ID: 6d1bfb4224dc
Revises: 215f3aad3e52
Create Date: 2026-09-11 12:36:04.135626

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d1bfb4224dc'
down_revision: Union[str, Sequence[str], None] = '215f3aad3e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "software_products",
        sa.Column("article", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("software_products", "article")
