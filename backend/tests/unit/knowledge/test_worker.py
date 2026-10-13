from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from src.event_config import (
    ARTICLE_ARCHIVED_QUEUE,
    ARTICLE_EDITED_QUEUE,
    ARTICLE_PUBLISHED_QUEUE,
    EVENT_TOPIC_MAP,
)
from src.knowledge import worker
from src.knowledge.domain.events import (
    ArticleArchived,
    ArticleEdited,
    ArticlePublished,
)
from src.knowledge.domain.vo import ArticleVisibility


def test_article_events_are_mapped_to_worker_queues():
    assert EVENT_TOPIC_MAP[ArticlePublished] == ARTICLE_PUBLISHED_QUEUE
    assert EVENT_TOPIC_MAP[ArticleEdited] == ARTICLE_EDITED_QUEUE
    assert EVENT_TOPIC_MAP[ArticleArchived] == ARTICLE_ARCHIVED_QUEUE


async def test_article_published_starts_background_indexing(
    monkeypatch,
):
    service = SimpleNamespace(index=AsyncMock())
    monkeypatch.setattr(
        worker,
        "get_article_indexing_service",
        lambda: service,
    )
    event = ArticlePublished(
        article_id=uuid4(),
        title="Инструкция",
        visibility=ArticleVisibility.INTERNAL,
        published_by=uuid4(),
    )

    await worker.on_article_published(event)

    service.index.assert_awaited_once_with(event.article_id)


async def test_article_edited_starts_background_reindexing(
    monkeypatch,
):
    service = SimpleNamespace(index=AsyncMock())
    monkeypatch.setattr(
        worker,
        "get_article_indexing_service",
        lambda: service,
    )
    event = ArticleEdited(
        article_id=uuid4(),
        title="Обновлённая инструкция",
        edited_by=uuid4(),
    )

    await worker.on_article_edited(event)

    service.index.assert_awaited_once_with(event.article_id)


async def test_article_archived_starts_background_index_cleanup(
    monkeypatch,
):
    service = SimpleNamespace(index=AsyncMock())
    monkeypatch.setattr(
        worker,
        "get_article_indexing_service",
        lambda: service,
    )
    event = ArticleArchived(
        article_id=uuid4(),
        archived_by=uuid4(),
    )

    await worker.on_article_archived(event)

    service.index.assert_awaited_once_with(event.article_id)
