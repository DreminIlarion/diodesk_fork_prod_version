from typing import Annotated

from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

from .domain.vo import ChunkKind

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
    """Источник найденного материала."""

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
