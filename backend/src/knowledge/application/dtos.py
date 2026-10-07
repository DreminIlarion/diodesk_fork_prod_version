from dataclasses import dataclass
from uuid import UUID

from ..domain.vo import ArticleSource, ArticleVisibility, ChunkKind


@dataclass(frozen=True, slots=True)
class ArticleChunk:
    """Фрагмент опубликованной статьи, подготовленный для индексации в OpenSearch."""

    # Стабильные идентификаторы фрагмента и статьи
    chunk_id: str
    article_id: UUID
    article_version: int
    position: int

    # Текст, участвующий в полнотекстовом и векторном поиске
    title: str
    content: str
    context_headings: tuple[str, ...]
    kind: ChunkKind

    # Данные для фильтрации и формирования ссылки на источник
    source: ArticleSource
    visibility: ArticleVisibility
    tags: tuple[str, ...] = ()

    # Связи с существующими сущностями проекта
    product_id: UUID | None = None
    project_id: UUID | None = None
    counterparty_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class EmbeddedArticleChunk:
    """
    Фрагмент статьи вместе с рассчитанным векторным представлением.
    """

    chunk: ArticleChunk
    embedding: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class SearchFilters:
    """Фильтры гибридного поиска по базе знаний."""

    visibilities: tuple[ArticleVisibility, ...] = (
        ArticleVisibility.INTERNAL,
    )
    source_kinds: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()

    product_id: UUID | None = None
    project_id: UUID | None = None
    counterparty_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class SearchHit:
    """Фрагмент базы знаний, найденный гибридным поиском."""

    chunk_id: str
    article_id: UUID

    title: str
    content: str

    source: ArticleSource
    kind: ChunkKind

    rank_score: float
    exact_terms: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Citation:
    """Ссылка на материал, использованный при формировании ответа."""

    article_id: UUID
    title: str

    source: ArticleSource

    chunk_ids: tuple[str, ...]
