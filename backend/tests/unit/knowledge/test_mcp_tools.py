from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

from src.knowledge.application.dtos import SearchFilters, SearchHit
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleVisibility,
    ChunkKind,
)
from src.knowledge.mcp.server import create_server
from src.knowledge.mcp.tools import search_knowledge

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
PRODUCT_ID = UUID("2b8aa727-dbd9-4653-a78f-e490f8ce752b")
PROJECT_ID = UUID("0e6fe862-f77d-458b-a129-f96bd4831e28")
COUNTERPARTY_ID = UUID("d2f3872c-d4d0-4d36-9a65-d760c46551e9")


def build_hit() -> SearchHit:
    return SearchHit(
        chunk_id=f"{ARTICLE_ID}:1:0",
        article_id=ARTICLE_ID,
        title="Ошибка проведения документа",
        content="Перепроведите документ после обновления данных.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        kind=ChunkKind.SOLUTION,
        rank_score=0.75,
        exact_terms=("проведение", "документ"),
    )


async def test_search_knowledge_passes_filters_and_presents_hits():
    hit = build_hit()
    service = SimpleNamespace(
        search=AsyncMock(return_value=(hit,)),
    )

    result = await search_knowledge(
        query="Как исправить ошибку проведения?",
        top_k=5,
        source_kinds=["ticket"],
        tags=["1С"],
        product_id=PRODUCT_ID,
        project_id=PROJECT_ID,
        counterparty_id=None,
        service=service,
    )

    service.search.assert_awaited_once_with(
        query="Как исправить ошибку проведения?",
        top_k=5,
        filters=SearchFilters(
            visibilities=(
                ArticleVisibility.PUBLIC,
                ArticleVisibility.INTERNAL,
            ),
            source_kinds=("ticket",),
            tags=("1С",),
            product_id=PRODUCT_ID,
            project_id=PROJECT_ID,
            counterparty_id=None,
        ),
    )

    assert len(result) == 1
    assert result[0].chunk_id == hit.chunk_id
    assert result[0].article_id == hit.article_id
    assert result[0].title == hit.title
    assert result[0].content == hit.content
    assert result[0].source.kind == hit.source.kind
    assert result[0].source.ref == hit.source.ref
    assert result[0].kind == ChunkKind.SOLUTION
    assert result[0].rank_score == hit.rank_score
    assert result[0].exact_terms == ["проведение", "документ"]


async def test_search_knowledge_adds_customer_visibility_for_counterparty():
    service = SimpleNamespace(
        search=AsyncMock(return_value=()),
    )

    result = await search_knowledge(
        query="Ошибка уведомлений",
        counterparty_id=COUNTERPARTY_ID,
        service=service,
    )

    assert result == []
    filters = service.search.await_args.kwargs["filters"]
    assert filters.visibilities == (
        ArticleVisibility.PUBLIC,
        ArticleVisibility.INTERNAL,
        ArticleVisibility.CUSTOMER_SPECIFIC,
    )
    assert filters.counterparty_id == COUNTERPARTY_ID


async def test_knowledge_server_registers_search_tool():
    tools = await create_server().list_tools()

    assert [tool.name for tool in tools] == ["search_knowledge"]
