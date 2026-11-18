from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, select, text

from src.core.database import session_factory
from src.shared.domain.vo import Priority
from src.shared.utils.time import current_datetime
from src.tasks.domain.vo import TaskStatus
from src.tasks.infra.models import TaskOrm
from src.tickets.domain.vo import TicketStatus, TicketType
from src.tickets.infra.models import TicketOrm


def make_ticket(ticket_id: UUID, number: str) -> dict[str, object]:
    return {
        "id": ticket_id,
        "created_by": uuid4(),
        "reporter_id": uuid4(),
        "number": number,
        "title": "Test ticket",
        "description": "Test description",
        "ticket_type": TicketType.SERVICE_REQUEST,
        "status": TicketStatus.NEW,
        "priority": Priority.MEDIUM,
        "tags": [],
    }


def make_task(number: str, ticket_id: UUID, *, archived: bool = False) -> dict[str, object]:
    return {
        "id": uuid4(),
        "ticket_id": ticket_id,
        "number": number,
        "title": "Test task",
        "status": TaskStatus.BACKLOG,
        "priority": Priority.MEDIUM,
        "actual_hours": 0,
        "created_by": uuid4(),
        "tags": [],
        "deleted_at": current_datetime() if archived else None,
    }


@pytest.mark.integration
async def test_has_tasks_ignores_archived_tasks() -> None:
    suffix = uuid4().hex[:8]
    active_ticket_id = uuid4()
    archived_only_ticket_id = uuid4()
    empty_ticket_id = uuid4()

    async with session_factory() as session:
        transaction = await session.begin()
        try:
            index_result = await session.execute(
                text(
                    """
                    SELECT indexdef
                    FROM pg_indexes
                    WHERE schemaname = current_schema()
                      AND tablename = 'tasks'
                      AND indexname = 'ix_tasks_ticket_id_active'
                    """
                )
            )
            index_definition = " ".join(
                index_result.scalar_one().lower().split()
            )

            assert "(ticket_id)" in index_definition
            assert "ticket_id is not null" in index_definition
            assert "deleted_at is null" in index_definition

            await session.execute(
                insert(TicketOrm.__table__),
                (
                    make_ticket(active_ticket_id, f"T-{suffix}-1"),
                    make_ticket(archived_only_ticket_id, f"T-{suffix}-2"),
                    make_ticket(empty_ticket_id, f"T-{suffix}-3"),
                ),
            )
            await session.execute(
                insert(TaskOrm.__table__),
                (
                    make_task(f"TASK-{suffix}-1", active_ticket_id),
                    make_task(
                        f"TASK-{suffix}-2",
                        archived_only_ticket_id,
                        archived=True,
                    ),
                ),
            )

            result = await session.execute(
                select(TicketOrm.id, TicketOrm.has_tasks).where(
                    TicketOrm.id.in_(
                        (active_ticket_id, archived_only_ticket_id, empty_ticket_id)
                    )
                )
            )
            has_tasks_by_ticket = dict(result.all())

            assert has_tasks_by_ticket[active_ticket_id] is True
            assert has_tasks_by_ticket[archived_only_ticket_id] is False
            assert has_tasks_by_ticket[empty_ticket_id] is False
        finally:
            await transaction.rollback()
