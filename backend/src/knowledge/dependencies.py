from typing import Annotated

from functools import lru_cache

from fastapi import Depends

from src.core.aitunnel import get_aitunnel_client
from src.core.opensearch import get_opensearch_client
from src.core.settings import settings
from src.shared.dependencies import EventPublisherDep

from .application.articles import ArticleService
from .application.indexing import ArticleIndexingService
from .application.search import KnowledgeSearchService
from .domain.repos import ArticleRepository
from .infra.chunk_repos import OpenSearchArticleChunkRepository
from .infra.chunkers import MarkdownArticleChunker
from .infra.classifiers import AITunnelChunkClassifier
from .infra.embeddings import AITunnelEmbeddingProvider
from .infra.repos import OpenSearchArticleRepository


@lru_cache(maxsize=1)
def get_article_indexing_service() -> ArticleIndexingService:
    opensearch_client = get_opensearch_client()
    aitunnel_client = get_aitunnel_client()

    article_repository = get_article_repository()
    chunk_repository = OpenSearchArticleChunkRepository(
        opensearch_client,
        read_index=settings.opensearch.chunks_read_alias,
        write_index=settings.opensearch.chunks_write_alias,
        embedding_model=settings.ai_tunnel.embedding_model,
        search_pipeline=settings.opensearch.rrf_pipeline,
    )
    chunker = MarkdownArticleChunker()
    classifier = AITunnelChunkClassifier(
        aitunnel_client,
        model_id=settings.ai_tunnel.classification_model,
        batch_size=settings.ai_tunnel.classification_batch_size,
        max_tokens=settings.ai_tunnel.classification_max_tokens,
    )
    embedding_provider = AITunnelEmbeddingProvider(
        aitunnel_client,
        model_id=settings.ai_tunnel.embedding_model,
        dimensions=settings.ai_tunnel.embedding_dimensions,
    )

    return ArticleIndexingService(
        article_repository=article_repository,
        chunk_repository=chunk_repository,
        chunker=chunker,
        classifier=classifier,
        embedding_provider=embedding_provider,
    )


def get_article_repository() -> OpenSearchArticleRepository:
    """Создаёт репозиторий статей базы знаний."""

    return OpenSearchArticleRepository(
        get_opensearch_client(),
        read_index=settings.opensearch.articles_read_alias,
        write_index=settings.opensearch.articles_write_alias,
    )


ArticleRepositoryDep = Annotated[
    ArticleRepository,
    Depends(get_article_repository),
]


def get_article_service(
    article_repository: ArticleRepositoryDep,
    event_publisher: EventPublisherDep,
) -> ArticleService:
    """Создаёт сервис управления статьями базы знаний."""

    return ArticleService(
        article_repository=article_repository,
        event_publisher=event_publisher,
    )


ArticleServiceDep = Annotated[
    ArticleService,
    Depends(get_article_service),
]


@lru_cache(maxsize=1)
def get_knowledge_search_service() -> KnowledgeSearchService:
    opensearch_client = get_opensearch_client()
    aitunnel_client = get_aitunnel_client()

    chunk_repository = OpenSearchArticleChunkRepository(
        opensearch_client,
        read_index=settings.opensearch.chunks_read_alias,
        write_index=settings.opensearch.chunks_write_alias,
        embedding_model=settings.ai_tunnel.embedding_model,
        search_pipeline=settings.opensearch.rrf_pipeline,
    )
    embedding_provider = AITunnelEmbeddingProvider(
        aitunnel_client,
        model_id=settings.ai_tunnel.embedding_model,
        dimensions=settings.ai_tunnel.embedding_dimensions,
    )

    return KnowledgeSearchService(
        chunk_repository=chunk_repository,
        embedding_provider=embedding_provider,
    )
