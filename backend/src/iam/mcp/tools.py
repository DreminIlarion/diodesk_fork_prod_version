from typing import Annotated

from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field

from src.mcp.annotations import READ_ONLY
from src.mcp.dependencies import get_current_subject
from src.mcp.params import PageSize
from src.shared.domain.repos import get_or_raise_404

from ..domain.authz import Subject
from ..domain.entities import User
from ..domain.repos import UserRepository
from ..domain.vo import UserRole
from .dependencies import get_user_repo
from .presenters import to_user_brief
from .schemas import UserBrief


@tool(annotations=READ_ONLY, tags={"users"})
async def get_current_user(
        subject: Subject = Depends(get_current_subject),
        user_repo: UserRepository = Depends(get_user_repo),
) -> UserBrief:
    """Текущий пользователь, от имени которого работает агент."""

    user = await get_or_raise_404(user_repo.read, subject.id, User)
    return to_user_brief(user)


@tool(annotations=READ_ONLY, tags={"users"})
async def search_users(
        query: Annotated[str | None, Field(description="Часть ФИО, email или логина")] = None,
        roles: Annotated[
            list[UserRole] | None,
            Field(description="Пользователь должен иметь хотя бы одну роль. По умолчанию - "
                              "все сотрудники (без клиентов)"),
        ] = None,
        include_inactive: Annotated[
            bool, Field(description="Включать заблокированных пользователей")
        ] = False,
        limit: PageSize = 20,
        user_repo: UserRepository = Depends(get_user_repo),
) -> list[UserBrief]:
    """
    Поиск пользователей. Используй, чтобы по имени найти ID исполнителя или ревьювера.
    """

    users = await user_repo.search(
        query,
        roles=roles or UserRole.staff_roles(),
        active_only=not include_inactive,
        limit=limit,
    )
    return [to_user_brief(user) for user in users]


TOOLS = (get_current_user, search_users)
