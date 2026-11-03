from fastmcp.dependencies import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import session_factory

from ..domain.repos import TaskRepository
from ..infra.repos import SqlTaskRepository


def get_task_repo(
    session: AsyncSession = Depends(session_factory),
) -> TaskRepository:
    return SqlTaskRepository(session)
