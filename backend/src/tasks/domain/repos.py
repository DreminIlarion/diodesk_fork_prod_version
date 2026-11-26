from typing import Literal

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from ddf.application.dtos import QueryDTO

from src.shared.domain.repos import Repository
from src.shared.domain.vo import Priority, Tag
from src.shared.schemas import Page, Pagination

from .entities import Task
from .vo import TaskNumber, TaskStatus


@dataclass(frozen=True)
class TaskView:
    """
    Модель представления задачи (лёгкая модель для чтения)
    """

    id: UUID
    created_at: datetime
    updated_at: datetime

    number: TaskNumber
    title: str

    status: TaskStatus
    priority: Priority
    description: str | None = None

    assignee_id: UUID | None = None
    reviewer_id: UUID | None = None
    due_date: datetime | None = None
    story_points: Decimal | None = None
    estimated_hours: Decimal | None = None
    actual_hours: Decimal | None = None

    started_at: datetime | None = None  # ← Добавил
    completed_at: datetime | None = None  # ← Добавил
    working_since: datetime | None = None  # ← Добавил (таймер)

    stage_id: UUID | None = None

    project_id: UUID | None = None
    ticket_id: UUID | None = None
    parent_task_id: UUID | None = None
    attachments: list = field(default_factory=list)  # ← ДОБАВИ

    tags: set[Tag] = field(default_factory=set)


RelationKind = Literal["subtasks", "related"]


@dataclass(frozen=True)
class TaskBrief:
    """Краткое представление задачи для списков связей."""

    id: UUID
    number: str
    title: str
    status: TaskStatus


@dataclass
class TaskLinks:
    """Идетификаторы непосредственных подзадач и связанных задач."""

    subtasks: set[UUID] = field(default_factory=set)
    related_tasks: set[UUID] = field(default_factory=set)


class TaskRepository(Repository[Task]):

    async def get_by_number(self, number: TaskNumber) -> Task | None:
        """Получение задачи по её уникальному номеру"""

    async def get_next_sequence(
            self, ticket_id: UUID | None = None, project_id: UUID | None = None
    ) -> int:
        """
        Получение общего количества задач.
        Поддерживает 2 сценария:
         - Получение количества задач привязанных к тикету (передан ticket_id)
         - Получение количества внутренних задач (ticket_id = None),
          только те задачи, которые не принадлежат тикету
        """

    async def search(
            self,
            pagination: Pagination,
            *,
            query: QueryDTO | None = None,
    ) -> Page[TaskView]:
        """
        Универсальный поиск задач через DDF DSL.

        Архивные задачи исключаются независимо от пользовательского фильтра.
        """

    async def get_grouped_by_status(
            self,
            pagination: Pagination,
            *,
            query: QueryDTO | None = None,
    ) -> dict[TaskStatus, Page[TaskView]]:
        """
        Группировка задач по статусам.
        Применяет переданное DDF DSL-выражение.
        Возвращает облегченные модели представления задач.
        """

    async def lock_graph(self) -> None:
        """Заблокировать изменение структуры задач до конца транзакции."""

    async def read_for_update(
        self,
        task_id: UUID,
        *,
        include_deleted: bool = False,
    ) -> Task | None:
        """Загрузить задачу с блокировкой строки для изменения."""

    async def subtree_ids(self, task_id: UUID) -> set[UUID]:
        """Получить ID корня и всех его потомков, включая архиные задачи."""

    async def subtree_for_update(self, task_id: UUID) -> list[Task]:
        """Загрузить корень и всех потомков с блокировкой строк."""

    async def get_links(
        self,
        task_ids: list[UUID],
    ) -> dict[UUID, TaskLinks]:
        """Пакетно получить связи неудалённых задач."""

    async def list_linked(
        self,
        task_id: UUID,
        kind: RelationKind,
        pagination: Pagination,
    ) -> Page[TaskBrief]:
        """Получить страницу непосредственных подзадач или связанных задач."""

    async def set_related(
        self,
        task_id: UUID,
        related_task_id: UUID,
        *,
        linked: bool,
    ) -> bool:
        """Добавить или мягко удалить связь; вернуть факт изменения."""
