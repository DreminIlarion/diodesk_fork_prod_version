from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest

from src.knowledge.application.dtos import (
    ArticleFragment,
    ChunkClassification,
)
from src.knowledge.application.indexing import (
    ArticleIndexingError,
    ArticleIndexingService,
)
from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import ArticleSource, ChunkKind

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
AUTHOR_ID = UUID("2628de3f-7e3c-437e-a260-90c3a9cb92fd")
PUBLISHER_ID = UUID("3943ea15-c6e8-4990-93b0-a60585667093")
PRODUCT_ID = UUID("9cf0423f-a89b-4953-a69a-4911a0c063dd")
PROJECT_ID = UUID("e9950aef-edec-42c7-b760-19b105786c01")
COUNTERPARTY_ID = UUID("d2f3872c-d4d0-4d36-9a65-d760c46551e9")


def build_article(*, published: bool = True) -> Article:
    article = Article.create(
        title="Ошибка проведения",
        content="Описание проблемы и решения.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        author_id=AUTHOR_ID,
        tags=["1С", "документ"],
        product_id=PRODUCT_ID,
        project_id=PROJECT_ID,
        counterparty_id=COUNTERPARTY_ID,
    )
    article.id = ARTICLE_ID

    if published:
        article.publish(PUBLISHER_ID)

    return article


def build_dependencies(article: Article | None):
    article_repository = SimpleNamespace(
        read=AsyncMock(return_value=article),
    )
    chunk_repository = SimpleNamespace(
        replace_for_article=AsyncMock(),
        delete_by_article=AsyncMock(),
    )
    chunker = SimpleNamespace(split=Mock())
    classifier = SimpleNamespace(classify=AsyncMock())
    embedding_provider = SimpleNamespace(embed=AsyncMock())

    service = ArticleIndexingService(
        article_repository=article_repository,
        chunk_repository=chunk_repository,
        chunker=chunker,
        classifier=classifier,
        embedding_provider=embedding_provider,
    )
    return SimpleNamespace(
        service=service,
        article_repository=article_repository,
        chunk_repository=chunk_repository,
        chunker=chunker,
        classifier=classifier,
        embedding_provider=embedding_provider,
    )


def build_fragments() -> list[ArticleFragment]:
    return [
        ArticleFragment(
            position=0,
            content="Документ не проводится.",
            context_headings=("Проведение",),
        ),
        ArticleFragment(
            position=1,
            content="Перепроведите документ.",
            context_headings=("Проведение", "Решение"),
        ),
    ]


async def test_index_builds_and_replaces_article_chunks():
    article = build_article()
    dependencies = build_dependencies(article)
    fragments = build_fragments()
    dependencies.chunker.split.return_value = fragments
    dependencies.classifier.classify.return_value = [
        ChunkClassification(position=1, kind=ChunkKind.SOLUTION),
        ChunkClassification(position=0, kind=ChunkKind.PROBLEM),
    ]
    embeddings = [
        (0.1, 0.2),
        (0.3, 0.4),
    ]
    dependencies.embedding_provider.embed.return_value = embeddings

    await dependencies.service.index(article.id)

    dependencies.article_repository.read.assert_awaited_once_with(article.id)
    dependencies.chunker.split.assert_called_once_with(article)
    dependencies.classifier.classify.assert_awaited_once_with(
        article_title=article.title,
        fragments=fragments,
    )
    dependencies.embedding_provider.embed.assert_awaited_once_with(
        [
            (
                "Ошибка проведения\n"
                "Проведение\n"
                "Документ не проводится."
            ),
            (
                "Ошибка проведения\n"
                "Проведение\n"
                "Решение\n"
                "Перепроведите документ."
            ),
        ]
    )

    indexed_chunks = (
        dependencies.chunk_repository
        .replace_for_article.await_args.args[1]
    )
    assert [value.embedding for value in indexed_chunks] == embeddings
    assert [value.chunk.kind for value in indexed_chunks] == [
        ChunkKind.PROBLEM,
        ChunkKind.SOLUTION,
    ]

    first_chunk = indexed_chunks[0].chunk
    assert first_chunk.chunk_id == f"{article.id}:{article.version}:0"
    assert first_chunk.article_id == article.id
    assert first_chunk.source == article.source
    assert first_chunk.tags == tuple(article.tags)
    assert first_chunk.product_id == article.product_id
    assert first_chunk.project_id == article.project_id
    assert first_chunk.counterparty_id == article.counterparty_id


async def test_index_removes_unpublished_article_from_search():
    article = build_article(published=False)
    dependencies = build_dependencies(article)

    await dependencies.service.index(article.id)

    dependencies.chunk_repository.delete_by_article.assert_awaited_once_with(
        article.id
    )
    dependencies.chunker.split.assert_not_called()
    dependencies.classifier.classify.assert_not_awaited()
    dependencies.embedding_provider.embed.assert_not_awaited()


async def test_index_replaces_chunks_with_empty_list_for_empty_article():
    article = build_article()
    dependencies = build_dependencies(article)
    dependencies.chunker.split.return_value = []

    await dependencies.service.index(article.id)

    dependencies.chunk_repository.replace_for_article.assert_awaited_once_with(
        article.id,
        [],
    )
    dependencies.classifier.classify.assert_not_awaited()
    dependencies.embedding_provider.embed.assert_not_awaited()


async def test_index_rejects_missing_article():
    dependencies = build_dependencies(None)

    with pytest.raises(
        ArticleIndexingError,
        match="was not found",
    ):
        await dependencies.service.index(ARTICLE_ID)

    dependencies.chunk_repository.replace_for_article.assert_not_awaited()
    dependencies.chunk_repository.delete_by_article.assert_not_awaited()


async def test_index_rejects_duplicate_fragment_positions():
    article = build_article()
    dependencies = build_dependencies(article)
    dependencies.chunker.split.return_value = [
        ArticleFragment(position=0, content="Первый"),
        ArticleFragment(position=0, content="Второй"),
    ]

    with pytest.raises(
        ArticleIndexingError,
        match="duplicate fragment positions",
    ):
        await dependencies.service.index(article.id)

    dependencies.classifier.classify.assert_not_awaited()


async def test_index_rejects_unexpected_classification_positions():
    article = build_article()
    dependencies = build_dependencies(article)
    dependencies.chunker.split.return_value = build_fragments()
    dependencies.classifier.classify.return_value = [
        ChunkClassification(position=0, kind=ChunkKind.PROBLEM),
    ]

    with pytest.raises(
        ArticleIndexingError,
        match="unexpected positions",
    ):
        await dependencies.service.index(article.id)

    dependencies.embedding_provider.embed.assert_not_awaited()
    dependencies.chunk_repository.replace_for_article.assert_not_awaited()


async def test_index_rejects_unexpected_embedding_count():
    article = build_article()
    dependencies = build_dependencies(article)
    fragments = build_fragments()
    dependencies.chunker.split.return_value = fragments
    dependencies.classifier.classify.return_value = [
        ChunkClassification(position=0, kind=ChunkKind.PROBLEM),
        ChunkClassification(position=1, kind=ChunkKind.SOLUTION),
    ]
    dependencies.embedding_provider.embed.return_value = [(0.1, 0.2)]

    with pytest.raises(
        ArticleIndexingError,
        match="1 embeddings for 2 fragments",
    ):
        await dependencies.service.index(article.id)

    dependencies.chunk_repository.replace_for_article.assert_not_awaited()
