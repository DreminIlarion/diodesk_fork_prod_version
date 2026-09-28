from typing import Any

from collections.abc import Mapping
from uuid import UUID

from opensearchpy import AsyncOpenSearch
from opensearchpy import NotFoundError as OpenSearchNotFoundError

from src.shared.schemas import Page, Pagination

from ..domain.entities import Article
from ..domain.vo import SourceType
from .mappers import ArticleDocumentMapper


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
        source_type: SourceType,
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
                                    "source_type": source_type.value,
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


def _article_from_hit(
    hit: Mapping[str, Any],
) -> Article:
    return ArticleDocumentMapper.to_entity(
        document_id=hit["_id"],
        source=hit["_source"],
    )


def _total_hits(
    total: int | Mapping[str, Any],
) -> int:
    if isinstance(total, int):
        return total
    return int(total["value"])
