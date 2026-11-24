"""merge feedbacks and contracts heads

Revision ID: e793a6234474
Revises: d2f6b87c1a04, 06d3fd2fdcaa
Create Date: 2026-11-24 14:45:56.633858

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e793a6234474'
down_revision: Union[str, Sequence[str], None] = ('d2f6b87c1a04', '06d3fd2fdcaa')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
