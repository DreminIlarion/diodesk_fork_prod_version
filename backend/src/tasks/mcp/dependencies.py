from fastmcp.dependencies import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.activity_logs.recorder import ActivityLogRecorder
from src.comments.infra.repos import SqlCommentRepository, SqlReactionRepository
from src.comments.services import CommentService
from src.core.database import session_factory
from src.iam.domain.repos import UserRepository
from src.iam.mcp.dependencies import get_user_repo
from src.mcp.dependencies import get_activity_log_recorder, get_event_publisher, get_project_repo
from src.projects.domain.repos import ProjectRepository
from src.shared.domain.events import EventPublisher
from src.tickets.domain.repos import TicketRepository
from src.tickets.mcp.dependencies import get_ticket_repo

from ..domain.authz import TaskAuthZService
from ..domain.repos import TaskRepository
from ..infra.repos import SqlTaskRepository
from ..services import TaskAssignmentService, TaskService


def get_task_repo(session: AsyncSession = Depends(session_factory)) -> TaskRepository:
    return SqlTaskRepository(session)


def get_task_service(
        session: AsyncSession = Depends(session_factory),
        task_repo: TaskRepository = Depends(get_task_repo),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
        project_repo: ProjectRepository = Depends(get_project_repo),
        activity_log_recorder: ActivityLogRecorder = Depends(get_activity_log_recorder),
        event_publisher: EventPublisher = Depends(get_event_publisher),
) -> TaskService:
    return TaskService(
        uow=session,
        task_repo=task_repo,
        ticket_repo=ticket_repo,
        user_repo=user_repo,
        project_repo=project_repo,
        task_authz_service=TaskAuthZService(),
        activity_log_recorder=activity_log_recorder,
        event_publisher=event_publisher,
    )


def get_assignment_service(
        task_repo: TaskRepository = Depends(get_task_repo),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskAssignmentService:
    return TaskAssignmentService(task_repo=task_repo, ticket_repo=ticket_repo, user_repo=user_repo)


def get_task_comment_service(
        session: AsyncSession = Depends(session_factory),
        event_publisher: EventPublisher = Depends(get_event_publisher),
) -> CommentService:
    return CommentService(
        uow=session,
        comment_repo=SqlCommentRepository(session),
        reaction_repo=SqlReactionRepository(session),
        event_publisher=event_publisher,
    )
