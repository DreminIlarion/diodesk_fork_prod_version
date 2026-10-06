from dataclasses import dataclass, field
from enum import StrEnum


@dataclass(frozen=True, slots=True)
class ArticleSource:
    kind: str
    ref: str


class ArticleStatus(StrEnum):
    """Статус статьи базы знаний"""

    DRAFT = "draft"
    IN_REVIEW = "in_review"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ArticleVisibility(StrEnum):
    """Область видимости статьи"""

    PUBLIC = "public"
    INTERNAL = "internal"
    CUSTOMER_SPECIFIC = "customer_specific"


class ChunkKind(StrEnum):
    """Смысловая роль фрагмента статьи"""

    PROBLEM = "problem"
    CAUSE = "cause"
    SOLUTION = "solution"
    VERIFICATION = "verification"
    DOCUMENTATION = "documentation"


class ModelCapability(StrEnum):
    """Возможность генеративной модели"""

    TEXT = "text"
    STRUCTURED_OUTPUT = "structured_output"
    VISION = "vision"


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """Описание возможностей модели без политики её выбора."""

    id: str
    provider: str
    api_model: str
    context_window: int
    max_output_tokens: int | None = None

    capabilities: frozenset[ModelCapability] = field(
        default_factory=lambda: frozenset({ModelCapability.TEXT})
    )
