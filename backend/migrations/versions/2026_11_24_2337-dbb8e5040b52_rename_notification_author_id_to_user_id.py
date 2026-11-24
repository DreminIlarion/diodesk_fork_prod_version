"""rename notification author_id to user_id

Revision ID: dbb8e5040b52
Revises: 00de571cfdda
Create Date: 2026-11-24 23:37:58.291650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dbb8e5040b52'
down_revision: Union[str, Sequence[str], None] = '00de571cfdda'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column("notifications", "author_id", new_column_name="user_id")
    op.alter_column("user_preferences", "author_id", new_column_name="user_id")


def downgrade() -> None:
    op.alter_column("user_preferences", "user_id", new_column_name="author_id")
    op.alter_column("notifications", "user_id", new_column_name="author_id")
