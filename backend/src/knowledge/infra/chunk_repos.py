from typing import Any

from uuid import UUID

from opensearchpy import AsyncOpenSearch

from ..application.dtos import (
    EmbeddedArticleChunk,
    SearchFilters,
    SearchHit,
)
from .chunk_mappers import ArticleChunkDocumentMapper


class ChunkIndexingError(RuntimeError):
    """OpenSearch не смог сохранить один или несколько чанков."""


class OpenSearchArticleChunkRepository:
    """Хранилище поисковых чанков статей в OpenSearch."""

    def __init__(
        self,
        client: AsyncOpenSearch,
        *,
        read_index: str,
        write_index: str,
        embedding_model: str,
        search_pipeline: str,
    ) -> None:
        self.client = client
        self.read_index = read_index
        self.write_index = write_index
        self.embedding_model = embedding_model
        self.search_pipeline = search_pipeline

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
                "refresh": "true",
            },
        )

    async def hybrid_search(
        self,
        *,
        query: str,
        query_embedding: tuple[float, ...],
        filters: SearchFilters,
        top_k: int = 10,
    ) -> tuple[SearchHit, ...]:
        """
        Выполняет BM25- и HNSW-поиск с объединением через RRF.
        """

        hybrid_query: dict[str, Any] = {
            "queries": [
                {
                    "multi_match": {
                        "query": query,
                        "fields": [
                            "title^3",
                            "content",
                            "context_headings^2",
                        ],
                        "type": "best_fields",
                    }
                },
                {
                    "knn": {
                        "embedding": {
                            "vector": list(query_embedding),
                            "k": top_k,
                        }
                    }
                },
            ]
        }

        search_filter = _build_search_filter(filters)
        if search_filter is not None:
            hybrid_query["filter"] = search_filter

        response = await self.client.search(
            index=self.read_index,
            body={
                "size": top_k,
                "_source": {
                    "excludes": [
                        "embedding",
                    ]
                },
                "query": {
                    "hybrid": hybrid_query,
                },
            },
            params={
                "search_pipeline": self.search_pipeline,
            },
        )

        return tuple(
            ArticleChunkDocumentMapper.to_search_hit(
                document_id=hit["_id"],
                source=hit["_source"],
                score=float(hit.get("_score") or 0.0),
            )
            for hit in response["hits"]["hits"]
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


def _build_search_filter(
    filters: SearchFilters,
) -> dict[str, Any] | None:
    """Преобразует фильтры поиска в OpenSearch DSL."""

    clauses: list[dict[str, Any]] = []

    if filters.visibilities:
        clauses.append(
            {
                "terms": {
                    "visibility": [
                        visibility.value
                        for visibility in filters.visibilities
                    ]
                }
            }
        )

    if filters.source_kinds:
        clauses.append(
            {
                "terms": {
                    "source_type": list(
                        filters.source_kinds
                    )
                }
            }
        )

    if filters.tags:
        clauses.append(
            {
                "terms": {
                    "tags": list(filters.tags),
                }
            }
        )

    optional_ids = (
        ("product_id", filters.product_id),
        ("project_id", filters.project_id),
        ("counterparty_id", filters.counterparty_id),
    )

    for field_name, value in optional_ids:
        if value is not None:
            clauses.append(
                {
                    "term": {
                        field_name: str(value),
                    }
                }
            )

    if not clauses:
        return None

    return {
        "bool": {
            "filter": clauses,
        }
    }
