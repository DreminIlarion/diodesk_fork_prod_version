from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from opensearchpy import NotFoundError as OpenSearchNotFoundError

from src.knowledge.domain.entities import ChatMessage
from src.knowledge.domain.vo import ChatRole
from src.knowledge.infra.mappers import ChatMessageDocumentMapper
from src.knowledge.infra.repos import (
    OpenSearchChatMessageRepository,
)
from src.shared.schemas import Pagination

MESSAGE_INDEX = "kb_chat_messages_v1"


def build_message(
    *,
    session_id: UUID | None = None,
    created_at: datetime | None = None,
    content: str = "Как исправить ошибку?",
) -> ChatMessage:
    timestamp = created_at or datetime(
        2026,
        9,
        30,
        10,
        0,
        tzinfo=UTC,
    )

    return ChatMessage(
        session_id=session_id or uuid4(),
        role=ChatRole.USER,
        content=content,
        requested_model_id="auto",
        created_at=timestamp,
        updated_at=timestamp,
    )


def build_client():
    return SimpleNamespace(
        index=AsyncMock(),
        get=AsyncMock(),
        search=AsyncMock(),
        delete=AsyncMock(),
        exists=AsyncMock(),
        mget=AsyncMock(),
        delete_by_query=AsyncMock(),
    )


def build_repository(
    client,
) -> OpenSearchChatMessageRepository:
    return OpenSearchChatMessageRepository(
        client,
        index=MESSAGE_INDEX,
    )


def build_hit(message: ChatMessage) -> dict:
    return {
        "_id": str(message.id),
        "_source": ChatMessageDocumentMapper.from_entity(message),
    }


async def test_create_and_read_chat_message():
    client = build_client()
    repository = build_repository(client)
    message = build_message()

    created = await repository.create(message)

    client.get.return_value = build_hit(message)
    restored = await repository.read(message.id)

    assert created is message
    assert restored is not None
    assert restored.id == message.id
    assert restored.session_id == message.session_id
    assert restored.content == message.content

    client.index.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        id=str(message.id),
        body=ChatMessageDocumentMapper.from_entity(message),
        params={
            "op_type": "create",
            "refresh": "wait_for",
        },
    )


async def test_read_missing_chat_message_returns_none():
    client = build_client()
    repository = build_repository(client)
    client.get.side_effect = OpenSearchNotFoundError(
        404,
        "not_found",
        {},
    )

    result = await repository.read(uuid4())

    assert result is None


async def test_paginate_chat_messages():
    client = build_client()
    repository = build_repository(client)
    message = build_message()

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
                build_hit(message),
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
    assert [item.id for item in page.items] == [message.id]


async def test_update_delete_and_check_chat_message():
    client = build_client()
    repository = build_repository(client)
    message = build_message()
    client.exists.return_value = True

    message.content = "Уточнённый вопрос"

    await repository.update(message)
    exists = await repository.exists(message.id)
    await repository.delete(message.id)

    assert exists is True
    client.index.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        id=str(message.id),
        body=ChatMessageDocumentMapper.from_entity(message),
        params={
            "refresh": "wait_for",
        },
    )
    client.exists.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        id=str(message.id),
    )
    client.delete.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        id=str(message.id),
        params={
            "refresh": "wait_for",
        },
    )


async def test_get_chat_messages_by_ids():
    client = build_client()
    repository = build_repository(client)
    message = build_message()
    missing_id = uuid4()

    client.mget.return_value = {
        "docs": [
            {
                **build_hit(message),
                "found": True,
            },
            {
                "_id": str(missing_id),
                "found": False,
            },
        ]
    }

    messages = await repository.get_by_ids(
        [
            message.id,
            missing_id,
        ]
    )

    assert [item.id for item in messages] == [message.id]


async def test_list_last_messages_in_chronological_order():
    client = build_client()
    repository = build_repository(client)
    session_id = uuid4()
    limit = 2

    older = build_message(
        session_id=session_id,
        created_at=datetime(
            2026,
            9,
            30,
            10,
            0,
            tzinfo=UTC,
        ),
        content="Первое сообщение",
    )
    newer = build_message(
        session_id=session_id,
        created_at=datetime(
            2026,
            9,
            30,
            10,
            1,
            tzinfo=UTC,
        ),
        content="Второе сообщение",
    )

    client.search.return_value = {
        "hits": {
            "hits": [
                build_hit(newer),
                build_hit(older),
            ]
        }
    }

    messages = await repository.list_by_session(
        session_id,
        limit=limit,
    )

    assert [message.id for message in messages] == [
        older.id,
        newer.id,
    ]

    client.search.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        body={
            "size": limit,
            "sort": [
                {
                    "created_at": {
                        "order": "desc",
                    }
                }
            ],
            "query": {
                "term": {
                    "session_id": str(session_id),
                }
            },
        },
    )


async def test_delete_chat_messages_by_session():
    client = build_client()
    repository = build_repository(client)
    session_id = uuid4()

    await repository.delete_by_session(session_id)

    client.delete_by_query.assert_awaited_once_with(
        index=MESSAGE_INDEX,
        body={
            "query": {
                "term": {
                    "session_id": str(session_id),
                }
            }
        },
        params={
            "conflicts": "proceed",
            "refresh": True,
        },
    )
