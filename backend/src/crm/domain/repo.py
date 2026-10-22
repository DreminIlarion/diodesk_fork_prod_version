from typing import override

from dataclasses import dataclass
from uuid import UUID

from src.iam.domain.entities import User
from src.products.domain.entities import SoftwareProduct
from src.shared.domain.repos import Repository
from src.shared.schemas import Page, Pagination

from .entities import Counterparty, CounterpartyProduct
from .vo import Inn


@dataclass(frozen=True)
class CounterpartyFilters:
    search_query: str | None = None
    email: str | None = None
    inn: Inn | None = None


class CounterpartyRepository(Repository[Counterparty]):

    @override
    async def paginate(
            self, pagination: Pagination, filters: CounterpartyFilters | None = None,
    ) -> Page[Counterparty]: ...

    async def get_by_email(self, email: str) -> Counterparty | None: ...

    async def get_by_inn(self, inn: Inn) -> Counterparty | None: ...

    async def get_with_descendants(self, counterparty_id: UUID) -> list[Counterparty]:
        """
        Нахождение контрагента и всех его суб-компании (филиалов, дочерних отделов).
        Принимает ID головного контрагента и возвращает плоский список.
        """

    async def get_customers(self, counterparty_id: UUID, params: Pagination) -> Page[User]:
        """Получение клиентов контрагента"""

    async def get_product(self, product_id: UUID) -> SoftwareProduct | None: ...

    async def get_product_link_by_serial(
            self, serial_number: str
    ) -> CounterpartyProduct | None: ...

    async def read_product_link(
            self, counterparty_id: UUID, link_id: UUID
    ) -> CounterpartyProduct | None: ...

    async def link_product(self, link: CounterpartyProduct) -> CounterpartyProduct:
        """
        Привязка программного продукта к контрагенту
        """

    async def update_product_link(self, link: CounterpartyProduct) -> None: ...

    async def unlink_product(self, counterparty_id: UUID, link_id: UUID) -> bool: ...

    async def get_products(
            self, counterparty_id: UUID, params: Pagination
    ) -> Page[CounterpartyProduct]:
        """
        Получение программных продуктов, которые используются контрагентом
        """
