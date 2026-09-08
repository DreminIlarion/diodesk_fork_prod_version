from typing import Annotated

from uuid import UUID

from fastapi import Depends, HTTPException, Query
from fastapi import status as http_status

from ..shared.dependencies import SessionDep
from .domain.repo import ProductRepository
from .domain.vo import ProductCategory, ProductStatus
from .infra.repo import SqlProductRepository
from .schemas import ProductFilters
from .services import ProductService


def get_product_repo(session: SessionDep) -> ProductRepository:
    return SqlProductRepository(session)


ProductRepoDep = Annotated[ProductRepository, Depends(get_product_repo)]


def get_product_service(session: SessionDep, repository: ProductRepoDep) -> ProductService:
    return ProductService(session, repository)


ProductServiceDep = Annotated[ProductService, Depends(get_product_service)]


def get_product_filters(
        category: Annotated[
            ProductCategory | None, Query(..., description="По категории")
        ] = None,
        status: Annotated[
            ProductStatus | None, Query(..., description="По статусу")
        ] = None,
        query: Annotated[
            str | None, Query(..., description="Полнотекстовый поиск")
        ] = None,
        counterparty_id: Annotated[
            UUID | None,
            Query(..., description="По связанному контрагенту"),
        ] = None,
        without_counterparty: Annotated[
            bool,
            Query(..., description="Только продукты без контрагента"),
        ] = False,
) -> ProductFilters:
    if counterparty_id is not None and without_counterparty:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "counterparty_id and without_counterparty "
                "cannot be specified together"
            ),
        )
    return ProductFilters(
        category=category,
        status=status,
        query=query,
        counterparty_id=counterparty_id,
        without_counterparty=without_counterparty,
    )


ProductFiltersDep = Annotated[ProductFilters, Depends(get_product_filters)]
