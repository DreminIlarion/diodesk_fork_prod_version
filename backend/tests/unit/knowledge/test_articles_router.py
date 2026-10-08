from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.knowledge.dependencies import get_article_service
from src.knowledge.domain.entities import Article
from src.knowledge.domain.vo import ArticleSource
from src.knowledge.routers import router as knowledge_router
from src.knowledge.routers.articles import (
    KNOWLEDGE_WRITE_SCOPE,
    require_knowledge_write,
)

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
SUBJECT_ID = UUID("90e31e9c-689a-4fef-a18d-b514f9aa2a28")
PRODUCT_ID = UUID("9cf0423f-a89b-4953-a69a-4911a0c063dd")


def build_article() -> Article:
    article = Article.create(
        title="Инструкция",
        content="Содержимое статьи.",
        source=ArticleSource(
            kind="documentation",
            ref="/docs/42",
        ),
        author_id=SUBJECT_ID,
        external_id="DOC-42",
        tags=["база знаний"],
        product_id=PRODUCT_ID,
        metadata={"verified": True},
    )
    article.id = ARTICLE_ID
    list(article.collect_events())
    return article


def build_service(article: Article):
    return SimpleNamespace(
        create=AsyncMock(return_value=article),
        get=AsyncMock(return_value=article),
        revise=AsyncMock(return_value=article),
        publish=AsyncMock(return_value=article),
        archive=AsyncMock(return_value=article),
    )


def build_client(service) -> TestClient:
    app = FastAPI()
    app.include_router(
        knowledge_router,
        prefix="/api/v1",
    )
    app.dependency_overrides[get_article_service] = lambda: service
    app.dependency_overrides[
        require_knowledge_write
    ] = lambda: Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.DEVELOPER],
    )
    return TestClient(app)


def test_create_article_endpoint():
    article = build_article()
    service = build_service(article)

    with build_client(service) as client:
        response = client.post(
            "/api/v1/knowledge/articles",
            json={
                "title": "  Инструкция  ",
                "content": "  Содержимое статьи.  ",
                "source": {
                    "kind": "documentation",
                    "ref": "/docs/42",
                },
                "external_id": "DOC-42",
                "tags": ["база знаний"],
                "product_id": str(PRODUCT_ID),
                "metadata": {"verified": True},
            },
        )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["id"] == str(ARTICLE_ID)
    assert response.json()["source"] == {
        "kind": "documentation",
        "ref": "/docs/42",
    }

    request = service.create.await_args.kwargs
    assert request["title"] == "Инструкция"
    assert request["content"] == "Содержимое статьи."
    assert request["source"] == ArticleSource(
        kind="documentation",
        ref="/docs/42",
    )
    assert request["author_id"] == SUBJECT_ID
    assert request["product_id"] == PRODUCT_ID
    assert request["metadata"] == {"verified": True}


def test_get_article_endpoint():
    article = build_article()
    service = build_service(article)

    with build_client(service) as client:
        response = client.get(
            f"/api/v1/knowledge/articles/{ARTICLE_ID}"
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(ARTICLE_ID)
    service.get.assert_awaited_once_with(ARTICLE_ID)


def test_edit_article_endpoint():
    article = build_article()
    service = build_service(article)

    with build_client(service) as client:
        response = client.patch(
            f"/api/v1/knowledge/articles/{ARTICLE_ID}",
            json={
                "title": "Новая редакция",
                "content": "Новое содержимое.",
                "tags": ["обновлено"],
            },
        )

    assert response.status_code == status.HTTP_200_OK
    service.revise.assert_awaited_once_with(
        ARTICLE_ID,
        title="Новая редакция",
        content="Новое содержимое.",
        edited_by=SUBJECT_ID,
        tags=["обновлено"],
    )


def test_publish_article_endpoint():
    article = build_article()
    service = build_service(article)

    with build_client(service) as client:
        response = client.post(
            f"/api/v1/knowledge/articles/{ARTICLE_ID}/publish"
        )

    assert response.status_code == status.HTTP_200_OK
    service.publish.assert_awaited_once_with(
        ARTICLE_ID,
        published_by=SUBJECT_ID,
    )


def test_archive_article_endpoint():
    article = build_article()
    service = build_service(article)

    with build_client(service) as client:
        response = client.post(
            f"/api/v1/knowledge/articles/{ARTICLE_ID}/archive"
        )

    assert response.status_code == status.HTTP_200_OK
    service.archive.assert_awaited_once_with(
        ARTICLE_ID,
        archived_by=SUBJECT_ID,
    )


def test_invalid_create_request_does_not_call_service():
    service = build_service(build_article())

    with build_client(service) as client:
        response = client.post(
            "/api/v1/knowledge/articles",
            json={
                "title": "   ",
                "content": "Содержимое.",
                "source": {
                    "kind": "documentation",
                    "ref": "/docs/42",
                },
            },
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    service.create.assert_not_awaited()


def test_staff_subject_is_allowed_to_manage_articles():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.SUPPORT_AGENT],
    )

    assert require_knowledge_write(subject) is subject


def test_scoped_service_is_allowed_to_manage_articles():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.AI_AGENT,
        scopes=[KNOWLEDGE_WRITE_SCOPE],
    )

    assert require_knowledge_write(subject) is subject


def test_customer_is_not_allowed_to_manage_articles():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.CUSTOMER],
    )

    with pytest.raises(PermissionDeniedError):
        require_knowledge_write(subject)
