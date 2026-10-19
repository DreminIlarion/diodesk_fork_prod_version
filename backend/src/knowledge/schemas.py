from typing import Annotated

from datetime import datetime
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

from .domain.types import ArticleMetadata
from .domain.vo import (
    ArticleStatus,
    ArticleVisibility,
    ChunkKind,
)

NonBlankString = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
    ),
]

SearchQuery = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=2000,
    ),
]


class ArticleSourceRequest(BaseModel):
    """Источник создаваемой статьи."""

    model_config = ConfigDict(extra="forbid")

    kind: NonBlankString
    ref: NonBlankString


class KnowledgeSearchRequest(BaseModel):
    """Параметры гибридного поиска по базе знаний."""

    query: SearchQuery
    top_k: int = Field(default=10, ge=1, le=50)

    source_kinds: tuple[NonBlankString, ...] = ()
    tags: tuple[NonBlankString, ...] = ()

    product_id: UUID | None = None
    project_id: UUID | None = None
    counterparty_id: UUID | None = None


class ArticleSourceResponse(BaseModel):
    """Источник статьи базы знаний."""

    model_config = ConfigDict(from_attributes=True)

    kind: str
    ref: str


class KnowledgeSearchHitResponse(BaseModel):
    """Фрагмент базы знаний, найденный поиском."""

    model_config = ConfigDict(from_attributes=True)

    chunk_id: str
    article_id: UUID

    title: str
    content: str

    source: ArticleSourceResponse
    kind: ChunkKind

    rank_score: float
    exact_terms: tuple[str, ...] = ()


class ArticleCreateRequest(BaseModel):
    """Данные для создания статьи базы знаний."""

    model_config = ConfigDict(extra="forbid")

    title: NonBlankString
    content: NonBlankString
    source: ArticleSourceRequest

    visibility: ArticleVisibility = ArticleVisibility.INTERNAL
    external_id: NonBlankString | None = None
    tags: list[NonBlankString] = Field(default_factory=list)

    product_id: UUID | None = None
    project_id: UUID | None = None
    counterparty_id: UUID | None = None

    metadata: ArticleMetadata = Field(default_factory=dict)


class ArticleEditRequest(BaseModel):
    """Новая редакция статьи базы знаний."""

    model_config = ConfigDict(extra="forbid")

    title: NonBlankString
    content: NonBlankString
    tags: list[NonBlankString] | None = None


class ArticleResponse(BaseModel):
    """Статья базы знаний."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    content: str

    source: ArticleSourceResponse
    external_id: str | None

    author_id: UUID
    published_by: UUID | None
    published_at: datetime | None

    status: ArticleStatus
    visibility: ArticleVisibility
    version: int

    tags: list[str]

    product_id: UUID | None
    project_id: UUID | None
    counterparty_id: UUID | None

    metadata: ArticleMetadata

    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
