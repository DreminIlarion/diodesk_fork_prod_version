from collections.abc import Sequence
from uuid import UUID

from ..domain.entities import Article
from ..domain.repos import ArticleRepository
from ..domain.vo import ArticleStatus, ChunkKind
from .dtos import (
    ArticleChunk,
    ArticleFragment,
    ChunkClassification,
    EmbeddedArticleChunk,
)
from .ports import (
    ArticleChunker,
    ArticleChunkRepository,
    ChunkClassifier,
    EmbeddingProvider,
)


class ArticleIndexingError(RuntimeError):
    """Статья не может быть корректно подготовлена для поискового индекса."""


class ArticleIndexingService:
    """Подготавливает опубликованные статьи для поиска в OpenSearch."""

    def __init__(
        self,
        *,
        article_repository: ArticleRepository,
        chunk_repository: ArticleChunkRepository,
        chunker: ArticleChunker,
        classifier: ChunkClassifier,
        embedding_provider: EmbeddingProvider,
    ) -> None:
        self._article_repository = article_repository
        self._chunk_repository = chunk_repository
        self._chunker = chunker
        self._classifier = classifier
        self._embedding_provider = embedding_provider

    async def index(self, article_id: UUID) -> None:
        article = await self._article_repository.read(article_id)

        if article is None:
            raise ArticleIndexingError(
                f"Article {article_id} was not found"
            )

        # Неопубликованная статья не должна оставаться в поисковом индексе.
        if article.status != ArticleStatus.PUBLISHED:
            await self._chunk_repository.delete_by_article(article.id)
            return

        fragments = self._chunker.split(article)
        _validate_fragment_positions(fragments)

        if not fragments:
            await self._chunk_repository.replace_for_article(
                article.id,
                [],
            )
            return

        classifications = await self._classifier.classify(
            article_title=article.title,
            fragments=fragments,
        )
        kinds_by_position = _classification_map(
            fragments=fragments,
            classifications=classifications,
        )

        embedding_inputs = [
            _embedding_input(
                article=article,
                fragment=fragment,
            )
            for fragment in fragments
        ]
        embeddings = await self._embedding_provider.embed(
            embedding_inputs
        )

        if len(embeddings) != len(fragments):
            raise ArticleIndexingError(
                "Embedding provider returned "
                f"{len(embeddings)} embeddings for "
                f"{len(fragments)} fragments"
            )

        indexed_chunks = [
            EmbeddedArticleChunk(
                chunk=_build_chunk(
                    article=article,
                    fragment=fragment,
                    kind=kinds_by_position[fragment.position],
                ),
                embedding=embedding,
            )
            for fragment, embedding in zip(
                fragments,
                embeddings,
                strict=True,
            )
        ]

        await self._chunk_repository.replace_for_article(
            article.id,
            indexed_chunks,
        )


def _validate_fragment_positions(
    fragments: Sequence[ArticleFragment],
) -> None:
    positions = [
        fragment.position
        for fragment in fragments
    ]

    if len(positions) != len(set(positions)):
        raise ArticleIndexingError(
            "Article chunker returned duplicate fragment positions"
        )


def _classification_map(
    *,
    fragments: Sequence[ArticleFragment],
    classifications: Sequence[ChunkClassification],
) -> dict[int, ChunkKind]:
    expected_positions = {
        fragment.position
        for fragment in fragments
    }
    actual_positions = [
        classification.position
        for classification in classifications
    ]

    if (
        len(actual_positions) != len(set(actual_positions))
        or set(actual_positions) != expected_positions
    ):
        raise ArticleIndexingError(
            "Chunk classifier returned unexpected positions: "
            f"{actual_positions}, expected "
            f"{sorted(expected_positions)}"
        )

    return {
        classification.position: classification.kind
        for classification in classifications
    }


def _embedding_input(
    *,
    article: Article,
    fragment: ArticleFragment,
) -> str:
    parts = (
        article.title,
        *fragment.context_headings,
        fragment.content,
    )
    return "\n".join(
        part
        for part in parts
        if part
    )


def _build_chunk(
    *,
    article: Article,
    fragment: ArticleFragment,
    kind: ChunkKind,
) -> ArticleChunk:
    return ArticleChunk(
        chunk_id=(
            f"{article.id}:"
            f"{article.version}:"
            f"{fragment.position}"
        ),
        article_id=article.id,
        article_version=article.version,
        position=fragment.position,
        title=article.title,
        content=fragment.content,
        context_headings=fragment.context_headings,
        kind=kind,
        source=article.source,
        visibility=article.visibility,
        tags=tuple(article.tags),
        product_id=article.product_id,
        project_id=article.project_id,
        counterparty_id=article.counterparty_id,
    )
