from .domain.entities import Task
from .domain.repos import TaskView
from .schemas import TaskResponse, TaskViewResponse
from src.iam.domain.entities import User
from src.iam.schemas import UserReference
from src.media.mappers import map_attachment_to_response
from src.projects.domain.entities import Project
from src.projects.schemas import ProjectReference
from src.tickets.domain.entities import Ticket
from src.tickets.mappers import map_ticket_to_preview
from src.tickets.schemas import Tag


def map_task_to_response(
        task: Task,
        *,
        ticket: Ticket | None = None,
        reporter: User | None = None,
        project: Project | None = None,
) -> TaskResponse:
    story_points = None if task.story_points is None else task.story_points.value
    estimated_hours = None if task.estimated_hours is None else float(task.estimated_hours)
    tags = [Tag(name=tag.name, color=tag.color) for tag in task.tags]
    attachments = [map_attachment_to_response(attachment) for attachment in task.attachments]

    return TaskResponse(
        id=task.id,
        created_at=task.created_at,
        updated_at=task.updated_at,
        is_archived=task.is_deleted,
        project_id=task.project_id,
        ticket_id=task.ticket_id,
        number=task.number.value,
        title=task.title,
        description=task.description,
        priority=task.priority,
        story_points=story_points,
        status=task.status,
        assignee_id=task.assignee_id,
        reviewer_id=task.reviewer_id,
        estimated_hours=estimated_hours,
        actual_hours=task.actual_hours,
        due_date=task.due_date,
        started_at=task.started_at,
        completed_at=task.completed_at,
        working_since=task.working_since,
        created_by=task.created_by,
        tags=tags,
        attachments=attachments,
        source_ticket=(
            map_ticket_to_preview(ticket)
            if ticket is not None
            else None
        ),
        source_ticket_reporter=map_task_reporter_to_reference(reporter),
        project=map_task_project_to_reference(project),
    )


def map_task_view_to_response(
        task: TaskView,
        *,
        ticket: Ticket | None = None,
        reporter: User | None = None,
        project: Project | None = None,
) -> TaskViewResponse:
    tags = [Tag(name=tag.name, color=tag.color) for tag in task.tags]
    attachments = [map_attachment_to_response(a) for a in task.attachments]

    return TaskViewResponse(
        id=task.id,
        created_at=task.created_at,
        updated_at=task.updated_at,
        number=task.number.value,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        assignee_id=task.assignee_id,
        reviewer_id=task.reviewer_id,
        due_date=task.due_date,
        story_points=task.story_points,
        estimated_hours=float(task.estimated_hours) if task.estimated_hours else None,  
        actual_hours=float(task.actual_hours) if task.actual_hours else None,
        started_at=task.started_at,
        completed_at=task.completed_at,
        working_since=task.working_since,
        project_id=task.project_id,
        ticket_id=task.ticket_id,
        attachments=attachments,
        tags=tags,
        source_ticket=(
            map_ticket_to_preview(ticket)
            if ticket is not None
            else None
        ),
        source_ticket_reporter=map_task_reporter_to_reference(reporter),
        project=map_task_project_to_reference(project),
    )


def map_task_reporter_to_reference(
        reporter: User | None,
) -> UserReference | None:
    if reporter is None:
        return None

    return UserReference(
        id=reporter.id,
        full_name=reporter.full_name.value if reporter.full_name else "",
        email=reporter.email.value,
        type=reporter.type,
    )


def map_task_project_to_reference(
        project: Project | None,
) -> ProjectReference | None:
    if project is None:
        return None

    return ProjectReference(
        id=project.id,
        key=project.key.value,
        name=project.name,
    )

