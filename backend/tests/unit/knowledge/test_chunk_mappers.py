from uuid import UUID

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

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
PRODUCT_ID = UUID("9cf0423f-a89b-4953-a69a-4911a0c063dd")
PROJECT_ID = UUID("e9950aef-edec-42c7-b760-19b105786c01")
COUNTERPARTY_ID = UUID("d2f3872c-d4d0-4d36-9a65-d760c46551e9")
EMBEDDING_MODEL = "text-embedding-3-small"
ARTICLE_VERSION = 2
RANK_SCORE = 0.75


def build_embedded_chunk(
    *,
    with_relations: bool = True,
) -> EmbeddedArticleChunk:
    return EmbeddedArticleChunk(
        chunk=ArticleChunk(
            chunk_id="article-1:2:0",
            article_id=ARTICLE_ID,
            article_version=ARTICLE_VERSION,
            position=0,
            title="Ошибка проведения документа",
            content="Перепроведите документ и повторите операцию.",
            context_headings=("Проведение", "Исправление"),
            kind=ChunkKind.SOLUTION,
            source=ArticleSource(
                kind="ticket",
                ref="/tickets/T-105",
            ),
            visibility=ArticleVisibility.INTERNAL,
            tags=("1С", "проведение"),
            product_id=PRODUCT_ID if with_relations else None,
            project_id=PROJECT_ID if with_relations else None,
            counterparty_id=(
                COUNTERPARTY_ID if with_relations else None
            ),
        ),
        embedding=(0.1, 0.2, 0.3),
    )


def test_chunk_mapper_builds_opensearch_document():
    value = build_embedded_chunk()

    document = ArticleChunkDocumentMapper.from_dto(
        value,
        embedding_model=EMBEDDING_MODEL,
    )

    assert "chunk_id" not in document
    assert document["article_id"] == str(ARTICLE_ID)
    assert document["article_version"] == ARTICLE_VERSION
    assert document["position"] == 0
    assert document["context_headings"] == [
        "Проведение",
        "Исправление",
    ]
    assert document["kind"] == "solution"
    assert document["source_type"] == "ticket"
    assert document["source_ref"] == "/tickets/T-105"
    assert document["visibility"] == "internal"
    assert document["tags"] == ["1С", "проведение"]
    assert document["product_id"] == str(PRODUCT_ID)
    assert document["project_id"] == str(PROJECT_ID)
    assert document["counterparty_id"] == str(COUNTERPARTY_ID)
    assert document["embedding_model"] == EMBEDDING_MODEL
    assert document["embedding"] == [0.1, 0.2, 0.3]


def test_chunk_mapper_preserves_empty_optional_relations():
    value = build_embedded_chunk(with_relations=False)

    document = ArticleChunkDocumentMapper.from_dto(
        value,
        embedding_model=EMBEDDING_MODEL,
    )

    assert document["product_id"] is None
    assert document["project_id"] is None
    assert document["counterparty_id"] is None


def test_chunk_mapper_builds_search_hit():
    value = build_embedded_chunk()
    document = ArticleChunkDocumentMapper.from_dto(
        value,
        embedding_model=EMBEDDING_MODEL,
    )

    hit = ArticleChunkDocumentMapper.to_search_hit(
        value.chunk.chunk_id,
        document,
        score=RANK_SCORE,
        exact_terms=("документ", "операция"),
    )

    assert hit.chunk_id == value.chunk.chunk_id
    assert hit.article_id == ARTICLE_ID
    assert hit.title == value.chunk.title
    assert hit.content == value.chunk.content
    assert hit.source == value.chunk.source
    assert hit.kind == ChunkKind.SOLUTION
    assert hit.rank_score == pytest.approx(RANK_SCORE)
    assert hit.exact_terms == ("документ", "операция")
