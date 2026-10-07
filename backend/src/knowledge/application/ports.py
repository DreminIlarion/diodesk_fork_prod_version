from typing import Protocol

from collections.abc import Sequence
from uuid import UUID

from ..domain.entities import Article
from .dtos import (
    ArticleFragment,
    ChunkClassification,
    EmbeddedArticleChunk,
    SearchFilters,
    SearchHit,
)


class ArticleChunker(Protocol):
    """Порт преобразования статьи в поисковые чанки."""

    def split(
        self,
        article: Article,
    ) -> list[ArticleFragment]:
        """Разбивает статью на фрагменты без смысловой классификации."""


class ChunkClassifier(Protocol):
    """Порт AI-классификации смысловых ролей фрагментов."""

    @property
    def model_id(self) -> str: ...

    async def classify(
        self,
        *,
        article_title: str,
        fragments: Sequence[ArticleFragment],
    ) -> list[ChunkClassification]:
        """Классифицирует каждый фрагмент и сохраняет его position."""


class ArticleChunkRepository(Protocol):
    """Порт поискового индекса фрагментов статей."""

    async def replace_for_article(
        self,
        article_id: UUID,
        chunks: list[EmbeddedArticleChunk],
    ) -> None:
        """Заменяет поисковые фрагменты статьи вместе с их embeddings."""

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
