from typing import ClassVar

from decimal import Decimal
from uuid import UUID

from ddf.application.dtos import QueryDTO
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.filters import compile_filter
from sqlalchemy import (
    BigInteger,
    ColumnElement,
    and_,
    cast,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql.selectable import CTE

from src.media.infra.repo import AttachmentMapper
from src.shared.domain.vo import Tag
from src.shared.infra.repos import ModelMapper
from src.shared.schemas import Page, Pagination

from ..domain.entities import Task
from ..domain.repos import RelationKind, TaskBrief, TaskLinks, TaskView
from ..domain.vo import StoryPoints, TaskNumber, TaskStatus
from .models import TaskOrm, TaskRelationOrm, TaskSequence

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
    "stageId",
    "createdBy",
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
    "estimatedHours",
    "actualHours",
)


def compile_task_search(query: str) -> ColumnElement[bool]:
    """Компилирует текстовый поиск по номеру, заголовку и описанию."""

    pattern = f"%{query}%"
    return or_(
        TaskOrm.number.ilike(pattern),
        TaskOrm.title.ilike(pattern),
        TaskOrm.description.ilike(pattern),
    )


TASK_GRAPH_LOCK_KEY = 0x44494F5441534B


def _task_subtree(task_id: UUID) -> CTE:
    """Построить запрос идентификаторов корня и всех его потомков."""

    nodes = (
        select(TaskOrm.id.label("id"))
        .where(TaskOrm.id == task_id)
        .cte("task_subtree", recursive=True)
    )

    return nodes.union(
        select(TaskOrm.id)
        .select_from(TaskOrm)
        .join(
            nodes,
            TaskOrm.parent_task_id == nodes.c.id,
        )
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
            stage_id=model.stage_id,
            parent_task_id=model.parent_task_id,
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
            stage_id=entity.stage_id,
            parent_task_id=entity.parent_task_id,
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
            attachments=[
                AttachmentMapper.from_entity(attachment) for attachment in entity.attachments
            ],
        )

    def from_model(self, model: TaskOrm) -> Task:
        return self.to_entity(model)

    def to_model(self, entity: Task) -> TaskOrm:
        return self.from_entity(entity)

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
            estimated_hours=(
                None if model.estimated_hours is None else Decimal(model.estimated_hours)
            ),
            actual_hours=None if model.actual_hours is None else Decimal(model.actual_hours),
            started_at=model.started_at,        # ← Добавиl
            completed_at=model.completed_at,    # ← Добавил
            working_since=model.working_since,  # ← Добавил
            project_id=model.project_id,
            stage_id=model.stage_id,
            ticket_id=model.ticket_id,
            parent_task_id=model.parent_task_id,
            attachments=[AttachmentMapper.to_entity(a) for a in model.attachments],
            tags={Tag(name=tag["name"], color=tag["color"]) for tag in model.tags},
        )


class SqlTaskRepository(SqlAlchemyRepository[Task, TaskOrm]):
    model = TaskOrm
    data_mapper = TaskMapper()
    filter_whitelist: ClassVar[tuple[str, ...]] = TASK_FILTER_WHITELIST

    async def lock_graph(self) -> None:
        await self._session.execute(
            select(
                func.pg_advisory_xact_lock(
                    cast(
                        literal(TASK_GRAPH_LOCK_KEY),
                        BigInteger,
                    )
                )
            )
        )

    async def read_for_update(
        self,
        task_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> Task | None:
        stmt = select(self.model).where(
            self.model.id == task_id,
        )

        if not include_deleted:
            stmt = stmt.where(
                self.model.deleted_at.is_(None),
            )

        stmt = (
            stmt
            .with_for_update(of=self.model)
            .execution_options(populate_existing=True)
        )

        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        return (
            None
            if model is None
            else self.data_mapper.from_model(model)
        )

    async def subtree_ids(self, task_id: UUID) -> set[UUID]:
        nodes = _task_subtree(task_id)

        result = await self._session.execute(
            select(nodes.c.id)
        )

        return set(result.scalars().all())

    async def subtree_for_update(
        self,
        task_id: UUID,
    ) -> list[Task]:
        nodes = _task_subtree(task_id)

        stmt = (
            select(self.model)
            .where(
                self.model.id.in_(
                    select(nodes.c.id)
                )
            )
            .order_by(self.model.id)
            .with_for_update(of=self.model)
            .execution_options(populate_existing=True)
        )

        result = await self._session.execute(stmt)
        models = result.scalars().all()

        return [
            self.data_mapper.from_model(model)
            for model in models
        ]

    async def get_links(
        self,
        task_ids: list[UUID],
    ) -> dict[UUID, TaskLinks]:
        links = {
            task_id: TaskLinks()
            for task_id in task_ids
        }

        if not links:
            return links

        ids = list(links)
        source = self.model.__table__.alias("source_task")
        peer = self.model.__table__.alias("peer_task")

        children_stmt = (
            select(
                source.c.id,
                self.model.id,
            )
            .select_from(self.model)
            .join(
                source,
                source.c.id == self.model.parent_task_id,
            )
            .where(
                source.c.id.in_(ids),
                source.c.deleted_at.is_(None),
                self.model.deleted_at.is_(None),
            )
        )

        result = await self._session.execute(children_stmt)

        for parent_id, child_id in result:
            links[parent_id].subtasks.add(child_id)

        relation = TaskRelationOrm

        edges = (
            select(
                relation.left_task_id.label("owner_id"),
                relation.right_task_id.label("peer_id"),
            )
            .where(
                relation.left_task_id.in_(ids),
                relation.deleted_at.is_(None),
            )
            .union_all(
                select(
                    relation.right_task_id.label("owner_id"),
                    relation.left_task_id.label("peer_id"),
                )
                .where(
                    relation.right_task_id.in_(ids),
                    relation.deleted_at.is_(None),
                )
            )
            .subquery("task_edges")
        )

        related_stmt = (
            select(
                edges.c.owner_id,
                edges.c.peer_id,
            )
            .select_from(edges)
            .join(
                source,
                source.c.id == edges.c.owner_id,
            )
            .join(
                peer,
                peer.c.id == edges.c.peer_id,
            )
            .where(
                source.c.deleted_at.is_(None),
                peer.c.deleted_at.is_(None),
            )
        )

        result = await self._session.execute(related_stmt)

        for owner_id, peer_id in result:
            links[owner_id].related_tasks.add(peer_id)

        return links

    async def list_linked(
        self,
        task_id: UUID,
        kind: RelationKind,
        pagination: Pagination,
    ) -> Page[TaskBrief]:
        stmt = (
            select(
                self.model.id,
                self.model.number,
                self.model.title,
                self.model.status,
            )
            .where(
                self.model.deleted_at.is_(None),
            )
        )

        if kind == "subtasks":
            stmt = stmt.where(
                self.model.parent_task_id == task_id,
            )
        else:
            relation = TaskRelationOrm

            peer_ids = (
                select(
                    relation.right_task_id.label("id"),
                )
                .where(
                    relation.left_task_id == task_id,
                    relation.deleted_at.is_(None),
                )
                .union_all(
                    select(
                        relation.left_task_id.label("id"),
                    )
                    .where(
                        relation.right_task_id == task_id,
                        relation.deleted_at.is_(None),
                    )
                )
                .subquery("related_task_ids")
            )

            stmt = stmt.join(
                peer_ids,
                peer_ids.c.id == self.model.id,
            )

        total_items = await self._session.scalar(
            select(func.count()).select_from(
                stmt.subquery()
            )
        )

        stmt = (
            stmt
            .order_by(
                self.model.created_at,
                self.model.id,
            )
            .offset(pagination.offset)
            .limit(pagination.size)
        )

        result = await self._session.execute(stmt)
        rows = result.mappings().all()

        return Page.create(
            items=[
                TaskBrief(**row)
                for row in rows
            ],
            total_items=total_items or 0,
            page=pagination.page,
            size=pagination.size,
        )

    async def get_by_number(self, number: TaskNumber) -> Task | None:
        stmt = select(self.model).where(self.model.number == number.value)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)

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
            count_stmt = count_stmt.where(
                TaskOrm.ticket_id.is_(None),
                TaskOrm.project_id.is_(None),
            )

        real_count = await self._session.scalar(count_stmt)
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

        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def search(
            self,
            pagination: Pagination,
            *,
            query: QueryDTO | None = None,
    ) -> Page[TaskView]:
        conditions = [self.model.deleted_at.is_(None)]

        if query is not None:
            conditions.append(
                compile_filter(
                    self.model,
                    query,
                    self.filter_whitelist,
                    compile_task_search,
                )
            )

        stmt = (
            select(self.model)
            .where(*conditions)
            .order_by(
                self.model.priority.desc(),
                self.model.due_date.asc().nulls_last(),
            )
        )
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_items = await self._session.scalar(count_stmt) or 0
        stmt = stmt.offset(pagination.offset).limit(pagination.size)
        results = await self._session.execute(stmt)
        return Page.create(
            items=[TaskMapper.to_view(model) for model in results.scalars().all()],
            total_items=total_items,
            page=pagination.page,
            size=pagination.size,
        )

    async def get_grouped_by_status(
            self,
            pagination: Pagination,
            *,
            query: QueryDTO | None = None,
    ) -> dict[TaskStatus, Page[TaskView]]:
        # Общие условия фильтрации (исключаем удалённые задачи)
        conditions = [self.model.deleted_at.is_(None)]

        if query is not None:
            conditions.append(
                compile_filter(
                    self.model,
                    query,
                    self.filter_whitelist,
                    compile_task_search,
                )
            )

        # Пагинация задач для каждого статуса
        grouped: dict[TaskStatus, Page[TaskView]] = {}

        for status in TaskStatus:
            # Базовый запрос для получения задач
            stmt = select(self.model).where(and_(*conditions), self.model.status == status)

            # Подсчёт общего количества задач в статусе
            count_stmt = select(func.count()).select_from(stmt.subquery())
            total_items = await self._session.scalar(count_stmt)

            # Запрос для пагинации
            stmt = (
                stmt
                .order_by(self.model.priority.desc(), self.model.created_at.desc())
                .offset(pagination.offset)
                .limit(pagination.size)
            )
            results = await self._session.execute(stmt)
            models = results.scalars().all()

            grouped[status] = Page.create(
                items=[TaskMapper.to_view(model) for model in models],
                total_items=total_items,
                page=pagination.page,
                size=pagination.size,
            )

        return grouped

    async def set_related(
        self,
        task_id: UUID,
        related_task_id: UUID,
        *,
        linked: bool,
    ) -> bool:
        left_id, right_id = sorted(
            (task_id, related_task_id)
        )

        if linked:
            stmt = (
                pg_insert(TaskRelationOrm)
                .values(
                    left_task_id=left_id,
                    right_task_id=right_id,
                    deleted_at=None,
                )
                .on_conflict_do_update(
                    index_elements=[
                        TaskRelationOrm.left_task_id,
                        TaskRelationOrm.right_task_id,
                    ],
                    set_={
                        "deleted_at": None,
                        "updated_at": func.now(),
                    },
                    where=TaskRelationOrm.deleted_at.is_not(None),
                )
                .returning(
                    TaskRelationOrm.left_task_id,
                )
            )
        else:
            stmt = (
                update(TaskRelationOrm)
                .where(
                    TaskRelationOrm.left_task_id == left_id,
                    TaskRelationOrm.right_task_id == right_id,
                    TaskRelationOrm.deleted_at.is_(None),
                )
                .values(
                    deleted_at=func.now(),
                    updated_at=func.now(),
                )
                .returning(
                    TaskRelationOrm.left_task_id,
                )
            )

        result = await self._session.execute(stmt)

        return result.scalar_one_or_none() is not None
