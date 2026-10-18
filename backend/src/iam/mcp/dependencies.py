from fastmcp.dependencies import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import session_factory

from ..domain.repos import UserRepository
from ..infra.repos import SqlUserRepository


def get_user_repo(session: AsyncSession = Depends(session_factory)) -> UserRepository:
    return SqlUserRepository(session)
