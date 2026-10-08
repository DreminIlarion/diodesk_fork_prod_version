from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from src.knowledge.application.dtos import SearchFilters, SearchHit
from src.knowledge.application.search import (
    KnowledgeSearchError,
    KnowledgeSearchService,
)
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleVisibility,
    ChunkKind,
)

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
QUERY = "Как исправить ошибку проведения?"
QUERY_EMBEDDING = (0.1, 0.2, 0.3)
TOP_K = 5


def build_dependencies():
    chunk_repository = SimpleNamespace(
        hybrid_search=AsyncMock(),
    )
    embedding_provider = SimpleNamespace(
        embed=AsyncMock(),
    )
    service = KnowledgeSearchService(
        chunk_repository=chunk_repository,
        embedding_provider=embedding_provider,
    )
    return SimpleNamespace(
        service=service,
        chunk_repository=chunk_repository,
        embedding_provider=embedding_provider,
    )


def build_hit() -> SearchHit:
    return SearchHit(
        chunk_id=f"{ARTICLE_ID}:1:0",
        article_id=ARTICLE_ID,
        title="Ошибка проведения",
        content="Перепроведите документ.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        kind=ChunkKind.SOLUTION,
        rank_score=0.75,
    )


async def test_search_embeds_query_and_returns_repository_hits():
    dependencies = build_dependencies()
    filters = SearchFilters(
        visibilities=(ArticleVisibility.INTERNAL,),
        source_kinds=("ticket",),
    )
    expected_hits = (build_hit(),)
    dependencies.embedding_provider.embed.return_value = [
        QUERY_EMBEDDING
    ]
    dependencies.chunk_repository.hybrid_search.return_value = (
        expected_hits
    )

    result = await dependencies.service.search(
        query=QUERY,
        filters=filters,
        top_k=TOP_K,
    )

    assert result == expected_hits
    dependencies.embedding_provider.embed.assert_awaited_once_with(
        [QUERY]
    )
    dependencies.chunk_repository.hybrid_search.assert_awaited_once_with(
        query=QUERY,
        query_embedding=QUERY_EMBEDDING,
        filters=filters,
        top_k=TOP_K,
    )


@pytest.mark.parametrize(
    "embeddings",
    [
        [],
        [QUERY_EMBEDDING, QUERY_EMBEDDING],
    ],
)
async def test_search_rejects_unexpected_embedding_count(
    embeddings,
):
    dependencies = build_dependencies()
    dependencies.embedding_provider.embed.return_value = embeddings

    with pytest.raises(
        KnowledgeSearchError,
        match="embeddings for one search query",
    ):
        await dependencies.service.search(
            query=QUERY,
            filters=SearchFilters(),
        )

    dependencies.chunk_repository.hybrid_search.assert_not_awaited()
