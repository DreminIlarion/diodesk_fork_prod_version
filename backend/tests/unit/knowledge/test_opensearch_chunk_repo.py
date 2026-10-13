from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.knowledge.application.dtos import (
    ArticleChunk,
    EmbeddedArticleChunk,
    SearchFilters,
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
CHUNKS_READ_INDEX = "kb_chunks_read"
EMBEDDING_MODEL = "text-embedding-3-small"
SEARCH_PIPELINE = "kb-rrf-v1"
ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
PRODUCT_ID = UUID("9cf0423f-a89b-4953-a69a-4911a0c063dd")
PROJECT_ID = UUID("e9950aef-edec-42c7-b760-19b105786c01")
COUNTERPARTY_ID = UUID("d2f3872c-d4d0-4d36-9a65-d760c46551e9")
TOP_K = 5
RANK_SCORE = 0.032


def build_client(
    *,
    bulk_errors: bool = False,
    search_hits: list[dict] | None = None,
):
    return SimpleNamespace(
        delete_by_query=AsyncMock(),
        bulk=AsyncMock(
            return_value={
                "errors": bulk_errors,
            }
        ),
        search=AsyncMock(
            return_value={
                "hits": {
                    "hits": search_hits or [],
                }
            }
        ),
    )


def build_repository(client) -> OpenSearchArticleChunkRepository:
    return OpenSearchArticleChunkRepository(
        client,
        read_index=CHUNKS_READ_INDEX,
        write_index=CHUNKS_INDEX,
        embedding_model=EMBEDDING_MODEL,
        search_pipeline=SEARCH_PIPELINE,
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
            "refresh": "true",
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
            "refresh": "true",
        },
    )


async def test_hybrid_search_combines_bm25_hnsw_and_rrf():
    value = build_chunk(chunk_id="chunk-1", position=0)
    source = ArticleChunkDocumentMapper.from_dto(
        value,
        embedding_model=EMBEDDING_MODEL,
    )
    client = build_client(
        search_hits=[
            {
                "_id": value.chunk.chunk_id,
                "_score": RANK_SCORE,
                "_source": source,
            }
        ]
    )
    repository = build_repository(client)
    query_embedding = (0.4, 0.5, 0.6)

    results = await repository.hybrid_search(
        query="ошибка проведения",
        query_embedding=query_embedding,
        filters=SearchFilters(),
        top_k=TOP_K,
    )

    assert isinstance(results, tuple)
    assert len(results) == 1
    assert results[0].chunk_id == value.chunk.chunk_id
    assert results[0].article_id == ARTICLE_ID
    assert results[0].rank_score == pytest.approx(RANK_SCORE)

    client.search.assert_awaited_once()
    search_call = client.search.await_args

    assert search_call.kwargs["index"] == CHUNKS_READ_INDEX
    assert search_call.kwargs["params"] == {
        "search_pipeline": SEARCH_PIPELINE,
    }

    body = search_call.kwargs["body"]
    hybrid = body["query"]["hybrid"]
    bm25_query, hnsw_query = hybrid["queries"]

    assert body["size"] == TOP_K
    assert body["_source"] == {
        "excludes": ["embedding"],
    }
    assert bm25_query == {
        "multi_match": {
            "query": "ошибка проведения",
            "fields": [
                "title^3",
                "content",
                "context_headings^2",
            ],
            "type": "best_fields",
        }
    }
    assert hnsw_query == {
        "knn": {
            "embedding": {
                "vector": list(query_embedding),
                "k": TOP_K,
            }
        }
    }
    assert hybrid["filter"] == {
        "bool": {
            "filter": [
                {
                    "terms": {
                        "visibility": ["internal"],
                    }
                }
            ]
        }
    }


async def test_hybrid_search_builds_all_filters():
    client = build_client()
    repository = build_repository(client)

    results = await repository.hybrid_search(
        query="ошибка",
        query_embedding=(0.1, 0.2, 0.3),
        filters=SearchFilters(
            visibilities=(
                ArticleVisibility.INTERNAL,
                ArticleVisibility.PUBLIC,
            ),
            source_kinds=("ticket", "instruction"),
            tags=("1С", "ошибка"),
            product_id=PRODUCT_ID,
            project_id=PROJECT_ID,
            counterparty_id=COUNTERPARTY_ID,
        ),
        top_k=TOP_K,
    )

    assert results == ()

    body = client.search.await_args.kwargs["body"]
    clauses = body["query"]["hybrid"]["filter"]["bool"]["filter"]

    assert clauses == [
        {
            "terms": {
                "visibility": ["internal", "public"],
            }
        },
        {
            "terms": {
                "source_type": ["ticket", "instruction"],
            }
        },
        {
            "terms": {
                "tags": ["1С", "ошибка"],
            }
        },
        {
            "term": {
                "product_id": str(PRODUCT_ID),
            }
        },
        {
            "term": {
                "project_id": str(PROJECT_ID),
            }
        },
        {
            "term": {
                "counterparty_id": str(COUNTERPARTY_ID),
            }
        },
    ]


async def test_hybrid_search_omits_empty_filter():
    client = build_client()
    repository = build_repository(client)

    results = await repository.hybrid_search(
        query="ошибка",
        query_embedding=(0.1, 0.2, 0.3),
        filters=SearchFilters(visibilities=()),
        top_k=TOP_K,
    )

    assert results == ()

    body = client.search.await_args.kwargs["body"]

    assert "filter" not in body["query"]["hybrid"]
