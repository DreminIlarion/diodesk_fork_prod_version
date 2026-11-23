"""sync ticket and project member schema

Revision ID: a41c9d724f38
Revises: e890d8cc4ae7
Create Date: 2026-11-10 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a41c9d724f38"
down_revision: Union[str, Sequence[str], None] = "e890d8cc4ae7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Bring the database schema in line with the current ORM models."""
    op.add_column(
        "tickets",
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "tickets",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tickets",
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column(
        "project_members",
        "author_id",
        new_column_name="user_id",
        existing_type=sa.Uuid(),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Restore the column names and fields from the previous revision."""
    op.alter_column(
        "project_members",
        "user_id",
        new_column_name="author_id",
        existing_type=sa.Uuid(),
        existing_nullable=False,
    )
    op.drop_column("tickets", "resolved_at")
    op.drop_column("tickets", "approved_at")
    op.drop_column("tickets", "resolved_by")
