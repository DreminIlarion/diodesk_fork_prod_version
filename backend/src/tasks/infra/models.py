from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.media.infra.models import AttachmentOrm

from datetime import date, datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    column,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.shared.domain.vo import Priority

from ..domain.vo import TaskStatus


class TaskOrm(EntityMixin, Base):
    __tablename__ = "tasks"

    ticket_id: Mapped[UUID | None] = mapped_column(nullable=True)
    project_id: Mapped[UUID | None] = mapped_column(nullable=True)
    stage_id: Mapped[UUID | None] = mapped_column(nullable=True, index=True)

    number: Mapped[str] = mapped_column(unique=True)
    title: Mapped[str]
    description: Mapped[str | None] = mapped_column(nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus))
    priority: Mapped[Priority] = mapped_column(Enum(Priority))
    story_points: Mapped[int | None] = mapped_column(nullable=True)

    assignee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    reviewer_id: Mapped[UUID | None] = mapped_column(nullable=True)

    estimated_hours: Mapped[float | None] = mapped_column(nullable=True)
    actual_hours: Mapped[float] = mapped_column(default=0.0)

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    working_since: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_by: Mapped[UUID]

    tags: Mapped[list[dict[str, str]]] = mapped_column(JSONB)

    attachments: Mapped[list["AttachmentOrm"]] = relationship(  # noqa: UP037
        primaryjoin=(
            "and_(AttachmentOrm.owner_type=='task', "
            "foreign(AttachmentOrm.owner_id)==TaskOrm.id)"
        ),
        lazy="selectin",
        viewonly=True,
    )

    parent_task_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        CheckConstraint(
            column("parent_task_id") != column("id"),
            name="ck_tasks_parent_not_self",
        ),
    )


class TaskSequence(EntityMixin, Base):
    __tablename__ = "tasks_sequences"

    project_id: Mapped[UUID | None] = mapped_column(nullable=True)
    ticket_id: Mapped[UUID | None] = mapped_column(nullable=True)
    last_number: Mapped[int]

    __table_args__ = (
        UniqueConstraint(
            "project_id", "ticket_id", name="uq_task_sequences", postgresql_nulls_not_distinct=True
        ),
    )


class TaskRelationOrm(Base):
    __tablename__ = "task_relations"

    left_task_id: Mapped[UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    right_task_id: Mapped[UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            column("left_task_id") < column("right_task_id"),
            name="ck_task_relations_ordered_pair",
        ),
    )
