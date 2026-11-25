from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call
from uuid import UUID, uuid4

import pytest

from src.activity_logs.recorder import ActivityLogRecorder
from src.iam.domain.authz import PermissionResult, Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.repos import UserRepository
from src.iam.domain.vo import UserRole
from src.projects.domain.repos import ProjectRepository
from src.projects.domain.vo import ProjectKey
from src.shared.domain.events import EventPublisher
from src.shared.domain.exceptions import InvalidStateError, NotFoundError
from src.shared.domain.repos import UnitOfWork
from src.shared.domain.vo import Priority
from src.shared.utils.time import current_datetime
from src.tasks.domain.authz import TaskAuthZService
from src.tasks.domain.events import TaskParentChanged
from src.tasks.domain.repos import TaskLinks, TaskRepository
from src.tasks.domain.vo import ReviewDecision, TaskStatus
from src.tasks.mappers import map_task_to_response
from src.tasks.schemas import TaskCreate, TaskUpdate
from src.tasks.services.task import TaskService
from src.tickets.domain.repos import TicketRepository
from src.tickets.domain.vo import TicketNumber

from .test_relations import make_task

pytestmark = pytest.mark.unit

MUTATIONS = (
    "change_status",
    "edit",
    "assign_to",
    "request_review",
    "review",
    "archive",
    "add_actual_hours",
)
AUTHORIZATION_METHODS = {
    "change_status": "can_change_status",
    "edit": "can_edit_task",
    "assign_to": "can_assign_task",
    "request_review": "can_request_review",
    "review": "can_review_task",
    "archive": "can_archive_task",
}


@pytest.fixture
def env() -> SimpleNamespace:
    subject = Subject(id=uuid4(), type=SubjectType.USER, roles=[UserRole.DEVELOPER])
    tasks = {}
    links = {}
    subtrees = {}
    repo = AsyncMock(spec=TaskRepository)

    def read(task_id):
        return tasks.get(task_id)

    def read_for_update(task_id, *, include_deleted=False):
        task = tasks.get(task_id)
        if task is not None and task.is_deleted and not include_deleted:
            return None
        return task

    def create(task):
        tasks[task.id] = task
        return task

    def get_links(task_ids):
        return {
            task_id: (
                TaskLinks()
                if task_id in tasks and tasks[task_id].is_deleted
                else links.get(task_id, TaskLinks())
            )
            for task_id in task_ids
        }

    def subtree_ids(task_id):
        return subtrees.get(task_id, {task_id})

    def subtree_for_update(task_id):
        ids = subtrees.get(task_id, {task_id})
        return [tasks[item_id] for item_id in sorted(ids) if item_id in tasks]

    repo.read.side_effect = read
    repo.read_for_update.side_effect = read_for_update
    repo.create.side_effect = create
    repo.get_links.side_effect = get_links
    repo.subtree_ids.side_effect = subtree_ids
    repo.subtree_for_update.side_effect = subtree_for_update
    repo.get_next_sequence.return_value = 1
    repo.set_related.return_value = True

    authz = AsyncMock(spec=TaskAuthZService)
    for name in {"can_create_task", *AUTHORIZATION_METHODS.values()}:
        getattr(authz, name).return_value = PermissionResult(True)

    user_repo = AsyncMock(spec=UserRepository)
    user_repo.read.return_value = SimpleNamespace(id=uuid4())
    ticket_repo = AsyncMock(spec=TicketRepository)
    ticket_repo.read.return_value = None
    project_repo = AsyncMock(spec=ProjectRepository)
    project_repo.read.return_value = None
    uow = AsyncMock(spec=UnitOfWork)
    recorder = AsyncMock(spec=ActivityLogRecorder)
    publisher = AsyncMock(spec=EventPublisher)
    service = TaskService(
        uow=uow,
        task_repo=repo,
        ticket_repo=ticket_repo,
        user_repo=user_repo,
        project_repo=project_repo,
        task_authz_service=authz,
        activity_log_recorder=recorder,
        event_publisher=publisher,
    )
    return SimpleNamespace(
        service=service,
        repo=repo,
        tasks=tasks,
        links=links,
        subtrees=subtrees,
        authz=authz,
        subject=subject,
        uow=uow,
        recorder=recorder,
        publisher=publisher,
        user_repo=user_repo,
        ticket_repo=ticket_repo,
        project_repo=project_repo,
    )


def mutation_task(method: str):
    status = {
        "request_review": TaskStatus.IN_PROGRESS,
        "review": TaskStatus.TO_REVIEW,
    }.get(method, TaskStatus.BACKLOG)
    return make_task(status=status)


async def invoke_mutation(env: SimpleNamespace, method: str, task_id: UUID):
    service, subject = env.service, env.subject
    if method == "change_status":
        return await service.change_status(task_id, TaskStatus.TODO, subject)
    if method == "edit":
        return await service.edit(task_id, TaskUpdate(title="Updated task"), subject)
    if method == "assign_to":
        return await service.assign_to(task_id, uuid4(), subject)
    if method == "request_review":
        return await service.request_review(task_id, uuid4(), subject)
    if method == "review":
        return await service.review(task_id, ReviewDecision.DONE, subject)
    if method == "archive":
        return await service.archive(task_id, subject)
    if method == "add_actual_hours":
        return await service.add_actual_hours(task_id, 1)
    raise AssertionError(f"Unknown mutation: {method}")


@pytest.mark.asyncio
@pytest.mark.parametrize("method", MUTATIONS)
async def test_mutations_load_task_with_row_lock(env: SimpleNamespace, method: str) -> None:
    task = mutation_task(method)
    env.tasks[task.id] = task

    await invoke_mutation(env, method, task.id)

    env.repo.read.assert_not_awaited()
    env.repo.update.assert_awaited_once_with(task)
    env.uow.commit.assert_awaited_once()
    if method == "archive":
        env.repo.read_for_update.assert_not_awaited()
        env.repo.subtree_for_update.assert_awaited_once_with(task.id)
        assert env.repo.method_calls[:2] == [
            call.lock_graph(),
            call.subtree_for_update(task.id),
        ]
        assert task.is_deleted
    else:
        env.repo.read_for_update.assert_awaited_once_with(task.id)
        env.repo.lock_graph.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("method", MUTATIONS)
async def test_mutations_reject_task_missing_from_locked_read(
    env: SimpleNamespace,
    method: str,
) -> None:
    task = mutation_task(method)
    env.tasks[task.id] = task
    if method == "archive":
        env.repo.subtree_for_update.side_effect = None
        env.repo.subtree_for_update.return_value = []
    else:
        env.repo.read_for_update.side_effect = None
        env.repo.read_for_update.return_value = None

    with pytest.raises(NotFoundError):
        await invoke_mutation(env, method, task.id)

    env.repo.read.assert_not_awaited()
    env.repo.update.assert_not_awaited()
    env.repo.get_links.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("method", list(AUTHORIZATION_METHODS))
async def test_mutations_keep_authorization_checks(env: SimpleNamespace, method: str) -> None:
    task = mutation_task(method)
    env.tasks[task.id] = task
    permission = getattr(env.authz, AUTHORIZATION_METHODS[method])
    permission.return_value = PermissionResult(False, "Forbidden")

    with pytest.raises(PermissionDeniedError, match="Forbidden"):
        await invoke_mutation(env, method, task.id)

    if method == "archive":
        env.repo.subtree_for_update.assert_awaited_once_with(task.id)
    else:
        env.repo.read_for_update.assert_awaited_once_with(task.id)
    permission.assert_awaited_once()
    env.repo.update.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_response_contains_parent_and_sorted_links(env: SimpleNamespace) -> None:
    task = make_task(parent_task_id=uuid4())
    env.tasks[task.id] = task
    child_ids = {UUID(int=12), UUID(int=11)}
    related_ids = {UUID(int=22), UUID(int=21)}
    env.links[task.id] = TaskLinks(subtasks=child_ids, related_tasks=related_ids)

    response = await env.service.get(task.id)

    assert response.parent_task_id == task.parent_task_id
    assert response.subtasks == sorted(child_ids)
    assert response.related_tasks == sorted(related_ids)
    serialized = response.model_dump(mode="json", by_alias=True)
    assert serialized["parentTaskId"] == str(task.parent_task_id)
    assert serialized["relatedTasks"] == [str(item) for item in sorted(related_ids)]
    env.repo.get_links.assert_awaited_once_with([task.id])
    env.repo.read_for_update.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_subtask_persists_parent_and_records_history(env: SimpleNamespace) -> None:
    parent = make_task()
    env.tasks[parent.id] = parent
    draft = TaskCreate(title="Child", priority=Priority.MEDIUM, parentTaskId=parent.id)

    response = await env.service.create(draft, env.subject)

    child = env.tasks[response.id]
    assert child.parent_task_id == parent.id
    assert response.parent_task_id == parent.id
    assert child.project_id == parent.project_id
    calls = env.repo.method_calls
    assert calls.index(call.lock_graph()) < calls.index(call.read_for_update(parent.id))
    assert calls.index(call.read_for_update(parent.id)) < calls.index(
        call.get_next_sequence(ticket_id=None, project_id=None)
    )
    events = env.recorder.record_all.await_args.args[0]
    parent_event = next(event for event in events if isinstance(event, TaskParentChanged))
    assert parent_event.task_id == child.id
    assert parent_event.new_parent_task_id == parent.id
    env.uow.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_subtask_inherits_context_without_changing_draft(
    env: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parent = make_task(project_id=uuid4(), ticket_id=uuid4(), stage_id=uuid4())
    env.tasks[parent.id] = parent
    env.ticket_repo.read.return_value = SimpleNamespace(
        id=parent.ticket_id,
        project_id=parent.project_id,
        number=TicketNumber("TEST-26-00000001"),
        priority=Priority.HIGH,
    )
    env.project_repo.read.return_value = SimpleNamespace(
        key=ProjectKey("TEST"),
        find_stage=Mock(return_value=object()),
    )
    monkeypatch.setattr(env.service, "_map_response", AsyncMock(side_effect=map_task_to_response))
    draft = TaskCreate(title="Child", priority=Priority.LOW, parentTaskId=parent.id)

    response = await env.service.create(draft, env.subject)

    child = env.tasks[response.id]
    assert child.project_id == parent.project_id
    assert child.ticket_id == parent.ticket_id
    assert child.stage_id == parent.stage_id
    assert child.priority == Priority.HIGH
    assert draft.project_id is None
    assert draft.ticket_id is None
    assert draft.stage_id is None


@pytest.mark.asyncio
async def test_create_subtask_preserves_explicit_null_ticket_and_stage(
    env: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parent = make_task(project_id=uuid4(), ticket_id=uuid4(), stage_id=uuid4())
    env.tasks[parent.id] = parent
    env.project_repo.read.return_value = SimpleNamespace(key=ProjectKey("TEST"))
    monkeypatch.setattr(env.service, "_map_response", AsyncMock(side_effect=map_task_to_response))
    draft = TaskCreate(
        title="Child",
        priority=Priority.MEDIUM,
        parentTaskId=parent.id,
        ticket_id=None,
        stage_id=None,
    )

    response = await env.service.create(draft, env.subject)

    child = env.tasks[response.id]
    assert child.project_id == parent.project_id
    assert child.ticket_id is None
    assert child.stage_id is None
    env.ticket_repo.read.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("parent_project_id", [None, UUID(int=100)])
async def test_create_subtask_rejects_ticket_from_another_project(
    env: SimpleNamespace,
    parent_project_id: UUID | None,
) -> None:
    parent = make_task(project_id=parent_project_id)
    env.tasks[parent.id] = parent
    ticket_id = uuid4()
    env.ticket_repo.read.return_value = SimpleNamespace(id=ticket_id, project_id=uuid4())
    draft = TaskCreate(
        title="Child",
        priority=Priority.MEDIUM,
        parentTaskId=parent.id,
        ticket_id=ticket_id,
    )

    with pytest.raises(InvalidStateError, match="project mismatch"):
        await env.service.create(draft, env.subject)

    env.repo.create.assert_not_awaited()
    env.repo.get_next_sequence.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_root_task_keeps_legacy_ticket_stage_inheritance(
    env: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticket_id, project_id, stage_id = uuid4(), uuid4(), uuid4()
    env.ticket_repo.read.return_value = SimpleNamespace(
        id=ticket_id,
        project_id=project_id,
        stage_id=stage_id,
        number=TicketNumber("TEST-26-00000001"),
        priority=Priority.HIGH,
    )
    env.project_repo.read.return_value = SimpleNamespace(
        key=ProjectKey("TEST"),
        find_stage=Mock(return_value=object()),
    )
    monkeypatch.setattr(env.service, "_map_response", AsyncMock(side_effect=map_task_to_response))
    draft = TaskCreate(
        title="Root task",
        priority=Priority.LOW,
        ticket_id=ticket_id,
        stage_id=None,
    )

    response = await env.service.create(draft, env.subject)

    task = env.tasks[response.id]
    assert task.parent_task_id is None
    assert task.project_id == project_id
    assert task.ticket_id == ticket_id
    assert task.stage_id == stage_id
    assert task.priority == Priority.HIGH
    env.repo.lock_graph.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case", "expected_error"),
    [
        ("without_project", InvalidStateError),
        ("missing_project", NotFoundError),
        ("missing_stage", NotFoundError),
    ],
)
async def test_create_rejects_invalid_stage_context(
    env: SimpleNamespace,
    case: str,
    expected_error: type[Exception],
) -> None:
    project_id = None if case == "without_project" else uuid4()
    if case == "missing_stage":
        env.project_repo.read.return_value = SimpleNamespace(
            key=ProjectKey("TEST"),
            find_stage=Mock(return_value=None),
        )
    draft = TaskCreate(
        title="Invalid stage context",
        priority=Priority.MEDIUM,
        project_id=project_id,
        stage_id=uuid4(),
    )

    with pytest.raises(expected_error):
        await env.service.create(draft, env.subject)

    env.repo.create.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_set_parent_rejects_descendant_as_parent(env: SimpleNamespace) -> None:
    task, descendant = make_task(), make_task()
    env.tasks.update({task.id: task, descendant.id: descendant})
    env.subtrees[task.id] = {task.id, descendant.id}

    with pytest.raises(InvalidStateError, match="cycle"):
        await env.service.set_parent(task.id, descendant.id, env.subject)

    assert task.parent_task_id is None
    env.repo.update.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_set_parent_checks_both_parents_and_preserves_context(
    env: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    old_parent = make_task(project_id=project_id)
    new_parent = make_task(project_id=project_id)
    task = make_task(
        project_id=project_id,
        ticket_id=uuid4(),
        stage_id=uuid4(),
        parent_task_id=old_parent.id,
    )
    original_context = (task.project_id, task.ticket_id, task.stage_id, task.status)
    env.tasks.update({item.id: item for item in (task, old_parent, new_parent)})
    monkeypatch.setattr(env.service, "_map_response", AsyncMock(side_effect=map_task_to_response))

    response = await env.service.set_parent(task.id, new_parent.id, env.subject)

    assert response.parent_task_id == new_parent.id
    assert (task.project_id, task.ticket_id, task.stage_id, task.status) == original_context
    checked_ids = [item.kwargs["task"].id for item in env.authz.can_edit_task.await_args_list]
    assert checked_ids == [task.id, old_parent.id, new_parent.id]
    env.repo.read_for_update.assert_any_await(old_parent.id, include_deleted=True)
    env.uow.flush.assert_awaited_once()
    env.uow.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_set_parent_rejects_another_project(env: SimpleNamespace) -> None:
    task = make_task(project_id=uuid4())
    parent = make_task(project_id=uuid4())
    env.tasks.update({task.id: task, parent.id: parent})

    with pytest.raises(InvalidStateError, match="same project"):
        await env.service.set_parent(task.id, parent.id, env.subject)

    env.repo.update.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_set_parent_allows_detaching_from_archived_parent(env: SimpleNamespace) -> None:
    parent = make_task(deleted_at=current_datetime())
    task = make_task(parent_task_id=parent.id)
    env.tasks.update({task.id: task, parent.id: parent})

    response = await env.service.set_parent(task.id, None, env.subject)

    assert response.parent_task_id is None
    env.repo.read_for_update.assert_any_await(parent.id, include_deleted=True)
    env.repo.update.assert_awaited_once_with(task)


@pytest.mark.asyncio
async def test_repeated_parent_assignment_has_no_write_or_history(env: SimpleNamespace) -> None:
    parent = make_task(status=TaskStatus.DONE)
    task = make_task(parent_task_id=parent.id)
    env.tasks.update({task.id: task, parent.id: parent})

    response = await env.service.set_parent(task.id, parent.id, env.subject)

    assert response.parent_task_id == parent.id
    env.repo.update.assert_not_awaited()
    env.repo.subtree_ids.assert_not_awaited()
    assert env.recorder.record_all.await_args.args[0] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("denied_target", ["task", "old_parent", "new_parent"])
async def test_set_parent_rejects_missing_edit_permission(
    env: SimpleNamespace,
    denied_target: str,
) -> None:
    old_parent, new_parent = make_task(), make_task()
    task = make_task(parent_task_id=old_parent.id)
    targets = {"task": task, "old_parent": old_parent, "new_parent": new_parent}
    env.tasks.update({item.id: item for item in targets.values()})

    def can_edit(*, subject, task):
        if task.id == targets[denied_target].id:
            return PermissionResult(False, "Forbidden")
        return PermissionResult(True)

    env.authz.can_edit_task.side_effect = can_edit

    with pytest.raises(PermissionDeniedError):
        await env.service.set_parent(task.id, new_parent.id, env.subject)

    assert task.parent_task_id == old_parent.id
    env.repo.update.assert_not_awaited()
    env.uow.commit.assert_not_awaited()
