from dataclasses import dataclass, field
from uuid import UUID

from .vo import (
    ChunkKind,
    ModelCapability,
    SourceType,
)


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """
    Описание возможностей модели без политики её выбора
    """

    id: str
    provider: str
    api_model: str
    context_window: int
    max_output_tokens: int | None = None

    capabilities: frozenset[ModelCapability] = field(
        default_factory=lambda: frozenset(
            {ModelCapability.TEXT}
        )
    )


@dataclass(frozen=True, slots=True)
class SearchHit:
    """
    Фрагмент базы знаний, найденный гибридным поиском
    """

    chunk_id: str
    article_id: UUID

    title: str
    content: str

    source_type: SourceType
    source_ref: str
    kind: ChunkKind

    rank_score: float
    exact_terms: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Quoting:
    """
    Ссыылка на материал, использованный при формировании ответа
    """

    article_id: UUID
    title: str

    source_type: SourceType
    source_ref: str

    chunk_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ModelGeneration:
    """
    Результат обращения к генеративной модели
    """

    text: str

    requested_model_id: str
    actual_model_id: str

    input_tokens: int | None = None
    output_tokens: int | None = None
    provider_request_id: str | None = None
