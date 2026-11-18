"""add contact person id to invitations

Revision ID: 738a6073778c
Revises: 3fd029c77bb8
Create Date: 2026-11-17 12:59:24.198814

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '738a6073778c'
down_revision: Union[str, Sequence[str], None] = '3fd029c77bb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invitations",
        sa.Column("contact_person_id", sa.UUID(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invitations", "contact_person_id")
