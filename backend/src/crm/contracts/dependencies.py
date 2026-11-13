from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query

from src.shared.dependencies import PaginationDep, SessionDep
from src.shared.schemas import Page

from ..dependencies import CounterpartyRepoDep
from ..mappers import map_counterparty_to_response  # noqa: F401
from .domain.repo import ContractFilters, ContractRepository
from .infra.repos import SqlContractRepository
from .mappers import map_contract_to_response
from .schemas import ContractResponse
from .services import ContractService


def get_contract_repo(session: SessionDep) -> SqlContractRepository:
    return SqlContractRepository(session)


ContractRepoDep = Annotated[ContractRepository, Depends(get_contract_repo)]


def get_contract_service(
        session: SessionDep,
        repo: ContractRepoDep,
        counterparty_repo: CounterpartyRepoDep,
) -> ContractService:
    return ContractService(session, repo, counterparty_repo)


ContractServiceDep = Annotated[ContractService, Depends(get_contract_service)]


def get_contract_filters(
        counterparty_id: Annotated[
            UUID | None, Query(..., description="Фильтр по контрагенту")
        ] = None,
) -> ContractFilters:
    return ContractFilters(counterparty_id=counterparty_id)


ContractFiltersDep = Annotated[ContractFilters, Depends(get_contract_filters)]


async def paginate_contracts(
        pagination: PaginationDep,
        filters: ContractFiltersDep,
        repo: ContractRepoDep,
) -> Page[ContractResponse]:
    page = await repo.paginate(pagination, filters)
    return page.to_response(map_contract_to_response)