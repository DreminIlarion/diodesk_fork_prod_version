from fastmcp.dependencies import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.activity_logs.infra.repos import SqlActivityLogRepository
from src.activity_logs.recorder import ActivityLogRecorder
from src.core.database import session_factory
from src.iam.domain.repos import UserRepository
from src.iam.infra.repos import SqlUserRepository
from src.projects.domain.repos import ProjectRepository
from src.projects.infra.repos import SqlProjectRepository
from src.shared.dependencies import get_event_publisher
from src.shared.domain.events import EventPublisher
from src.tickets.domain.repos import TicketRepository
from src.tickets.infra.repos import SqlTicketRepository

from ..domain.authz import TaskAuthZService
from ..domain.repos import TaskRepository
from ..infra.repos import SqlTaskRepository
from ..services import TaskService


def get_task_repo(
    session: AsyncSession = Depends(session_factory),
) -> TaskRepository:
    return SqlTaskRepository(session)


def get_ticket_repo(
    session: AsyncSession = Depends(session_factory),
) -> TicketRepository:
    return SqlTicketRepository(session)


def get_user_repo(
    session: AsyncSession = Depends(session_factory),
) -> UserRepository:
    return SqlUserRepository(session)


def get_project_repo(
    session: AsyncSession = Depends(session_factory),
) -> ProjectRepository:
    return SqlProjectRepository(session)


def get_activity_log_recorder(
    session: AsyncSession = Depends(session_factory),
) -> ActivityLogRecorder:
    return ActivityLogRecorder(SqlActivityLogRepository(session))


def get_task_service(
    session: AsyncSession = Depends(session_factory),
    task_repo: TaskRepository = Depends(get_task_repo),
    ticket_repo: TicketRepository = Depends(get_ticket_repo),
    user_repo: UserRepository = Depends(get_user_repo),
    project_repo: ProjectRepository = Depends(get_project_repo),
    activity_log_recorder: ActivityLogRecorder = Depends(
        get_activity_log_recorder
    ),
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
