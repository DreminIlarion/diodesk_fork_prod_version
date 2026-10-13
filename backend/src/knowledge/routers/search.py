from typing import Annotated

from fastapi import APIRouter, Depends

from src.iam.dependencies import CurrentSubjectDep
from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole

from ..application.dtos import SearchFilters
from ..application.search import KnowledgeSearchService
from ..dependencies import get_knowledge_search_service
from ..domain.vo import ArticleVisibility
from ..schemas import (
    KnowledgeSearchHitResponse,
    KnowledgeSearchRequest,
)

KNOWLEDGE_SEARCH_SCOPE = "knowledge:search"

router = APIRouter(prefix="/search")


def require_knowledge_search(
    subject: CurrentSubjectDep,
) -> Subject:
    is_staff = subject.has_any_role(UserRole.staff_roles())
    is_internal_service = subject.has_scope(
        KNOWLEDGE_SEARCH_SCOPE
    )

    if not is_staff and not is_internal_service:
        raise PermissionDeniedError(
            "Knowledge base search is not allowed"
        )

    return subject


KnowledgeSearchServiceDep = Annotated[
    KnowledgeSearchService,
    Depends(get_knowledge_search_service),
]


@router.post(
    path="",
    response_model=list[KnowledgeSearchHitResponse],
    dependencies=[Depends(require_knowledge_search)],
    summary="Поиск по базе знаний",
    description=(
        "Гибридный поиск BM25 и HNSW "
        "с объединением результатов через RRF."
    ),
)
async def search_knowledge(
    data: KnowledgeSearchRequest,
    service: KnowledgeSearchServiceDep,
) -> list[KnowledgeSearchHitResponse]:
    visibilities = [
        ArticleVisibility.PUBLIC,
        ArticleVisibility.INTERNAL,
    ]

    # Клиентские материалы ищутся только в контексте
    # конкретного контрагента.
    if data.counterparty_id is not None:
        visibilities.append(
            ArticleVisibility.CUSTOMER_SPECIFIC
        )

    hits = await service.search(
        query=data.query,
        top_k=data.top_k,
        filters=SearchFilters(
            visibilities=tuple(visibilities),
            source_kinds=data.source_kinds,
            tags=data.tags,
            product_id=data.product_id,
            project_id=data.project_id,
            counterparty_id=data.counterparty_id,
        ),
    )

    return [
        KnowledgeSearchHitResponse.model_validate(hit)
        for hit in hits
    ]
