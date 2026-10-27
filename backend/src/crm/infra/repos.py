from typing import override

from uuid import UUID, uuid4

from sqlalchemy import Select, and_, delete, func, or_, select
from sqlalchemy.orm import joinedload

from src.iam.domain.entities import User
from src.iam.domain.vo import FullName
from src.products.domain.entities import SoftwareProduct
from src.products.infra.models import SoftwareProductOrm
from src.products.infra.repo import SoftwareProductMapper
from src.shared.infra.repos import ModelMapper, SqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Counterparty, CounterpartyProduct
from ..domain.repo import CounterpartyFilters
from ..domain.vo import ContactPerson, Inn, Kpp, Okpo, Phone
from .models import CounterpartyOrm, CounterpartyProductOrm


class CounterpartyMapper(ModelMapper[Counterparty, CounterpartyOrm]):

    @staticmethod
    def to_entity(model: CounterpartyOrm) -> Counterparty:
        return Counterparty(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            counterparty_type=model.counterparty_type,
            name=model.name,
            legal_name=model.legal_name,
            inn=Inn(model.inn),
            kpp=None if model.kpp is None else Kpp(model.kpp),
            okpo=None if model.okpo is None else Okpo(model.okpo),
            phone=None if model.phone is None else Phone(model.phone),
            email=model.email,
            address=model.address,
            avatar_url=model.avatar_url,
            contact_persons=[
                ContactPerson(
                    id=UUID(contact_person["id"]) if contact_person.get("id") else uuid4(),
                    full_name=FullName(contact_person["full_name"]),
                    phone=Phone(contact_person["phone"]) if contact_person["phone"] else None,
                    email=contact_person["email"],
                    position=contact_person.get("position"),
                    extension=contact_person.get("extension"),
                    messengers=contact_person["messengers"],
                )
                for contact_person in model.contact_persons
            ],
            is_active=model.is_active,
            parent_id=model.parent_id,
        )

    @staticmethod
    def from_entity(entity: Counterparty) -> CounterpartyOrm:
        return CounterpartyOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            counterparty_type=entity.counterparty_type,
            name=entity.name,
            legal_name=entity.legal_name,
            inn=entity.inn.value,
            kpp=None if entity.kpp is None else entity.kpp.value,
            okpo=None if entity.okpo is None else entity.okpo.value,
            phone=entity.phone.value,
            email=entity.email,
            address=entity.address,
            avatar_url=entity.avatar_url,
            contact_persons=[
                {
                    "id": str(contact_person.id),
                    "full_name": contact_person.full_name.value,
                    "phone": contact_person.phone.value if contact_person.phone else None,
                    "email": contact_person.email,
                    "position": contact_person.position,
                    "extension": contact_person.extension,
                    "messengers": contact_person.messengers,
                }
                for contact_person in entity.contact_persons
            ],
            is_active=entity.is_active,
            parent_id=entity.parent_id,
        )


class CounterpartyProductMapper(
    ModelMapper[CounterpartyProduct, CounterpartyProductOrm]
):
    @staticmethod
    def to_entity(model: CounterpartyProductOrm) -> CounterpartyProduct:
        return CounterpartyProduct(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            counterparty_id=model.counterparty_id,
            product_id=model.product_id,
            serial_number=model.serial_number,
            product=SoftwareProductMapper.to_entity(model.product),
        )

    @staticmethod
    def from_entity(entity: CounterpartyProduct) -> CounterpartyProductOrm:
        return CounterpartyProductOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            counterparty_id=entity.counterparty_id,
            product_id=entity.product_id,
            serial_number=entity.serial_number,
        )


class SqlCounterpartyRepository(SqlAlchemyRepository[Counterparty, CounterpartyOrm]):
    model = CounterpartyOrm
    model_mapper = CounterpartyMapper

    def _apply_counterparty_filters(
            self, stmt: Select[tuple[CounterpartyOrm]], filters: CounterpartyFilters,
    ) -> Select[tuple[CounterpartyOrm]]:
        conditions = []

        if filters.search_query and filters.search_query.strip():
            search_query = filters.search_query.strip()

            if search_query.isdigit():
                conditions.append(self.model.inn.ilike(f"{search_query}%"))
            else:
                pattern = f"%{search_query}%"
                conditions.append(
                    or_(self.model.name.ilike(pattern), self.model.legal_name.ilike(pattern))
                )

        if filters.email:
            conditions.append(self.model.email == filters.email)

        if filters.inn:
            conditions.append(self.model.inn == filters.inn.value)

        if conditions:
            stmt = stmt.where(and_(*conditions))

        return stmt

    @override
    async def paginate(
            self, pagination: Pagination, filters: CounterpartyFilters | None = None,
    ) -> Page[Counterparty]:
        stmt = select(self.model)

        if filters:
            stmt = self._apply_counterparty_filters(stmt, filters)

        return await self._paginate(stmt, pagination)

    async def get_by_email(self, email: str) -> Counterparty | None:
        stmt = (
            select(self.model)
            .where(
                (self.model.email == email) &
                (self.model.parent_id.is_(None))
            )
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_by_inn(self, inn: Inn) -> Counterparty | None:
        stmt = (
            select(self.model)
            .where(
                (self.model.inn == inn.value) &
                (self.model.parent_id.is_(None))
            )
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_with_descendants(self, counterparty_id: UUID) -> list[Counterparty]:
        # 1. Запрос для выбора корневого элемента
        recursive_cte = (
            select(self.model)
            .where(self.model.id == counterparty_id)
            .cte(name="counterparty_tree", recursive=True)
        )

        # 2. Рекурсивная часть: присоединение детей и найденных родителей
        recursive_cte = recursive_cte.union_all(
            select(self.model).join(recursive_cte, self.model.parent_id == recursive_cte.c.id)
        )

        # 3. Финальный запрос из CTE
        stmt = select(self.model).from_statement(select(recursive_cte))

        # 4. Выполнение запроса и преобразование результата
        results = await self.session.execute(stmt)
        models = results.scalars().all()
        return [self.model_mapper.to_entity(model) for model in models]

    async def get_customers(self, counterparty_id: UUID, params: Pagination) -> Page[User]:
        from ...iam.infra.models import UserOrm
        from ...iam.infra.repos import UserMapper

        # 1. Основной запрос
        stmt = select(UserOrm).where(UserOrm.counterparty_id == counterparty_id)

        # 2. Получение количества клиентов
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = await self.session.scalar(count_stmt)
        if total == 0:
            return Page.create([], total, params.page, params.size)

        # 3. Получение списка клиентов
        stmt = stmt.offset(params.offset).limit(params.size)
        results = await self.session.execute(stmt)
        models = results.scalars().all()

        # 4. Расчёт результата
        items = [UserMapper.to_entity(model) for model in models]
        return Page.create(items, total, params.page, params.size)

    async def get_product(self, product_id: UUID) -> SoftwareProduct | None:
        model = await self.session.get(SoftwareProductOrm, product_id)
        return None if model is None else SoftwareProductMapper.to_entity(model)

    async def get_product_link_by_serial(
            self, serial_number: str
    ) -> CounterpartyProduct | None:
        stmt = (
            select(CounterpartyProductOrm)
            .options(joinedload(CounterpartyProductOrm.product))
            .where(CounterpartyProductOrm.serial_number == serial_number)
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else CounterpartyProductMapper.to_entity(model)

    async def read_product_link(
            self, counterparty_id: UUID, link_id: UUID
    ) -> CounterpartyProduct | None:
        stmt = (
            select(CounterpartyProductOrm)
            .options(joinedload(CounterpartyProductOrm.product))
            .where(
                CounterpartyProductOrm.id == link_id,
                CounterpartyProductOrm.counterparty_id == counterparty_id,
            )
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else CounterpartyProductMapper.to_entity(model)

    async def link_product(self, link: CounterpartyProduct) -> CounterpartyProduct:
        self.session.add(CounterpartyProductMapper.from_entity(link))
        return link

    async def update_product_link(self, link: CounterpartyProduct) -> None:
        model = await self.session.get(CounterpartyProductOrm, link.id)
        if model is not None:
            model.serial_number = link.serial_number
            model.updated_at = link.updated_at

    async def unlink_product(self, counterparty_id: UUID, link_id: UUID) -> bool:
        stmt = (
            delete(CounterpartyProductOrm)
            .where(
                CounterpartyProductOrm.counterparty_id == counterparty_id,
                CounterpartyProductOrm.id == link_id,
            )
            .returning(CounterpartyProductOrm.id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_products(
            self, counterparty_id: UUID, pagination: Pagination,
    ) -> Page[CounterpartyProduct]:
        stmt = (
            select(CounterpartyProductOrm)
            .options(joinedload(CounterpartyProductOrm.product))
            .where(
                CounterpartyProductOrm.counterparty_id == counterparty_id,
                CounterpartyProductOrm.deleted_at.is_(None),
            )
        )

        # 2. Подсчёт общего количества записей удовлетворяющих запросу
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_items = await self.session.scalar(count_stmt)
        if total_items == 0:
            return Page.create([], total_items, pagination.page, pagination.size)

        stmt = (
            stmt
            .order_by(CounterpartyProductOrm.created_at.desc())
            .offset(pagination.offset)
            .limit(pagination.size)
        )
        results = await self.session.execute(stmt)
        models = results.scalars().all()

        items = [CounterpartyProductMapper.to_entity(model) for model in models]

        return Page.create(items, total_items, pagination.page, pagination.size)
