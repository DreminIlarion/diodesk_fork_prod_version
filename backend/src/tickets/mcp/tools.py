from typing import Annotated

from uuid import UUID

from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field

from src.comments.domain.vo import CommentVisibility
from src.iam.domain.authz import Subject
from src.iam.domain.repos import UserRepository
from src.iam.mcp.dependencies import get_user_repo
from src.iam.mcp.presenters import load_user_briefs
from src.mcp.annotations import CREATE, READ_ONLY, UPDATE
from src.mcp.dependencies import get_current_subject, get_project_repo
from src.mcp.params import PageNumber, PageSize, UserSelector, paginate, resolve_user
from src.mcp.schemas import CommentBrief
from src.projects.domain.repos import ProjectRepository
from src.shared.domain.repos import get_or_raise_404
from src.shared.domain.vo import Priority
from src.shared.schemas import Page
from src.tasks.domain.repos import TaskRepository
from src.tasks.mcp.dependencies import get_task_repo

from ..domain.dtos import ActorsFilters, TicketFilters
from ..domain.entities import Ticket
from ..domain.repos import TicketRepository
from ..domain.vo import CommentType, TicketStatus, TicketType
from ..schemas import CommentCreate
from ..services import CommentService, TicketService
from .dependencies import get_ticket_comment_service, get_ticket_repo, get_ticket_service
from .presenters import present_ticket, to_comment_brief, to_ticket_brief
from .references import TicketRef, find_ticket
from .schemas import TicketBrief, TicketCard


@tool(annotations=READ_ONLY, tags={"tickets"})
async def get_ticket(
        ticket: TicketRef,
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        task_repo: TaskRepository = Depends(get_task_repo),
        user_repo: UserRepository = Depends(get_user_repo),
        project_repo: ProjectRepository = Depends(get_project_repo),
) -> TicketCard:
    """
    Полная карточка заявки: описание, участники и пул задач по ней со сводкой
    (сколько открыто, без исполнителя, суммарные оценки).
    """

    found = await find_ticket(ticket_repo, ticket)
    return await present_ticket(
        found, task_repo=task_repo, user_repo=user_repo, project_repo=project_repo,
    )


@tool(annotations=READ_ONLY, tags={"tickets"})
async def search_tickets(
        query: Annotated[
            str | None, Field(description="Полнотекстовый поиск по заголовку и описанию")
        ] = None,
        statuses: Annotated[list[TicketStatus] | None, Field(description="Статусы")] = None,
        priorities: Annotated[list[Priority] | None, Field(description="Приоритеты")] = None,
        ticket_type: Annotated[TicketType | None, Field(description="Вид заявки")] = None,
        tags: Annotated[list[str] | None, Field(description="Хотя бы один из тегов")] = None,
        assignee: Annotated[UserSelector | None, Field(description="Ответственный")] = None,
        project_id: Annotated[UUID | None, Field(description="ID проекта")] = None,
        page: PageNumber = 1,
        size: PageSize = 20,
        subject: Subject = Depends(get_current_subject),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        user_repo: UserRepository = Depends(get_user_repo),
) -> Page[TicketBrief]:
    """Поиск заявок по фильтрам (от новых к старым)."""

    assignee_id = resolve_user(assignee, subject)
    filters = TicketFilters(
        search_query=query,
        statuses=statuses,
        priorities=priorities,
        type=ticket_type,
        tags=tags,
        project_ids=None if project_id is None else {project_id},
        actors=None if assignee_id is None else ActorsFilters(assignee_id=assignee_id),
    )
    found = await ticket_repo.paginate(paginate(page, size), filters=filters)

    users = await load_user_briefs(
        user_repo, (uid for t in found.items for uid in (t.reporter_id, t.assignee_id)),
    )
    return found.to_response(lambda ticket: to_ticket_brief(ticket, users))


@tool(annotations=READ_ONLY, tags={"tickets", "comments"})
async def list_ticket_comments(
        ticket: TicketRef,
        include_internal: Annotated[
            bool, Field(description="Включать внутренние комментарии сотрудников")
        ] = True,
        page: PageNumber = 1,
        size: PageSize = 20,
        subject: Subject = Depends(get_current_subject),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        service: CommentService = Depends(get_ticket_comment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> Page[CommentBrief]:
    """Обсуждение заявки (комментарии верхнего уровня, от новых к старым)."""

    found = await find_ticket(ticket_repo, ticket)
    comments = await service.get_comments(
        ticket_id=found.id,
        pagination=paginate(page, size),
        current_subject=subject,
        include_internal=include_internal,
    )
    authors = await load_user_briefs(user_repo, (comment.author_id for comment in comments.items))
    return comments.to_response(lambda comment: to_comment_brief(comment, authors))


@tool(annotations=CREATE, tags={"tickets", "comments"})
async def add_ticket_comment(
        ticket: TicketRef,
        text: Annotated[str, Field(min_length=1, description="Текст комментария")],
        visibility: Annotated[
            CommentVisibility,
            Field(description="internal - только сотрудникам (по умолчанию), "
                              "public - увидит клиент, note - личная заметка"),
        ] = CommentVisibility.INTERNAL,
        reply_to: Annotated[
            UUID | None, Field(description="ID комментария, на который нужно ответить")
        ] = None,
        subject: Subject = Depends(get_current_subject),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        service: CommentService = Depends(get_ticket_comment_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> CommentBrief:
    """
    Оставить комментарий к заявке. Публичный комментарий увидит клиент -
    его текст обязательно согласуй с пользователем.
    """

    found = await find_ticket(ticket_repo, ticket)
    data = CommentCreate(text=text, type=CommentType(visibility.value))

    if reply_to is None:
        comment = await service.add_comment(found.id, data, subject)
    else:
        comment = await service.reply_to_comment(found.id, reply_to, data, subject)

    authors = await load_user_briefs(user_repo, [comment.author_id])
    return to_comment_brief(comment, authors)


@tool(annotations=UPDATE, tags={"tickets", "planning"})
async def assign_ticket(
        ticket: TicketRef,
        assignee: UserSelector,
        subject: Subject = Depends(get_current_subject),
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        service: TicketService = Depends(get_ticket_service),
        task_repo: TaskRepository = Depends(get_task_repo),
        user_repo: UserRepository = Depends(get_user_repo),
        project_repo: ProjectRepository = Depends(get_project_repo),
) -> TicketCard:
    """Назначить ответственного за заявку."""

    found = await find_ticket(ticket_repo, ticket)
    await service.assign(
        ticket_id=found.id, assignee_id=resolve_user(assignee, subject), current_subject=subject,
    )
    return await present_ticket(
        await get_or_raise_404(ticket_repo.read, found.id, Ticket),
        task_repo=task_repo,
        user_repo=user_repo,
        project_repo=project_repo,
    )


TOOLS = (get_ticket, search_tickets, list_ticket_comments, add_ticket_comment, assign_ticket)
