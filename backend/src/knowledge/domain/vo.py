from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID


class ArticleStatus(StrEnum):
    """Статус статьи базы знаний"""

    DRAFT = "draft"  # черновик
    IN_REVIEW = "in_review"  # на проверке
    PUBLISHED = "published"  # опубликована
    ARCHIVED = "archived"  # в архиве


class ArticleVisibility(StrEnum):
    """Область видимости статьи"""

    PUBLIC = "public"
    INTERNAL = "internal"
    CUSTOMER_SPECIFIC = "customer_specific"


class SourceType(StrEnum):
    TICKET = "ticket"
    INSTRUCTION = "instruction"
    DOCUMENTATION = "documentation"


class ChunkKind(StrEnum):
    PROBLEM = "problem"
    CAUSE = "cause"
    SOLUTION = "solution"
    VERIFICATION = "verification"
    DOCUMENTATION = "documentation"


class ChatRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ModelCapability(StrEnum):
    TEXT = "text"
    STRUCTURED_OUTPUT = "structured_output"
    VISION = "vision"


@dataclass(frozen=True, kw_only=True)
class ArticleChunk:
    """
    Часть (кусок) статьи.
    Для индексирования системой.
    """

    version_id: UUID
    attachment_id: UUID | None = None

    content_type: str
    content: str | None = None

    embedding: list[float]
