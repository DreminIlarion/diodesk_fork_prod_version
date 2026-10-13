"""sync schema with models

Модели менялись без миграций, из-за чего падали комментарии, реакции, уведомления,
участники проектов и заявки. Миграция приводит схему к моделям, сохраняя данные:
колонки переименовываются, а не пересоздаются, значения переносятся в новые поля.

Revision ID: 8c1f4d2a9b7e
Revises: 215f3aad3e52
Create Date: 2026-10-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8c1f4d2a9b7e'
down_revision: Union[str, Sequence[str], None] = '215f3aad3e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

aggregate_type = postgresql.ENUM('TICKET', 'TASK', name='aggregatetype', create_type=False)
reaction_type = postgresql.ENUM(
    'LIKE', 'THANKS', 'IN_PROGRESS', 'RESOLVED', 'IMPORTANT', name='reactiontype', create_type=False,
)

# Связи пользователя: author_id переименован в user_id
USER_COLUMN_TABLES = ('notifications', 'user_preferences', 'project_members')


def upgrade() -> None:
    # Этапы жизненного цикла заявки
    op.add_column('tickets', sa.Column('resolved_by', sa.Uuid(), nullable=True))
    op.add_column('tickets', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tickets', sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True))

    # Контрагент может не иметь email
    op.alter_column('counterparties', 'email', existing_type=sa.String(), nullable=True)

    # Индексы и уникальные ограничения переезжают вместе с колонкой
    for table in USER_COLUMN_TABLES:
        op.alter_column(table, 'author_id', new_column_name='user_id')

    # Комментарии к любым агрегатам (заявки, задачи) вместо только заявок
    op.execute('ALTER TYPE commenttype RENAME TO commentvisibility')
    op.alter_column('comments', 'comment_type', new_column_name='visibility')

    aggregate_type.create(op.get_bind(), checkfirst=True)
    op.add_column('comments', sa.Column('aggregate_type', aggregate_type, nullable=True))
    op.add_column('comments', sa.Column('aggregate_id', sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE comments SET aggregate_type = 'TICKET', aggregate_id = ticket_id "
        "WHERE ticket_id IS NOT NULL"
    )
    op.alter_column('comments', 'ticket_id', existing_type=sa.Uuid(), nullable=True)
    op.create_index('ix_comments_aggregate', 'comments', ['aggregate_type', 'aggregate_id'])

    # Реакция хранит произвольный код (like, thanks, ...) вместо фиксированного enum
    op.add_column('reactions', sa.Column('emoji', sa.String(), nullable=True))
    op.execute('UPDATE reactions SET emoji = lower(reaction_type::text)')
    op.alter_column('reactions', 'emoji', existing_type=sa.String(), nullable=False)
    op.drop_constraint('uq_comment_reaction', 'reactions', type_='unique')
    op.create_unique_constraint(
        'uq_comment_reaction', 'reactions', ['comment_id', 'author_id', 'emoji'],
    )
    op.drop_column('reactions', 'reaction_type')
    reaction_type.drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Реакции, которых не было в старом enum, откатить нельзя
    reaction_type.create(op.get_bind(), checkfirst=True)
    op.execute(
        "DELETE FROM reactions "
        "WHERE emoji NOT IN ('like', 'thanks', 'in_progress', 'resolved', 'important')"
    )
    op.add_column('reactions', sa.Column('reaction_type', reaction_type, nullable=True))
    op.execute('UPDATE reactions SET reaction_type = upper(emoji)::reactiontype')
    op.alter_column('reactions', 'reaction_type', existing_type=reaction_type, nullable=False)
    op.drop_constraint('uq_comment_reaction', 'reactions', type_='unique')
    op.create_unique_constraint(
        'uq_comment_reaction', 'reactions', ['comment_id', 'author_id', 'reaction_type'],
    )
    op.drop_column('reactions', 'emoji')

    # Комментарии к задачам в старой схеме хранить негде
    op.execute(
        'DELETE FROM reactions WHERE comment_id IN (SELECT id FROM comments WHERE ticket_id IS NULL)'
    )
    op.execute('DELETE FROM comments WHERE ticket_id IS NULL')
    op.drop_index('ix_comments_aggregate', table_name='comments')
    op.alter_column('comments', 'ticket_id', existing_type=sa.Uuid(), nullable=False)
    op.drop_column('comments', 'aggregate_id')
    op.drop_column('comments', 'aggregate_type')
    aggregate_type.drop(op.get_bind(), checkfirst=True)
    op.alter_column('comments', 'visibility', new_column_name='comment_type')
    op.execute('ALTER TYPE commentvisibility RENAME TO commenttype')

    for table in USER_COLUMN_TABLES:
        op.alter_column(table, 'user_id', new_column_name='author_id')

    op.alter_column('counterparties', 'email', existing_type=sa.String(), nullable=False)

    op.drop_column('tickets', 'resolved_at')
    op.drop_column('tickets', 'approved_at')
    op.drop_column('tickets', 'resolved_by')
