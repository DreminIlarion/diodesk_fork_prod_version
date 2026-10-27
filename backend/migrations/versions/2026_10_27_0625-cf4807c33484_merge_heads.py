"""merge heads

Revision ID: cf4807c33484
Revises: ab964f3da4e1, b91d4e7f2a36
Create Date: 2026-10-27 06:25:45.440743

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cf4807c33484'
down_revision: Union[str, Sequence[str], None] = ('ab964f3da4e1', 'b91d4e7f2a36')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
