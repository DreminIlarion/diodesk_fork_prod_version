from collections.abc import Collection
from dataclasses import dataclass
from uuid import UUID

from src.shared.domain.vo import Priority

from .vo import TaskStatus


@dataclass(frozen=True, slots=True)
class TaskSearchFilters:
    """
    Фильтры поиска задач.
    Все условия объединяются через AND, пустые значения игнорируются.
    """

    query: str | None = None
    statuses: Collection[TaskStatus] | None = None
    priorities: Collection[Priority] | None = None
    tags: Collection[str] | None = None

    assignee_id: UUID | None = None
    reviewer_id: UUID | None = None
    created_by: UUID | None = None
    unassigned_only: bool = False

    project_id: UUID | None = None
    ticket_id: UUID | None = None

    overdue_only: bool = False
    include_archived: bool = False
