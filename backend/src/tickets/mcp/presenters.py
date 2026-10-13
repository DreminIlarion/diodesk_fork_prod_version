from collections.abc import Sequence

from src.comments.domain.vo import CommentVisibility
from src.iam.domain.repos import UserRepository
from src.iam.mcp.presenters import UserBriefs, load_user_briefs
from src.mcp.schemas import CommentBrief, ProjectLink, ticket_url
from src.projects.domain.repos import ProjectRepository
from src.shared.schemas import Pagination
from src.tasks.domain.dtos import TaskSearchFilters
from src.tasks.domain.repos import TaskRepository, TaskView
from src.tasks.mcp.presenters import to_task_brief

from ..domain.entities import Ticket
from ..schemas import CommentResponse
from .schemas import TaskPoolSummary, TicketBrief, TicketCard

# Сколько задач заявки выводится в карточке
MAX_TICKET_TASKS = 100


def to_ticket_brief(ticket: Ticket, users: UserBriefs) -> TicketBrief:
    return TicketBrief(
        id=ticket.id,
        number=ticket.number.value,
        title=ticket.title,
        type=ticket.type,
        status=ticket.status,
        priority=ticket.priority,
        reporter=users.find(ticket.reporter_id),
        assignee=users.find(ticket.assignee_id),
        tags=sorted(tag.name for tag in ticket.tags),
        created_at=ticket.created_at,
        url=ticket_url(ticket.number.value),
    )


def summarize_task_pool(tasks: Sequence[TaskView]) -> TaskPoolSummary:
    open_tasks = [task for task in tasks if task.status.is_open]

    return TaskPoolSummary(
        total=len(tasks),
        open=len(open_tasks),
        done=sum(not task.status.is_open for task in tasks),
        unassigned=sum(task.assignee_id is None for task in open_tasks),
        story_points=sum(int(task.story_points or 0) for task in open_tasks),
        estimated_hours=round(sum(float(task.estimated_hours or 0) for task in open_tasks), 2),
    )


async def present_ticket(
        ticket: Ticket,
        *,
        task_repo: TaskRepository,
        user_repo: UserRepository,
        project_repo: ProjectRepository,
) -> TicketCard:
    tasks = (await task_repo.search(
        TaskSearchFilters(ticket_id=ticket.id), Pagination(page=1, size=MAX_TICKET_TASKS),
    )).items
    users = await load_user_briefs(
        user_repo, (ticket.reporter_id, ticket.assignee_id, *(task.assignee_id for task in tasks)),
    )
    project = None if ticket.project_id is None else await project_repo.read(ticket.project_id)

    return TicketCard(
        **to_ticket_brief(ticket, users).model_dump(),
        description=ticket.description,
        project=None if project is None else ProjectLink(
            id=project.id, key=project.key.value, name=project.name,
        ),
        counterparty_id=ticket.counterparty_id,
        updated_at=ticket.updated_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        is_archived=ticket.is_deleted,
        task_pool=summarize_task_pool(tasks),
        tasks=[to_task_brief(task, users) for task in tasks],
    )


def to_comment_brief(comment: CommentResponse, authors: UserBriefs) -> CommentBrief:
    return CommentBrief(
        id=comment.id,
        created_at=comment.created_at,
        author=authors.get(comment.author_id),
        text=comment.text,
        visibility=CommentVisibility(comment.type.value),
        parent_comment_id=comment.parent_comment_id,
        reply_count=comment.reply_count,
    )
