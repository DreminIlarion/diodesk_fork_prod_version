"""add_stage_id_to_tickets

Revision ID: 304eb98a2792
Revises: f2ac4ba8aea1
Create Date: 2026-10-14 07:19:35.043433

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '304eb98a2792'
down_revision: Union[str, Sequence[str], None] = 'f2ac4ba8aea1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """The stage_id column was already added by revision 215f3aad3e52."""


def downgrade() -> None:
    """No-op because this revision does not own the stage_id column."""
