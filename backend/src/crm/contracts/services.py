from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import NotFoundError

from ..domain.repo import CounterpartyRepository  # чтобы проверить контрагента
from .domain.entities import Contract, ContractRate
from .domain.repo import ContractRepository
from .mappers import map_contract_to_response
from .schemas import ContractCreate, ContractResponse, ContractUpdate


class ContractService:
    def __init__(
            self,
            session: AsyncSession,
            repository: ContractRepository,
            counterparty_repository: CounterpartyRepository,
    ) -> None:
        self.session = session
        self.repository = repository
        self.counterparty_repository = counterparty_repository

    async def _ensure_counterparty(self, counterparty_id: UUID) -> None:
        counterparty = await self.counterparty_repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Counterparty with ID {counterparty_id} not found")

    async def create(self, data: ContractCreate) -> ContractResponse:
        await self._ensure_counterparty(data.counterparty_id)

        contract = Contract(
            counterparty_id=data.counterparty_id,
            name=data.name,
            date_start=data.date_start,
            date_end=data.date_end,
            status=data.status,
            type=data.type,
            period=data.period,
            sum=data.sum,
        )
        contract.rates = [
            ContractRate(
                contract_id=contract.id,
                type_rate=r.type_rate,
                rate=r.rate,
                unit_measurement_rate=r.unit_measurement_rate,
                hours_subscription=r.hours_subscription,
                hours_its=r.hours_its,
            )
            for r in data.rates
        ]

        await self.repository.create(contract)
        await self.session.commit()
        return map_contract_to_response(contract)

    async def get(self, contract_id: UUID) -> ContractResponse:
        contract = await self.repository.read(contract_id)
        if contract is None:
            raise NotFoundError(f"Contract with ID {contract_id} not found")
        return map_contract_to_response(contract)

    async def update(self, contract_id: UUID, data: ContractUpdate) -> ContractResponse:
        contract = await self.repository.read(contract_id)
        if contract is None:
            raise NotFoundError(f"Contract with ID {contract_id} not found")

        new_rates = None
        if data.rates is not None:
            new_rates = [
                ContractRate(
                    contract_id=contract.id,
                    type_rate=r.type_rate,
                    rate=r.rate,
                    unit_measurement_rate=r.unit_measurement_rate,
                    hours_subscription=r.hours_subscription,
                    hours_its=r.hours_its,
                )
                for r in data.rates
            ]

        contract.update(
            name=data.name,
            date_start=data.date_start,
            date_end=data.date_end,
            status=data.status,
            type=data.type,
            period=data.period,
            sum=data.sum,
            rates=new_rates,
        )
        await self.repository.update(contract)
        await self.session.commit()
        return map_contract_to_response(contract)

    async def delete(self, contract_id: UUID) -> None:
        contract = await self.repository.read(contract_id)
        if contract is None:
            raise NotFoundError(f"Contract with ID {contract_id} not found")
        await self.repository.delete(contract_id)
        await self.session.commit()