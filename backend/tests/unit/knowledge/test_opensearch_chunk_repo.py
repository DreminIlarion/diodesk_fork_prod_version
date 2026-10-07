from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.knowledge.application.dtos import (
    ArticleChunk,
    EmbeddedArticleChunk,
)
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleVisibility,
    ChunkKind,
)
from src.knowledge.infra.chunk_mappers import (
    ArticleChunkDocumentMapper,
)
from src.knowledge.infra.chunk_repos import (
    ChunkIndexingError,
    OpenSearchArticleChunkRepository,
)

CHUNKS_INDEX = "kb_chunks_write"
EMBEDDING_MODEL = "text-embedding-3-small"
ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")


def build_client(*, bulk_errors: bool = False):
    return SimpleNamespace(
        delete_by_query=AsyncMock(),
        bulk=AsyncMock(
            return_value={
                "errors": bulk_errors,
            }
        ),
    )


def build_repository(client) -> OpenSearchArticleChunkRepository:
    return OpenSearchArticleChunkRepository(
        client,
        write_index=CHUNKS_INDEX,
        embedding_model=EMBEDDING_MODEL,
    )


def build_chunk(
    *,
    chunk_id: str,
    position: int,
    article_id: UUID = ARTICLE_ID,
) -> EmbeddedArticleChunk:
    return EmbeddedArticleChunk(
        chunk=ArticleChunk(
            chunk_id=chunk_id,
            article_id=article_id,
            article_version=1,
            position=position,
            title="Ошибка проведения документа",
            content=f"Фрагмент номер {position}",
            context_headings=("Решение",),
            kind=ChunkKind.SOLUTION,
            source=ArticleSource(
                kind="ticket",
                ref="/tickets/T-105",
            ),
            visibility=ArticleVisibility.INTERNAL,
        ),
        embedding=(0.1, 0.2, 0.3),
    )


async def test_replace_for_article_deletes_old_and_bulk_indexes_new_chunks():
    client = build_client()
    repository = build_repository(client)
    chunks = [
        build_chunk(chunk_id="chunk-1", position=0),
        build_chunk(chunk_id="chunk-2", position=1),
    ]

    await repository.replace_for_article(ARTICLE_ID, chunks)

    client.delete_by_query.assert_awaited_once_with(
        index=CHUNKS_INDEX,
        body={
            "query": {
                "term": {
                    "article_id": str(ARTICLE_ID),
                }
            }
        },
        params={
            "conflicts": "proceed",
            "refresh": True,
        },
    )

    expected_body = []
    for value in chunks:
        expected_body.extend(
            [
                {
                    "index": {
                        "_id": value.chunk.chunk_id,
                    }
                },
                ArticleChunkDocumentMapper.from_dto(
                    value,
                    embedding_model=EMBEDDING_MODEL,
                ),
            ]
        )

    client.bulk.assert_awaited_once_with(
        index=CHUNKS_INDEX,
        body=expected_body,
        params={
            "refresh": "wait_for",
        },
    )


async def test_replace_for_article_with_empty_chunks_only_deletes_old_chunks():
    client = build_client()
    repository = build_repository(client)

    await repository.replace_for_article(ARTICLE_ID, [])

    client.delete_by_query.assert_awaited_once()
    client.bulk.assert_not_awaited()


async def test_replace_rejects_chunk_from_another_article_before_deletion():
    client = build_client()
    repository = build_repository(client)
    chunks = [
        build_chunk(
            chunk_id="foreign-chunk",
            position=0,
            article_id=uuid4(),
        )
    ]

    with pytest.raises(
        ValueError,
        match="All chunks must belong",
    ):
        await repository.replace_for_article(
            ARTICLE_ID,
            chunks,
        )

    client.delete_by_query.assert_not_awaited()
    client.bulk.assert_not_awaited()


async def test_replace_raises_when_bulk_response_contains_errors():
    client = build_client(bulk_errors=True)
    repository = build_repository(client)
    chunks = [
        build_chunk(chunk_id="chunk-1", position=0),
    ]

    with pytest.raises(
        ChunkIndexingError,
        match="failed to index article chunks",
    ):
        await repository.replace_for_article(
            ARTICLE_ID,
            chunks,
        )

    client.delete_by_query.assert_awaited_once()
    client.bulk.assert_awaited_once()


async def test_delete_by_article_uses_term_query():
    client = build_client()
    repository = build_repository(client)

    await repository.delete_by_article(ARTICLE_ID)

    client.delete_by_query.assert_awaited_once_with(
        index=CHUNKS_INDEX,
        body={
            "query": {
                "term": {
                    "article_id": str(ARTICLE_ID),
                }
            }
        },
        params={
            "conflicts": "proceed",
            "refresh": True,
        },
    )
