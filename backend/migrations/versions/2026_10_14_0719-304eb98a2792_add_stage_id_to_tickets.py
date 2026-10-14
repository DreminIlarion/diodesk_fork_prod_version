"""add_stage_id_to_tickets

Revision ID: 304eb98a2792
Revises: f2ac4ba8aea1
Create Date: 2026-10-14 07:19:35.043433

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '304eb98a2792'
down_revision: Union[str, Sequence[str], None] = 'f2ac4ba8aea1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "tickets",
        sa.Column("stage_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tickets_stage_id_project_stages",
        "tickets",
        "project_stages",
        ["stage_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tickets_stage_id", "tickets", ["stage_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_tickets_stage_id", table_name="tickets")
    op.drop_constraint("fk_tickets_stage_id_project_stages", "tickets", type_="foreignkey")
    op.drop_column("tickets", "stage_id")
