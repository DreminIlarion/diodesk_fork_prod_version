from uuid import UUID

from src.shared.domain.exceptions import InvalidStateError

from .domain.entities import Task
from .schemas import TaskCreate


def validate_parent_target(
    parent: Task,
    project_id: UUID | None,
) -> None:
    """Проверить возможность назначения задачи родителям."""

    if parent.is_deleted:
        raise InvalidStateError("Deleted task cannot be a parent")

    if not parent.status.is_open:
        raise InvalidStateError("Parent task must be unfinished")

    if parent.project_id != project_id:
        raise InvalidStateError(
            "Parent and child tasks must belong to the same project"
        )


def inherit_parent_context(
    data: TaskCreate,
    parent: Task,
) -> TaskCreate:
    """Подставить контекст родителя для отсутствующих полей."""

    supplied_fields = data.model_fields_set

    if (
        "project_id" in supplied_fields
        and data.project_id != parent.project_id
    ):
        raise InvalidStateError("Project mismatch with parent task")

    updates = {
        "project_id": parent.project_id,
    }

    if "ticket_id" not in supplied_fields:
        updates["ticket_id"] = parent.ticket_id

    if "stage_id" not in supplied_fields:
        updates["stage_id"] = parent.stage_id

    return data.model_copy(update=updates)
