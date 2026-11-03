from typing import Annotated

from ddf.application.dtos import QueryDTO
from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field

from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import PermissionDeniedError
from src.mcp.annotations import READ_ONLY
from src.mcp.dependencies import get_current_subject
from src.shared.schemas import Page, Pagination

from ..domain.authz import TaskAuthZService
from ..domain.repos import TaskRepository
from .dependencies import get_task_repo
from .presenters import to_task_brief
from .schemas import TaskBrief


@tool(annotations=READ_ONLY, tags={"tasks"})
async def search_tasks(
    query: Annotated[
        QueryDTO | None,
        Field(
            description=(
                "Универсальный DDF DSL-фильтр. Доступные поля: "
                "id, number, title, description, status, priority, "
                "storyPoints, assigneeId, reviewerId, dueDate, "
                "projectId, stageId, ticketId, createdBy, createdAt, "
                "updatedAt, startedAt, completedAt, estimatedHours, "
                "actualHours"
            )
        ),
    ] = None,
    page: Annotated[int, Field(ge=1, description="Номер страницы")] = 1,
    size: Annotated[
        int,
        Field(ge=1, le=100, description="Количество задач на странице"),
    ] = 20,
    subject: Subject = Depends(get_current_subject),
    task_repo: TaskRepository = Depends(get_task_repo),
) -> Page[TaskBrief]:
    """
    Найти задачи с универсальной фильтрацией.

    Используйи один DSL-запрос вместо отдельных инструментов для каждого
    исполнителя, статуса, приоритета, проекта или срока.
    """

    permission = await TaskAuthZService().can_view_task(subject)
    if not permission.allowed:
        raise PermissionDeniedError(permission.reason)

    tasks = await task_repo.search(
        Pagination(page=page, size=size),
        query=query,
    )
    return tasks.to_response(to_task_brief)


TOOLS = (search_tasks,)
