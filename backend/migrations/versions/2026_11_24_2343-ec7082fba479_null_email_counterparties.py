"""null email counterparties

Revision ID: ec7082fba479
Revises: dbb8e5040b52
Create Date: 2026-11-24 23:43:47.627492

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec7082fba479'
down_revision: Union[str, Sequence[str], None] = 'dbb8e5040b52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("counterparties", "email", nullable=True)


def downgrade() -> None:
    op.alter_column("counterparties", "email", nullable=False)
