"""backfill_contact_person_ids

Revision ID: 38525d040bc5
Revises: cf4807c33484
Create Date: 2026-10-27 06:35:14.020814

"""
import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '38525d040bc5'
down_revision: Union[str, Sequence[str], None] = 'cf4807c33484'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, contact_persons FROM counterparties "
        "WHERE contact_persons IS NOT NULL "
        "AND jsonb_typeof(contact_persons) = 'array' "
        "AND jsonb_array_length(contact_persons) > 0"
    )).fetchall()

    for row in rows:
        persons = row.contact_persons or []
        changed = False
        for p in persons:
            if "id" not in p:
                p["id"] = str(uuid.uuid4())
                changed = True
        if changed:
            conn.execute(
                sa.text(
                    "UPDATE counterparties "
                    "SET contact_persons = CAST(:cp AS JSONB) "
                    "WHERE id = :id"
                ),
                {"cp": json.dumps(persons), "id": row.id},
            )


def downgrade() -> None:
    """Downgrade schema."""
    pass
