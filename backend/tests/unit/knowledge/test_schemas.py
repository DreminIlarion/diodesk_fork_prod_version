from uuid import UUID

import pytest
from pydantic import ValidationError

from src.knowledge.application.dtos import SearchHit
from src.knowledge.domain.vo import ArticleSource, ChunkKind
from src.knowledge.schemas import (
    KnowledgeSearchHitResponse,
    KnowledgeSearchRequest,
)

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")


def test_search_request_normalizes_strings():
    request = KnowledgeSearchRequest(
        query="  ошибка проведения  ",
        source_kinds=("  ticket  ",),
        tags=("  1С  ",),
    )

    assert request.query == "ошибка проведения"
    assert request.source_kinds == ("ticket",)
    assert request.tags == ("1С",)


@pytest.mark.parametrize(
    "query",
    ["", "   "],
)
def test_search_request_rejects_empty_query(query: str):
    with pytest.raises(ValidationError):
        KnowledgeSearchRequest(query=query)


@pytest.mark.parametrize(
    "top_k",
    [0, 51],
)
def test_search_request_rejects_top_k_outside_range(top_k: int):
    with pytest.raises(ValidationError):
        KnowledgeSearchRequest(
            query="ошибка",
            top_k=top_k,
        )


@pytest.mark.parametrize(
    "field",
    ["source_kinds", "tags"],
)
def test_search_request_rejects_empty_filter_values(field: str):
    with pytest.raises(ValidationError):
        KnowledgeSearchRequest(
            query="ошибка",
            **{field: ("   ",)},
        )


def test_search_hit_response_accepts_application_dto():
    hit = SearchHit(
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

    response = KnowledgeSearchHitResponse.model_validate(hit)

    assert response.chunk_id == hit.chunk_id
    assert response.article_id == hit.article_id
    assert response.source.kind == "ticket"
    assert response.source.ref == "/tickets/T-105"
    assert response.kind == ChunkKind.SOLUTION
