"""add_task_relations

Revision ID: a6e48d957c21
Revises: 06d3fd2fdcaa, d2f6b87c1a04
Create Date: 2026-11-24 13:54:07.262441

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6e48d957c21'
down_revision: Union[str, Sequence[str], None] = ('06d3fd2fdcaa', 'd2f6b87c1a04')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("parent_task_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_parent_task_id_tasks",
        "tasks",
        "tasks",
        ["parent_task_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_tasks_parent_task_id",
        "tasks",
        ["parent_task_id"],
    )
    op.create_check_constraint(
        "ck_tasks_parent_not_self",
        "tasks",
        sa.column("parent_task_id") != sa.column("id"),
    )

    op.create_table(
        "task_relations",
        sa.Column("left_task_id", sa.Uuid(), nullable=False),
        sa.Column("right_task_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["left_task_id"],
            ["tasks.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["right_task_id"],
            ["tasks.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("left_task_id", "right_task_id"),
        sa.CheckConstraint(
            sa.column("left_task_id") < sa.column("right_task_id"),
            name="ck_task_relations_ordered_pair",
        ),
    )
    op.create_index(
        "ix_task_relations_right_task_id",
        "task_relations",
        ["right_task_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_task_relations_right_task_id",
        table_name="task_relations",
    )
    op.drop_table("task_relations")

    op.drop_constraint(
        "ck_tasks_parent_not_self",
        "tasks",
        type_="check",
    )
    op.drop_index("ix_tasks_parent_task_id", table_name="tasks")
    op.drop_constraint(
        "fk_tasks_parent_task_id_tasks",
        "tasks",
        type_="foreignkey",
    )
    op.drop_column("tasks", "parent_task_id")
