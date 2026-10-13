from typing import Any

from collections.abc import Mapping
from uuid import UUID

from ..application.dtos import (
    EmbeddedArticleChunk,
    SearchHit,
)
from ..domain.vo import ArticleSource, ChunkKind


class ArticleChunkDocumentMapper:
    """
    Преобразование поискового чанка в документ OpenSearch и обратно.
    """

    @staticmethod
    def from_dto(
        value: EmbeddedArticleChunk,
        *,
        embedding_model: str,
    ) -> dict[str, Any]:
        """
        Подготавливает `_source` документа поискового индекса.
        """

        chunk = value.chunk

        return {
            "article_id": str(chunk.article_id),
            "article_version": chunk.article_version,
            "position": chunk.position,
            "title": chunk.title,
            "content": chunk.content,
            "context_headings": list(
                chunk.context_headings
            ),
            "kind": chunk.kind.value,
            "source_type": chunk.source.kind,
            "source_ref": chunk.source.ref,
            "visibility": chunk.visibility.value,
            "tags": list(chunk.tags),
            "product_id": _optional_uuid_to_string(
                chunk.product_id
            ),
            "project_id": _optional_uuid_to_string(
                chunk.project_id
            ),
            "counterparty_id": _optional_uuid_to_string(
                chunk.counterparty_id
            ),
            "embedding_model": embedding_model,
            "embedding": list(value.embedding),
        }

    @staticmethod
    def to_search_hit(
        document_id: str,
        source: Mapping[str, Any],
        *,
        score: float,
        exact_terms: tuple[str, ...] = (),
    ) -> SearchHit:
        """
        Преобразует результат поиска OpenSearch в application DTO.
        """

        return SearchHit(
            chunk_id=document_id,
            article_id=UUID(str(source["article_id"])),
            title=str(source["title"]),
            content=str(source["content"]),
            source=ArticleSource(
                kind=str(source["source_type"]),
                ref=str(source["source_ref"]),
            ),
            kind=ChunkKind(str(source["kind"])),
            rank_score=score,
            exact_terms=exact_terms,
        )


def _optional_uuid_to_string(
    value: UUID | None,
) -> str | None:
    if value is None:
        return None
    return str(value)
