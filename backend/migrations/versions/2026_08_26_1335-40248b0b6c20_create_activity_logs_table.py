"""create activity logs table

Revision ID: 40248b0b6c20
Revises: c2e6e6f01135
Create Date: 2026-08-26 13:35:15.936223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '40248b0b6c20'
down_revision: Union[str, Sequence[str], None] = 'c2e6e6f01135'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "activity_logs",
        sa.Column("aggregate_type", sa.String(), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column(
            "occurred_on",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "changes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("event_id", sa.Uuid(), nullable=True),
        sa.Column("correlation_id", sa.Uuid(), nullable=True),
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
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_activity_logs_aggregate_type_id_date",
        "activity_logs",
        [
            "aggregate_type",
            "aggregate_id",
            sa.text("occurred_on DESC"),
        ],
        unique=False,
    )
    op.create_index(
        "ix_activity_logs_actor_action_date",
        "activity_logs",
        [
            "actor_id",
            "action",
            sa.text("occurred_on DESC"),
        ],
        unique=False,
    )
    op.create_index(
        "ix_activity_logs_changes_gin",
        "activity_logs",
        ["changes"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_activity_logs_meta_gin",
        "activity_logs",
        ["meta"],
        unique=False,
        postgresql_using="gin",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_activity_logs_meta_gin",
        table_name="activity_logs",
    )
    op.drop_index(
        "ix_activity_logs_changes_gin",
        table_name="activity_logs",
    )
    op.drop_index(
        "ix_activity_logs_actor_action_date",
        table_name="activity_logs",
    )
    op.drop_index(
        "ix_activity_logs_aggregate_type_id_date",
        table_name="activity_logs",
    )
    op.drop_table("activity_logs")
