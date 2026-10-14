import asyncio
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition, Group

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.shared.schemas import Page, Pagination
from src.tickets.data_loaders import ReferenceLoader
from src.tickets.services import TicketQueryService


class CapturingTicketRepository:
    def __init__(self) -> None:
        self.query = None

    async def paginate(self, pagination: Pagination, query=None):
        self.query = query
        return Page.create([], 0, pagination.page, pagination.size)


def load_nothing(_ids):
    return asyncio.sleep(0, result=[])


@pytest.fixture
def ticket_query_service():
    repository = CapturingTicketRepository()
    loader = ReferenceLoader(
        users_loader=load_nothing,
        counterparties_loader=load_nothing,
        projects_loader=load_nothing,
    )
    return TicketQueryService(repository, loader), repository


@pytest.mark.asyncio
async def test_customer_scope_is_combined_with_requested_filter(
    ticket_query_service,
) -> None:
    service, repository = ticket_query_service
    counterparty_id = uuid4()
    requested_filter = Condition(field="status", op="$eq", value="open")
    subject = Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[UserRole.CUSTOMER],
        counterparty_id=counterparty_id,
    )

    await service.get_tickets(
        Pagination(page=1, size=10),
        query=requested_filter,
        current_subject=subject,
    )

    assert isinstance(repository.query, Group)
    assert repository.query.filters == (
        requested_filter,
        Condition(field="counterpartyId", op="$eq", value=counterparty_id),
    )


@pytest.mark.asyncio
async def test_customer_without_counterparty_cannot_search_tickets(
    ticket_query_service,
) -> None:
    service, _ = ticket_query_service
    subject = Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[UserRole.CUSTOMER],
    )

    with pytest.raises(PermissionDeniedError, match="associated with a counterparty"):
        await service.get_tickets(
            Pagination(page=1, size=10),
            current_subject=subject,
        )
