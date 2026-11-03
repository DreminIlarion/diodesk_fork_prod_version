"""merge uuid v7 compatibility and main heads

Revision ID: e890d8cc4ae7
Revises: ebb2c313d4d0, 38525d040bc5
Create Date: 2026-11-03 13:40:54.231582

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e890d8cc4ae7'
down_revision: Union[str, Sequence[str], None] = ('ebb2c313d4d0', '38525d040bc5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
