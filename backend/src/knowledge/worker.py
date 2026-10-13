from uuid import UUID

from faststream import AckPolicy, FastStream
from faststream.rabbit import RabbitBroker, RabbitQueue

from src.core.aitunnel import close_aitunnel_client
from src.core.opensearch import close_opensearch_client
from src.core.settings import settings
from src.event_config import (
    ARTICLE_ARCHIVED_QUEUE,
    ARTICLE_EDITED_QUEUE,
    ARTICLE_PUBLISHED_QUEUE,
)

from .dependencies import get_article_indexing_service
from .domain.events import (
    ArticleArchived,
    ArticleEdited,
    ArticlePublished,
)

broker = RabbitBroker(
    settings.rabbit.url,
    virtualhost=settings.rabbit.virtualhost,
)
app = FastStream(broker)


async def _index_article(article_id: UUID) -> None:
    """Синхронизирует поисковый индекс с текущим состоянием статьи."""

    service = get_article_indexing_service()
    await service.index(article_id)


@broker.subscriber(
    queue=RabbitQueue(
        ARTICLE_PUBLISHED_QUEUE,
        durable=True,
    ),
    ack_policy=AckPolicy.NACK_ON_ERROR,
    description="Индексация опубликованной статьи базы знаний",
)
async def on_article_published(
    event: ArticlePublished,
) -> None:
    await _index_article(event.article_id)


@broker.subscriber(
    queue=RabbitQueue(
        ARTICLE_EDITED_QUEUE,
        durable=True,
    ),
    ack_policy=AckPolicy.NACK_ON_ERROR,
    description="Переиндексация отредактированной статьи базы знаний",
)
async def on_article_edited(
    event: ArticleEdited,
) -> None:
    await _index_article(event.article_id)


@broker.subscriber(
    queue=RabbitQueue(
        ARTICLE_ARCHIVED_QUEUE,
        durable=True,
    ),
    ack_policy=AckPolicy.NACK_ON_ERROR,
    description="Удаление архивированной статьи из поискового индекса",
)
async def on_article_archived(
    event: ArticleArchived,
) -> None:
    await _index_article(event.article_id)


@app.on_shutdown
async def close_external_clients() -> None:
    try:
        try:
            await close_aitunnel_client()
        finally:
            await close_opensearch_client()
    finally:
        get_article_indexing_service.cache_clear()
