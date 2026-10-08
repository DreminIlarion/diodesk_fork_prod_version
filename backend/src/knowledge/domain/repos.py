from src.shared.domain.repos import Repository

from .entities import Article


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
