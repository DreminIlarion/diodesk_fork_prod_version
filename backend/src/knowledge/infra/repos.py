from typing import Any

from collections.abc import Mapping
from uuid import UUID

from opensearchpy import AsyncOpenSearch
from opensearchpy import NotFoundError as OpenSearchNotFoundError

from src.shared.schemas import Page, Pagination

from ..domain.entities import Article, ChatMessage, ChatSession
from .mappers import (
    ArticleDocumentMapper,
    ChatMessageDocumentMapper,
    ChatSessionDocumentMapper,
)


class OpenSearchArticleRepository:
    """Хранилище статей базы знаний в OpenSearch."""

    def __init__(
        self,
        client: AsyncOpenSearch,
        *,
        read_index: str,
        write_index: str,
    ) -> None:
        self.client = client
        self.read_index = read_index
        self.write_index = write_index

    async def create(self, entity: Article) -> Article:
        """
        Создаёт статью и запрещает перезапись документа с таким же ID.
        """

        await self.client.index(
            index=self.write_index,
            id=str(entity.id),
            body=ArticleDocumentMapper.from_entity(entity),
            params={
                "op_type": "create",
                "refresh": "wait_for",
            },
        )
        return entity

    async def read(self, uid: UUID) -> Article | None:
        """Получает статью по её ID."""

        try:
            response = await self.client.get(
                index=self.read_index,
                id=str(uid),
            )
        except OpenSearchNotFoundError:
            return None

        return _article_from_hit(response)

    async def paginate(
        self,
        params: Pagination,
    ) -> Page[Article]:
        """Возвращает страницу статей новых к старым."""

        response = await self.client.search(
            index=self.read_index,
            body={
                "from": params.offset,
                "size": params.size,
                "track_total_hits": True,
                "sort": [
                    {
                        "created_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "match_all": {},
                },
            },
        )

        hits = response["hits"]
        total_items = _total_hits(hits["total"])
        articles = [
            _article_from_hit(hit)
            for hit in hits["hits"]
        ]

        return Page.create(
            items=articles,
            total_items=total_items,
            page=params.page,
            size=params.size,
        )

    async def update(self, entity: Article) -> None:
        """Полностью заменяет `_source` существующей статьи."""

        await self.client.index(
            index=self.write_index,
            id=str(entity.id),
            body=ArticleDocumentMapper.from_entity(entity),
            params={
                "refresh": "wait_for",
            },
        )

    async def delete(self, uid: UUID) -> None:
        """Физически удаляет статью, если она существует."""

        try:
            await self.client.delete(
                index=self.write_index,
                id=str(uid),
                params={
                    "refresh": "wait_for",
                },
            )
        except OpenSearchNotFoundError:
            return

    async def exists(self, uid: UUID) -> bool:
        """Проверяет существование статьи."""

        return bool(
            await self.client.exists(
                index=self.read_index,
                id=str(uid),
            )
        )

    async def get_by_ids(
        self,
        ids: list[UUID],
    ) -> list[Article]:
        """Получает статьи одним запросом с сохранением порядка ID."""

        if not ids:
            return []

        response = await self.client.mget(
            index=self.read_index,
            body={
                "ids": [
                    str(article_id)
                    for article_id in ids
                ],
            },
        )

        return [
            _article_from_hit(document)
            for document in response["docs"]
            if document.get("found") is True
        ]

    async def get_by_external_id(
        self,
        source_type: str,
        external_id: str,
    ) -> Article | None:
        """
        Находит статью по типу и идентификатору внешнего источника.
        """

        response = await self.client.search(
            index=self.read_index,
            body={
                "size": 1,
                "sort": [
                    {
                        "updated_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "bool": {
                        "filter": [
                            {
                                "term": {
                                    "source_type": source_type,
                                }
                            },
                            {
                                "term": {
                                    "external_id": external_id,
                                }
                            },
                        ]
                    }
                },
            },
        )

        hits = response["hits"]["hits"]
        if not hits:
            return None

        return _article_from_hit(hits[0])


class OpenSearchChatSessionRepository:
    """Хранилище сессий ии-чата в OpenSearch."""

    def __init__(
        self,
        client: AsyncOpenSearch,
        *,
        index: str,
    ) -> None:
        self.client = client
        self.index = index

    async def create(
        self,
        entity: ChatSession,
    ) -> ChatSession:
        """Создаёт новую сессию ии-чата."""

        await self.client.index(
            index=self.index,
            id=str(entity.id),
            body=ChatSessionDocumentMapper.from_entity(entity),
            params={
                "op_type": "create",
                "refresh": "wait_for",
            },
        )
        return entity

    async def read(
        self,
        uid: UUID,
    ) -> ChatSession | None:
        """Получает сессию по её ID."""

        try:
            response = await self.client.get(
                index=self.index,
                id=str(uid),
            )
        except OpenSearchNotFoundError:
            return None

        return _chat_session_from_hit(response)

    async def paginate(
        self,
        params: Pagination,
    ) -> Page[ChatSession]:
        """Возвращает страницу сессий от новых к старым."""

        response = await self.client.search(
            index=self.index,
            body={
                "from": params.offset,
                "size": params.size,
                "track_total_hits": True,
                "sort": [
                    {
                        "created_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "match_all": {},
                },
            },
        )

        hits = response["hits"]
        sessions = [
            _chat_session_from_hit(hit)
            for hit in hits["hits"]
        ]

        return Page.create(
            items=sessions,
            total_items=_total_hits(hits["total"]),
            page=params.page,
            size=params.size,
        )

    async def update(
        self,
        entity: ChatSession,
    ) -> None:
        """Полностью обновляет документы сессии."""

        await self.client.index(
            index=self.index,
            id=str(entity.id),
            body=ChatSessionDocumentMapper.from_entity(entity),
            params={
                "refresh": "wait_for",
            },
        )

    async def delete(self, uid: UUID) -> None:
        """Физически удаляет сессию, если она существует."""

        try:
            await self.client.delete(
                index=self.index,
                id=str(uid),
                params={
                    "refresh": "wait_for",
                },
            )
        except OpenSearchNotFoundError:
            return

    async def exists(self, uid: UUID) -> bool:
        """Проверяет существование сессии."""

        return bool(
            await self.client.exists(
                index=self.index,
                id=str(uid),
            )
        )

    async def get_by_ids(
        self,
        ids: list[UUID],
    ) -> list[ChatSession]:
        """Получает несколько сессий одним запросом."""

        if not ids:
            return []

        response = await self.client.mget(
            index=self.index,
            body={
                "ids": [
                    str(session_id)
                    for session_id in ids
                ],
            },
        )

        return [
            _chat_session_from_hit(document)
            for document in response["docs"]
            if document.get("found") is True
        ]

    async def get_by_ticket_and_user(
        self,
        ticket_id: UUID,
        user_id: UUID,
    ) -> ChatSession | None:
        """Возвращает последнюю активную сессию сотрудника в тикете."""

        response = await self.client.search(
            index=self.index,
            body={
                "size": 1,
                "sort": [
                    {
                        "updated_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "bool": {
                        "filter": [
                            {
                                "term": {
                                    "ticket_id": str(ticket_id),
                                }
                            },
                            {
                                "term": {
                                    "created_by": str(user_id),
                                }
                            },
                        ],
                        "must_not": [
                            {
                                "exists": {
                                    "field": "deleted_at",
                                }
                            }
                        ],
                    }
                },
            },
        )

        hits = response["hits"]["hits"]
        if not hits:
            return None

        return _chat_session_from_hit(hits[0])


class OpenSearchChatMessageRepository:
    """Хранилище сообщений ии-чата в OpenSearch"""

    def __init__(
        self,
        client: AsyncOpenSearch,
        *,
        index: str,
    ) -> None:
        self.client = client
        self.index = index

    async def create(
        self,
        entity: ChatMessage,
    ) -> ChatMessage:
        """Создаёт сообщение ии-чата."""

        await self.client.index(
            index=self.index,
            id=str(entity.id),
            body=ChatMessageDocumentMapper.from_entity(entity),
            params={
                "op_type": "create",
                "refresh": "wait_for",
            },
        )
        return entity

    async def read(
        self,
        uid: UUID,
    ) -> ChatMessage | None:
        """Получает сообщение по его ID"""

        try:
            response = await self.client.get(
                index=self.index,
                id=str(uid),
            )
        except OpenSearchNotFoundError:
            return None

        return _chat_message_from_hit(response)

    async def paginate(
        self,
        params: Pagination,
    ) -> Page[ChatMessage]:
        """Возвращает страницу сообщение от новых к старым."""

        response = await self.client.search(
            index=self.index,
            body={
                "from": params.offset,
                "size": params.size,
                "track_total_hits": True,
                "sort": [
                    {
                        "created_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "match_all": {},
                },
            },
        )

        hits = response["hits"]
        messages = [
            _chat_message_from_hit(hit)
            for hit in hits["hits"]
        ]

        return Page.create(
            items=messages,
            total_items=_total_hits(hits["total"]),
            page=params.page,
            size=params.size,
        )

    async def update(
        self,
        entity: ChatMessage,
    ) -> None:
        """Полностью обновляет документ сообщения."""

        await self.client.index(
            index=self.index,
            id=str(entity.id),
            body=ChatMessageDocumentMapper.from_entity(entity),
            params={
                "refresh": "wait_for",
            },
        )

    async def delete(self, uid: UUID) -> None:
        """Физическти удаляет сообщение, если оно существует."""

        try:
            await self.client.delete(
                index=self.index,
                id=str(uid),
                params={
                    "refresh": "wait_for",
                },
            )
        except OpenSearchNotFoundError:
            return

    async def exists(self, uid: UUID) -> bool:
        """Проверяет существование сообщения."""

        return bool(
            await self.client.exists(
                index=self.index,
                id=str(uid),
            )
        )

    async def get_by_ids(
        self,
        ids: list[UUID],
    ) -> list[ChatMessage]:
        """Получает несколько сообщение одним запросом."""

        if not ids:
            return []

        response = await self.client.mget(
            index=self.index,
            body={
                "ids": [
                    str(message_id)
                    for message_id in ids
                ],
            },
        )

        return [
            _chat_message_from_hit(document)
            for document in response["docs"]
            if document.get("found") is True
        ]

    async def list_by_session(
        self,
        session_id: UUID,
        *,
        limit: int = 50,
    ) -> list[ChatMessage]:
        """
        Возвращает последние сообщения сессии в хронологическом порядке.
        """

        response = await self.client.search(
            index=self.index,
            body={
                "size": limit,
                "sort": [
                    {
                        "created_at": {
                            "order": "desc",
                        }
                    }
                ],
                "query": {
                    "term": {
                        "session_id": str(session_id),
                    }
                },
            },
        )

        messages_from_new_to_old = [
            _chat_message_from_hit(hit)
            for hit in response["hits"]["hits"]
        ]

        return list(reversed(messages_from_new_to_old))

    async def delete_by_session(
        self,
        session_id: UUID,
    ) -> None:
        """Удаляет все сообщения указанной сессии."""

        await self.client.delete_by_query(
            index=self.index,
            body={
                "query": {
                    "term": {
                        "session_id": str(session_id),
                    }
                }
            },
            params={
                "conflicts": "proceed",
                "refresh": True,
            },
        )


def _chat_session_from_hit(
    hit: Mapping[str, Any],
) -> ChatSession:
    return ChatSessionDocumentMapper.to_entity(
        document_id=str(hit["_id"]),
        source=hit["_source"],
    )


def _article_from_hit(
    hit: Mapping[str, Any],
) -> Article:
    return ArticleDocumentMapper.to_entity(
        document_id=hit["_id"],
        source=hit["_source"],
    )


def _chat_message_from_hit(
    hit: Mapping[str, Any],
) -> ChatMessage:
    return ChatMessageDocumentMapper.to_entity(
        document_id=str(hit["_id"]),
        source=hit["_source"],
    )


def _total_hits(
    total: int | Mapping[str, Any],
) -> int:
    if isinstance(total, int):
        return total
    return int(total["value"])
