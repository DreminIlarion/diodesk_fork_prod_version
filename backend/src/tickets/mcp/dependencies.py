from fastmcp.dependencies import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.activity_logs.recorder import ActivityLogRecorder
from src.core.database import session_factory
from src.crm.infra.repos import SqlCounterpartyRepository
from src.iam.domain.repos import UserRepository
from src.iam.mcp.dependencies import get_user_repo
from src.mcp.dependencies import get_activity_log_recorder, get_event_publisher, get_project_repo
from src.projects.domain.repos import ProjectRepository
from src.projects.infra.repos import SqlProjectMemberRepository
from src.shared.domain.events import EventPublisher

from ..domain.authz import TicketAuthZService
from ..domain.repos import TicketRepository
from ..infra.repos import SqlCommentRepository, SqlReactionRepository, SqlTicketRepository
from ..services import CommentService, TicketService


def get_ticket_repo(session: AsyncSession = Depends(session_factory)) -> TicketRepository:
    return SqlTicketRepository(session)


def get_ticket_service(
        session: AsyncSession = Depends(session_factory),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        project_repo: ProjectRepository = Depends(get_project_repo),
        user_repo: UserRepository = Depends(get_user_repo),
        activity_log_recorder: ActivityLogRecorder = Depends(get_activity_log_recorder),
        event_publisher: EventPublisher = Depends(get_event_publisher),
) -> TicketService:
    return TicketService(
        uow=session,
        ticket_repo=ticket_repo,
        project_repo=project_repo,
        user_repo=user_repo,
        counterparty_repo=SqlCounterpartyRepository(session),
        ticket_authz_service=TicketAuthZService(SqlProjectMemberRepository(session)),
        activity_log_recorder=activity_log_recorder,
        event_publisher=event_publisher,
    )


def get_ticket_comment_service(
        session: AsyncSession = Depends(session_factory),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        event_publisher: EventPublisher = Depends(get_event_publisher),
) -> CommentService:
    """
    Комментарии заявок через тот же сервис, что и веб-интерфейс,
    чтобы комментарии агента сразу отображались в карточке заявки.
    """

    return CommentService(
        session=session,
        ticket_repo=ticket_repo,
        comment_repo=SqlCommentRepository(session),
        reaction_repo=SqlReactionRepository(session),
        event_publisher=event_publisher,
    )
