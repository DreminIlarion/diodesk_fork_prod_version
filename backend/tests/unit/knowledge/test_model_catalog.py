from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.knowledge.domain.vo import ModelCapability
from src.knowledge.infra.model_catalog import (
    ProxyAPIModelCatalog,
)

CACHE_TTL_SECONDS = 900
DEFAULT_CONTEXT_WINDOW = 32_768
INITIAL_TIME = 100.0
EXPECTED_API_CALLS = 1
EXPECTED_REFRESH_CALLS = 2


def build_client(*responses):
    return SimpleNamespace(
        models=SimpleNamespace(
            list=AsyncMock(
                side_effect=responses,
            )
        )
    )


def build_response(*models):
    return SimpleNamespace(
        data=list(models),
    )


def build_model(
    model_id: str,
    *,
    owned_by: str,
):
    return SimpleNamespace(
        id=model_id,
        owned_by=owned_by,
    )


async def test_catalog_maps_and_sorts_proxyapi_models():
    client = build_client(
        build_response(
            build_model(
                "openai/gpt-5-mini",
                owned_by="openai",
            ),
            build_model(
                "anthropic/claude-haiku-4-5",
                owned_by="anthropic",
            ),
        )
    )

    catalog = ProxyAPIModelCatalog(
        client,
        ttl_seconds=CACHE_TTL_SECONDS,
        default_context_window=DEFAULT_CONTEXT_WINDOW,
    )

    models = await catalog.list_models()

    assert [model.id for model in models] == [
        "anthropic/claude-haiku-4-5",
        "openai/gpt-5-mini",
    ]
    assert models[0].provider == "anthropic"
    assert models[0].api_model == (
        "anthropic/claude-haiku-4-5"
    )
    assert (
        models[0].context_window
        == DEFAULT_CONTEXT_WINDOW
    )
    assert ModelCapability.TEXT in models[0].capabilities


async def test_catalog_uses_cache_until_ttl_expires():
    clock_time = [INITIAL_TIME]

    client = build_client(
        build_response(
            build_model(
                "openai/gpt-5-mini",
                owned_by="openai",
            )
        ),
        build_response(
            build_model(
                "openai/gpt-5.5",
                owned_by="openai",
            )
        ),
    )

    catalog = ProxyAPIModelCatalog(
        client,
        ttl_seconds=CACHE_TTL_SECONDS,
        default_context_window=DEFAULT_CONTEXT_WINDOW,
        clock=lambda: clock_time[0],
    )

    first_result = await catalog.list_models()
    cached_result = await catalog.list_models()

    assert cached_result is first_result
    assert client.models.list.await_count == EXPECTED_API_CALLS

    clock_time[0] += CACHE_TTL_SECONDS

    refreshed_result = await catalog.list_models()

    assert [model.id for model in refreshed_result] == [
        "openai/gpt-5.5"
    ]
    assert (
        client.models.list.await_count
        == EXPECTED_REFRESH_CALLS
    )


async def test_catalog_finds_model_by_full_id():
    model_id = "deepseek/deepseek-chat"

    client = build_client(
        build_response(
            build_model(
                model_id,
                owned_by="deepseek",
            )
        )
    )

    catalog = ProxyAPIModelCatalog(
        client,
        ttl_seconds=CACHE_TTL_SECONDS,
        default_context_window=DEFAULT_CONTEXT_WINDOW,
    )

    model = await catalog.get_model(model_id)
    missing_model = await catalog.get_model(
        "unknown/missing-model"
    )

    assert model is not None
    assert model.id == model_id
    assert model.provider == "deepseek"
    assert missing_model is None
    assert client.models.list.await_count == EXPECTED_API_CALLS


async def test_catalog_derives_provider_from_model_id():
    model_id = "qwen/qwen3-14b"

    client = build_client(
        build_response(
            build_model(
                model_id,
                owned_by="",
            )
        )
    )

    catalog = ProxyAPIModelCatalog(
        client,
        ttl_seconds=CACHE_TTL_SECONDS,
        default_context_window=DEFAULT_CONTEXT_WINDOW,
    )

    model = await catalog.get_model(model_id)

    assert model is not None
    assert model.provider == "qwen"
