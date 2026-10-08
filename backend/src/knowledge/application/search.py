from .dtos import SearchFilters, SearchHit
from .ports import ArticleChunkRepository, EmbeddingProvider


class KnowledgeSearchError(RuntimeError):
    """Поисковый запрос не удалось подготовить или выполнить."""


class KnowledgeSearchService:
    """Выполняет гибридный поиск по базе знаний."""

    def __init__(
        self,
        *,
        chunk_repository: ArticleChunkRepository,
        embedding_provider: EmbeddingProvider,
    ) -> None:
        self._chunk_repository = chunk_repository
        self._embedding_provider = embedding_provider

    async def search(
        self,
        *,
        query: str,
        filters: SearchFilters,
        top_k: int = 10,
    ) -> tuple[SearchHit, ...]:
        embeddings = await self._embedding_provider.embed([query])

        if len(embeddings) != 1:
            raise KnowledgeSearchError(
                "Embedding provider returned "
                f"{len(embeddings)} embeddings for one search query"
            )

        return await self._chunk_repository.hybrid_search(
            query=query,
            query_embedding=embeddings[0],
            filters=filters,
            top_k=top_k,
        )
