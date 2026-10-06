from types import SimpleNamespace
from unittest.mock import AsyncMock, call

import pytest

from src.knowledge.infra.embeddings import (
    AITunnelEmbeddingProvider,
    InvalidEmbeddingResponseError,
)

MODEL_ID = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 2
BATCH_SIZE = 2


def build_client():
    return SimpleNamespace(
        embeddings=SimpleNamespace(
            create=AsyncMock(),
        )
    )


def build_provider(client) -> AITunnelEmbeddingProvider:
    return AITunnelEmbeddingProvider(
        client,
        model_id=MODEL_ID,
        dimensions=EMBEDDING_DIMENSIONS,
        batch_size=BATCH_SIZE,
    )


async def test_empty_input_does_not_call_aitunnel():
    client = build_client()
    provider = build_provider(client)

    embeddings = await provider.embed([])

    assert embeddings == []
    client.embeddings.create.assert_not_awaited()


async def test_embeddings_are_batched_and_returned_in_input_order():
    client = build_client()
    provider = build_provider(client)

    client.embeddings.create.side_effect = [
        SimpleNamespace(
            data=[
                SimpleNamespace(
                    index=1,
                    embedding=[0.3, 0.4],
                ),
                SimpleNamespace(
                    index=0,
                    embedding=[0.1, 0.2],
                ),
            ]
        ),
        SimpleNamespace(
            data=[
                SimpleNamespace(
                    index=0,
                    embedding=[0.5, 0.6],
                )
            ]
        ),
    ]

    embeddings = await provider.embed(
        [
            "Первый текст",
            "Второй текст",
            "Третий текст",
        ]
    )

    assert embeddings == [
        (0.1, 0.2),
        (0.3, 0.4),
        (0.5, 0.6),
    ]
    assert client.embeddings.create.await_args_list == [
        call(
            model=MODEL_ID,
            input=[
                "Первый текст",
                "Второй текст",
            ],
            encoding_format="float",
            dimensions=EMBEDDING_DIMENSIONS,
        ),
        call(
            model=MODEL_ID,
            input=[
                "Третий текст",
            ],
            encoding_format="float",
            dimensions=EMBEDDING_DIMENSIONS,
        ),
    ]


async def test_invalid_response_indices_are_rejected():
    client = build_client()
    provider = build_provider(client)

    client.embeddings.create.return_value = SimpleNamespace(
        data=[
            SimpleNamespace(
                index=0,
                embedding=[0.1, 0.2],
            ),
            SimpleNamespace(
                index=0,
                embedding=[0.3, 0.4],
            ),
        ]
    )

    with pytest.raises(
        InvalidEmbeddingResponseError,
        match="invalid embedding indices",
    ):
        await provider.embed(
            [
                "Первый текст",
                "Второй текст",
            ]
        )


async def test_invalid_embedding_dimension_is_rejected():
    client = build_client()
    provider = build_provider(client)

    client.embeddings.create.return_value = SimpleNamespace(
        data=[
            SimpleNamespace(
                index=0,
                embedding=[0.1],
            )
        ]
    )

    with pytest.raises(
        InvalidEmbeddingResponseError,
        match="dimension 1, expected 2",
    ):
        await provider.embed(["Текст"])
