from typing import Any

from opensearchpy import AsyncOpenSearch

DEFAULT_RRF_RANK_CONSTANT = 60


def build_rrf_search_pipeline_body(
    *,
    rank_constant: int = DEFAULT_RRF_RANK_CONSTANT,
) -> dict[str, Any]:
    """Создаёт конфигурацию RRF-пайплайна гибридного поиска."""

    return {
        "description": (
            "Knowledge base hybrid search with reciprocal rank fusion"
        ),
        "phase_results_processors": [
            {
                "score-ranker-processor": {
                    "combination": {
                        "technique": "rrf",
                        "rank_constant": rank_constant,
                    }
                }
            }
        ],
    }


async def ensure_rrf_search_pipeline(
    client: AsyncOpenSearch,
    *,
    name: str,
) -> None:
    """Создаёт или обновляет RRF-пайплайн в OpenSearch."""

    if not name.strip():
        raise ValueError(
            "OpenSearch search pipeline name cannot be empty"
        )

    await client.search_pipeline.put(
        id=name,
        body=build_rrf_search_pipeline_body(),
    )
