from src.shared.domain.vo import Tag

from ..schemas import TaskCreate, TaskUpdate
from .schemas import TaskChanges, TaskDraft


def to_task_create(draft: TaskDraft) -> TaskCreate:
    return TaskCreate(
        title=draft.title,
        description=draft.description,
        priority=draft.priority,
        story_points=draft.story_points,
        estimated_hours=draft.estimated_hours,
        due_date=draft.due_date,
        assignee_id=draft.assignee_id,
        ticket_id=draft.ticket_id,
        project_id=draft.project_id,
        stage_id=draft.stage_id,
        tags=[Tag(name=name) for name in draft.tags],
        mark_as_todo=draft.ready_for_work,
    )


def to_task_update(changes: TaskChanges) -> TaskUpdate:
    return TaskUpdate(
        title=changes.title,
        description=changes.description,
        priority=changes.priority,
        story_points=changes.story_points,
        estimated_hours=changes.estimated_hours,
        due_date=changes.due_date,
    )
