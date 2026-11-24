"""migrate reaction type to emoji

Revision ID: 00de571cfdda
Revises: fc85bdb63db7
Create Date: 2026-11-24 23:33:49.085945

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00de571cfdda'
down_revision: Union[str, Sequence[str], None] = 'fc85bdb63db7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("reactions", "reaction_type", new_column_name="emoji")
    op.execute("""
        ALTER TABLE reactions
        ALTER COLUMN emoji TYPE varchar
        USING lower(emoji::text)
    """)



def downgrade() -> None:
    """Downgrade schema."""
    pass
