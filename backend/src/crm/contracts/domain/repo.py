from dataclasses import dataclass
from typing import override
from uuid import UUID

from src.shared.domain.repos import Repository
from src.shared.schemas import Page, Pagination

from .entities import Contract


@dataclass(frozen=True)
class ContractFilters:
    counterparty_id: UUID | None = None
    project_id: UUID | None = None


class ContractRepository(Repository[Contract]):

    @override
    async def paginate(
            self, pagination: Pagination, filters: ContractFilters | None = None,
    ) -> Page[Contract]: ...

    async def list_by_counterparty(self, counterparty_id: UUID) -> list[Contract]: ...

    async def get_project_ids(self, contract_id: UUID) -> list[UUID]: ...

    async def set_project_ids(self, contract_id: UUID, project_ids: list[UUID]) -> None: ...