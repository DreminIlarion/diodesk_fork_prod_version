from datetime import UTC, datetime
from uuid import UUID, uuid4

from src.knowledge.domain.entities import (
    Article,
    ChatMessage,
    ChatSession,
)
from src.knowledge.domain.vo import (
    ArticleStatus,
    ArticleVisibility,
    ChatRole,
    SourceType,
)
from src.knowledge.infra.mappers import (
    ArticleDocumentMapper,
    ChatMessageDocumentMapper,
    ChatSessionDocumentMapper,
)


def build_article() -> Article:
    return Article(
        id=UUID("c1545085-5ce4-4301-bc4a-058940332abb"),
        created_at=datetime(2026, 9, 28, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 9, 28, 9, 0, tzinfo=UTC),
        deleted_at=None,
        title="Ошибка проведения документа",
        content="Причина ошибки и последовательность исправления.",
        source_type=SourceType.TICKET,
        source_ref="/tickets/T-105",
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
        attachment_ids=[
            UUID("077b9e47-7448-450b-83b4-36ce5b76e405")
        ],
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
    assert document["status"] == "published"
    assert document["visibility"] == "internal"
    assert document["created_at"] == article.created_at.isoformat()
    assert document["attachment_ids"] == [
        str(attachment_id)
        for attachment_id in article.attachment_ids
    ]


def test_article_mapper_restores_domain_entity():
    article = build_article()
    document = ArticleDocumentMapper.from_entity(article)

    restored = ArticleDocumentMapper.to_entity(
        str(article.id),
        document,
    )

    assert restored.id == article.id
    assert restored.source_type == SourceType.TICKET
    assert restored.status == ArticleStatus.PUBLISHED
    assert restored.visibility == ArticleVisibility.INTERNAL
    assert restored.published_by == article.published_by
    assert restored.attachment_ids == article.attachment_ids
    assert restored.metadata == article.metadata
    assert ArticleDocumentMapper.from_entity(restored) == document
    assert list(restored.collect_events()) == []


def test_article_mapper_preserves_empty_optional_fields():
    article = Article.create(
        title="Инструкция",
        content="Содержимое инструкции",
        source_type=SourceType.INSTRUCTION,
        source_ref="/knowledge/instructions/example",
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


def build_chat_session() -> ChatSession:
    return ChatSession(
        id=UUID("ac47fc79-936f-4a02-b21d-8227bcc66f80"),
        ticket_id=UUID("34294f51-5db7-47c6-9120-2d5df1e445e5"),
        created_by=UUID("07832d16-437c-48a4-bf2a-87c18e30bfd2"),
        model_id="auto",
        created_at=datetime(2026, 9, 28, 10, 0, tzinfo=UTC),
        updated_at=datetime(2026, 9, 28, 10, 5, tzinfo=UTC),
        deleted_at=None,
    )


def build_chat_message() -> ChatMessage:
    return ChatMessage(
        id=UUID("e7781351-d416-4e2e-bf81-7b0750f6f12b"),
        session_id=UUID("ac47fc79-936f-4a02-b21d-8227bcc66f80"),
        role=ChatRole.ASSISTANT,
        content="Для исправления перепроведите документ.",
        requested_model_id="auto",
        actual_model_id="openai/gpt-4.1-mini",
        confidence=0.87,
        citation_article_ids=[
            UUID("c1545085-5ce4-4301-bc4a-058940332abb")
        ],
        provider_request_id="request-123",
        created_at=datetime(2026, 9, 28, 10, 1, tzinfo=UTC),
        updated_at=datetime(2026, 9, 28, 10, 1, tzinfo=UTC),
        deleted_at=None,
    )


def test_chat_session_mapper_round_trip():
    session = build_chat_session()

    document = ChatSessionDocumentMapper.from_entity(session)
    restored = ChatSessionDocumentMapper.to_entity(
        str(session.id),
        document,
    )

    assert "id" not in document
    assert document["ticket_id"] == str(session.ticket_id)
    assert document["model_id"] == "auto"
    assert restored.id == session.id
    assert restored.ticket_id == session.ticket_id
    assert restored.created_by == session.created_by
    assert restored.model_id == session.model_id
    assert ChatSessionDocumentMapper.from_entity(restored) == document


def test_chat_message_mapper_round_trip():
    message = build_chat_message()

    document = ChatMessageDocumentMapper.from_entity(message)
    restored = ChatMessageDocumentMapper.to_entity(
        str(message.id),
        document,
    )

    assert "id" not in document
    assert document["role"] == "assistant"
    assert document["actual_model_id"] == message.actual_model_id
    assert restored.id == message.id
    assert restored.session_id == message.session_id
    assert restored.role == ChatRole.ASSISTANT
    assert restored.confidence == message.confidence
    assert restored.citation_article_ids == message.citation_article_ids
    assert ChatMessageDocumentMapper.from_entity(restored) == document


def test_chat_message_mapper_preserves_empty_optional_fields():
    message = ChatMessage(
        session_id=uuid4(),
        role=ChatRole.USER,
        content="Как устранить ошибку?",
    )

    document = ChatMessageDocumentMapper.from_entity(message)
    restored = ChatMessageDocumentMapper.to_entity(
        str(message.id),
        document,
    )

    assert restored.requested_model_id is None
    assert restored.actual_model_id is None
    assert restored.confidence is None
    assert restored.citation_article_ids == []
    assert restored.provider_request_id is None
    assert restored.deleted_at is None
