from src.knowledge.application.search import (
    KnowledgeSearchService,
)
from src.knowledge.dependencies import (
    get_knowledge_search_service as build_knowledge_search_service,
)


def get_search_service() -> KnowledgeSearchService:
    """Возвращает сервис гибридного поиска для MCP-инструментов."""

    return build_knowledge_search_service()
