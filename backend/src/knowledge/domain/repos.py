from typing import Protocol

from uuid import UUID

from src.shared.domain.repos import Repository

from .dtos import ArticleChunk, SearchFilters, SearchHit
from .entities import Article, ChatMessage, ChatSession
from .vo import SourceType


class ArticleRepository(Repository[Article]):
    """Репозиторий агрегатов статей базы знаний"""

    async def get_by_external_id(
        self,
        source_type: SourceType,
        external_id: str,
    ) -> Article | None:
        """
        Получение статьи по идентификатору во внешнем источнике
        """


class ArticleChunkRepository(Protocol):
    """Порт индекса фрагментов статей в OpenSearch"""

    async def replace_for_article(
        self,
        article_id: UUID,
        chunks: list[ArticleChunk],
    ) -> None:
        """
        Заменяет поисковые фрагменты конкретной статьи
        """

    async def delete_by_article(self, article_id: UUID) -> None:
        """
        Удаляет из поискового индекса все фрагменты статьи
        """

    async def hybrid_search(
        self,
        *,
        query: str,
        query_embedding: tuple[float, ...],
        filters: SearchFilters,
        top_k: int = 10,
    ) -> list[SearchHit]:
        """
        Выполняет гибридный поиск BM25 и HNSW с объединением через RRF
        """


class ChatSessionRepository(Repository[ChatSession]):
    """Репозиторий ии-диалогов, открытых в карточках тикетов"""

    async def get_by_ticket_and_user(
        self,
        ticket_id: UUID,
        user_id: UUID,
    ) -> ChatSession | None:
        """
        Возвращает диалог сотрудника в указанном тикете
        """


class ChatMessageRepository(Repository[ChatMessage]):
    """Репозиторий сообщений ии-диалога"""

    async def list_by_session(
        self,
        session_id: UUID,
        *,
        limit: int = 50,
    ) -> list[ChatMessage]:
        """
        Возвращает последние сообщения диалога в хронологическом порядке
        """

    async def delete_by_session(self, session_id: UUID) -> None:
        """
        Удаляет сообщения закрываемого диалога
        """
