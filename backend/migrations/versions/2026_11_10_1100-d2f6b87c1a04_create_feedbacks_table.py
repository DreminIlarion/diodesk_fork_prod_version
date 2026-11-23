"""create feedbacks table

Revision ID: d2f6b87c1a04
Revises: a41c9d724f38
Create Date: 2026-11-10 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2f6b87c1a04"
down_revision: Union[str, Sequence[str], None] = "a41c9d724f38"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the table used by the feedback service."""
    op.create_table(
        "feedbacks",
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_feedbacks_rating_range",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_id", name="uq_feedbacks_ticket_id"),
    )


def downgrade() -> None:
    """Remove the feedback table."""
    op.drop_table("feedbacks")
