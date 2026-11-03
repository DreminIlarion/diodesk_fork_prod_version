from typing import Annotated

from uuid import UUID

from ddf.application.dtos import QueryDTO
from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field

from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import PermissionDeniedError
from src.mcp.annotations import CREATE, READ_ONLY, UPDATE
from src.mcp.dependencies import get_current_subject
from src.shared.schemas import Page, Pagination

from ..domain.authz import TaskAuthZService
from ..domain.repos import TaskRepository
from ..services import TaskService
from .dependencies import get_task_repo, get_task_service
from .presenters import to_task_brief, to_task_card
from .references import TaskRef, find_task
from .schemas import TaskBrief, TaskCard, TaskChanges, TaskDraft


@tool(annotations=CREATE, tags={"tasks"})
async def create_task(
    task: TaskDraft,
    subject: Subject = Depends(get_current_subject),
    service: TaskService = Depends(get_task_service),
) -> TaskCard:
    """
    Создать задачу.

    Перед вызовом покажи пользователю название, описание, приоритет,
    исполнителя и срок, затем получи подтверждение.
    """

    created = await service.create(
        task.to_task_create(),
        subject,
    )
    return to_task_card(created)


@tool(annotations=UPDATE, tags={"tasks"})
async def update_task(
    task: TaskRef,
    changes: TaskChanges,
    subject: Subject = Depends(get_current_subject),
    task_repo: TaskRepository = Depends(get_task_repo),
    service: TaskService = Depends(get_task_service),
) -> TaskCard:
    """
    Изменить поля задачи.

    Перед вызовом получи текущую карточку задачи, покажи пользователю
    планируемые изменения и дождись подтверждения.
    """

    found = await find_task(task_repo, task)
    updated = await service.edit(
        found.id,
        changes.to_task_update(),
        subject,
    )
    return to_task_card(updated)


@tool(annotations=UPDATE, tags={"tasks", "users"})
async def assign_task(
    task: TaskRef,
    assignee_id: Annotated[
        UUID,
        Field(description="ID пользователя, назначаемого исполнителем"),
    ],
    subject: Subject = Depends(get_current_subject),
    task_repo: TaskRepository = Depends(get_task_repo),
    service: TaskService = Depends(get_task_service),
) -> TaskCard:
    """
    Назначить исполнителя задачи.

    Если пользователь указал имя или email, сначала найди его через search_users.
    Перед назначением покажи пользователю задачу и выбранного исполнителя,
    затем дождись подтверждения.
    """

    found = await find_task(task_repo, task)
    assigned = await service.assign_to(
        found.id,
        assignee_id,
        subject,
    )
    return to_task_card(assigned)


@tool(annotations=READ_ONLY, tags={"tasks"})
async def get_task(
    task: TaskRef,
    subject: Subject = Depends(get_current_subject),
    task_repo: TaskRepository = Depends(get_task_repo),
) -> TaskCard:
    """
    Получить полную карточку задачи по UUID или номеру.

    Используй перед изменением задачи, чтобы проверить её текущее состояние
    и допустимые переходы статуса.
    """

    found = await find_task(task_repo, task)

    permission = await TaskAuthZService().can_view_task(
        subject,
        project_id=found.project_id,
    )
    if not permission.allowed:
        raise PermissionDeniedError(permission.reason)

    return to_task_card(found)


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

    Используй один DSL-запрос вместо отдельных инструментов для каждого
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


TOOLS = (
    assign_task,
    create_task,
    get_task,
    search_tasks,
    update_task,
)
