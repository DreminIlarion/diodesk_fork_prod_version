"""add_audit_cols_to_stage_assignees

Revision ID: f2ac4ba8aea1
Revises: 6a3a9b39cfc5
Create Date: 2026-10-13 06:55:36.533630

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2ac4ba8aea1'
down_revision: Union[str, Sequence[str], None] = '6a3a9b39cfc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "project_stage_assignees",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "project_stage_assignees",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("project_stage_assignees", "deleted_at")
    op.drop_column("project_stage_assignees", "updated_at")
