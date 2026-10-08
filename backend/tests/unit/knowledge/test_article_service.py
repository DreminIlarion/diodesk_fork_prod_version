from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from src.knowledge.application.articles import ArticleService
from src.knowledge.domain.entities import Article
from src.knowledge.domain.events import (
    ArticleArchived,
    ArticleCreated,
    ArticleEdited,
    ArticlePublished,
)
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleStatus,
)
from src.shared.domain.exceptions import (
    AlreadyExistsError,
    NotFoundError,
)

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
AUTHOR_ID = UUID("2628de3f-7e3c-437e-a260-90c3a9cb92fd")
EDITOR_ID = UUID("3943ea15-c6e8-4990-93b0-a60585667093")
SOURCE = ArticleSource(kind="ticket", ref="/tickets/T-105")
UPDATED_ARTICLE_VERSION = 2


def build_article() -> Article:
    article = Article.create(
        title="Ошибка проведения документа",
        content="Описание проблемы.",
        source=SOURCE,
        author_id=AUTHOR_ID,
        external_id="T-105",
    )
    article.id = ARTICLE_ID
    list(article.collect_events())
    return article


def build_dependencies(article: Article | None = None):
    article_repository = SimpleNamespace(
        create=AsyncMock(),
        read=AsyncMock(return_value=article),
        update=AsyncMock(),
        get_by_external_id=AsyncMock(return_value=None),
    )
    event_publisher = SimpleNamespace(
        publish_all=AsyncMock(),
    )
    service = ArticleService(
        article_repository=article_repository,
        event_publisher=event_publisher,
    )
    return SimpleNamespace(
        service=service,
        article_repository=article_repository,
        event_publisher=event_publisher,
    )


async def test_create_persists_article_and_publishes_created_event():
    dependencies = build_dependencies()

    article = await dependencies.service.create(
        title="Ошибка проведения документа",
        content="Описание проблемы.",
        source=SOURCE,
        author_id=AUTHOR_ID,
        external_id="T-105",
    )

    dependencies.article_repository.get_by_external_id.assert_awaited_once_with(
        SOURCE.kind,
        "T-105",
    )
    dependencies.article_repository.create.assert_awaited_once_with(article)
    events = dependencies.event_publisher.publish_all.await_args.args[0]
    assert len(events) == 1
    assert isinstance(events[0], ArticleCreated)
    assert events[0].article_id == article.id


async def test_create_without_external_id_skips_duplicate_lookup():
    dependencies = build_dependencies()

    await dependencies.service.create(
        title="Инструкция",
        content="Содержимое инструкции.",
        source=ArticleSource(kind="documentation", ref="/docs/42"),
        author_id=AUTHOR_ID,
    )

    dependencies.article_repository.get_by_external_id.assert_not_awaited()


async def test_create_rejects_duplicate_external_id():
    existing = build_article()
    dependencies = build_dependencies()
    dependencies.article_repository.get_by_external_id.return_value = existing

    with pytest.raises(AlreadyExistsError, match="T-105"):
        await dependencies.service.create(
            title="Дубликат",
            content="Содержимое.",
            source=SOURCE,
            author_id=AUTHOR_ID,
            external_id="T-105",
        )

    dependencies.article_repository.create.assert_not_awaited()
    dependencies.event_publisher.publish_all.assert_not_awaited()


async def test_get_returns_article():
    article = build_article()
    dependencies = build_dependencies(article)

    result = await dependencies.service.get(ARTICLE_ID)

    assert result is article
    dependencies.article_repository.read.assert_awaited_once_with(ARTICLE_ID)


async def test_get_rejects_missing_article():
    dependencies = build_dependencies()

    with pytest.raises(NotFoundError, match=str(ARTICLE_ID)):
        await dependencies.service.get(ARTICLE_ID)


async def test_revise_persists_article_and_publishes_edited_event():
    article = build_article()
    dependencies = build_dependencies(article)

    result = await dependencies.service.revise(
        ARTICLE_ID,
        title="Исправленная инструкция",
        content="Новое содержимое.",
        edited_by=EDITOR_ID,
        tags=["обновлено"],
    )

    assert result is article
    assert article.version == UPDATED_ARTICLE_VERSION
    dependencies.article_repository.update.assert_awaited_once_with(article)
    events = dependencies.event_publisher.publish_all.await_args.args[0]
    assert len(events) == 1
    assert isinstance(events[0], ArticleEdited)
    assert events[0].article_id == ARTICLE_ID


async def test_publish_persists_article_and_publishes_event():
    article = build_article()
    dependencies = build_dependencies(article)

    result = await dependencies.service.publish(
        ARTICLE_ID,
        published_by=EDITOR_ID,
    )

    assert result is article
    assert article.status == ArticleStatus.PUBLISHED
    dependencies.article_repository.update.assert_awaited_once_with(article)
    events = dependencies.event_publisher.publish_all.await_args.args[0]
    assert len(events) == 1
    assert isinstance(events[0], ArticlePublished)
    assert events[0].article_id == ARTICLE_ID


async def test_archive_persists_article_and_publishes_event():
    article = build_article()
    dependencies = build_dependencies(article)

    result = await dependencies.service.archive(
        ARTICLE_ID,
        archived_by=EDITOR_ID,
    )

    assert result is article
    assert article.status == ArticleStatus.ARCHIVED
    dependencies.article_repository.update.assert_awaited_once_with(article)
    events = dependencies.event_publisher.publish_all.await_args.args[0]
    assert len(events) == 1
    assert isinstance(events[0], ArticleArchived)
    assert events[0].article_id == ARTICLE_ID
