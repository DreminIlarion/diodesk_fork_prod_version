from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.core.settings import OpenSearchSettings
from src.knowledge.infra.indices import (
    IndexAliasConflictError,
    ensure_knowledge_indices,
    resolve_knowledge_index_names,
)

EMBEDDING_MODEL = "baai/bge-m3"
EMBEDDING_DIMENSIONS = 1024


def build_settings() -> OpenSearchSettings:
    return OpenSearchSettings(
        articles_index="kb_articles_v1",
        chunks_index_prefix="kb_chunks",
        articles_read_alias="kb_articles_read",
        articles_write_alias="kb_articles_write",
        chunks_read_alias="kb_chunks_read",
        chunks_write_alias="kb_chunks_write",
        rrf_pipeline="kb-rrf-v1",
        number_of_shards=1,
        number_of_replicas=0,
    )


def build_client(
    *,
    index_exists: bool,
    alias_exists: bool,
):
    indices = SimpleNamespace(
        exists=AsyncMock(return_value=index_exists),
        create=AsyncMock(),
        exists_alias=AsyncMock(return_value=alias_exists),
        put_alias=AsyncMock(),
    )

    search_pipeline = SimpleNamespace(
        put=AsyncMock(),
    )

    return SimpleNamespace(
        indices=indices,
        search_pipeline=search_pipeline,
    )


def test_resolve_knowledge_index_names():
    config = build_settings()

    names = resolve_knowledge_index_names(
        config,
        embedding_model=EMBEDDING_MODEL,
        embedding_dimensions=EMBEDDING_DIMENSIONS,
    )

    assert names.articles == config.articles_index
    assert names.chunks.startswith("kb_chunks-1024-")


async def test_ensure_knowledge_indices_creates_missing_resources():
    config = build_settings()
    client = build_client(
        index_exists=False,
        alias_exists=False,
    )

    names = await ensure_knowledge_indices(
        client,
        config,
        embedding_model=EMBEDDING_MODEL,
        embedding_dimensions=EMBEDDING_DIMENSIONS,
    )

    expected_index_count = 2
    expected_alias_count = 4

    assert client.indices.create.await_count == expected_index_count
    assert client.indices.put_alias.await_count == expected_alias_count

    created_indices = {
        call.kwargs["index"]
        for call in client.indices.create.await_args_list
    }

    assert created_indices == {
        names.articles,
        names.chunks,
    }
    client.search_pipeline.put.assert_awaited_once()


async def test_ensure_knowledge_indices_is_idempotent():
    config = build_settings()
    client = build_client(
        index_exists=True,
        alias_exists=True,
    )

    await ensure_knowledge_indices(
        client,
        config,
        embedding_model=EMBEDDING_MODEL,
        embedding_dimensions=EMBEDDING_DIMENSIONS,
    )

    client.indices.create.assert_not_awaited()
    client.indices.put_alias.assert_not_awaited()
    client.search_pipeline.put.assert_awaited_once()


async def test_ensure_knowledge_indices_rejects_alias_conflict():
    config = build_settings()
    client = build_client(
        index_exists=True,
        alias_exists=False,
    )

    def alias_exists(
        *,
        name: str,
        index: str | None = None,
    ) -> bool:
        return index is None

    client.indices.exists_alias.side_effect = alias_exists

    with pytest.raises(
        IndexAliasConflictError,
        match="already points to another index",
    ):
        await ensure_knowledge_indices(
            client,
            config,
            embedding_model=EMBEDDING_MODEL,
            embedding_dimensions=EMBEDDING_DIMENSIONS,
        )

    client.indices.put_alias.assert_not_awaited()
    client.search_pipeline.put.assert_not_awaited()
