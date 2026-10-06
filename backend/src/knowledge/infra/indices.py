from dataclasses import dataclass

from opensearchpy import AsyncOpenSearch

from src.core.settings import OpenSearchSettings

from .mappings import (
    build_articles_index_body,
    build_chunks_index_body,
    build_chunks_index_name,
)


class IndexAliasConflictError(RuntimeError):
    """Алиас OpenSearch уже связан с другим физическим индексом"""


@dataclass(frozen=True, slots=True)
class KnowledgeIndexNames:
    """Физические имена индексов базы знаний"""

    articles: str
    chunks: str


def resolve_knowledge_index_names(
    config: OpenSearchSettings,
    *,
    embedding_model: str,
    embedding_dimensions: int,
) -> KnowledgeIndexNames:
    """Вычисляет физические имена всех индексов базы знаний"""

    return KnowledgeIndexNames(
        articles=config.articles_index,
        chunks=build_chunks_index_name(
            prefix=config.chunks_index_prefix,
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
        ),
    )


async def ensure_knowledge_indices(
    client: AsyncOpenSearch,
    config: OpenSearchSettings,
    *,
    embedding_model: str,
    embedding_dimensions: int,
) -> KnowledgeIndexNames:
    """
    Создаёт отсутствующие индексы и алиасы базы знаний.

    Существующие индексы не пересоздаются. Алиасы, связанные с другими
    индексами, автоматически не переключаются: для этого потребуется
    отдельная управляемая переиндексация.
    """

    names = resolve_knowledge_index_names(
        config,
        embedding_model=embedding_model,
        embedding_dimensions=embedding_dimensions,
    )

    await _ensure_index(
        client,
        index=names.articles,
        body=build_articles_index_body(
            number_of_shards=config.number_of_shards,
            number_of_replicas=config.number_of_replicas,
        ),
    )
    await _ensure_alias(
        client,
        index=names.articles,
        alias=config.articles_read_alias,
        is_write_index=False,
    )
    await _ensure_alias(
        client,
        index=names.articles,
        alias=config.articles_write_alias,
        is_write_index=True,
    )

    await _ensure_index(
        client,
        index=names.chunks,
        body=build_chunks_index_body(
            number_of_shards=config.number_of_shards,
            number_of_replicas=config.number_of_replicas,
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
        ),
    )
    await _ensure_alias(
        client,
        index=names.chunks,
        alias=config.chunks_read_alias,
        is_write_index=False,
    )
    await _ensure_alias(
        client,
        index=names.chunks,
        alias=config.chunks_write_alias,
        is_write_index=True,
    )

    return names


async def _ensure_index(
    client: AsyncOpenSearch,
    *,
    index: str,
    body: dict,
) -> None:
    """Создаёт физический индекс, если он ещё не существует"""

    if await client.indices.exists(index=index):
        return

    await client.indices.create(
        index=index,
        body=body,
    )


async def _ensure_alias(
    client: AsyncOpenSearch,
    *,
    index: str,
    alias: str,
    is_write_index: bool,
) -> None:
    """Создаёт алиас и не переключает его с другого индекса автоматически"""

    if await client.indices.exists_alias(
        index=index,
        name=alias,
    ):
        return

    if await client.indices.exists_alias(name=alias):
        raise IndexAliasConflictError(
            f"OpenSearch alias {alias!r} already points to another index"
        )

    await client.indices.put_alias(
        index=index,
        name=alias,
        body={
            "is_write_index": is_write_index,
        },
    )
