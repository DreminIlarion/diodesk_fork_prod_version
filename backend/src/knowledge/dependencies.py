from functools import lru_cache

from src.core.aitunnel import get_aitunnel_client
from src.core.opensearch import get_opensearch_client
from src.core.settings import settings

from .application.indexing import ArticleIndexingService
from .application.search import KnowledgeSearchService
from .infra.chunk_repos import OpenSearchArticleChunkRepository
from .infra.chunkers import MarkdownArticleChunker
from .infra.classifiers import AITunnelChunkClassifier
from .infra.embeddings import AITunnelEmbeddingProvider
from .infra.repos import OpenSearchArticleRepository


@lru_cache(maxsize=1)
def get_article_indexing_service() -> ArticleIndexingService:
    opensearch_client = get_opensearch_client()
    aitunnel_client = get_aitunnel_client()

    article_repository = OpenSearchArticleRepository(
        opensearch_client,
        read_index=settings.opensearch.articles_read_alias,
        write_index=settings.opensearch.articles_write_alias,
    )
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
