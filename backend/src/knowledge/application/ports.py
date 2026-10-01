from typing import Protocol

from uuid import UUID

from .dtos import ArticleChunk, SearchFilters, SearchHit


class ArticleChunkRepository(Protocol):
    """Порт поискового индекса фрагментов статей."""

    async def replace_for_article(
        self,
        article_id: UUID,
        chunks: list[ArticleChunk],
    ) -> None:
        """Заменяет поисковые фрагменты конкретной статьи."""

    async def delete_by_article(self, article_id: UUID) -> None:
        """Удаляет из поискового индекса все фрагменты статьи."""

    async def hybrid_search(
        self,
        *,
        query: str,
        query_embedding: tuple[float, ...],
        filters: SearchFilters,
        top_k: int = 10,
    ) -> tuple[SearchHit, ...]:
        """Выполняет гибридный поиск BM25 и HNSW с объединением через RRF."""
