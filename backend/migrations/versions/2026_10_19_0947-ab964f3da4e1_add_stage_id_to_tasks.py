"""add_stage_id_to_tasks

Revision ID: ab964f3da4e1
Revises: 304eb98a2792
Create Date: 2026-10-19 09:47:12.926513

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'ab964f3da4e1'
down_revision: Union[str, Sequence[str], None] = '304eb98a2792'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tasks',
        sa.Column('stage_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_tasks_stage_id_project_stages',
        'tasks',
        'project_stages',
        ['stage_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_tasks_stage_id',
        'tasks',
        ['stage_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_stage_id', table_name='tasks')
    op.drop_constraint(
        'fk_tasks_stage_id_project_stages',
        'tasks',
        type_='foreignkey',
    )
    op.drop_column('tasks', 'stage_id')
