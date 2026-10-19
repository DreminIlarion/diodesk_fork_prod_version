from typing import Self

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from src.shared.domain.entities import AggregateRoot
from src.shared.domain.exceptions import InvalidStateError
from src.shared.utils.time import current_datetime

from .events import (
    ArticleArchived,
    ArticleCreated,
    ArticleEdited,
    ArticlePublished,
)
from .types import ArticleMetadata
from .vo import (
    ArticleSource,
    ArticleStatus,
    ArticleVisibility,
)


@dataclass(kw_only=True)
class Article(AggregateRoot):
    """
    Статья базы знаний
    """

    # Контент
    title: str
    content: str

    # Источник знания
    source: ArticleSource
    external_id: str | None = None

    # Авторство и публикация
    author_id: UUID
    published_by: UUID | None = None
    published_at: datetime | None = None

    # Статус, видимость и версия
    status: ArticleStatus = ArticleStatus.DRAFT
    visibility: ArticleVisibility = ArticleVisibility.INTERNAL
    version: int = 1

    # Классификация
    tags: list[str] = field(default_factory=list)

    # Связи с существующими сущностями
    product_id: UUID | None = None
    project_id: UUID | None = None
    counterparty_id: UUID | None = None

    # Дополнительные данные источника
    metadata: ArticleMetadata = field(default_factory=dict)

    @classmethod
    def create(
        cls,
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
    ) -> Self:
        """Создание статьи базы знаний."""

        article = cls(
            title=title,
            content=content,
            source=source,
            author_id=author_id,
            visibility=visibility,
            external_id=external_id,
            tags=tags or [],
            product_id=product_id,
            project_id=project_id,
            counterparty_id=counterparty_id,
            metadata=metadata or {},
        )
        article.register_event(
            ArticleCreated(
                article_id=article.id,
                author_id=author_id,
                title=title,
            )
        )
        return article

    def revise(
        self,
        *,
        title: str,
        content: str,
        edited_by: UUID,
        tags: list[str] | None = None,
    ) -> None:
        """Создание новой редакции статьи."""

        # Архивные статьи изменять нельзя
        if self.status == ArticleStatus.ARCHIVED:
            raise InvalidStateError(
                "Archived article cannot be edited"
            )

        # Обновление содержимого
        self.title = title
        self.content = content
        self.author_id = edited_by

        if tags is not None:
            self.tags = tags

        # Номер редакции увеличивается, ID статьи остаётся прежним
        self.version += 1
        self.updated_at = current_datetime()

        self.register_event(
            ArticleEdited(
                article_id=self.id,
                title=self.title,
                edited_by=edited_by,
            )
        )

    def publish(self, published_by: UUID) -> None:
        """Публикация статьи базы знаний."""

        # Архивную статью публиковать нельзя
        if self.status == ArticleStatus.ARCHIVED:
            raise InvalidStateError(
                "Archived article cannot be published"
            )

        # Повторная публикация не изменяет состояние
        if self.status == ArticleStatus.PUBLISHED:
            return

        now = current_datetime()

        self.status = ArticleStatus.PUBLISHED
        self.published_by = published_by
        self.published_at = now
        self.updated_at = now

        self.register_event(
            ArticlePublished(
                article_id=self.id,
                title=self.title,
                visibility=self.visibility,
                published_by=published_by,
            )
        )

    def archive(self, archived_by: UUID) -> None:
        """Архивирование статьи базы знаний."""

        # Повторное архивирование не изменяет состояние
        # и не создаёт повторное событие.
        if self.status == ArticleStatus.ARCHIVED:
            return

        now = current_datetime()

        self.status = ArticleStatus.ARCHIVED
        self.deleted_at = now
        self.updated_at = now

        self.register_event(
            ArticleArchived(
                article_id=self.id,
                archived_by=archived_by,
            )
        )
