from typing import Annotated

from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from src.activity_logs.dependencies import ActivityLogPaginatorFunc, get_activity_logs_paginator
from src.activity_logs.schemas import ActivityLogResponse
from src.iam.dependencies import (
    CurrentSubjectDep,
    CurrentUserDep,
    get_current_subject,
)
from src.iam.domain.authz import Subject
from src.shared.dependencies import PaginationDep
from src.shared.schemas import Page

from .dependencies import (
    CommentServiceDep,
    ReactionServiceDep,
    TicketQueryServiceDep,
    TicketServiceDep,
    get_ticket_or_404,
)
from .domain.activity_logs import AGGREGATE_TYPE
from .domain.vo import ReactionType, TicketStatus
from .infra.ai import suggest_ticket_fields
from .schemas import (
    CommentCreate,
    CommentEdit,
    CommentResponse,
    CommentWithReactionsResponse,
    PredictionResponse,
    ReactionResponse,
    TicketAssign,
    TicketCreate,
    TicketEdit,
    TicketFilters,
    TicketParticipant,
    TicketPredict,
    TicketResponse,
    TicketStatusChange,
    TicketViewResponse,
)
from .services import TicketService

router = APIRouter(prefix="/tickets", tags=["Заявки"])

type TicketStatusHandler = Callable[
    [TicketService, UUID, Subject],
    Awaitable[TicketResponse],
]

_ticket_status_handlers: dict[TicketStatus, TicketStatusHandler] = {}


def register_ticket_status_handler(
        target_status: TicketStatus,
) -> Callable[[TicketStatusHandler], TicketStatusHandler]:
    """Зарегистрировать обработчик перехода тикета в указанный статус"""

    def decorator(handler: TicketStatusHandler) -> TicketStatusHandler:
        """Добавить обработчик в реестр и вернуть исходную функцию"""

        _ticket_status_handlers[target_status] = handler
        return handler

    return decorator


@register_ticket_status_handler(TicketStatus.PENDING_APPROVAL)
async def transition_to_pending_approval(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Отправить тикет на согласование"""

    return await service.submit_for_approval(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.OPEN)
async def transition_to_open(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Согласовать тикет и перевести его в открытый статус"""

    return await service.approve(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.IN_PROGRESS)
async def transition_to_in_progress(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Взять тикет в работу"""

    return await service.start_progress(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.WAITING)
async def transition_to_waiting(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Перевести тикет в ожидание ответа"""

    return await service.wait(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.RESOLVED)
async def transition_to_resolved(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Отметить тикет как решённый"""

    return await service.resolve(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.CLOSED)
async def transition_to_closed(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Закрыть тикет"""

    return await service.close(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.CANCELED)
async def transition_to_canceled(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Отменить тикет"""

    return await service.cancel(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.REJECTED)
async def transition_to_rejected(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Отклонить тикет"""

    return await service.reject(ticket_id, current_subject)


@register_ticket_status_handler(TicketStatus.REOPENED)
async def transition_to_reopened(
        service: TicketService,
        ticket_id: UUID,
        current_subject: Subject,
) -> TicketResponse:
    """Переоткрыть тикет"""

    return await service.reopen(ticket_id, current_subject)


@router.post(
    path="",
    status_code=status.HTTP_201_CREATED,
    response_model=TicketResponse,
    summary="Создать новую заявку"
)
async def create_ticket(
        current_subject: CurrentSubjectDep, data: TicketCreate, service: TicketServiceDep
) -> TicketResponse:
    return await service.create(data, current_subject)


@router.post(
    path="/search",
    status_code=status.HTTP_200_OK,
    response_model=Page[TicketViewResponse],
    dependencies=[Depends(get_current_subject)],
    summary="Получить список тикетов",
)
async def search_tickets(
        filters: TicketFilters,
        current_subject: CurrentSubjectDep,
        pagination: PaginationDep,
        service: TicketQueryServiceDep,
) -> Page[TicketViewResponse]:
    return await service.get_tickets(
        pagination,
        filters=filters,
        current_subject=current_subject,
    )


@router.get(
    path="/{ticket_id}",
    status_code=status.HTTP_200_OK,
    response_model=TicketResponse,
    dependencies=[Depends(get_current_subject)],
    summary="Получить заявку",
)
async def get_ticket(ticket: TicketResponse = Depends(get_ticket_or_404)) -> TicketResponse:
    return ticket


@router.get(
    path="/{ticket_id}/participants",
    status_code=status.HTTP_200_OK,
    response_model=list[TicketParticipant],
    dependencies=[Depends(get_current_subject)],
    summary="Получить участников заявки",
)
async def get_ticket_participants(
        ticket_id: UUID, service: TicketQueryServiceDep,
) -> list[TicketParticipant]:
    return await service.get_ticket_participants(ticket_id)


@router.patch(
    path="/{ticket_id}",
    status_code=status.HTTP_200_OK,
    response_model=TicketResponse,
    summary="Редактирование тикета",
    description="",
)
async def update_ticket(
        ticket_id: UUID,
        data: TicketEdit,
        current_subject: CurrentSubjectDep,
        service: TicketServiceDep,
) -> TicketResponse:
    return await service.edit(ticket_id, data, current_subject=current_subject)


@router.post(
    path="/{ticket_id}/assign",
    status_code=status.HTTP_200_OK,
    response_model=TicketResponse,
    summary="Назначить тикет на пользователя",
    description="Назначает тикет на агента поддержки. Доступно только для сотрудников поддержки",
)
async def assign_ticket(
        ticket_id: UUID,
        data: TicketAssign,
        current_subject: CurrentSubjectDep,
        service: TicketServiceDep,
) -> TicketResponse:
    return await service.assign(
        ticket_id=ticket_id,
        assignee_id=data.assignee_id,
        current_subject=current_subject,
    )


@router.delete(
    path="/{ticket_id}",
    status_code=status.HTTP_200_OK,
    response_model=TicketResponse,
    summary="Архивирование тикета",
    description="Soft-delete метод, не удаляет тикет фактически (добавляет в архив)",
)
async def delete_ticket(
        ticket_id: UUID, current_subject: CurrentSubjectDep, service: TicketServiceDep
) -> TicketResponse:
    return await service.archive(ticket_id=ticket_id, current_subject=current_subject)


@router.get(
    path="/{ticket_id}/history",
    status_code=status.HTTP_200_OK,
    response_model=Page[ActivityLogResponse],
    dependencies=[Depends(get_current_subject)],
    summary="Получить историю бизнес действий",
    description="Журнал всех зарегистрированные события над заявкой"
)
async def get_ticket_history(
        ticket_id: UUID,
        paginator: ActivityLogPaginatorFunc = Depends(get_activity_logs_paginator),
) -> Page[ActivityLogResponse]:
    return await paginator(AGGREGATE_TYPE, ticket_id)


@router.get(
    path="/{ticket_id}/comments",
    status_code=status.HTTP_200_OK,
    response_model=Page[CommentWithReactionsResponse],
    summary="Получение комментариев тикета"
)
async def get_ticket_comments(
        ticket_id: UUID,
        pagination: PaginationDep,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
        include_internal: Annotated[
            bool, Query(..., description="Видеть внутренние комментарии (только для поддержки)")
        ] = False,
) -> Page[CommentWithReactionsResponse]:
    return await service.get_comments(
        ticket_id=ticket_id,
        pagination=pagination,
        current_subject=current_user,
        include_internal=include_internal,
    )


@router.get(
    path="/comments/{comment_id}/replies",
    status_code=status.HTTP_200_OK,
    response_model=Page[CommentWithReactionsResponse],
    summary="Получение ответов на комментарий"
)
async def get_comment_replies(
        comment_id: UUID,
        pagination: PaginationDep,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
        include_internal: Annotated[
            bool, Query(..., description="Видеть внутренние комментарии (только для поддержки)")
        ] = False,
) -> Page[CommentWithReactionsResponse]:
    return await service.get_comment_replies(
        comment_id=comment_id,
        pagination=pagination,
        current_subject=current_user,
        include_internal=include_internal,
    )


@router.post(
    path="/{ticket_id}/comments",
    status_code=status.HTTP_201_CREATED,
    response_model=CommentResponse,
    summary="Оставить комментарий к тикету",
)
async def add_comment(
        ticket_id: UUID,
        data: CommentCreate,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
) -> CommentResponse:
    return await service.add_comment(ticket_id, data, current_user)


@router.post(
    path="/{ticket_id}/comments/{comment_id}/replies",
    status_code=status.HTTP_201_CREATED,
    response_model=CommentResponse,
    summary="Ответить на комментарий"
)
async def add_comment_reply(
        ticket_id: UUID,
        comment_id: UUID,
        data: CommentCreate,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
) -> CommentResponse:
    return await service.reply_to_comment(
        ticket_id=ticket_id,
        parent_comment_id=comment_id,
        data=data,
        current_subject=current_user,
    )


@router.patch(
    path="/{ticket_id}/comments/{comment_id}",
    status_code=status.HTTP_200_OK,
    response_model=CommentResponse,
    summary="Редактирование комментария",
)
async def edit_comment(
        ticket_id: UUID,
        comment_id: UUID,
        data: CommentEdit,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
) -> CommentResponse:
    return await service.edit_comment(
        ticket_id=ticket_id,
        comment_id=comment_id,
        data=data,
        edited_by=current_user.user_id
    )


@router.delete(
    path="/{ticket_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удаление комментария (Soft-delete)"
)
async def delete_comment(
        ticket_id: UUID,
        comment_id: UUID,
        current_user: CurrentUserDep,
        service: CommentServiceDep,
) -> None:
    return await service.delete_comment(
        ticket_id=ticket_id,
        comment_id=comment_id,
        deleted_by=current_user.user_id,
        deleted_by_role=current_user.role,
    )


@router.post(
    path="/comments/{comment_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Оставить/переключить реакцию",
    description="""\
    Реализует 3 сценария:

     - Создание новой реакции
     - Переключение между реакциями (реакция была создана, пользователь нажал на другую)
     - Удаление реакции (пользователь нажал на поставленную реакцию)
    """
)
async def toggle_reaction(
        comment_id: UUID,
        current_user: CurrentUserDep,
        service: ReactionServiceDep,
        reaction_type: Annotated[
            ReactionType, Body(..., embed=True, description="Реакция, которую нужно оставить")
        ],
) -> None:
    return await service.toggle(
        comment_id=comment_id, current_subject=current_user, reaction_type=reaction_type
    )


@router.get(
    path="/comments/{comment_id}/reactions",
    status_code=status.HTTP_200_OK,
    response_model=ReactionResponse,
    summary="Получение реакции на комментарий"
)
async def get_comment_reactions(
        comment_id: UUID, current_user: CurrentUserDep, service: ReactionServiceDep
) -> ReactionResponse:
    return await service.get_reactions_for_comment(comment_id, current_user)


@router.patch(
    path="/{ticket_id}/status",
    status_code=status.HTTP_200_OK,
    response_model=TicketResponse,
    summary="Изменить статус тикета",
)
async def change_ticket_status(
        ticket_id: UUID,
        data: TicketStatusChange,
        current_subject: CurrentSubjectDep,
        service: TicketServiceDep,
) -> TicketResponse:
    handler = _ticket_status_handlers.get(data.status)
    if handler is None:
        raise ValueError(f"Unsupported target status: {data.status.value}")

    return await handler(service, ticket_id, current_subject)


@router.post(
    path="/predict",
    status_code=status.HTTP_200_OK,
    response_model=PredictionResponse,
    summary="Определение приоритета и генерация тегов"
)
async def suggest_for_ticket(data: TicketPredict) -> PredictionResponse:
    return await suggest_ticket_fields(data)
