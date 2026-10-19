from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from ddf.application.dsl import Condition, Group, Negation, Search
from ddf.application.dtos import OffsetPagination, Sort
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient

from src.iam.dependencies import get_current_subject
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.vo import UserRole
from src.shared.domain.vo import Priority
from src.shared.schemas import Pagination
from src.tasks.domain.vo import TaskStatus
from src.tasks.infra.models import TaskOrm
from src.tasks.infra.repos import SqlTaskRepository
from src.tickets.dependencies import get_ticket_repo
from src.tickets.domain.vo import TicketStatus, TicketType
from src.tickets.infra.models import TicketOrm
from src.tickets.infra.repos import SqlTicketRepository

pytestmark = pytest.mark.integration


def _ticket(
    *,
    project_id: UUID,
    title: str,
    status: TicketStatus = TicketStatus.OPEN,
    priority: Priority = Priority.HIGH,
    created_at: datetime | None = None,
    tags: list[str] | None = None,
) -> TicketOrm:
    timestamp = created_at or datetime.now(UTC)
    return TicketOrm(
        id=uuid4(),
        created_at=timestamp,
        updated_at=timestamp,
        project_id=project_id,
        created_by=uuid4(),
        reporter_id=uuid4(),
        number=f"INT-26-{int(uuid4()) % 100_000_000:08d}",
        title=title,
        description=f"Description for {title}",
        ticket_type=TicketType.INCIDENT,
        status=status,
        priority=priority,
        tags=[{"name": tag, "color": "#3498db"} for tag in tags or []],
    )


def _task(
    *,
    project_id: UUID,
    title: str,
    due_date: date,
    status: TaskStatus = TaskStatus.TODO,
) -> TaskOrm:
    return TaskOrm(
        id=uuid4(),
        project_id=project_id,
        number=f"TASK-{int(uuid4()) % 1_000_000_000:09d}",
        title=title,
        description=f"Description for {title}",
        status=status,
        priority=Priority.HIGH,
        actual_hours=0,
        due_date=due_date,
        created_by=uuid4(),
        tags=[],
    )


async def test_ticket_repository_executes_nested_ddf_filter_on_postgres(session) -> None:
    project_id = uuid4()
    matching = _ticket(
        project_id=project_id,
        title="Printer outage",
        created_at=datetime(2026, 1, 2, tzinfo=UTC),
    )
    excluded_by_negation = _ticket(
        project_id=project_id,
        title="Printer toner replacement",
        priority=Priority.LOW,
        created_at=datetime(2026, 1, 3, tzinfo=UTC),
    )
    excluded_by_search = _ticket(
        project_id=project_id,
        title="Network outage",
        status=TicketStatus.NEW,
        created_at=datetime(2026, 1, 3, tzinfo=UTC),
    )
    session.add_all((matching, excluded_by_negation, excluded_by_search))
    await session.flush()

    query = Group(
        op="$and",
        filters=(
            Condition(field="projectId", op="$eq", value=str(project_id)),
            Group(
                op="$or",
                filters=(
                    Condition(field="status", op="$eq", value=TicketStatus.OPEN.value),
                    Condition(field="status", op="$eq", value=TicketStatus.NEW.value),
                ),
            ),
            Negation(
                filter=Condition(
                    field="priority",
                    op="$eq",
                    value=Priority.LOW.value,
                )
            ),
            Condition(
                field="createdAt",
                op="$gte",
                value="2026-01-01T00:00:00Z",
            ),
            Search(query="printer"),
        ),
    )

    page = await SqlTicketRepository(session).find(
        OffsetPagination(page=1, size=10),
        query=query,
        sort=Sort(field="created_at", direction="asc"),
    )

    assert [ticket.id for ticket in page.items] == [matching.id]


async def test_ticket_repository_executes_tag_in_and_nin_on_postgres(session) -> None:
    project_id = uuid4()
    tagged = _ticket(
        project_id=project_id,
        title="Tagged ticket",
        tags=["hardware", "urgent"],
    )
    untagged = _ticket(
        project_id=project_id,
        title="Other ticket",
        tags=["finance"],
    )
    session.add_all((tagged, untagged))
    await session.flush()

    repository = SqlTicketRepository(session)
    project_filter = Condition(field="projectId", op="$eq", value=str(project_id))

    included = await repository.find(
        OffsetPagination(page=1, size=10),
        query=Group(
            op="$and",
            filters=(
                project_filter,
                Condition(field="tags", op="$in", value=["hardware", "missing"]),
            ),
        ),
    )
    excluded = await repository.find(
        OffsetPagination(page=1, size=10),
        query=Group(
            op="$and",
            filters=(
                project_filter,
                Condition(field="tags", op="$nin", value=["hardware"]),
            ),
        ),
    )

    assert {ticket.id for ticket in included.items} == {tagged.id}
    assert {ticket.id for ticket in excluded.items} == {untagged.id}


async def test_task_repository_executes_iso_date_filter_on_postgres(session) -> None:
    project_id = uuid4()
    overdue = _task(
        project_id=project_id,
        title="Overdue task",
        due_date=date(2026, 10, 10),
    )
    future = _task(
        project_id=project_id,
        title="Future task",
        due_date=date(2026, 10, 20),
    )
    session.add_all((overdue, future))
    await session.flush()

    grouped = await SqlTaskRepository(session).get_grouped_by_status(
        Pagination(page=1, size=10),
        query=Group(
            op="$and",
            filters=(
                Condition(field="projectId", op="$eq", value=str(project_id)),
                Condition(field="dueDate", op="$lt", value="2026-10-14"),
                Condition(field="status", op="$eq", value=TaskStatus.TODO.value),
            ),
        ),
    )

    assert [task.id for task in grouped[TaskStatus.TODO].items] == [overdue.id]
    assert grouped[TaskStatus.TODO].total_items == 1


async def test_unknown_dsl_field_returns_http_400_with_real_repository(session) -> None:
    from main import value_exception_handler
    from src.tickets.router import router as ticket_router

    test_app = FastAPI()
    test_app.include_router(ticket_router, prefix="/api/v1")
    test_app.add_exception_handler(ValueError, value_exception_handler)

    subject = Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[UserRole.ADMIN],
    )
    test_app.dependency_overrides[get_current_subject] = lambda: subject
    test_app.dependency_overrides[get_ticket_repo] = lambda: SqlTicketRepository(session)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=test_app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/tickets/search?page=1&size=10",
                json={"field": "passwordHash", "op": "$eq", "value": "secret"},
            )
    finally:
        test_app.dependency_overrides.pop(get_current_subject, None)
        test_app.dependency_overrides.pop(get_ticket_repo, None)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "Unknown filter field" in response.json()["error"]["message"]
