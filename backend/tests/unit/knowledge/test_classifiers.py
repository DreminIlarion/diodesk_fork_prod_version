import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.knowledge.application.dtos import ArticleFragment, ChunkClassification
from src.knowledge.domain.vo import ChunkKind
from src.knowledge.infra.classifiers import (
    AITunnelChunkClassifier,
    InvalidChunkClassificationError,
)

MODEL_ID = "classification-model"
MAX_TOKENS = 512


def build_client():
    return SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=AsyncMock(),
            )
        )
    )


def build_classifier(client, *, batch_size: int = 20) -> AITunnelChunkClassifier:
    return AITunnelChunkClassifier(
        client,
        model_id=MODEL_ID,
        batch_size=batch_size,
        max_tokens=MAX_TOKENS,
    )


def completion(content: str):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
            )
        ]
    )


def fragments() -> list[ArticleFragment]:
    return [
        ArticleFragment(
            position=2,
            content="Документ не проводится.",
            context_headings=("Ошибка",),
        ),
        ArticleFragment(
            position=5,
            content="Перепроведите документ.",
            context_headings=("Решение",),
        ),
    ]


async def test_empty_fragments_do_not_call_aitunnel():
    client = build_client()
    classifier = build_classifier(client)

    result = await classifier.classify(
        article_title="Ошибка документа",
        fragments=[],
    )

    assert result == []
    client.chat.completions.create.assert_not_awaited()


async def test_classifier_returns_results_in_fragment_order():
    client = build_client()
    classifier = build_classifier(client)
    client.chat.completions.create.return_value = completion(
        json.dumps(
            {
                "classifications": [
                    {"position": 5, "kind": "solution"},
                    {"position": 2, "kind": "problem"},
                ]
            }
        )
    )

    result = await classifier.classify(
        article_title="Ошибка документа",
        fragments=fragments(),
    )

    assert result == [
        ChunkClassification(position=2, kind=ChunkKind.PROBLEM),
        ChunkClassification(position=5, kind=ChunkKind.SOLUTION),
    ]

    request = client.chat.completions.create.await_args.kwargs
    assert request["model"] == MODEL_ID
    assert request["max_tokens"] == MAX_TOKENS
    assert request["response_format"]["type"] == "json_schema"
    assert request["response_format"]["json_schema"]["strict"] is True

    payload = json.loads(request["messages"][1]["content"])
    assert payload["article_title"] == "Ошибка документа"
    assert [item["position"] for item in payload["fragments"]] == [2, 5]


async def test_classifier_splits_fragments_into_batches():
    client = build_client()
    classifier = build_classifier(client, batch_size=1)
    client.chat.completions.create.side_effect = [
        completion(
            '{"classifications":[{"position":2,"kind":"problem"}]}'
        ),
        completion(
            '{"classifications":[{"position":5,"kind":"solution"}]}'
        ),
    ]

    result = await classifier.classify(
        article_title="Ошибка документа",
        fragments=fragments(),
    )

    assert [item.kind for item in result] == [
        ChunkKind.PROBLEM,
        ChunkKind.SOLUTION,
    ]
    assert client.chat.completions.create.await_count == len(fragments())


async def test_classifier_rejects_missing_fragment_position():
    client = build_client()
    classifier = build_classifier(client)
    client.chat.completions.create.return_value = completion(
        '{"classifications":[{"position":2,"kind":"problem"}]}'
    )

    with pytest.raises(
        InvalidChunkClassificationError,
        match="unexpected classification positions",
    ):
        await classifier.classify(
            article_title="Ошибка документа",
            fragments=fragments(),
        )


async def test_classifier_rejects_unknown_kind():
    client = build_client()
    classifier = build_classifier(client)
    client.chat.completions.create.return_value = completion(
        '{"classifications":['
        '{"position":2,"kind":"unknown"},'
        '{"position":5,"kind":"solution"}'
        ']}'
    )

    with pytest.raises(
        InvalidChunkClassificationError,
        match="invalid classification JSON",
    ):
        await classifier.classify(
            article_title="Ошибка документа",
            fragments=fragments(),
        )


async def test_classifier_rejects_duplicate_input_positions():
    client = build_client()
    classifier = build_classifier(client)
    duplicate_fragments = [
        ArticleFragment(position=1, content="Первый"),
        ArticleFragment(position=1, content="Второй"),
    ]

    with pytest.raises(
        InvalidChunkClassificationError,
        match="positions must be unique",
    ):
        await classifier.classify(
            article_title="Статья",
            fragments=duplicate_fragments,
        )

    client.chat.completions.create.assert_not_awaited()
