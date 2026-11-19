"""add_cancelled_to_project_status

Revision ID: 06d3fd2fdcaa
Revises: d090fcf351bd
Create Date: 2026-11-19 09:05:39.328160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06d3fd2fdcaa'
down_revision: Union[str, Sequence[str], None] = 'd090fcf351bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute("ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    pass  # Postgres не поддерживает удаление значения из enum
