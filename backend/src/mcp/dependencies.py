"""
Общие зависимости MCP компонентов.

Используется DI из FastMCP (`fastmcp.dependencies.Depends`): зависимости объявляются
значениями по умолчанию и разрешаются один раз на вызов инструмента, поэтому все
репозитории и сервисы в рамках одного вызова работают в одной сессии БД.
"""

from fastmcp.dependencies import Depends
from fastmcp.server.dependencies import get_access_token
from sqlalchemy.ext.asyncio import AsyncSession

from src.activity_logs.infra.repos import SqlActivityLogRepository
from src.activity_logs.recorder import ActivityLogRecorder
from src.core.database import session_factory
from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import UnauthorizedError
from src.iam.security import subject_from_claims
from src.projects.domain.repos import ProjectRepository
from src.projects.infra.repos import SqlProjectRepository
from src.shared.dependencies import get_event_publisher

__all__ = (
    "get_activity_log_recorder",
    "get_current_subject",
    "get_event_publisher",
    "get_project_repo",
)


def get_current_subject() -> Subject:
    """Пользователь, от имени которого действует агент."""

    access_token = get_access_token()
    if access_token is None or not access_token.claims:
        raise UnauthorizedError("Bearer access token is required")

    return subject_from_claims(access_token.claims)


def get_activity_log_recorder(
        session: AsyncSession = Depends(session_factory),
) -> ActivityLogRecorder:
    return ActivityLogRecorder(SqlActivityLogRepository(session))


def get_project_repo(session: AsyncSession = Depends(session_factory)) -> ProjectRepository:
    return SqlProjectRepository(session)
