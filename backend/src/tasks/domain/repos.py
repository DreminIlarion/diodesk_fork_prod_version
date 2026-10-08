from typing import TYPE_CHECKING

from collections.abc import Collection
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from src.shared.domain.repos import Repository
from src.shared.domain.vo import Priority, Tag
from src.shared.schemas import Page, Pagination

from .dtos import TaskSearchFilters
from .entities import Task
from .vo import TaskNumber, TaskStatus

if TYPE_CHECKING:
    from .assignment import CompletedTask, Workload


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

    project_id: UUID | None = None
    ticket_id: UUID | None = None
    attachments: list = field(default_factory=list)  # ← ДОБАВИ

    tags: set[Tag] = field(default_factory=set)


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
        """
        Группировка задач по статусам.
        Учитывает переданное пространство имён, если project_id is None -
        вернуться все строке где project_id равен None.
        Возвращает облегченные модели представления задач.
        """

    async def search(
            self, filters: TaskSearchFilters, pagination: Pagination,
    ) -> Page[TaskView]:
        """
        Поиск задач по фильтрам.
        Сортировка: сначала более приоритетные, затем с ближайшим сроком.
        """

    async def get_workloads(self, user_ids: Collection[UUID]) -> list["Workload"]:
        """
        Агрегированная загрузка исполнителей по открытым задачам и очереди ревью.
        Пользователи без открытых задач и ревью в результат не попадают.
        """

    async def get_completed(
            self, assignee_ids: Collection[UUID], *, since: datetime, limit: int,
    ) -> list["CompletedTask"]:
        """
        Выполненные задачи исполнителей начиная с указанной даты (от новых к старым).
        """
