import re

from src.knowledge.infra.mappings import (
    build_articles_index_body,
    build_chunks_index_body,
    build_chunks_index_name,
    build_messages_index_body,
    build_sessions_index_body,
)


def test_chunks_index_name_is_stable_and_safe():
    embedding_dimensions = 1024

    first_name = build_chunks_index_name(
        prefix="kb_chunks",
        embedding_model="baai/bge-m3",
        embedding_dimensions=embedding_dimensions,
    )
    second_name = build_chunks_index_name(
        prefix="kb_chunks",
        embedding_model="baai/bge-m3",
        embedding_dimensions=embedding_dimensions,
    )

    assert first_name == second_name
    assert re.fullmatch(r"[a-z0-9_-]+", first_name)


def test_chunks_index_name_depends_on_embedding_profile():
    first_name = build_chunks_index_name(
        prefix="kb_chunks",
        embedding_model="baai/bge-m3",
        embedding_dimensions=1024,
    )
    second_name = build_chunks_index_name(
        prefix="kb_chunks",
        embedding_model="openai/text-embedding-3-small",
        embedding_dimensions=1536,
    )

    assert first_name != second_name


def test_chunks_mapping_configures_hnsw():
    embedding_dimensions = 1024
    embedding_model = "baai/bge-m3"

    body = build_chunks_index_body(
        number_of_shards=1,
        number_of_replicas=0,
        embedding_model=embedding_model,
        embedding_dimensions=embedding_dimensions,
    )

    index_settings = body["settings"]["index"]
    embedding_mapping = body["mappings"]["properties"]["embedding"]
    metadata = body["mappings"]["_meta"]

    assert index_settings["knn"] is True
    assert embedding_mapping["type"] == "knn_vector"
    assert embedding_mapping["dimension"] == embedding_dimensions
    assert embedding_mapping["method"]["name"] == "hnsw"
    assert embedding_mapping["method"]["engine"] == "lucene"
    assert embedding_mapping["method"]["space_type"] == "cosinesimil"
    assert metadata["embedding_model"] == embedding_model


def test_all_document_mappings_are_strict():
    mappings = [
        build_articles_index_body(
            number_of_shards=1,
            number_of_replicas=0,
        ),
        build_sessions_index_body(
            number_of_shards=1,
            number_of_replicas=0,
        ),
        build_messages_index_body(
            number_of_shards=1,
            number_of_replicas=0,
        ),
    ]

    assert all(
        body["mappings"]["dynamic"] == "strict"
        for body in mappings
    )
