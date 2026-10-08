from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from src.knowledge.application.dtos import SearchHit
from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleVisibility,
    ChunkKind,
)
from src.knowledge.schemas import (
    ArticleCreateRequest,
    ArticleEditRequest,
    ArticleResponse,
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


def test_article_create_request_normalizes_strings():
    request = ArticleCreateRequest(
        title="  Инструкция  ",
        content="  Содержимое статьи.  ",
        source={
            "kind": "  documentation  ",
            "ref": "  /docs/42  ",
        },
        external_id="  DOC-42  ",
        tags=["  база знаний  "],
        metadata={
            "priority": 1,
            "verified": True,
            "note": None,
        },
    )

    assert request.title == "Инструкция"
    assert request.content == "Содержимое статьи."
    assert request.source.kind == "documentation"
    assert request.source.ref == "/docs/42"
    assert request.external_id == "DOC-42"
    assert request.tags == ["база знаний"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "   "),
        ("content", ""),
        ("external_id", "   "),
    ],
)
def test_article_create_request_rejects_empty_strings(
    field: str,
    value: str,
):
    data = {
        "title": "Инструкция",
        "content": "Содержимое.",
        "source": {
            "kind": "documentation",
            "ref": "/docs/42",
        },
        field: value,
    }

    with pytest.raises(ValidationError):
        ArticleCreateRequest.model_validate(data)


@pytest.mark.parametrize(
    "source",
    [
        {"kind": "   ", "ref": "/docs/42"},
        {"kind": "documentation", "ref": "   "},
    ],
)
def test_article_create_request_rejects_empty_source_values(source):
    with pytest.raises(ValidationError):
        ArticleCreateRequest(
            title="Инструкция",
            content="Содержимое.",
            source=source,
        )


def test_article_create_request_forbids_unknown_fields():
    with pytest.raises(ValidationError):
        ArticleCreateRequest(
            title="Инструкция",
            content="Содержимое.",
            source={
                "kind": "documentation",
                "ref": "/docs/42",
            },
            unknown_field="value",
        )


def test_article_create_request_rejects_non_scalar_metadata():
    with pytest.raises(ValidationError):
        ArticleCreateRequest(
            title="Инструкция",
            content="Содержимое.",
            source={
                "kind": "documentation",
                "ref": "/docs/42",
            },
            metadata={"nested": {"value": 1}},
        )


def test_article_edit_request_normalizes_strings():
    request = ArticleEditRequest(
        title="  Новая редакция  ",
        content="  Новое содержимое.  ",
        tags=["  обновлено  "],
    )

    assert request.title == "Новая редакция"
    assert request.content == "Новое содержимое."
    assert request.tags == ["обновлено"]


def test_article_response_accepts_domain_aggregate():
    author_id = uuid4()
    article = Article.create(
        title="Инструкция",
        content="Содержимое статьи.",
        source=ArticleSource(
            kind="documentation",
            ref="/docs/42",
        ),
        author_id=author_id,
        visibility=ArticleVisibility.INTERNAL,
        external_id="DOC-42",
        tags=["база знаний"],
        metadata={"verified": True},
    )

    response = ArticleResponse.model_validate(article)

    assert response.id == article.id
    assert response.author_id == author_id
    assert response.source.kind == "documentation"
    assert response.source.ref == "/docs/42"
    assert response.tags == ["база знаний"]
    assert response.metadata == {"verified": True}
