from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.knowledge.application.dtos import SearchHit
from src.knowledge.dependencies import get_knowledge_search_service
from src.knowledge.domain.vo import (
    ArticleSource,
    ArticleVisibility,
    ChunkKind,
)
from src.knowledge.routers import router as knowledge_router
from src.knowledge.routers.search import (
    KNOWLEDGE_SEARCH_SCOPE,
    require_knowledge_search,
)

ARTICLE_ID = UUID("c1545085-5ce4-4301-bc4a-058940332abb")
COUNTERPARTY_ID = UUID("d2f3872c-d4d0-4d36-9a65-d760c46551e9")
SUBJECT_ID = UUID("90e31e9c-689a-4fef-a18d-b514f9aa2a28")
TOP_K = 5


def build_hit() -> SearchHit:
    return SearchHit(
        chunk_id=f"{ARTICLE_ID}:1:0",
        article_id=ARTICLE_ID,
        title="Ошибка проведения",
        content="Перепроведите документ.",
        source=ArticleSource(
            kind="ticket",
            ref="/tickets/T-105",
        ),
        kind=ChunkKind.SOLUTION,
        rank_score=0.75,
    )


def build_client(service) -> TestClient:
    app = FastAPI()
    app.include_router(
        knowledge_router,
        prefix="/api/v1",
    )
    app.dependency_overrides[
        get_knowledge_search_service
    ] = lambda: service
    app.dependency_overrides[
        require_knowledge_search
    ] = lambda: Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.DEVELOPER],
    )
    return TestClient(app)


def test_search_endpoint_returns_hits_and_internal_visibilities():
    service = SimpleNamespace(
        search=AsyncMock(return_value=(build_hit(),)),
    )

    with build_client(service) as client:
        response = client.post(
            "/api/v1/knowledge/search",
            json={
                "query": "  ошибка проведения  ",
                "top_k": TOP_K,
                "source_kinds": ["ticket"],
                "tags": ["1С"],
            },
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()[0]["chunk_id"] == f"{ARTICLE_ID}:1:0"
    assert response.json()[0]["kind"] == "solution"

    request = service.search.await_args.kwargs
    assert request["query"] == "ошибка проведения"
    assert request["top_k"] == TOP_K
    assert request["filters"].visibilities == (
        ArticleVisibility.PUBLIC,
        ArticleVisibility.INTERNAL,
    )
    assert request["filters"].source_kinds == ("ticket",)
    assert request["filters"].tags == ("1С",)


def test_search_endpoint_adds_customer_visibility_with_counterparty():
    service = SimpleNamespace(
        search=AsyncMock(return_value=()),
    )

    with build_client(service) as client:
        response = client.post(
            "/api/v1/knowledge/search",
            json={
                "query": "ошибка",
                "counterparty_id": str(COUNTERPARTY_ID),
            },
        )

    assert response.status_code == status.HTTP_200_OK
    filters = service.search.await_args.kwargs["filters"]
    assert filters.visibilities == (
        ArticleVisibility.PUBLIC,
        ArticleVisibility.INTERNAL,
        ArticleVisibility.CUSTOMER_SPECIFIC,
    )
    assert filters.counterparty_id == COUNTERPARTY_ID


def test_search_endpoint_rejects_invalid_request_before_service():
    service = SimpleNamespace(search=AsyncMock())

    with build_client(service) as client:
        response = client.post(
            "/api/v1/knowledge/search",
            json={
                "query": "   ",
                "top_k": 0,
            },
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    service.search.assert_not_awaited()


def test_staff_subject_is_allowed_to_search():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.SUPPORT_AGENT],
    )

    assert require_knowledge_search(subject) is subject


def test_scoped_service_is_allowed_to_search():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.AI_AGENT,
        scopes=[KNOWLEDGE_SEARCH_SCOPE],
    )

    assert require_knowledge_search(subject) is subject


def test_customer_without_scope_is_not_allowed_to_search():
    subject = Subject(
        id=SUBJECT_ID,
        type=SubjectType.USER,
        roles=[UserRole.CUSTOMER],
    )

    with pytest.raises(PermissionDeniedError):
        require_knowledge_search(subject)
