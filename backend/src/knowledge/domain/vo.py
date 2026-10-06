from dataclasses import dataclass
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
