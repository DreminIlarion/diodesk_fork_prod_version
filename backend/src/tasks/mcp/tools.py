from typing import Annotated, Literal

from collections.abc import Sequence
from datetime import date, timedelta
from uuid import UUID

from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.comments.domain.vo import AggregateReference, AggregateType, CommentVisibility
from src.comments.schemas import CommentCreate
from src.comments.services import CommentService
from src.core.database import session_factory
from src.iam.domain.authz import Subject
from src.iam.domain.repos import UserRepository
from src.iam.domain.vo import UserRole
from src.iam.mcp.dependencies import get_user_repo
from src.iam.mcp.presenters import load_user_briefs
from src.mcp.annotations import CREATE, READ_ONLY, UPDATE
from src.mcp.dependencies import get_current_subject
from src.mcp.middleware import describe
from src.mcp.params import (
    PageNumber,
    PageSize,
    ResultLimit,
    UserSelector,
    paginate,
    resolve_user,
)
from src.mcp.schemas import CommentBrief
from src.shared.domain.exceptions import AppError, NotFoundError
from src.shared.domain.vo import Priority
from src.shared.schemas import Page
from src.tickets.domain.repos import TicketRepository
from src.tickets.mcp.dependencies import get_ticket_repo
from src.tickets.mcp.references import TicketRef, find_ticket

from ..domain.dtos import TaskSearchFilters
from ..domain.entities import Task
from ..domain.repos import TaskRepository
from ..domain.vo import ReviewDecision, TaskStatus
from ..schemas import TaskResponse, TaskUpdate
from ..services import TaskAssignmentService, TaskService
from .dependencies import (
    get_assignment_service,
    get_task_comment_service,
    get_task_repo,
    get_task_service,
)
from .presenters import (
    present_task,
    present_task_briefs,
    present_task_page,
    to_assignee_suggestion,
    to_comment_brief,
    to_expertise_profile,
    to_task_suggestion,
    to_workload_entry,
)
from .references import TaskRef, find_task
from .schemas import (
    AssigneeSuggestion,
    DraftFailure,
    ExpertiseProfile,
    StoryPointsValue,
    TaskBatchResult,
    TaskBrief,
    TaskCard,
    TaskDraft,
    TaskSuggestion,
    WorkloadEntry,
)

MAX_BATCH_SIZE = 30

TaskDrafts = Annotated[
    list[TaskDraft], Field(min_length=1, max_length=MAX_BATCH_SIZE, description="Черновики задач"),
]
CommentText = Annotated[str, Field(min_length=1, description="Текст комментария")]
CommentVisibilityParam = Annotated[
    CommentVisibility,
    Field(description="internal - только сотрудникам (по умолчанию), public - виден всем"),
]


# ============================== Чтение ==============================


@tool(annotations=READ_ONLY, tags={"tasks"})
async def get_task(
        task: TaskRef,
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """Полная карточка задачи: постановка, статус и допустимые переходы, участники, оценки."""

    found = await find_task(task_repo, task)
    return await present_task(await service.get(found.id), user_repo)


@tool(annotations=READ_ONLY, tags={"tasks"})
async def search_tasks(
        query: Annotated[str | None, Field(description="Текст в номере, теме, описании")] = None,
        statuses: Annotated[list[TaskStatus] | None, Field(description="Статусы")] = None,
        priorities: Annotated[list[Priority] | None, Field(description="Приоритеты")] = None,
        tags: Annotated[list[str] | None, Field(description="Хотя бы один из тегов")] = None,
        assignee: Annotated[
            UUID | Literal["me", "none"] | None,
            Field(description='ID исполнителя, "me" - текущий пользователь, '
                              '"none" - без исполнителя'),
        ] = None,
        reviewer: Annotated[UserSelector | None, Field(description="Проверяющий")] = None,
        ticket: Annotated[TicketRef | None, Field(description="Заявка")] = None,
        project_id: Annotated[UUID | None, Field(description="ID проекта")] = None,
        overdue_only: Annotated[bool, Field(description="Только просроченные")] = False,
        page: PageNumber = 1,
        size: PageSize = 20,
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
) -> Page[TaskBrief]:
    """
    Поиск задач по фильтрам. Сначала идут более приоритетные и с ближайшим сроком.
    Например, мои открытые задачи: assignee="me" и статусы кроме done/cancelled.
    """

    match assignee:
        case "none":
            assignee_id, unassigned_only = None, True
        case _:
            assignee_id, unassigned_only = resolve_user(assignee, subject), False

    filters = TaskSearchFilters(
        query=query,
        statuses=statuses,
        priorities=priorities,
        tags=tags,
        assignee_id=assignee_id,
        reviewer_id=resolve_user(reviewer, subject),
        unassigned_only=unassigned_only,
        ticket_id=None if ticket is None else (await find_ticket(ticket_repo, ticket)).id,
        project_id=project_id,
        overdue_only=overdue_only,
    )
    found = await task_repo.search(filters, paginate(page, size))
    return await present_task_page(found, user_repo)


# ============================== Создание ==============================


async def _create_tasks(
        drafts: Sequence[TaskDraft],
        *,
        service: TaskService,
        session: AsyncSession,
        subject: Subject,
        user_repo: UserRepository,
        ticket_id: UUID | None = None,
        project_id: UUID | None = None,
        parent: Task | None = None,
) -> TaskBatchResult:
    """
    Создаёт задачи по одной: ошибка в одном черновике не отменяет остальные,
    а возвращается агенту, чтобы он мог исправить и повторить только её.
    """

    created: list[TaskResponse] = []
    failed: list[DraftFailure] = []

    for index, draft in enumerate(drafts):
        description = None
        if parent is not None:
            description = f"Подзадача {parent.number}: {parent.title}\n\n{draft.description or ''}"

        data = draft.to_task_create(
            ticket_id=ticket_id,
            project_id=project_id,
            description=description,
            default_tags=None if parent is None else [tag.name for tag in parent.tags],
        )
        try:
            created.append(await service.create(data, subject))
        except (AppError, ValueError) as error:
            await session.rollback()
            failed.append(DraftFailure(index=index, title=draft.title, error=describe(error)))

    return TaskBatchResult(created=await present_task_briefs(created, user_repo), failed=failed)


@tool(annotations=CREATE, tags={"tasks"})
async def create_task(
        task: TaskDraft,
        ticket: Annotated[
            TicketRef | None, Field(description="Заявка, по которой создаётся задача")
        ] = None,
        project_id: Annotated[UUID | None, Field(description="ID проекта")] = None,
        subject: Subject = Depends(get_current_subject),
        service: TaskService = Depends(get_task_service),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """
    Создать задачу. Без заявки и проекта задача будет внутренней (номер TASK-NNN).
    Перед вызовом покажи пользователю черновик и получи подтверждение.
    """

    ticket_id = None if ticket is None else (await find_ticket(ticket_repo, ticket)).id
    created = await service.create(
        task.to_task_create(ticket_id=ticket_id, project_id=project_id), subject,
    )
    return await present_task(created, user_repo)


@tool(annotations=CREATE, tags={"tasks", "tickets", "planning"})
async def create_tasks_from_ticket(
        ticket: TicketRef,
        tasks: TaskDrafts,
        subject: Subject = Depends(get_current_subject),
        session: AsyncSession = Depends(session_factory),
        service: TaskService = Depends(get_task_service),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskBatchResult:
    """
    Создать пул задач по заявке (декомпозиция заявки). Задачи наследуют проект
    и приоритет заявки и получают номера вида <номер заявки>-NNN.
    Перед вызовом согласуй с пользователем список задач и оценки.
    """

    found = await find_ticket(ticket_repo, ticket)
    return await _create_tasks(
        tasks,
        service=service,
        session=session,
        subject=subject,
        user_repo=user_repo,
        ticket_id=found.id,
        project_id=found.project_id,
    )


@tool(annotations=CREATE, tags={"tasks", "planning"})
async def decompose_task(
        task: TaskRef,
        subtasks: TaskDrafts,
        subject: Subject = Depends(get_current_subject),
        session: AsyncSession = Depends(session_factory),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskBatchResult:
    """
    Разбить задачу на подзадачи. Подзадачи наследуют заявку, проект и теги
    (если свои не указаны), а в описании получают ссылку на исходную задачу.
    Перед вызовом согласуй с пользователем список подзадач.
    """

    parent = await find_task(task_repo, task)
    return await _create_tasks(
        subtasks,
        service=service,
        session=session,
        subject=subject,
        user_repo=user_repo,
        ticket_id=parent.ticket_id,
        project_id=parent.project_id,
        parent=parent,
    )


# ============================== Изменение ==============================


@tool(annotations=UPDATE, tags={"tasks"})
async def update_task(
        task: TaskRef,
        title: Annotated[str | None, Field(min_length=3, description="Новая тема")] = None,
        description: Annotated[str | None, Field(description="Новая постановка")] = None,
        priority: Annotated[Priority | None, Field(description="Новый приоритет")] = None,
        story_points: Annotated[
            StoryPointsValue | None, Field(description="Сложность по шкале Фибоначчи")
        ] = None,
        estimated_hours: Annotated[
            float | None, Field(gt=0, description="Оценка трудозатрат, ч")
        ] = None,
        due_date: Annotated[date | None, Field(description="Новый срок")] = None,
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """Изменить поля задачи. Передавай только то, что нужно изменить."""

    found = await find_task(task_repo, task)
    data = TaskUpdate(
        title=title,
        description=description,
        priority=priority,
        story_points=story_points,
        estimated_hours=estimated_hours,
        due_date=due_date,
    )
    return await present_task(await service.edit(found.id, data, subject), user_repo)


@tool(annotations=UPDATE, tags={"tasks"})
async def change_task_status(
        task: TaskRef,
        status: Annotated[TaskStatus, Field(description="Новый статус")],
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """
    Перевести задачу в другой статус. Допустимые переходы есть в карточке задачи
    (next_statuses). На ревью (to_review) переводи через request_task_review.
    """

    found = await find_task(task_repo, task)
    changed = await service.change_status(found.id, status, subject)
    return await present_task(changed, user_repo)


@tool(annotations=UPDATE, tags={"tasks", "planning"})
async def assign_task(
        task: TaskRef,
        assignee: UserSelector,
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """Назначить исполнителя задачи. Подобрать кандидата помогает suggest_assignees."""

    found = await find_task(task_repo, task)
    assigned = await service.assign_to(found.id, resolve_user(assignee, subject), subject)
    return await present_task(assigned, user_repo)


@tool(annotations=UPDATE, tags={"tasks"})
async def request_task_review(
        task: TaskRef,
        reviewer_id: Annotated[UUID, Field(description="ID проверяющего (не исполнитель)")],
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """Отправить задачу на ревью указанному сотруднику (статус to_review)."""

    found = await find_task(task_repo, task)
    reviewed = await service.request_review(found.id, reviewer_id, subject)
    return await present_task(reviewed, user_repo)


@tool(annotations=UPDATE, tags={"tasks"})
async def review_task(
        task: TaskRef,
        decision: Annotated[
            ReviewDecision,
            Field(description="done - принять, to_fix - на доработку, to_test - на тестирование"),
        ],
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> TaskCard:
    """Завершить ревью задачи с решением."""

    found = await find_task(task_repo, task)
    reviewed = await service.review(found.id, decision, subject)
    return await present_task(reviewed, user_repo)


# ============================== Комментарии ==============================


@tool(annotations=CREATE, tags={"tasks", "comments"})
async def add_task_comment(
        task: TaskRef,
        text: CommentText,
        visibility: CommentVisibilityParam = CommentVisibility.INTERNAL,
        reply_to: Annotated[
            UUID | None, Field(description="ID комментария, на который нужно ответить")
        ] = None,
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: CommentService = Depends(get_task_comment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> CommentBrief:
    """Оставить комментарий к задаче (например, итог обсуждения или план работ)."""

    found = await find_task(task_repo, task)
    data = CommentCreate(text=text, visibility=visibility)

    if reply_to is None:
        aggregate = AggregateReference(id=found.id, type=AggregateType.TASK)
        comment = await service.create_comment(aggregate, data, subject)
    else:
        comment = await service.add_reply(reply_to, data, subject)

    authors = await load_user_briefs(user_repo, [comment.author_id])
    return to_comment_brief(comment, authors)


@tool(annotations=READ_ONLY, tags={"tasks", "comments"})
async def list_task_comments(
        task: TaskRef,
        page: PageNumber = 1,
        size: PageSize = 20,
        subject: Subject = Depends(get_current_subject),
        task_repo: TaskRepository = Depends(get_task_repo),
        service: CommentService = Depends(get_task_comment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> Page[CommentBrief]:
    """Комментарии к задаче (верхнего уровня, от новых к старым)."""

    found = await find_task(task_repo, task)
    comments = await service.get_comments(
        aggregate_ref=AggregateReference(id=found.id, type=AggregateType.TASK),
        pagination=paginate(page, size),
        current_subject=subject,
        visible=set(CommentVisibility),
    )
    authors = await load_user_briefs(user_repo, (comment.author_id for comment in comments.items))
    return comments.to_response(lambda comment: to_comment_brief(comment, authors))


# ============================== Планирование ==============================


@tool(annotations=READ_ONLY, tags={"planning", "users"})
async def get_team_workload(
        user_ids: Annotated[
            list[UUID] | None, Field(description="Конкретные сотрудники (по умолчанию - все)")
        ] = None,
        roles: Annotated[
            list[UserRole] | None,
            Field(description="Роли сотрудников (по умолчанию - разработчики и поддержка)"),
        ] = None,
        service: TaskAssignmentService = Depends(get_assignment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> list[WorkloadEntry]:
    """Загрузка сотрудников по задачам и заявкам, от самых свободных к самым загруженным."""

    if user_ids:
        users = await user_repo.get_by_ids(user_ids)
    else:
        users = await service.find_candidates(roles)

    briefs = await load_user_briefs(user_repo, (user.id for user in users))
    workloads = await service.get_workloads([user.id for user in users])

    entries = [to_workload_entry(workloads[user.id], briefs[user.id]) for user in users]
    return sorted(entries, key=lambda entry: entry.load_hours)


@tool(annotations=READ_ONLY, tags={"planning", "users"})
async def get_user_expertise(
        user: UserSelector = "me",
        period_days: Annotated[
            int, Field(ge=7, le=730, description="Глубина анализа истории, дней")
        ] = 180,
        subject: Subject = Depends(get_current_subject),
        service: TaskAssignmentService = Depends(get_assignment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> ExpertiseProfile:
    """
    Профиль опыта сотрудника по выполненным задачам: теги, темы, последние задачи
    и точность оценок. Помогает понять, какие задачи ему подходят.
    """

    user_id = resolve_user(user, subject)
    briefs = await load_user_briefs(user_repo, [user_id])
    if user_id not in briefs:
        raise NotFoundError(f"User '{user_id}' not found")

    expertise = await service.get_expertise([user_id], period=timedelta(days=period_days))
    return to_expertise_profile(expertise[user_id], briefs[user_id], period_days)


@tool(annotations=READ_ONLY, tags={"planning", "tasks"})
async def suggest_assignees(
        task: TaskRef,
        roles: Annotated[
            list[UserRole] | None,
            Field(description="Роли кандидатов (по умолчанию - разработчики и поддержка)"),
        ] = None,
        limit: ResultLimit = 5,
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskAssignmentService = Depends(get_assignment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> list[AssigneeSuggestion]:
    """
    Подобрать исполнителей задачи по опыту (теги и темы выполненных задач)
    и текущей загрузке. Каждый кандидат идёт с обоснованием.
    """

    found = await find_task(task_repo, task)
    matches = await service.suggest_assignees(found.id, roles=roles, limit=limit)
    users = await load_user_briefs(user_repo, (match.user_id for match in matches))
    return [to_assignee_suggestion(match, users[match.user_id]) for match in matches]


@tool(annotations=READ_ONLY, tags={"planning", "tasks"})
async def suggest_tasks_for_user(
        user: UserSelector = "me",
        project_id: Annotated[UUID | None, Field(description="Только задачи проекта")] = None,
        limit: ResultLimit = 5,
        subject: Subject = Depends(get_current_subject),
        service: TaskAssignmentService = Depends(get_assignment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> list[TaskSuggestion]:
    """
    Подобрать свободные задачи (backlog/todo без исполнителя), которые лучше всего
    подходят сотруднику по его опыту и срочности задач.
    """

    matches = await service.suggest_tasks(
        resolve_user(user, subject), project_id=project_id, limit=limit,
    )
    users = await load_user_briefs(user_repo, (match.task.assignee_id for match in matches))
    return [to_task_suggestion(match, users) for match in matches]


TOOLS = (
    get_task,
    search_tasks,
    create_task,
    create_tasks_from_ticket,
    decompose_task,
    update_task,
    change_task_status,
    assign_task,
    request_task_review,
    review_task,
    add_task_comment,
    list_task_comments,
    get_team_workload,
    get_user_expertise,
    suggest_assignees,
    suggest_tasks_for_user,
)
