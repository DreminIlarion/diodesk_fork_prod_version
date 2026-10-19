from uuid import UUID

from src.shared.domain.events import EventPublisher
from src.shared.domain.exceptions import (
    AlreadyExistsError,
    NotFoundError,
)

from ..domain.entities import Article
from ..domain.repos import ArticleRepository
from ..domain.types import ArticleMetadata
from ..domain.vo import ArticleSource, ArticleVisibility


class ArticleService:
    """Управляет жизненным циклом статей базы знаний."""

    def __init__(
        self,
        *,
        article_repository: ArticleRepository,
        event_publisher: EventPublisher,
    ) -> None:
        self._article_repository = article_repository
        self._event_publisher = event_publisher

    async def create(
        self,
        *,
        title: str,
        content: str,
        source: ArticleSource,
        author_id: UUID,
        visibility: ArticleVisibility = ArticleVisibility.INTERNAL,
        external_id: str | None = None,
        tags: list[str] | None = None,
        product_id: UUID | None = None,
        project_id: UUID | None = None,
        counterparty_id: UUID | None = None,
        metadata: ArticleMetadata | None = None,
    ) -> Article:
        if external_id is not None:
            existing = (
                await self._article_repository.get_by_external_id(
                    source.kind,
                    external_id,
                )
            )
            if existing is not None:
                raise AlreadyExistsError(
                    "Article with external ID "
                    f"{external_id!r} already exists "
                    f"for source {source.kind!r}"
                )

        article = Article.create(
            title=title,
            content=content,
            source=source,
            author_id=author_id,
            visibility=visibility,
            external_id=external_id,
            tags=tags,
            product_id=product_id,
            project_id=project_id,
            counterparty_id=counterparty_id,
            metadata=metadata,
        )

        await self._article_repository.create(article)
        await self._publish_events(article)

        return article

    async def get(self, article_id: UUID) -> Article:
        article = await self._article_repository.read(article_id)

        if article is None:
            raise NotFoundError(
                f"Article with ID {article_id} was not found"
            )

        return article

    async def revise(
        self,
        article_id: UUID,
        *,
        title: str,
        content: str,
        edited_by: UUID,
        tags: list[str] | None = None,
    ) -> Article:
        article = await self.get(article_id)

        article.revise(
            title=title,
            content=content,
            edited_by=edited_by,
            tags=tags,
        )

        await self._article_repository.update(article)
        await self._publish_events(article)

        return article

    async def publish(
        self,
        article_id: UUID,
        *,
        published_by: UUID,
    ) -> Article:
        article = await self.get(article_id)

        article.publish(published_by)

        await self._article_repository.update(article)
        await self._publish_events(article)

        return article

    async def archive(
        self,
        article_id: UUID,
        *,
        archived_by: UUID,
    ) -> Article:
        article = await self.get(article_id)

        article.archive(archived_by)

        await self._article_repository.update(article)
        await self._publish_events(article)

        return article

    async def _publish_events(
        self,
        article: Article,
    ) -> None:
        events = list(article.collect_events())

        if events:
            await self._event_publisher.publish_all(events)
