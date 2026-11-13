from typing import override
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from src.shared.infra.repos import ModelMapper, SqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Contract, ContractRate
from ..domain.repo import ContractFilters
from .models import ContractOrm, ContractRateOrm


class ContractMapper(ModelMapper[Contract, ContractOrm]):

    @staticmethod
    def to_entity(model: ContractOrm) -> Contract:
        return Contract(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            counterparty_id=model.counterparty_id,
            name=model.name,
            date_start=model.date_start,
            date_end=model.date_end,
            status=model.status,
            type=model.type,
            period=model.period,
            sum=model.sum,
            rates=[
                ContractRate(
                    id=rate.id,
                    created_at=rate.created_at,
                    updated_at=rate.updated_at,
                    deleted_at=rate.deleted_at,
                    contract_id=model.id,
                    type_rate=rate.type_rate,
                    rate=rate.rate,
                    unit_measurement_rate=rate.unit_measurement_rate,
                    hours_subscription=rate.hours_subscription,
                    hours_its=rate.hours_its,
                )
                for rate in model.rates
            ],
        )

    @staticmethod
    def from_entity(entity: Contract) -> ContractOrm:
        return ContractOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            counterparty_id=entity.counterparty_id,
            name=entity.name,
            date_start=entity.date_start,
            date_end=entity.date_end,
            status=entity.status,
            type=entity.type,
            period=entity.period,
            sum=entity.sum,
            rates=[
                ContractRateOrm(
                    id=rate.id,
                    created_at=rate.created_at,
                    updated_at=rate.updated_at,
                    deleted_at=rate.deleted_at,
                    contract_id=entity.id,
                    type_rate=rate.type_rate,
                    rate=rate.rate,
                    unit_measurement_rate=rate.unit_measurement_rate,
                    hours_subscription=rate.hours_subscription,
                    hours_its=rate.hours_its,
                )
                for rate in entity.rates
            ],
        )


class SqlContractRepository(SqlAlchemyRepository[Contract, ContractOrm]):
    model = ContractOrm
    model_mapper = ContractMapper

    @override
    async def paginate(
            self, pagination: Pagination, filters: ContractFilters | None = None,
    ) -> Page[Contract]:
        stmt = select(self.model).options(selectinload(self.model.rates))

        if filters and filters.counterparty_id is not None:
            stmt = stmt.where(self.model.counterparty_id == filters.counterparty_id)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt)
        if not total:
            return Page.create([], 0, pagination.page, pagination.size)

        stmt = (
            stmt.order_by(self.model.created_at.desc())
            .offset(pagination.offset)
            .limit(pagination.size)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        items = [self.model_mapper.to_entity(m) for m in models]
        return Page.create(items, total, pagination.page, pagination.size)

    async def list_by_counterparty(self, counterparty_id: UUID) -> list[Contract]:
        stmt = (
            select(self.model)
            .options(selectinload(self.model.rates))
            .where(self.model.counterparty_id == counterparty_id)
        )
        result = await self.session.execute(stmt)
        return [self.model_mapper.to_entity(m) for m in result.scalars().all()]