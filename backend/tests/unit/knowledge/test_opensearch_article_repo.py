from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from opensearchpy import NotFoundError as OpenSearchNotFoundError

from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import ArticleSource
from src.knowledge.infra.mappers import ArticleDocumentMapper
from src.knowledge.infra.repos import OpenSearchArticleRepository
from src.shared.schemas import Pagination

READ_INDEX = "kb_articles_read"
WRITE_INDEX = "kb_articles_write"


def build_article() -> Article:
    return Article.create(
        title="Ошибка проведения документа",
        content="Причина ошибки и последовательность исправления.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        external_id="T-105",
        author_id=uuid4(),
    )


def build_client():
    return SimpleNamespace(
        index=AsyncMock(),
        get=AsyncMock(),
        search=AsyncMock(),
        delete=AsyncMock(),
        exists=AsyncMock(),
        mget=AsyncMock(),
    )


def build_repository(client) -> OpenSearchArticleRepository:
    return OpenSearchArticleRepository(
        client,
        read_index=READ_INDEX,
        write_index=WRITE_INDEX,
    )


def build_hit(article: Article) -> dict:
    return {
        "_id": str(article.id),
        "_source": ArticleDocumentMapper.from_entity(article),
    }


async def test_create_article():
    client = build_client()
    repository = build_repository(client)
    article = build_article()

    created = await repository.create(article)

    assert created is article
    client.index.assert_awaited_once_with(
        index=WRITE_INDEX,
        id=str(article.id),
        body=ArticleDocumentMapper.from_entity(article),
        params={
            "op_type": "create",
            "refresh": "wait_for",
        },
    )


async def test_read_article():
    client = build_client()
    repository = build_repository(client)
    article = build_article()
    client.get.return_value = build_hit(article)

    restored = await repository.read(article.id)

    assert restored is not None
    assert restored.id == article.id
    assert restored.title == article.title
    client.get.assert_awaited_once_with(
        index=READ_INDEX,
        id=str(article.id),
    )


async def test_read_missing_article_returns_none():
    client = build_client()
    repository = build_repository(client)
    article_id = uuid4()
    client.get.side_effect = OpenSearchNotFoundError(
        404,
        "not_found",
        {},
    )

    result = await repository.read(article_id)

    assert result is None


async def test_paginate_articles():
    client = build_client()
    repository = build_repository(client)
    article = build_article()

    page_number = 2
    page_size = 10
    total_items = 11

    client.search.return_value = {
        "hits": {
            "total": {
                "value": total_items,
                "relation": "eq",
            },
            "hits": [
                build_hit(article),
            ],
        }
    }

    page = await repository.paginate(
        Pagination(
            page=page_number,
            size=page_size,
        )
    )

    assert page.page == page_number
    assert page.size == page_size
    assert page.total_items == total_items
    assert page.has_prev is True
    assert page.has_next is False
    assert [item.id for item in page.items] == [article.id]

    client.search.assert_awaited_once_with(
        index=READ_INDEX,
        body={
            "from": page_size,
            "size": page_size,
            "track_total_hits": True,
            "sort": [
                {
                    "created_at": {
                        "order": "desc",
                    }
                }
            ],
            "query": {
                "match_all": {},
            },
        },
    )


async def test_update_article_and_check_existence():
    client = build_client()
    repository = build_repository(client)
    article = build_article()
    client.exists.return_value = True

    await repository.update(article)
    exists = await repository.exists(article.id)

    assert exists is True
    client.index.assert_awaited_once_with(
        index=WRITE_INDEX,
        id=str(article.id),
        body=ArticleDocumentMapper.from_entity(article),
        params={
            "refresh": "wait_for",
        },
    )
    client.exists.assert_awaited_once_with(
        index=READ_INDEX,
        id=str(article.id),
    )


async def test_delete_article():
    client = build_client()
    repository = build_repository(client)
    article_id = uuid4()

    await repository.delete(article_id)

    client.delete.assert_awaited_once_with(
        index=WRITE_INDEX,
        id=str(article_id),
        params={
            "refresh": "wait_for",
        },
    )


async def test_delete_missing_article_is_idempotent():
    client = build_client()
    repository = build_repository(client)
    client.delete.side_effect = OpenSearchNotFoundError(
        404,
        "not_found",
        {},
    )

    await repository.delete(uuid4())


async def test_get_articles_by_ids():
    client = build_client()
    repository = build_repository(client)
    article = build_article()
    missing_id = uuid4()

    client.mget.return_value = {
        "docs": [
            {
                **build_hit(article),
                "found": True,
            },
            {
                "_id": str(missing_id),
                "found": False,
            },
        ]
    }

    articles = await repository.get_by_ids(
        [
            article.id,
            missing_id,
        ]
    )

    assert [item.id for item in articles] == [article.id]
    client.mget.assert_awaited_once_with(
        index=READ_INDEX,
        body={
            "ids": [
                str(article.id),
                str(missing_id),
            ]
        },
    )


async def test_get_article_by_external_id():
    client = build_client()
    repository = build_repository(client)
    article = build_article()

    client.search.return_value = {
        "hits": {
            "hits": [
                build_hit(article),
            ]
        }
    }

    restored = await repository.get_by_external_id(
        "ticket",
        "T-105",
    )

    assert restored is not None
    assert restored.id == article.id

    client.search.assert_awaited_once_with(
        index=READ_INDEX,
        body={
            "size": 1,
            "sort": [
                {
                    "updated_at": {
                        "order": "desc",
                    }
                }
            ],
            "query": {
                "bool": {
                    "filter": [
                        {
                            "term": {
                                "source_type": "ticket",
                            }
                        },
                        {
                            "term": {
                                "external_id": "T-105",
                            }
                        },
                    ]
                }
            },
        },
    )
