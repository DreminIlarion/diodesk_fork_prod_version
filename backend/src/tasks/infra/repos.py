from collections.abc import Collection
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.media.infra.repo import AttachmentMapper
from src.shared.domain.vo import Priority, Tag
from src.shared.infra.repos import ModelMapper, SqlAlchemyRepository
from src.shared.schemas import Page, Pagination
from src.shared.utils.time import current_datetime

from ..domain.assignment import CompletedTask, Workload
from ..domain.dtos import TaskSearchFilters
from ..domain.entities import Task
from ..domain.repos import TaskView
from ..domain.vo import StoryPoints, TaskNumber, TaskStatus
from .models import TaskOrm, TaskSequence

FINISHED_STATUSES = frozenset(status for status in TaskStatus if status.is_finished)


def _to_decimal(value: float | None) -> Decimal:
    return Decimal(0) if value is None else Decimal(str(value))


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
            project_id: UUID | None = None,
            ticket_id: UUID | None = None,
            assignee_id: UUID | None = None,
            created_by: UUID | None = None,  # ← добавить
            reviewer_id: UUID | None = None,
            # Дополнительные фильтры
            priorities: list[Priority] | None = None,
            overdue_only: bool = False,
    ) -> dict[TaskStatus, Page[TaskView]]:
        # Общие условия фильтрации (исключаем удалённые задачи)
        conditions = [self.model.deleted_at.is_(None)]

        # Применение фильтра по проекту
        if project_id is not None:
            conditions.append(self.model.project_id == project_id)

        # Остальные фильтры
        if ticket_id is not None:
            conditions.append(self.model.ticket_id == ticket_id)

        user_conditions = []

        if assignee_id is not None:
            user_conditions.append(
                self.model.assignee_id == assignee_id
            )

        if created_by is not None:
            user_conditions.append(
                self.model.created_by == created_by
            )

        if reviewer_id is not None:
            user_conditions.append(
                self.model.reviewer_id == reviewer_id
            )

        if user_conditions:
            conditions.append(or_(*user_conditions))  

        if priorities is not None:
            conditions.append(self.model.priority.in_(priorities))

        if overdue_only:
            today = current_datetime().date()
            conditions.extend([
                self.model.due_date < today,
                self.model.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]),
            ])

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

    def _build_search_conditions(  # noqa: C901
            self, filters: TaskSearchFilters,
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []

        if not filters.include_archived:
            conditions.append(self.model.deleted_at.is_(None))

        if filters.query:
            conditions.append(or_(
                self.model.number.icontains(filters.query, autoescape=True),
                self.model.title.icontains(filters.query, autoescape=True),
                self.model.description.icontains(filters.query, autoescape=True),
            ))

        if filters.statuses:
            conditions.append(self.model.status.in_(filters.statuses))

        if filters.priorities:
            conditions.append(self.model.priority.in_(filters.priorities))

        if filters.tags:
            conditions.append(or_(*(
                self.model.tags.contains([{"name": tag}]) for tag in filters.tags
            )))

        if filters.unassigned_only:
            conditions.append(self.model.assignee_id.is_(None))
        elif filters.assignee_id is not None:
            conditions.append(self.model.assignee_id == filters.assignee_id)

        if filters.reviewer_id is not None:
            conditions.append(self.model.reviewer_id == filters.reviewer_id)

        if filters.created_by is not None:
            conditions.append(self.model.created_by == filters.created_by)

        if filters.project_id is not None:
            conditions.append(self.model.project_id == filters.project_id)

        if filters.ticket_id is not None:
            conditions.append(self.model.ticket_id == filters.ticket_id)

        if filters.overdue_only:
            conditions.extend((
                self.model.due_date < current_datetime().date(),
                self.model.status.notin_(FINISHED_STATUSES),
            ))

        return conditions

    async def search(
            self, filters: TaskSearchFilters, pagination: Pagination,
    ) -> Page[TaskView]:
        stmt = (
            select(self.model)
            .where(*self._build_search_conditions(filters))
            .order_by(self.model.priority.desc(), self.model.due_date.asc().nulls_last())
        )
        return await self._paginate(stmt, pagination, model_mapper=self.model_mapper.to_view)

    async def get_workloads(self, user_ids: Collection[UUID]) -> list[Workload]:
        if not user_ids:
            return []

        is_active = and_(
            self.model.deleted_at.is_(None), self.model.status.notin_(FINISHED_STATUSES),
        )
        remaining_hours = func.greatest(self.model.estimated_hours - self.model.actual_hours, 0)

        assigned_stmt = (
            select(
                self.model.assignee_id,
                func.count(),
                func.count().filter(self.model.status == TaskStatus.IN_PROGRESS),
                func.count().filter(self.model.due_date < current_datetime().date()),
                func.coalesce(func.sum(self.model.story_points), 0),
                func.coalesce(func.sum(remaining_hours), 0),
                func.count().filter(self.model.estimated_hours.is_(None)),
            )
            .where(is_active, self.model.assignee_id.in_(user_ids))
            .group_by(self.model.assignee_id)
        )
        review_stmt = (
            select(self.model.reviewer_id, func.count())
            .where(
                self.model.deleted_at.is_(None),
                self.model.status == TaskStatus.TO_REVIEW,
                self.model.reviewer_id.in_(user_ids),
            )
            .group_by(self.model.reviewer_id)
        )

        assigned = (await self.session.execute(assigned_stmt)).tuples().all()
        review_queue: dict[UUID, int] = dict(
            (await self.session.execute(review_stmt)).tuples().all()
        )

        workloads = {
            user_id: Workload(
                user_id=user_id,
                open_tasks=open_tasks,
                in_progress=in_progress,
                overdue=overdue,
                story_points=story_points,
                remaining_hours=_to_decimal(remaining),
                unestimated_tasks=unestimated,
                review_queue=review_queue.get(user_id, 0),
            )
            for (
                user_id, open_tasks, in_progress, overdue, story_points, remaining, unestimated
            ) in assigned
        }
        for user_id, count in review_queue.items():
            workloads.setdefault(user_id, Workload(user_id=user_id, review_queue=count))

        return list(workloads.values())

    async def get_completed(
            self, assignee_ids: Collection[UUID], *, since: datetime, limit: int,
    ) -> list[CompletedTask]:
        if not assignee_ids:
            return []

        finished_at = func.coalesce(self.model.completed_at, self.model.updated_at)
        stmt = (
            select(
                self.model.assignee_id,
                self.model.number,
                self.model.title,
                self.model.description,
                self.model.tags,
                self.model.estimated_hours,
                self.model.actual_hours,
                finished_at,
            )
            .where(
                self.model.deleted_at.is_(None),
                self.model.status == TaskStatus.DONE,
                self.model.assignee_id.in_(assignee_ids),
                finished_at >= since,
            )
            .order_by(finished_at.desc())
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).tuples().all()

        return [
            CompletedTask(
                assignee_id=assignee_id,
                number=number,
                title=title,
                description=description,
                tags=frozenset(tag["name"] for tag in tags or ()),
                estimated_hours=None if estimated is None else _to_decimal(estimated),
                actual_hours=_to_decimal(actual),
                completed_at=completed_at,
            )
            for (
                assignee_id, number, title, description, tags, estimated, actual, completed_at
            ) in rows
        ]
