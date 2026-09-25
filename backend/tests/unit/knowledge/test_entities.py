from uuid import uuid4

import pytest

from src.knowledge.domain.entities import Article, ChatSession
from src.knowledge.domain.events import (
    ArticleCreated,
    ArticleEdited,
    ArticlePublished,
)
from src.knowledge.domain.vo import ArticleStatus, SourceType
from src.shared.domain.exceptions import InvalidStateError


@pytest.fixture
def article() -> Article:
    return Article.create(
        title="Ошибка печати",
        content="Описание проблемы и решения",
        source_type=SourceType.INSTRUCTION,
        source_ref="/knowledge/instructions/printing",
        author_id=uuid4(),
    )


def test_create_article_registers_event(article: Article):
    events = list(article.collect_events())

    assert article.status == ArticleStatus.DRAFT
    assert article.version == 1
    assert len(events) == 1
    assert isinstance(events[0], ArticleCreated)
    assert events[0].article_id == article.id


def test_publish_article(article: Article):
    list(article.collect_events())
    published_by = uuid4()

    article.publish(published_by)
    events = list(article.collect_events())

    assert article.status == ArticleStatus.PUBLISHED
    assert article.reviewer_id == published_by
    assert article.published_at is not None
    assert len(events) == 1
    assert isinstance(events[0], ArticlePublished)


def test_revise_article_increments_version(article: Article):
    list(article.collect_events())
    editor_id = uuid4()

    previous_version = article.version

    article.revise(
        title="Обновлённая инструкция",
        content="Новое содержимое",
        edited_by=editor_id,
    )
    events = list(article.collect_events())

    assert article.title == "Обновлённая инструкция"
    assert article.version == previous_version + 1
    assert len(events) == 1
    assert isinstance(events[0], ArticleEdited)


def test_archived_article_cannot_be_edited(article: Article):
    article.archive()

    with pytest.raises(InvalidStateError):
        article.revise(
            title="Новое название",
            content="Новое содержимое",
            edited_by=uuid4(),
        )


def test_archived_article_cannot_be_published(article: Article):
    article.archive()

    with pytest.raises(InvalidStateError):
        article.publish(uuid4())


def test_chat_session_changes_model():
    session = ChatSession(
        ticket_id=uuid4(),
        created_by=uuid4(),
        model_id="qwen/first",
    )

    session.change_model("deepseek/second")

    assert session.model_id == "deepseek/second"
