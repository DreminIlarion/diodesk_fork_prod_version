from uuid import UUID

from src.shared.domain.repos import Repository

from .entities import Article, ChatMessage, ChatSession


class ArticleRepository(Repository[Article]):
    """Репозиторий агрегатов статей базы знаний"""

    async def get_by_external_id(
        self,
        source_type: str,
        external_id: str,
    ) -> Article | None:
        """
        Получение статьи по идентификатору во внешнем источнике
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
