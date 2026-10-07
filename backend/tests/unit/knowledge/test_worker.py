from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from src.knowledge import worker
from src.knowledge.domain.events import ArticlePublished
from src.knowledge.domain.vo import ArticleVisibility


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
