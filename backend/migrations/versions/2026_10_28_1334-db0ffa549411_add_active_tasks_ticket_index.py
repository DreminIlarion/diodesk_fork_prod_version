"""add active tasks ticket index

Revision ID: db0ffa549411
Revises: 38525d040bc5
Create Date: 2026-10-28 13:34:42.612535

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db0ffa549411'
down_revision: Union[str, Sequence[str], None] = '38525d040bc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_ticket_id_active",
        "tasks",
        ["ticket_id"],
        unique=False,
        postgresql_where=sa.text(
            "ticket_id IS NOT NULL AND deleted_at IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tasks_ticket_id_active",
        table_name="tasks",
    )
