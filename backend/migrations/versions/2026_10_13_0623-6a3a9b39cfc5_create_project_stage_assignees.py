"""create_project_stage_assignees

Revision ID: 6a3a9b39cfc5
Revises: 215f3aad3e52
Create Date: 2026-10-13 06:23:27.189857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a3a9b39cfc5'
down_revision: Union[str, Sequence[str], None] = '215f3aad3e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "project_stage_assignees",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("stage_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["stage_id"], ["project_stages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stage_id", "user_id", name="uq_stage_assignee"),
    )
    op.create_index("ix_project_stage_assignees_stage", "project_stage_assignees", ["stage_id"])
    op.create_index("ix_project_stage_assignees_user", "project_stage_assignees", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_project_stage_assignees_user", table_name="project_stage_assignees")
    op.drop_index("ix_project_stage_assignees_stage", table_name="project_stage_assignees")
    op.drop_table("project_stage_assignees")
