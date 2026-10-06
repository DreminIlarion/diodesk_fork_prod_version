from typing import Any

import hashlib
import re

INDEX_SCHEMA_VERSION = 1


def build_chunks_index_name(
    prefix: str,
    embedding_model: str,
    embedding_dimensions: int,
) -> str:
    """
    Формирует имя индекса, зависящее от embedding-модели и размерности вектора
    """

    normalized_prefix = re.sub(
        r"[^a-z0-9_-]+",
        "-",
        prefix.lower(),
    ).strip("-_")

    if not normalized_prefix:
        raise ValueError("OpenSearch index prefix cannot be empty")

    model_digest = hashlib.sha256(
        embedding_model.encode("utf-8"),
        usedforsecurity=False,
    ).hexdigest()[:12]

    return (
        f"{normalized_prefix}-{embedding_dimensions}-"
        f"{model_digest}-v{INDEX_SCHEMA_VERSION}"
    )


def build_articles_index_body(
    *,
    number_of_shards: int,
    number_of_replicas: int,
) -> dict[str, Any]:
    """
    Создает настройки и mapping индекса статей.
    """

    return {
        "settings": {
            "index": {
                "number_of_shards": number_of_shards,
                "number_of_replicas": number_of_replicas,
            }
        },
        "mappings": {
            "dynamic": "strict",
            "_meta": {
                "schema_version": INDEX_SCHEMA_VERSION,
                "document_type": "knowledge_article",
            },
            "properties": {
                "title": {
                    "type": "text",
                    "analyzer": "russian",
                    "fields": {
                        "keyword": {
                            "type": "keyword",
                            "ignore_above": 512,
                        }
                    },
                },
                "content": {
                    "type": "text",
                    "analyzer": "russian",
                },
                "source_type": {"type": "keyword"},
                "source_ref": {"type": "keyword"},
                "external_id": {"type": "keyword"},
                "author_id": {"type": "keyword"},
                "published_by": {"type": "keyword"},
                "published_at": {"type": "date"},
                "status": {"type": "keyword"},
                "visibility": {"type": "keyword"},
                "version": {"type": "integer"},
                "tags": {"type": "keyword"},
                "product_id": {"type": "keyword"},
                "project_id": {"type": "keyword"},
                "counterparty_id": {"type": "keyword"},
                "metadata": {
                    "type": "object",
                    "enabled": False,
                },
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
                "deleted_at": {"type": "date"},
            },
        },
    }


def build_chunks_index_body(
    *,
    number_of_shards: int,
    number_of_replicas: int,
    embedding_model: str,
    embedding_dimensions: int,
) -> dict[str, Any]:
    """Создаёт настройки и mapping индекса поисковых фрагментов"""

    return {
        "settings": {
            "index": {
                "knn": True,
                "number_of_shards": number_of_shards,
                "number_of_replicas": number_of_replicas,
            }
        },
        "mappings": {
            "dynamic": "strict",
            "_meta": {
                "schema_version": INDEX_SCHEMA_VERSION,
                "document_type": "knowledge_chunk",
                "embedding_model": embedding_model,
                "embedding_dimensions": embedding_dimensions,
            },
            "properties": {
                "article_id": {"type": "keyword"},
                "article_version": {"type": "integer"},
                "position": {"type": "integer"},
                "title": {
                    "type": "text",
                    "analyzer": "russian",
                },
                "content": {
                    "type": "text",
                    "analyzer": "russian",
                },
                "context_headings": {
                    "type": "text",
                    "analyzer": "russian",
                },
                "kind": {"type": "keyword"},
                "source_type": {"type": "keyword"},
                "source_ref": {"type": "keyword"},
                "visibility": {"type": "keyword"},
                "tags": {"type": "keyword"},
                "product_id": {"type": "keyword"},
                "project_id": {"type": "keyword"},
                "counterparty_id": {"type": "keyword"},
                "embedding_model": {"type": "keyword"},
                "embedding": {
                    "type": "knn_vector",
                    "dimension": embedding_dimensions,
                    "method": {
                        "name": "hnsw",
                        "engine": "lucene",
                        "space_type": "cosinesimil",
                        "parameters": {
                            "m": 16,
                            "ef_construction": 100,
                        },
                    },
                },
            },
        },
    }
