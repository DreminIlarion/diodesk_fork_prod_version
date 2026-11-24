"""add aggregate_type and aggregate_id

Revision ID: fc85bdb63db7
Revises: e793a6234474
Create Date: 2026-11-24 23:28:13.180392

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fc85bdb63db7'
down_revision: Union[str, Sequence[str], None] = 'e793a6234474'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE aggregatetype AS ENUM ('TICKET', 'TASK')")
    op.add_column(
        "comments",
        sa.Column(
            "aggregate_type",
            postgresql.ENUM("TICKET", "TASK", name="aggregatetype", create_type=False),
            nullable=True,
        ),
    )
    op.add_column("comments", sa.Column("aggregate_id", sa.Uuid(), nullable=True))
    op.execute("""
        UPDATE comments
        SET aggregate_type = 'TICKET', aggregate_id = ticket_id
        WHERE ticket_id IS NOT NULL
    """)
    op.alter_column("comments", "comment_type", new_column_name="visibility")
    op.execute("ALTER TYPE commenttype RENAME TO commentvisibility")


def downgrade() -> None:
    op.execute("ALTER TYPE commentvisibility RENAME TO commenttype")
    op.alter_column("comments", "visibility", new_column_name="comment_type")
    op.drop_column("comments", "aggregate_id")
    op.drop_column("comments", "aggregate_type")
    op.execute("DROP TYPE aggregatetype")
