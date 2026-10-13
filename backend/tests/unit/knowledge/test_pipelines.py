from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.knowledge.infra.pipelines import (
    DEFAULT_RRF_RANK_CONSTANT,
    build_rrf_search_pipeline_body,
    ensure_rrf_search_pipeline,
)

PIPELINE_NAME = "kb-rrf-v1"


def build_client():
    return SimpleNamespace(
        search_pipeline=SimpleNamespace(
            put=AsyncMock(),
        )
    )


def test_build_rrf_search_pipeline_body():
    body = build_rrf_search_pipeline_body()

    processors = body["phase_results_processors"]
    ranker = processors[0]["score-ranker-processor"]
    combination = ranker["combination"]

    assert combination["technique"] == "rrf"
    assert (
        combination["rank_constant"]
        == DEFAULT_RRF_RANK_CONSTANT
    )


async def test_ensure_rrf_search_pipeline():
    client = build_client()

    await ensure_rrf_search_pipeline(
        client,
        name=PIPELINE_NAME,
    )

    client.search_pipeline.put.assert_awaited_once_with(
        id=PIPELINE_NAME,
        body=build_rrf_search_pipeline_body(),
    )


async def test_empty_pipeline_name_is_rejected():
    client = build_client()

    with pytest.raises(
        ValueError,
        match="pipeline name cannot be empty",
    ):
        await ensure_rrf_search_pipeline(
            client,
            name=" ",
        )

    client.search_pipeline.put.assert_not_awaited()
