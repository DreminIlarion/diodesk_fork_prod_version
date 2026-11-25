"""add_work_type_to_tickets

Revision ID: 522d2f8bbee6
Revises: ec7082fba479
Create Date: 2026-11-25 12:03:44.595561

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '522d2f8bbee6'
down_revision: Union[str, Sequence[str], None] = 'ec7082fba479'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("work_type", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "work_type")
