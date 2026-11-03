from src.core.settings import settings

from ..domain.repos import TaskView
from .schemas import TaskBrief


def to_task_brief(task: TaskView) -> TaskBrief:
    return TaskBrief(
        id=task.id,
        number=str(task.number),
        url=(
            f"{settings.frontend_url.rstrip('/')}"
            f"/tasks?task_id={task.id}"
        ),
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        story_points=(
            None if task.story_points is None else int(task.story_points)
        ),
        estimated_hours=(
            None
            if task.estimated_hours is None
            else float(task.estimated_hours)
        ),
        due_date=task.due_date,
        assignee_id=task.assignee_id,
        reviewer_id=task.reviewer_id,
        project_id=task.project_id,
        stage_id=task.stage_id,
        ticket_id=task.ticket_id,
        tags=sorted(tag.name for tag in task.tags),
    )
