from typing import Protocol, override

from uuid import UUID

from src.shared.domain.repos import Repository
from src.shared.schemas import Page, Pagination

from ..domain.entities import Ticket
from ..schemas import TicketFilters


class TicketRepository(Repository[Ticket], Protocol):
    """Интерфейс хранилища тикетов для application-сервисов"""

    @override
    async def paginate(
            self,
            pagination: Pagination,
            filters: TicketFilters | None = None,
    ) -> Page[Ticket]: ...

    async def get_total(
            self,
            project_id: UUID | None = None,
            counterparty_id: UUID | None = None,
    ) -> int:
        """Получить количество тикетов с учётом области поиска"""

        ...

    async def get_by_reporter(
            self,
            reporter_id: UUID,
            pagination: Pagination,
    ) -> Page[Ticket]: ...
