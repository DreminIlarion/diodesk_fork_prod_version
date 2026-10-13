from typing import Annotated

from uuid import UUID

from fastmcp.dependencies import Depends
from fastmcp.tools import tool
from pydantic import Field, StringConstraints

from src.knowledge.application.dtos import SearchFilters
from src.knowledge.application.search import (
    KnowledgeSearchService,
)
from src.knowledge.domain.vo import ArticleVisibility
from src.mcp.annotations import READ_ONLY

from .dependencies import get_search_service
from .presenters import present_search_hit
from .schemas import KnowledgeSearchResult

NonBlankString = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
    ),
]

SearchQuery = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=2000,
    ),
    Field(
        description=(
            "Вопрос или описание проблемы "
            "на естественном языке"
        ),
    ),
]

TopK = Annotated[
    int,
    Field(
        ge=1,
        le=50,
        description=(
            "Максимальное количество найденных фрагментов"
        ),
    ),
]


@tool(
    annotations=READ_ONLY,
    tags={"knowledge"},
)
async def search_knowledge(
    query: SearchQuery,
    top_k: TopK = 10,
    source_kinds: Annotated[
        list[NonBlankString] | None,
        Field(
            description=(
                "Типы источников, например ticket "
                "или documentation"
            ),
        ),
    ] = None,
    tags: Annotated[
        list[NonBlankString] | None,
        Field(description="Теги материалов"),
    ] = None,
    product_id: Annotated[
        UUID | None,
        Field(description="Идентификатор продукта"),
    ] = None,
    project_id: Annotated[
        UUID | None,
        Field(description="Идетификатор проекта"),
    ] = None,
    counterparty_id: Annotated[
        UUID | None,
        Field(description="Идетификатор контрагента"),
    ] = None,
    service: KnowledgeSearchService = Depends(
        get_search_service
    ),
) -> list[KnowledgeSearchResult]:
    """
    Выполняет гибридный поиск по базе знаний.

    Объединяет полнотекстовый BM25 и векторный HNSW-поиск
    через RRF и возвращает релевантные смысловые фрагменты.
    """

    visibilities = [
        ArticleVisibility.PUBLIC,
        ArticleVisibility.INTERNAL,
    ]

    if counterparty_id is not None:
        visibilities.append(
            ArticleVisibility.CUSTOMER_SPECIFIC
        )

    hits = await service.search(
        query=query,
        top_k=top_k,
        filters=SearchFilters(
            visibilities=tuple(visibilities),
            source_kinds=tuple(source_kinds or ()),
            tags=tuple(tags or ()),
            product_id=product_id,
            project_id=project_id,
            counterparty_id=counterparty_id,
        ),
    )

    return [
        present_search_hit(hit)
        for hit in hits
    ]


TOOLS = (
    search_knowledge,
)
