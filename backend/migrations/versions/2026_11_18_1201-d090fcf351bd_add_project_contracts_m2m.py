"""add_project_contracts_m2m

Revision ID: d090fcf351bd
Revises: 738a6073778c
Create Date: 2026-11-18 12:01:07.849322

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd090fcf351bd'
down_revision: Union[str, Sequence[str], None] = '738a6073778c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_contracts",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("contract_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "contract_id", name="uq_project_contracts_project_contract"),
    )
    op.create_index("ix_project_contracts_project", "project_contracts", ["project_id"])
    op.create_index("ix_project_contracts_contract", "project_contracts", ["contract_id"])


def downgrade() -> None:
    op.drop_index("ix_project_contracts_contract", table_name="project_contracts")
    op.drop_index("ix_project_contracts_project", table_name="project_contracts")
    op.drop_table("project_contracts")
