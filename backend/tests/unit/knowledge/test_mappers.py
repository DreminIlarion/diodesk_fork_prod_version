from datetime import UTC, datetime
from uuid import UUID, uuid4

from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleStatus,
    ArticleVisibility,
)
from src.knowledge.infra.mappers import ArticleDocumentMapper


def build_article() -> Article:
    return Article(
        id=UUID("c1545085-5ce4-4301-bc4a-058940332abb"),
        created_at=datetime(2026, 9, 28, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 9, 28, 9, 0, tzinfo=UTC),
        deleted_at=None,
        title="Ошибка проведения документа",
        content="Причина ошибки и последовательность исправления.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        external_id="T-105",
        author_id=UUID("5538b196-f216-445c-a52a-08de70b65ae5"),
        published_by=UUID(
            "efb114cd-8828-47e4-987e-84d1e99ed934"
        ),
        published_at=datetime(2026, 9, 28, 8, 30, tzinfo=UTC),
        status=ArticleStatus.PUBLISHED,
        visibility=ArticleVisibility.INTERNAL,
        version=2,
        tags=["1С", "проведение"],
        product_id=UUID("9cf0423f-a89b-4953-a69a-4911a0c063dd"),
        project_id=UUID("e9950aef-edec-42c7-b760-19b105786c01"),
        counterparty_id=UUID(
            "d2f3872c-d4d0-4d36-9a65-d760c46551e9"
        ),
        metadata={
            "imported": True,
            "priority": 10,
        },
    )


def test_article_mapper_builds_opensearch_document():
    article = build_article()

    document = ArticleDocumentMapper.from_entity(article)

    assert "id" not in document
    assert document["author_id"] == str(article.author_id)
    assert document["published_by"] == str(article.published_by)
    assert document["source_type"] == "ticket"
    assert document["source_ref"] == "/tickets/T-105"
    assert document["status"] == "published"
    assert document["visibility"] == "internal"
    assert document["created_at"] == article.created_at.isoformat()


def test_article_mapper_restores_domain_entity():
    article = build_article()
    document = ArticleDocumentMapper.from_entity(article)

    restored = ArticleDocumentMapper.to_entity(
        str(article.id),
        document,
    )

    assert restored.id == article.id
    assert restored.source == article.source
    assert restored.status == ArticleStatus.PUBLISHED
    assert restored.visibility == ArticleVisibility.INTERNAL
    assert restored.published_by == article.published_by
    assert restored.metadata == article.metadata
    assert ArticleDocumentMapper.from_entity(restored) == document
    assert list(restored.collect_events()) == []


def test_article_mapper_preserves_empty_optional_fields():
    article = Article.create(
        title="Инструкция",
        content="Содержимое инструкции",
        source=ArticleSource(
            kind="instruction",
            ref="/knowledge/instructions/example",
        ),
        author_id=uuid4(),
    )
    list(article.collect_events())

    document = ArticleDocumentMapper.from_entity(article)
    restored = ArticleDocumentMapper.to_entity(
        str(article.id),
        document,
    )

    assert restored.external_id is None
    assert restored.published_by is None
    assert restored.published_at is None
    assert restored.product_id is None
    assert restored.project_id is None
    assert restored.counterparty_id is None
    assert restored.deleted_at is None
