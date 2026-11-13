from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import require_role
from src.iam.domain.vo import UserRole
from src.shared.schemas import Page

from .dependencies import ContractRepoDep, ContractServiceDep, paginate_contracts
from .schemas import ContractCreate, ContractResponse, ContractUpdate

REQUIRED_ROLES = {UserRole.ADMIN, UserRole.SUPPORT_MANAGER, UserRole.ACCOUNT_MANAGER}

router = APIRouter(prefix="/contracts", tags=["Договоры"])


@router.post(
    path="",
    response_model=ContractResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(REQUIRED_ROLES))],
    summary="Создать договор",
)
async def create_contract(
        data: ContractCreate, service: ContractServiceDep
) -> ContractResponse:
    return await service.create(data)


@router.get(
    path="/{contract_id}",
    response_model=ContractResponse,
    status_code=status.HTTP_200_OK,
    summary="Получить договор",
)
async def get_contract(
        contract_id: UUID, service: ContractServiceDep
) -> ContractResponse:
    return await service.get(contract_id)


@router.get(
    path="",
    response_model=Page[ContractResponse],
    status_code=status.HTTP_200_OK,
    summary="Список договоров",
)
async def list_contracts(
        contracts: Page[ContractResponse] = Depends(paginate_contracts),
) -> Page[ContractResponse]:
    return contracts


@router.put(
    path="/{contract_id}",
    response_model=ContractResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(REQUIRED_ROLES))],
    summary="Изменить договор",
)
async def update_contract(
        contract_id: UUID, data: ContractUpdate, service: ContractServiceDep
) -> ContractResponse:
    return await service.update(contract_id, data)


@router.delete(
    path="/{contract_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(REQUIRED_ROLES))],
    summary="Удалить договор",
)
async def delete_contract(contract_id: UUID, service: ContractServiceDep) -> None:
    await service.delete(contract_id)