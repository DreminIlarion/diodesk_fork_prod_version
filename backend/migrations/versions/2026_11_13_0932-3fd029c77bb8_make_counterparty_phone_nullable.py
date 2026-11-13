"""make_counterparty_phone_nullable

Revision ID: 3fd029c77bb8
Revises: e82ba1dde3c4
Create Date: 2026-11-13 09:32:14.719445

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3fd029c77bb8'
down_revision: Union[str, Sequence[str], None] = 'e82ba1dde3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "counterparties",
        "phone",
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    # phone теперь может быть NULL; откат не восстанавливаем, чтобы не терять данные
    pass
