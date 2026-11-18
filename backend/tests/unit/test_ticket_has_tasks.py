from uuid import uuid4

import pytest

from src.tickets.domain.entities import Ticket
from src.tickets.domain.vo import TicketNumber
from src.tickets.mappers import map_ticket_to_response


@pytest.mark.parametrize("has_tasks", [False, True])
def test_ticket_response_contains_has_tasks(has_tasks: bool) -> None:
    ticket = Ticket.create(
        number=TicketNumber("TEST-26-00000001"),
        reporter_id=uuid4(),
        created_by=uuid4(),
        title="Test ticket",
        description="Test description",
    )
    ticket.has_tasks = has_tasks

    response = map_ticket_to_response(ticket)

    assert response.has_tasks is has_tasks
