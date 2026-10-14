from typing import Any, ClassVar

from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from ddf.application.dsl import Condition, Expression, Group, Negation
from ddf.infra.database.sqlalchemy.filters import compile_filter
from sqlalchemy import ColumnElement, and_, func, not_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.media.infra.repo import AttachmentMapper
from src.shared.domain.vo import Priority, Tag
from src.shared.infra.repos import ModelMapper, SqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Task
from ..domain.repos import TaskView
from ..domain.vo import StoryPoints, TaskNumber, TaskStatus
from .models import TaskOrm, TaskSequence

TASK_FILTER_WHITELIST = (
    "id",
    "number",
    "title",
    "description",
    "status",
    "priority",
    "storyPoints",
    "assigneeId",
    "reviewerId",
    "dueDate",
    "projectId",
    "ticketId",
    "createdBy",
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
    "estimatedHours",
    "actualHours",
    "tags",
)


def _to_uuid(value: Any) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _to_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    return date.fromisoformat(str(value))


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value

    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


_FIELD_VALUE_CONVERTERS: dict[str, Callable[[Any], Any]] = {
    "id": _to_uuid,
    "status": TaskStatus,
    "priority": Priority,
    "assigneeId": _to_uuid,
    "reviewerId": _to_uuid,
    "projectId": _to_uuid,
    "ticketId": _to_uuid,
    "createdBy": _to_uuid,
    "dueDate": _to_date,
    "createdAt": _to_datetime,
    "updatedAt": _to_datetime,
    "startedAt": _to_datetime,
    "completedAt": _to_datetime,
}


def _normalize_task_condition(condition: Condition) -> Condition:
    """Приводит значения DSL к типам ORM-модели."""

    converter = _FIELD_VALUE_CONVERTERS.get(condition.field)
    if converter is None or condition.value is None:
        return condition

    if condition.op in {"$in", "$nin"}:
        if not isinstance(condition.value, list):
            return condition

        value = [converter(item) for item in condition.value]
    else:
        value = converter(condition.value)

    return condition.model_copy(update={"value": value})


def _compile_tags_condition(
    condition: Condition,
) -> ColumnElement[bool]:
    """Компилирует фильтрацию JSONB-тегов с семантикой «любой из»."""

    if condition.op not in {"$in", "$nin"}:
        raise ValueError("Tags support only '$in' and '$nin' operators.")

    if not isinstance(condition.value, list) or not condition.value:
        raise ValueError("Tags filter expects a non-empty list.")

    if not all(isinstance(tag, str) for tag in condition.value):
        raise ValueError("Every tag must be a string.")

    matches_any_tag = or_(
        *(
            TaskOrm.tags.contains([{"name": tag}])
            for tag in condition.value
        )
    )

    if condition.op == "$nin":
        return not_(matches_any_tag)

    return matches_any_tag


def _compile_task_search(query: str) -> ColumnElement[bool]:
    """Компилирует текстовый поиск по номеру, заголовку и описанию."""

    pattern = f"%{query}%"

    return or_(
        TaskOrm.number.ilike(pattern),
        TaskOrm.title.ilike(pattern),
        TaskOrm.description.ilike(pattern),
    )


def _compile_task_expression(
    expression: Expression,
) -> ColumnElement[bool]:
    """Компилирует DDF DSL в SQLAlchemy-условие."""

    if isinstance(expression, Condition):
        if expression.field == "tags":
            return _compile_tags_condition(expression)

        return compile_filter(
            TaskOrm,
            _normalize_task_condition(expression),
            TASK_FILTER_WHITELIST,
            _compile_task_search,
        )

    if isinstance(expression, Group):
        filters = tuple(
            _compile_task_expression(child)
            for child in expression.filters
        )

        if not filters:
            raise ValueError("Filter group cannot be empty.")

        if expression.op == "$and":
            return and_(*filters)

        return or_(*filters)

    if isinstance(expression, Negation):
        return not_(_compile_task_expression(expression.filter_))

    return compile_filter(
        TaskOrm,
        expression,
        TASK_FILTER_WHITELIST,
        _compile_task_search,
    )


class TaskMapper(ModelMapper[Task, TaskOrm]):
    @staticmethod
    def to_entity(model: TaskOrm) -> Task:
        return Task(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            ticket_id=model.ticket_id,
            project_id=model.project_id,
            number=TaskNumber(model.number),
            title=model.title,
            description=model.description,
            status=model.status,
            priority=model.priority,
            story_points=None if model.story_points is None else StoryPoints(model.story_points),
            assignee_id=model.assignee_id,
            reviewer_id=model.reviewer_id,
            estimated_hours=(
                None if model.estimated_hours is None else Decimal(model.estimated_hours)
            ),
            actual_hours=None if model.actual_hours is None else Decimal(model.actual_hours),
            due_date=model.due_date,
            started_at=model.started_at,
            completed_at=model.completed_at,
            working_since=model.working_since,
            created_by=model.created_by,
            tags={Tag(name=tag["name"], color=tag["color"]) for tag in model.tags},
            attachments=[
                AttachmentMapper.to_entity(attachment) for attachment in model.attachments
            ],
        )

    @staticmethod
    def from_entity(entity: Task) -> TaskOrm:
        return TaskOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            ticket_id=entity.ticket_id,
            project_id=entity.project_id,
            number=entity.number.value,
            title=entity.title,
            description=entity.description,
            status=entity.status,
            priority=entity.priority,
            story_points=None if entity.story_points is None else entity.story_points.value,
            assignee_id=entity.assignee_id,
            reviewer_id=entity.reviewer_id,
            estimated_hours=(
                None if entity.estimated_hours is None else float(entity.estimated_hours)
            ),
            actual_hours=float(entity.actual_hours),
            due_date=entity.due_date,
            started_at=entity.started_at,
            completed_at=entity.completed_at,
            working_since=entity.working_since,
            created_by=entity.created_by,
            tags=[{"name": tag.name, "color": tag.color} for tag in entity.tags],
        )

    @staticmethod
    def to_view(model: TaskOrm) -> TaskView:
        return TaskView(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            number=TaskNumber(model.number),
            title=model.title,
            description=model.description,
            status=model.status,
            priority=model.priority,
            assignee_id=model.assignee_id,
            reviewer_id=model.reviewer_id,
            due_date=model.due_date,
            story_points=None if model.story_points is None else Decimal(model.story_points),
            estimated_hours=None if model.estimated_hours is None else Decimal(model.estimated_hours),
            actual_hours=None if model.actual_hours is None else Decimal(model.actual_hours),
            started_at=model.started_at,        # ← Добавиl
            completed_at=model.completed_at,    # ← Добавил
            working_since=model.working_since,  # ← Добавил
            project_id=model.project_id,
            ticket_id=model.ticket_id,
            attachments=[AttachmentMapper.to_entity(a) for a in model.attachments],
            tags={Tag(name=tag["name"], color=tag["color"]) for tag in model.tags},
        )


class SqlTaskRepository(SqlAlchemyRepository[Task, TaskOrm]):
    model = TaskOrm
    model_mapper = TaskMapper
    filter_whitelist: ClassVar[tuple[str, ...]] = TASK_FILTER_WHITELIST

    async def get_by_number(self, number: TaskNumber) -> Task | None:
        stmt = select(self.model).where(self.model.number == number.value)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_next_sequence(
            self, ticket_id: UUID | None = None, project_id: UUID | None = None
    ) -> int:
        # Считаем реальное количество задач
        count_stmt = select(func.count()).select_from(TaskOrm)
        if ticket_id is not None:
            count_stmt = count_stmt.where(TaskOrm.ticket_id == ticket_id)
        elif project_id is not None:
            count_stmt = count_stmt.where(TaskOrm.project_id == project_id)
        else:
            count_stmt = count_stmt.where(TaskOrm.ticket_id.is_(None), TaskOrm.project_id.is_(None))
        
        real_count = await self.session.scalar(count_stmt)
        next_num = (real_count or 0) + 1
        
        # Атомарная вставка/обновление
        stmt = (
            pg_insert(TaskSequence)
            .values(project_id=project_id, ticket_id=ticket_id, last_number=next_num)
            .on_conflict_do_update(
                constraint="uq_task_sequences",
                set_={"last_number": TaskSequence.last_number + 1},
            )
            .returning(TaskSequence.last_number)
        )
        
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def get_grouped_by_status(
            self,
            pagination: Pagination,
            *,
            query: Expression | None = None,
    ) -> dict[TaskStatus, Page[TaskView]]:
        # Общие условия фильтрации (исключаем удалённые задачи)
        conditions = [self.model.deleted_at.is_(None)]

        if query is not None:
            conditions.append(_compile_task_expression(query))

        # Пагинация задач для каждого статуса
        grouped: dict[TaskStatus, Page[TaskView]] = {}

        for status in TaskStatus:
            # Базовый запрос для получения задач
            stmt = select(self.model).where(and_(*conditions), self.model.status == status)

            # Подсчёт общего количества задач в статусе
            count_stmt = select(func.count()).select_from(stmt.subquery())
            total_items = await self.session.scalar(count_stmt)

            # Запрос для пагинации
            stmt = (
                stmt
                .order_by(self.model.priority.desc(), self.model.created_at.desc())
                .offset(pagination.offset)
                .limit(pagination.size)
            )
            results = await self.session.execute(stmt)
            models = results.scalars().all()

            grouped[status] = Page.create(
                items=[self.model_mapper.to_view(model) for model in models],
                total_items=total_items,
                page=pagination.page,
                size=pagination.size,
            )

        return grouped
