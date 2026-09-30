from enum import StrEnum


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


class SourceType(StrEnum):
    """Тип источника знаний"""

    TICKET = "ticket"
    INSTRUCTION = "instruction"
    DOCUMENTATION = "documentation"


class ChunkKind(StrEnum):
    """Смысловая роль фрагмента статьи"""

    PROBLEM = "problem"
    CAUSE = "cause"
    SOLUTION = "solution"
    VERIFICATION = "verification"
    DOCUMENTATION = "documentation"


class ChatRole(StrEnum):
    """Роль автора сообщения в ии-диалоге"""

    USER = "user"
    ASSISTANT = "assistant"


class ModelCapability(StrEnum):
    """Возможность генеративной модели"""

    TEXT = "text"
    STRUCTURED_OUTPUT = "structured_output"
    VISION = "vision"
