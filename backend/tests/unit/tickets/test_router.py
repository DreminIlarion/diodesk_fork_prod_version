from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from src.tickets.domain.vo import TicketStatus
from src.tickets.router import change_ticket_status
from src.tickets.schemas import TicketStatusChange


@pytest.mark.parametrize(
    ("target_status", "method_name"),
    [
        (TicketStatus.PENDING_APPROVAL, "submit_for_approval"),
        (TicketStatus.OPEN, "approve"),
        (TicketStatus.IN_PROGRESS, "start_progress"),
        (TicketStatus.WAITING, "wait"),
        (TicketStatus.RESOLVED, "resolve"),
        (TicketStatus.CLOSED, "close"),
        (TicketStatus.CANCELED, "cancel"),
        (TicketStatus.REJECTED, "reject"),
        (TicketStatus.REOPENED, "reopen"),
    ],
)
@pytest.mark.asyncio
async def test_change_ticket_status_dispatches_to_service(
    target_status,
    method_name,
):
    ticket_id = uuid4()
    current_subject = MagicMock()
    expected_response = MagicMock()

    service = MagicMock()
    handler = AsyncMock(return_value=expected_response)
    setattr(service, method_name, handler)

    response = await change_ticket_status(
        ticket_id=ticket_id,
        data=TicketStatusChange(status=target_status),
        current_subject=current_subject,
        service=service,
    )

    assert response is expected_response
    handler.assert_awaited_once_with(ticket_id, current_subject)


@pytest.mark.asyncio
async def test_change_ticket_status_rejects_unsupported_status():
    with pytest.raises(HTTPException) as exc_info:
        await change_ticket_status(
            ticket_id=uuid4(),
            data=TicketStatusChange(status=TicketStatus.NEW),
            current_subject=MagicMock(),
            service=MagicMock(),
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == "Unsupported target status: new"
