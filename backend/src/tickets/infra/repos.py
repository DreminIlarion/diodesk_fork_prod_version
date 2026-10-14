from typing import Any, ClassVar, override

from collections import defaultdict
from collections.abc import Callable
from uuid import UUID

from ddf.application.dsl import Condition, Expression, Group, Negation
from ddf.infra.database.sqlalchemy.filters import compile_filter
from sqlalchemy import ColumnElement, and_, func, not_, or_, select
from sqlalchemy.orm import selectinload

from src.comments.domain.vo import CommentVisibility
from src.comments.infra.models import CommentOrm, ReactionOrm
from src.shared.domain.vo import Priority
from src.shared.infra.repos import SqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Comment, Reaction, Ticket
from ..domain.repos import ReactionStats
from ..domain.vo import ReactionType, TicketStatus, TicketType
from .mappers import CommentMapper, ReactionMapper, TicketMapper
from .models import TicketOrm

TICKET_FILTER_WHITELIST = (
    "status",
    "priority",
    "ticketType",
    "tags",
    "counterpartyId",
    "projectId",
    "assigneeId",
    "reporterId",
    "createdBy",
    "createdAt",
)


_FIELD_VALUE_CONVERTERS: dict[str, Callable[[Any], Any]] = {
    "status": TicketStatus,
    "priority": Priority,
    "ticketType": TicketType,
    "counterpartyId": lambda value: UUID(str(value)),
    "projectId": lambda value: UUID(str(value)),
    "assigneeId": lambda value: UUID(str(value)),
    "reporterId": lambda value: UUID(str(value)),
    "createdBy": lambda value: UUID(str(value)),
}


def _normalize_condition(condition: Condition) -> Condition:
    """Приводит значения DSL к типам ORM-модели."""

    converter = _FIELD_VALUE_CONVERTERS.get(condition.field)
    if converter is None or condition.value is None:
        return condition

    if condition.op in {"$in", "$nin"}:
        if not isinstance(condition.value, list):
            return condition

        value = [converter(item) for item in condition.value]
    else:
        value = converter(condition.value)

    return condition.model_copy(update={"value": value})


def _compile_tags_condition(
    condition: Condition,
) -> ColumnElement[bool]:
    """Сохраняет старую семантику поиска по JSONB-тегам."""

    if condition.op not in {"$in", "$nin"}:
        raise ValueError("Tags support only '$in' and '$nin' operators.")

    if not isinstance(condition.value, list) or not condition.value:
        raise ValueError("Tags filter expects a non-empty list.")

    if not all(isinstance(tag, str) for tag in condition.value):
        raise ValueError("Every tag must be a string.")

    matches_any_tag = or_(*(TicketOrm.tags.contains([{"name": tag}]) for tag in condition.value))

    if condition.op == "$nin":
        return not_(matches_any_tag)

    return matches_any_tag


def _compile_ticket_search(query: str) -> ColumnElement[bool]:
    """Компилирует полнотекстовый поиск заявки."""

    return TicketOrm.search_vector.op("@@")(func.plainto_tsquery("russian", query))


def _compile_ticket_expression(
    expression: Expression,
) -> ColumnElement[bool]:
    """Компилирует DSL с дополнительной поддержкой JSONB-тегов."""

    if isinstance(expression, Condition):
        if expression.field == "tags":
            return _compile_tags_condition(expression)

        normalized = _normalize_condition(expression)
        return compile_filter(
            TicketOrm,
            normalized,
            TICKET_FILTER_WHITELIST,
            _compile_ticket_search,
        )

    if isinstance(expression, Group):
        filters = tuple(_compile_ticket_expression(child) for child in expression.filters)

        if not filters:
            raise ValueError("Filter group cannot be empty.")

        if expression.op == "$and":
            return and_(*filters)

        return or_(*filters)

    if isinstance(expression, Negation):
        return not_(_compile_ticket_expression(expression.filter_))

    return compile_filter(
        TicketOrm,
        expression,
        TICKET_FILTER_WHITELIST,
        _compile_ticket_search,
    )


class SqlTicketRepository(SqlAlchemyRepository[Ticket, TicketOrm]):
    model = TicketOrm
    model_mapper = TicketMapper
    filter_whitelist: ClassVar[tuple[str, ...]] = TICKET_FILTER_WHITELIST

    @override
    async def read(self, ticket_id: UUID) -> Ticket | None:
        stmt = (
            select(self.model)
            .where(self.model.id == ticket_id)
            .options(selectinload(self.model.attachments))
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()

        return None if model is None else self.model_mapper.to_entity(model)

    @override
    async def paginate(
        self,
        pagination: Pagination,
        query: Expression | None = None,
    ) -> Page[Ticket]:
        stmt = select(self.model)

        if query is not None:
            stmt = stmt.where(_compile_ticket_expression(query))

        return await self._paginate(stmt, pagination, model_mapper=self.model_mapper.to_light)

    async def get_total(
        self, project_id: UUID | None = None, counterparty_id: UUID | None = None
    ) -> int:
        conditions = []

        if project_id is not None:
            conditions.append(self.model.project_id == project_id)
            if counterparty_id is not None:
                conditions.append(self.model.counterparty_id == counterparty_id)

        elif counterparty_id is not None and project_id is None:
            conditions.extend((
                self.model.counterparty_id == counterparty_id,
                self.model.project_id.is_(None),
            ))

        else:
            conditions.extend((
                self.model.project_id.is_(None),
                self.model.counterparty_id.is_(None),
            ))

        stmt = select(func.count()).select_from(self.model).where(and_(*conditions))
        return await self.session.scalar(stmt) or 0

    async def get_by_reporter(self, reporter_id: UUID, pagination: Pagination) -> Page[Ticket]:
        stmt = select(self.model).where(self.model.reporter_id == reporter_id)

        return await self._paginate(stmt, pagination)

    @override
    async def get_by_ids(self, ids: list[UUID]) -> list[Ticket]:
        if not ids:
            return []

        stmt = select(self.model).where(self.model.id.in_(ids))
        result = await self.session.execute(stmt)

        return [self.model_mapper.to_light(model) for model in result.scalars().all()]


class SqlCommentRepository(SqlAlchemyRepository[Comment, CommentOrm]):
    model = CommentOrm
    model_mapper = CommentMapper

    async def get_by_ticket(
        self,
        ticket_id: UUID,
        pagination: Pagination,
        *,
        user_id: UUID | None = None,
        include_notes: bool = False,
        include_internal: bool = False,
    ) -> Page[Comment]:
        if user_id is None and include_notes:
            raise ValueError("User ID required for received NOTE comments")

        base_conditions = [
            self.model.ticket_id == ticket_id,
            self.model.parent_comment_id.is_(None),
            self.model.deleted_at.is_(None),
        ]
        type_conditions = [self.model.visibility == CommentVisibility.PUBLIC]

        if include_notes:
            type_conditions.append(
                (self.model.visibility == CommentVisibility.INTERNAL)
                & (self.model.author_id == user_id)
            )
        if include_internal:
            type_conditions.append(self.model.visibility == CommentVisibility.INTERNAL)

        stmt = select(self.model).where(and_(*base_conditions), or_(*type_conditions))

        return await self._paginate(stmt, pagination)

    async def get_replies(
        self,
        parent_comment_id: UUID,
        pagination: Pagination,
        *,
        user_id: UUID | None = None,
        include_notes: bool = False,
        include_internal: bool = False,
    ) -> Page[Comment]:
        type_conditions = [self.model.visibility == CommentVisibility.PUBLIC]
        if include_internal:
            type_conditions.append(self.model.visibility == CommentVisibility.INTERNAL)
        if include_notes:
            type_conditions.append(
                (self.model.visibility == CommentVisibility.INTERNAL)
                & (self.model.author_id == user_id)
            )

        stmt = select(self.model).where(
            self.model.parent_comment_id == parent_comment_id,
            self.model.deleted_at.is_(None),
            or_(*type_conditions),
        )

        return await self._paginate(stmt, pagination)


class SqlReactionRepository(SqlAlchemyRepository[Reaction, ReactionOrm]):
    model = ReactionOrm
    model_mapper = ReactionMapper

    async def find(
        self, comment_id: UUID, author_id: UUID, reaction_type: ReactionType
    ) -> Reaction | None:
        stmt = select(self.model).where(
            (self.model.comment_id == comment_id)
            & (self.model.author_id == author_id)
            & (self.model.emoji == reaction_type)
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_reaction_stats(self, comment_ids: list[UUID], user_id: UUID) -> ReactionStats:
        stmt = (
            select(
                self.model.comment_id,
                self.model.emoji,
                func.count(self.model.id).label("cnt"),
                func
                .count(self.model.id)
                .filter(self.model.author_id == user_id)
                .label("user_has_type"),
            )
            .where((self.model.comment_id.in_(comment_ids)) & (self.model.deleted_at.is_(None)))
            .group_by(self.model.comment_id, self.model.emoji)
        )

        result = await self.session.execute(stmt)

        counts: dict[UUID, dict[ReactionType, int]] = defaultdict(dict)
        user_reactions: dict[UUID, set[ReactionType]] = defaultdict(set)

        for row in result:
            counts[row.comment_id][row.emoji] = row.cnt
            if row.user_has_type > 0:
                user_reactions[row.comment_id].add(row.emoji)

        return ReactionStats(counts=counts, user_reactions=user_reactions)
