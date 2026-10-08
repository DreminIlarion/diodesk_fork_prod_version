from typing import Annotated

from uuid import UUID

from pydantic import Field

from src.shared.domain.exceptions import NotFoundError

from ..domain.entities import Ticket
from ..domain.repos import TicketRepository
from ..domain.vo import TicketNumber

TicketRef = Annotated[
    str,
    Field(
        min_length=1,
        description="Номер заявки (например, INT-26-00000012) или её UUID",
    ),
]


async def find_ticket(ticket_repo: TicketRepository, reference: str) -> Ticket:
    """Находит заявку по UUID или человеко-читаемому номеру."""

    reference = reference.strip()
    try:
        ticket_id = UUID(reference)
    except ValueError:
        ticket = await ticket_repo.get_by_number(TicketNumber(reference.upper()))
    else:
        ticket = await ticket_repo.read(ticket_id)

    if ticket is None:
        raise NotFoundError(f"Ticket '{reference}' not found")

    return ticket
