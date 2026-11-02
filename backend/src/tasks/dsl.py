from datetime import date
from uuid import UUID

from ddf.application.dsl import Condition, Expression, Group

from src.shared.domain.vo import Priority
from src.shared.utils.time import current_datetime

from .domain.vo import TaskStatus
from .schemas import (
    AssigneeKanbanContext,
    KanbanContextType,
    KanbanRequest,
    KanbanSearchRequest,
    ProjectKanbanContext,
    TicketKanbanContext,
)


def legacy_kanban_filters_to_expression(
    *,
    priorities: list[Priority] | None = None,
    overdue_only: bool = False,
    stage_ids: list[UUID] | None = None,
    today: date | None = None,
) -> Expression | None:
    """Преобразует старые query-параметры канбана в DDF DSL."""

    priority_expression = (
        Condition(
            field="priority",
            op="$in",
            value=[priority.value for priority in priorities],
        )
        if priorities
        else None
    )

    overdue_expression = None
    if overdue_only:
        overdue_expression = Group(
            op="$and",
            filters=(
                Condition(
                    field="dueDate",
                    op="$lt",
                    value=(today or current_datetime().date()).isoformat(),
                ),
                Condition(
                    field="status",
                    op="$nin",
                    value=[
                        TaskStatus.DONE.value,
                        TaskStatus.CANCELLED.value,
                    ],
                ),
            ),
        )

    stage_expression = (
        Condition(field="stageId", op="$in", value=stage_ids)
        if stage_ids
        else None
    )

    expressions = [
        expression
        for expression in (priority_expression, overdue_expression, stage_expression)
        if expression is not None
    ]
    if not expressions:
        return None
    if len(expressions) == 1:
        return expressions[0]
    return Group(op="$and", filters=tuple(expressions))


def apply_kanban_context(
    context: KanbanContextType,
    *,
    current_subject_id: UUID,
    query: Expression | None = None,
) -> Expression | None:
    """Добавляет обязательные ограничения контекста к пользовательскому DSL."""

    context_expression: Expression | None = None

    if isinstance(context, ProjectKanbanContext):
        context_expression = Condition(
            field="projectId",
            op="$eq",
            value=context.project_id,
        )

    elif isinstance(context, TicketKanbanContext):
        context_expression = Condition(
            field="ticketId",
            op="$eq",
            value=context.ticket_id,
        )

    elif isinstance(context, AssigneeKanbanContext):
        context_expression = Condition(
            field="assigneeId",
            op="$eq",
            value=context.assignee_id,
        )

    elif context.type == "my":
        context_expression = Group(
            op="$or",
            filters=(
                Condition(
                    field="createdBy",
                    op="$eq",
                    value=current_subject_id,
                ),
                Condition(
                    field="assigneeId",
                    op="$eq",
                    value=current_subject_id,
                ),
                Condition(
                    field="reviewerId",
                    op="$eq",
                    value=current_subject_id,
                ),
            ),
        )

    # Для internal сохраняется прежнее поведение без дополнительного фильтра.
    if context_expression is None:
        return query

    if query is None:
        return context_expression

    return Group(op="$and", filters=(context_expression, query))


def unpack_kanban_request(
    request: KanbanRequest,
) -> tuple[KanbanContextType, Expression | None]:
    """Разбирает старое и расширенное тело запроса."""

    if isinstance(request, KanbanSearchRequest):
        return request.context, request.query

    return request, None
