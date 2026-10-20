"""add uuid v7 compatibility function

Revision ID: ebb2c313d4d0
Revises: f2ac4ba8aea1
Create Date: 2026-10-20 14:28:31.429054

"""
# ruff: noqa: INP001

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "ebb2c313d4d0"
down_revision: str | Sequence[str] | None = "f2ac4ba8aea1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE OR REPLACE FUNCTION uuid_generate_v7() "
        "RETURNS uuid "
        "LANGUAGE sql "
        "AS 'SELECT uuidv7()'"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS uuid_generate_v7()")
