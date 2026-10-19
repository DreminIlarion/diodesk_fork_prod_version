from datetime import datetime

from ddf.application.dsl import Condition, Expression, Group, Search

from .schemas import LegacyTicketSearch


def legacy_ticket_search_to_expression(  # noqa: C901
    search: LegacyTicketSearch,
    *,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
) -> Expression | None:
    """Преобразует старый формат филтрации тикетов в DDF DSL."""

    expressions: list[Expression] = []

    if search.search_query:
        expressions.append(Search(query=search.search_query))

    if search.statuses:
        expressions.append(
            Condition(
                field="status",
                op="$in",
                value=[status.value for status in search.statuses],
            )
        )

    if search.priorities:
        priorities = (
            search.priorities if isinstance(search.priorities, list) else [search.priorities]
        )
        expressions.append(
            Condition(
                field="priority",
                op="$in",
                value=[priority.value for priority in priorities],
            )
        )

    if search.ticket_type:
        expressions.append(
            Condition(
                field="ticketType",
                op="$eq",
                value=search.ticket_type.value,
            )
        )

    if search.tags:
        expressions.append(
            Condition(
                field="tags",
                op="$in",
                value=search.tags,
            )
        )

    if search.counterparty_id:
        expressions.append(
            Condition(
                field="counterpartyId",
                op="$eq",
                value=search.counterparty_id,
            )
        )

    if search.project_ids:
        expressions.append(
            Condition(
                field="projectId",
                op="$in",
                value=search.project_ids,
            )
        )

    if search.actors:
        actor_fields = (
            ("assigneeId", search.actors.assignee_id),
            ("reporterId", search.actors.reporter_id),
            ("createdBy", search.actors.creator_id),
        )

        expressions.extend(
            Condition(field=field, op="$eq", value=value)
            for field, value in actor_fields
            if value is not None
        )

    if created_after:
        expressions.append(
            Condition(
                field="createdAt",
                op="$gte",
                value=created_after,
            )
        )

    if created_before:
        expressions.append(
            Condition(
                field="createdAt",
                op="$lte",
                value=created_before,
            )
        )

    if not expressions:
        return None

    if len(expressions) == 1:
        return expressions[0]

    return Group(op="$and", filters=tuple(expressions))
