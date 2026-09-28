from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from opensearchpy import NotFoundError as OpenSearchNotFoundError

from src.knowledge.domain.entities import ChatSession
from src.knowledge.infra.mappers import ChatSessionDocumentMapper
from src.knowledge.infra.repos import (
    OpenSearchChatSessionRepository,
)
from src.shared.schemas import Pagination

SESSION_INDEX = "kb_chat_sessions_v1"


def build_session() -> ChatSession:
    return ChatSession(
        ticket_id=uuid4(),
        created_by=uuid4(),
        model_id="auto",
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


def build_repository(
    client,
) -> OpenSearchChatSessionRepository:
    return OpenSearchChatSessionRepository(
        client,
        index=SESSION_INDEX,
    )


def build_hit(session: ChatSession) -> dict:
    return {
        "_id": str(session.id),
        "_source": ChatSessionDocumentMapper.from_entity(session),
    }


async def test_create_and_read_chat_session():
    client = build_client()
    repository = build_repository(client)
    session = build_session()

    created = await repository.create(session)

    client.get.return_value = build_hit(session)
    restored = await repository.read(session.id)

    assert created is session
    assert restored is not None
    assert restored.id == session.id
    assert restored.ticket_id == session.ticket_id
    assert restored.created_by == session.created_by
    assert restored.model_id == "auto"

    client.index.assert_awaited_once_with(
        index=SESSION_INDEX,
        id=str(session.id),
        body=ChatSessionDocumentMapper.from_entity(session),
        params={
            "op_type": "create",
            "refresh": "wait_for",
        },
    )


async def test_read_missing_chat_session_returns_none():
    client = build_client()
    repository = build_repository(client)
    client.get.side_effect = OpenSearchNotFoundError(
        404,
        "not_found",
        {},
    )

    result = await repository.read(uuid4())

    assert result is None


async def test_paginate_chat_sessions():
    client = build_client()
    repository = build_repository(client)
    session = build_session()

    page_number = 1
    page_size = 10
    total_items = 1

    client.search.return_value = {
        "hits": {
            "total": {
                "value": total_items,
                "relation": "eq",
            },
            "hits": [
                build_hit(session),
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
    assert [item.id for item in page.items] == [session.id]


async def test_update_delete_and_check_chat_session():
    client = build_client()
    repository = build_repository(client)
    session = build_session()
    client.exists.return_value = True

    session.change_model("openai/gpt-4.1-mini")

    await repository.update(session)
    exists = await repository.exists(session.id)
    await repository.delete(session.id)

    assert exists is True
    client.index.assert_awaited_once_with(
        index=SESSION_INDEX,
        id=str(session.id),
        body=ChatSessionDocumentMapper.from_entity(session),
        params={
            "refresh": "wait_for",
        },
    )
    client.exists.assert_awaited_once_with(
        index=SESSION_INDEX,
        id=str(session.id),
    )
    client.delete.assert_awaited_once_with(
        index=SESSION_INDEX,
        id=str(session.id),
        params={
            "refresh": "wait_for",
        },
    )


async def test_delete_missing_chat_session_is_idempotent():
    client = build_client()
    repository = build_repository(client)
    client.delete.side_effect = OpenSearchNotFoundError(
        404,
        "not_found",
        {},
    )

    await repository.delete(uuid4())


async def test_get_chat_sessions_by_ids():
    client = build_client()
    repository = build_repository(client)
    session = build_session()
    missing_id = uuid4()

    client.mget.return_value = {
        "docs": [
            {
                **build_hit(session),
                "found": True,
            },
            {
                "_id": str(missing_id),
                "found": False,
            },
        ]
    }

    sessions = await repository.get_by_ids(
        [
            session.id,
            missing_id,
        ]
    )

    assert [item.id for item in sessions] == [session.id]


async def test_get_chat_session_by_ticket_and_user():
    client = build_client()
    repository = build_repository(client)
    session = build_session()

    client.search.side_effect = [
        {
            "hits": {
                "hits": [
                    build_hit(session),
                ]
            }
        },
        {
            "hits": {
                "hits": [],
            }
        },
    ]

    restored = await repository.get_by_ticket_and_user(
        session.ticket_id,
        session.created_by,
    )
    missing = await repository.get_by_ticket_and_user(
        uuid4(),
        uuid4(),
    )

    expected_search_count = 2

    assert restored is not None
    assert restored.id == session.id
    assert missing is None
    assert client.search.await_count == expected_search_count

    first_query = client.search.await_args_list[0].kwargs["body"]

    assert first_query["query"]["bool"]["filter"] == [
        {
            "term": {
                "ticket_id": str(session.ticket_id),
            }
        },
        {
            "term": {
                "created_by": str(session.created_by),
            }
        },
    ]
    assert first_query["query"]["bool"]["must_not"] == [
        {
            "exists": {
                "field": "deleted_at",
            }
        }
    ]
