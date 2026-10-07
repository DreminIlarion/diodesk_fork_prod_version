from typing import Any

from uuid import UUID

from opensearchpy import AsyncOpenSearch

from ..application.dtos import EmbeddedArticleChunk
from .chunk_mappers import ArticleChunkDocumentMapper


class ChunkIndexingError(RuntimeError):
    """OpenSearch не смог сохранить один или несколько чанков."""


class OpenSearchArticleChunkRepository:
    """Хранилище поисковых чанков статей в OpenSearch."""

    def __init__(
        self,
        client: AsyncOpenSearch,
        *,
        write_index: str,
        embedding_model: str,
    ) -> None:
        self.client = client
        self.write_index = write_index
        self.embedding_model = embedding_model

    async def replace_for_article(
        self,
        article_id: UUID,
        chunks: list[EmbeddedArticleChunk],
    ) -> None:
        """
        Полностью заменяет поисковые чанки указанной статьи.
        """

        self._validate_article_ids(
            article_id=article_id,
            chunks=chunks,
        )

        await self.delete_by_article(article_id)

        if not chunks:
            return

        body: list[dict[str, Any]] = []

        for value in chunks:
            body.extend(
                [
                    {
                        "index": {
                            "_id": value.chunk.chunk_id,
                        }
                    },
                    ArticleChunkDocumentMapper.from_dto(
                        value,
                        embedding_model=self.embedding_model,
                    ),
                ]
            )

        response = await self.client.bulk(
            index=self.write_index,
            body=body,
            params={
                "refresh": "wait_for",
            },
        )

        if response.get("errors") is True:
            raise ChunkIndexingError(
                "OpenSearch failed to index article chunks"
            )

    async def delete_by_article(
        self,
        article_id: UUID,
    ) -> None:
        """Удаляет все поисковые чанки указанной статьи."""

        await self.client.delete_by_query(
            index=self.write_index,
            body={
                "query": {
                    "term": {
                        "article_id": str(article_id),
                    }
                }
            },
            params={
                "conflicts": "proceed",
                "refresh": True,
            },
        )

    @staticmethod
    def _validate_article_ids(
        *,
        article_id: UUID,
        chunks: list[EmbeddedArticleChunk],
    ) -> None:
        """
        Запрещает сохранить под одной статьёй чанки другой статьи.
        """

        if any(
            value.chunk.article_id != article_id
            for value in chunks
        ):
            raise ValueError(
                "All chunks must belong to the replaced article"
            )
