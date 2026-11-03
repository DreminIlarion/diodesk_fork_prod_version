from uuid import UUID

from src.core.settings import settings

from ..domain.consts import (
    ALLOWED_STATUS_TRANSITIONS,
    TASK_STATUS_LABEL_MAP,
)
from ..domain.entities import Task
from ..domain.repos import TaskView
from ..schemas import TaskResponse
from .schemas import TaskBrief, TaskCard


def _task_url(task_id: UUID) -> str:
    return (
        f"{settings.frontend_url.rstrip('/')}"
        f"/tasks?task_id={task_id}"
    )


def _story_points(
    task: Task | TaskView | TaskResponse,
) -> int | None:
    value = task.story_points
    if value is None:
        return None

    if hasattr(value, "value"):
        value = value.value

    return int(value)


def _brief_fields(
    task: Task | TaskView | TaskResponse,
) -> dict:
    return {
        "id": task.id,
        "number": str(task.number),
        "url": _task_url(task.id),
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "story_points": _story_points(task),
        "estimated_hours": (
            None
            if task.estimated_hours is None
            else float(task.estimated_hours)
        ),
        "due_date": task.due_date,
        "assignee_id": task.assignee_id,
        "reviewer_id": task.reviewer_id,
        "project_id": task.project_id,
        "stage_id": task.stage_id,
        "ticket_id": task.ticket_id,
        "tags": sorted(tag.name for tag in task.tags),
    }


def to_task_brief(
    task: Task | TaskView | TaskResponse,
) -> TaskBrief:
    return TaskBrief(**_brief_fields(task))


def to_task_card(task: Task | TaskResponse) -> TaskCard:
    is_archived = (
        task.is_deleted
        if isinstance(task, Task)
        else task.is_archived
    )

    return TaskCard(
        **_brief_fields(task),
        status_label=TASK_STATUS_LABEL_MAP[task.status],
        next_statuses=sorted(
            ALLOWED_STATUS_TRANSITIONS.get(task.status, set()),
            key=lambda status: status.value,
        ),
        actual_hours=float(task.actual_hours),
        created_by=task.created_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        working_since=task.working_since,
        is_archived=is_archived,
    )
