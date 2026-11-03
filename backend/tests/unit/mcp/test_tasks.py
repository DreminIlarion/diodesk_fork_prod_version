from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.shared.domain.exceptions import NotFoundError
from src.shared.domain.vo import Priority, Tag
from src.shared.schemas import Page, Pagination
from src.tasks.domain.entities import Task
from src.tasks.domain.repos import TaskView
from src.tasks.domain.vo import TaskNumber, TaskStatus
from src.tasks.mcp.tools import get_task, search_tasks

pytestmark = pytest.mark.unit

PAGE_NUMBER = 2
PAGE_SIZE = 5
TOTAL_ITEMS = 6
STORY_POINTS = 5
ESTIMATED_HOURS = 3.5


class FakeTaskRepository:
    def __init__(self, page: Page[TaskView]) -> None:
        self.page = page
        self.calls: list[tuple[Pagination, object | None]] = []

    async def search(
        self,
        pagination: Pagination,
        *,
        query: object | None = None,
    ) -> Page[TaskView]:
        self.calls.append((pagination, query))
        return self.page


class FakeTaskLookupRepository:
    def __init__(self, task: Task | None) -> None:
        self.task = task
        self.read_calls = []
        self.number_calls = []

    async def read(self, task_id):
        self.read_calls.append(task_id)
        return self.task

    async def get_by_number(self, number):
        self.number_calls.append(number)
        return self.task


def make_subject(role: UserRole) -> Subject:
    return Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[role],
    )


def make_task_view() -> TaskView:
    now = datetime.now(UTC)
    return TaskView(
        id=uuid4(),
        created_at=now,
        updated_at=now,
        number=TaskNumber("TASK-001"),
        title="Проверить MCP",
        description="Проверить универсальный поиск задач",
        status=TaskStatus.TODO,
        priority=Priority.HIGH,
        assignee_id=uuid4(),
        story_points=Decimal(STORY_POINTS),
        estimated_hours=Decimal(str(ESTIMATED_HOURS)),
        project_id=uuid4(),
        stage_id=uuid4(),
        tags={Tag(name="mcp"), Tag(name="backend")},
    )


def make_task(
    *,
    number: str,
    status: TaskStatus = TaskStatus.BACKLOG,
    project_id=None,
    stage_id=None,
    tags=None,
) -> Task:
    return Task(
        id=uuid4(),
        number=TaskNumber(number),
        title="Тестовая задача",
        status=status,
        priority=Priority.MEDIUM,
        created_by=uuid4(),
        project_id=project_id,
        stage_id=stage_id,
        tags=tags or set(),
    )


async def test_search_tasks_passes_ddf_query_and_pagination() -> None:
    task = make_task_view()
    repository = FakeTaskRepository(
        Page.create(
            [task],
            total_items=TOTAL_ITEMS,
            page=PAGE_NUMBER,
            size=PAGE_SIZE,
        )
    )
    query = Condition(
        field="assigneeId",
        op="$eq",
        value=task.assignee_id,
    )

    result = await search_tasks(
        query=query,
        page=PAGE_NUMBER,
        size=PAGE_SIZE,
        subject=make_subject(UserRole.DEVELOPER),
        task_repo=repository,
    )

    assert repository.calls == [
        (Pagination(page=PAGE_NUMBER, size=PAGE_SIZE), query)
    ]
    assert result.total_items == TOTAL_ITEMS
    assert result.page == PAGE_NUMBER
    assert len(result.items) == 1

    found = result.items[0]
    assert found.id == task.id
    assert found.number == "TASK-001"
    assert found.assignee_id == task.assignee_id
    assert found.story_points == STORY_POINTS
    assert found.estimated_hours == pytest.approx(ESTIMATED_HOURS)
    assert found.tags == ["backend", "mcp"]
    assert str(task.id) in found.url


async def test_search_tasks_allows_empty_filter() -> None:
    repository = FakeTaskRepository(Page.create([], total_items=0, page=1, size=20))

    result = await search_tasks(
        query=None,
        page=1,
        size=20,
        subject=make_subject(UserRole.SUPPORT_AGENT),
        task_repo=repository,
    )

    assert repository.calls == [(Pagination(page=1, size=20), None)]
    assert result.items == []


async def test_search_tasks_denies_customer() -> None:
    repository = FakeTaskRepository(Page.create([], total_items=0, page=1, size=20))

    with pytest.raises(PermissionDeniedError, match="Require staff user"):
        await search_tasks(
            query=None,
            page=1,
            size=20,
            subject=make_subject(UserRole.CUSTOMER),
            task_repo=repository,
        )

    assert repository.calls == []


async def test_get_task_finds_by_human_readable_number() -> None:
    task = make_task(
        number="TASK-001",
        status=TaskStatus.TODO,
        project_id=uuid4(),
        stage_id=uuid4(),
        tags={Tag(name="mcp")},
    )
    repository = FakeTaskLookupRepository(task)

    result = await get_task(
        task="task-001",
        subject=make_subject(UserRole.DEVELOPER),
        task_repo=repository,
    )

    assert repository.number_calls == [TaskNumber("TASK-001")]
    assert repository.read_calls == []
    assert result.id == task.id
    assert result.number == "TASK-001"
    assert result.status_label == "Готово к выполнению"
    assert TaskStatus.IN_PROGRESS in result.next_statuses
    assert result.project_id == task.project_id
    assert result.stage_id == task.stage_id
    assert result.tags == ["mcp"]
    assert str(task.id) in result.url


async def test_get_task_finds_by_uuid() -> None:
    task = make_task(number="TASK-002")
    repository = FakeTaskLookupRepository(task)

    result = await get_task(
        task=str(task.id),
        subject=make_subject(UserRole.SUPPORT_AGENT),
        task_repo=repository,
    )

    assert repository.read_calls == [task.id]
    assert repository.number_calls == []
    assert result.id == task.id


async def test_get_task_returns_not_found_for_invalid_reference() -> None:
    repository = FakeTaskLookupRepository(None)

    with pytest.raises(NotFoundError, match="not found"):
        await get_task(
            task="not a task number",
            subject=make_subject(UserRole.DEVELOPER),
            task_repo=repository,
        )

    assert repository.read_calls == []
    assert repository.number_calls == []


async def test_get_task_denies_customer() -> None:
    task = make_task(number="TASK-003")
    repository = FakeTaskLookupRepository(task)

    with pytest.raises(PermissionDeniedError, match="Require staff user"):
        await get_task(
            task="TASK-003",
            subject=make_subject(UserRole.CUSTOMER),
            task_repo=repository,
        )
