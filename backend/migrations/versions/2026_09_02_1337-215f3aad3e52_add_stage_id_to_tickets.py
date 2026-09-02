"""add stage id to tickets

Revision ID: 215f3aad3e52
Revises: 40248b0b6c20
Create Date: 2026-09-02 13:37:33.341134

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '215f3aad3e52'
down_revision: Union[str, Sequence[str], None] = '40248b0b6c20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("stage_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tickets_stage_id_project_stages",
        "tickets",
        "project_stages",
        ["stage_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_tickets_stage_id",
        "tickets",
        ["stage_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tickets_stage_id",
        table_name="tickets",
    )
    op.drop_constraint(
        "fk_tickets_stage_id_project_stages",
        "tickets",
        type_="foreignkey",
    )
    op.drop_column("tickets", "stage_id")
