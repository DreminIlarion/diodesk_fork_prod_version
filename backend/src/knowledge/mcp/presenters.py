from src.knowledge.application.dtos import SearchHit

from .schemas import (
    KnowledgeSearchResult,
    KnowledgeSource,
)


def present_search_hit(
    hit: SearchHit,
) -> KnowledgeSearchResult:
    """Преобразует результат поиска в MCP-представление."""

    return KnowledgeSearchResult(
        chunk_id=hit.chunk_id,
        article_id=hit.article_id,
        title=hit.title,
        content=hit.content,
        source=KnowledgeSource(
            kind=hit.source.kind,
            ref=hit.source.ref,
        ),
        kind=hit.kind,
        rank_score=hit.rank_score,
        exact_terms=list(hit.exact_terms),
    )
