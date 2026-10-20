from typing import ClassVar, override

from collections import defaultdict
from uuid import UUID

from ddf.application.dsl import Condition
from ddf.application.dtos import OffsetPagination, QueryDTO, Sort
from ddf.application.dtos.pagination import OffsetMeta
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository as DdfSqlAlchemyRepository
from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import selectinload

from src.comments.domain.vo import CommentVisibility
from src.comments.infra.models import CommentOrm, ReactionOrm
from src.shared.infra.repos import SqlAlchemyRepository as LocalSqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Comment, Reaction, Ticket
from ..domain.repos import ReactionStats
from ..domain.vo import ReactionType
from .mappers import CommentMapper, ReactionMapper, TicketMapper
from .models import TicketOrm

TICKET_FILTER_WHITELIST = (
    "status",
    "priority",
    "ticketType",
    "counterpartyId",
    "projectId",
    "assigneeId",
    "reporterId",
    "createdBy",
    "createdAt",
)


def _compile_ticket_search(query: str) -> ColumnElement[bool]:
    """Компилирует полнотекстовый поиск заявки."""

    return TicketOrm.search_vector.op("@@")(func.plainto_tsquery("russian", query))


class SqlTicketRepository(DdfSqlAlchemyRepository[Ticket, TicketOrm]):
    model = TicketOrm
    data_mapper = TicketMapper()
    search = staticmethod(_compile_ticket_search)
    filter_whitelist: ClassVar[tuple[str, ...]] = TICKET_FILTER_WHITELIST

    @override
    async def read(self, ticket_id: UUID) -> Ticket | None:
        stmt = (
            select(self.model)
            .where(self.model.id == ticket_id)
            .options(selectinload(self.model.attachments))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        return None if model is None else TicketMapper.to_entity(model)

    @override
    async def paginate(
        self,
        pagination: Pagination,
        query: QueryDTO | None = None,
    ) -> Page[Ticket]:
        page = await self.find(
            OffsetPagination(page=pagination.page, size=pagination.size),
            query=query,
            sort=Sort(field="created_at", direction="desc"),
        )
        if not isinstance(page.meta, OffsetMeta):
            raise TypeError("Ticket pagination must use the offset strategy.")

        return Page.create(
            items=page.items,
            total_items=page.meta.total,
            page=page.meta.page,
            size=page.meta.size,
        )

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
        return await self._session.scalar(stmt) or 0

    async def get_by_reporter(self, reporter_id: UUID, pagination: Pagination) -> Page[Ticket]:
        return await self.paginate(
            pagination,
            query=Condition(field="reporterId", op="$eq", value=reporter_id),
        )


class SqlCommentRepository(LocalSqlAlchemyRepository[Comment, CommentOrm]):
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


class SqlReactionRepository(LocalSqlAlchemyRepository[Reaction, ReactionOrm]):
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
