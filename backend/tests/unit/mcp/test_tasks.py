from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition
from pydantic import ValidationError

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.shared.domain.exceptions import NotFoundError
from src.shared.domain.vo import Priority, Tag
from src.shared.schemas import Page, Pagination
from src.tasks.domain.entities import Task
from src.tasks.domain.repos import TaskView
from src.tasks.domain.vo import TaskNumber, TaskStatus
from src.tasks.mcp.schemas import TaskChanges, TaskDraft
from src.tasks.mcp.tools import (
    assign_task,
    create_task,
    get_task,
    search_tasks,
    update_task,
)
from src.tasks.schemas import TaskCreate, TaskResponse, TaskUpdate

pytestmark = pytest.mark.unit

PAGE_NUMBER = 2
PAGE_SIZE = 5
TOTAL_ITEMS = 6
STORY_POINTS = 5
ESTIMATED_HOURS = 3.5
UPDATED_ESTIMATED_HOURS = 8


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


class FakeTaskService:
    def __init__(self, response: TaskResponse) -> None:
        self.response = response
        self.calls: list[tuple[TaskCreate, Subject]] = []
        self.edit_calls: list[tuple[object, TaskUpdate, Subject]] = []
        self.assign_calls: list[tuple[object, object, Subject]] = []

    async def create(
        self,
        data: TaskCreate,
        subject: Subject,
    ) -> TaskResponse:
        self.calls.append((data, subject))
        return self.response

    async def edit(
        self,
        task_id,
        data: TaskUpdate,
        subject: Subject,
    ) -> TaskResponse:
        self.edit_calls.append((task_id, data, subject))
        return self.response

    async def assign_to(
        self,
        task_id,
        assignee_id,
        subject: Subject,
    ) -> TaskResponse:
        self.assign_calls.append((task_id, assignee_id, subject))
        return self.response


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


def make_task_response(*, created_by) -> TaskResponse:
    now = datetime.now(UTC)
    return TaskResponse(
        id=uuid4(),
        created_at=now,
        updated_at=now,
        is_archived=False,
        number="TASK-004",
        title="Создать MCP-инструмент",
        description="Проверить создание задачи",
        status=TaskStatus.TODO,
        priority=Priority.HIGH,
        story_points=STORY_POINTS,
        estimated_hours=Decimal(str(ESTIMATED_HOURS)),
        actual_hours=Decimal(0),
        due_date=date(2026, 11, 10),
        assignee_id=uuid4(),
        created_by=created_by,
        tags=[Tag(name="mcp")],
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


async def test_create_task_passes_draft_and_subject_to_service() -> None:
    subject = make_subject(UserRole.DEVELOPER)
    response = make_task_response(created_by=subject.id)
    service = FakeTaskService(response)
    draft = TaskDraft(
        title=response.title,
        description=response.description,
        priority=response.priority,
        story_points=STORY_POINTS,
        estimated_hours=ESTIMATED_HOURS,
        due_date=response.due_date,
        assignee_id=response.assignee_id,
        tags=["mcp"],
        ready_for_work=True,
    )

    result = await create_task(
        task=draft,
        subject=subject,
        service=service,
    )

    assert len(service.calls) == 1
    data, passed_subject = service.calls[0]
    assert passed_subject is subject
    assert data.title == draft.title
    assert data.priority == Priority.HIGH
    assert data.story_points == STORY_POINTS
    assert data.estimated_hours == Decimal(str(ESTIMATED_HOURS))
    assert data.assignee_id == draft.assignee_id
    assert data.tags == [Tag(name="mcp")]
    assert data.mark_as_todo is True

    assert result.id == response.id
    assert result.number == response.number
    assert result.status == TaskStatus.TODO
    assert result.story_points == STORY_POINTS
    assert str(response.id) in result.url


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


async def test_update_task_passes_changes_and_subject_to_service() -> None:
    subject = make_subject(UserRole.DEVELOPER)
    task = make_task(number="TASK-005")
    repository = FakeTaskLookupRepository(task)
    response = make_task_response(created_by=subject.id)
    service = FakeTaskService(response)
    changes = TaskChanges(
        title="Обновлённая задача MCP",
        priority=Priority.CRITICAL,
        estimated_hours=UPDATED_ESTIMATED_HOURS,
        due_date=date(2026, 11, 15),
    )

    result = await update_task(
        task="task-005",
        changes=changes,
        subject=subject,
        task_repo=repository,
        service=service,
    )

    assert repository.number_calls == [TaskNumber("TASK-005")]
    assert repository.read_calls == []
    assert len(service.edit_calls) == 1

    task_id, data, passed_subject = service.edit_calls[0]
    assert task_id == task.id
    assert passed_subject is subject
    assert data.title == changes.title
    assert data.priority == Priority.CRITICAL
    assert data.estimated_hours == UPDATED_ESTIMATED_HOURS
    assert data.due_date == changes.due_date
    assert data.description is None
    assert data.story_points is None

    assert result.id == response.id
    assert result.number == response.number


def test_task_changes_requires_at_least_one_field() -> None:
    with pytest.raises(ValidationError, match="At least one task field"):
        TaskChanges()


async def test_assign_task_passes_assignee_and_subject_to_service() -> None:
    subject = make_subject(UserRole.DEVELOPER)
    assignee_id = uuid4()
    task = make_task(number="TASK-006")
    repository = FakeTaskLookupRepository(task)
    response = make_task_response(created_by=subject.id)
    service = FakeTaskService(response)

    result = await assign_task(
        task="task-006",
        assignee_id=assignee_id,
        subject=subject,
        task_repo=repository,
        service=service,
    )

    assert repository.number_calls == [TaskNumber("TASK-006")]
    assert repository.read_calls == []
    assert service.assign_calls == [(task.id, assignee_id, subject)]
    assert result.id == response.id
    assert result.number == response.number
