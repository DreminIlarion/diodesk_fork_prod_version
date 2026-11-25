from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, call
from uuid import uuid4

import pytest

from src.activity_logs.registry import map_event_to_activity_log
from src.iam.domain.authz import PermissionResult
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.domain.exceptions import InvalidStateError, NotFoundError
from src.shared.schemas import Page, Pagination
from src.tasks.domain.events import (
    TaskArchived,
    TaskRelationChanged,
    TaskStatusChanged,
    TaskWorkingFinished,
)
from src.tasks.domain.repos import TaskBrief, TaskLinks
from src.tasks.domain.vo import TaskStatus
from src.tasks.schemas import TaskBriefResponse

from .test_relations import NOW, make_task
from .test_service_relations import env as env  # noqa: PLC0414 - shared pytest fixture

pytestmark = pytest.mark.unit
ENDPOINT_COUNT = 2


@pytest.mark.asyncio
@pytest.mark.parametrize("root_status", [TaskStatus.BACKLOG, TaskStatus.DONE])
async def test_archive_cancels_only_live_unfinished_descendants(
    env: SimpleNamespace,
    root_status: TaskStatus,
) -> None:
    root = make_task(status=root_status)
    children = [
        make_task(status=status, parent_task_id=root.id) for status in TaskStatus if status.is_open
    ]
    completed = make_task(status=TaskStatus.DONE, parent_task_id=root.id)
    cancelled = make_task(status=TaskStatus.CANCELLED, parent_task_id=root.id)
    deleted = make_task(parent_task_id=root.id, deleted_at=NOW)
    under_completed = make_task(parent_task_id=completed.id)
    under_deleted = make_task(parent_task_id=deleted.id)
    peer = make_task(status=TaskStatus.IN_PROGRESS)
    nodes = [root, *children, completed, cancelled, deleted, under_completed, under_deleted]
    env.tasks.update({task.id: task for task in [*nodes, peer]})
    env.subtrees[root.id] = {task.id for task in nodes}
    env.links[root.id] = TaskLinks(related_tasks={peer.id})
    env.authz.can_change_status.return_value = PermissionResult(False, "Forbidden")
    env.authz.can_edit_task.return_value = PermissionResult(False, "Forbidden")

    response = await env.service.archive(root.id, env.subject)

    assert response.is_archived
    assert root.is_deleted
    assert root.status == root_status
    cancelled_descendants = [*children, under_completed, under_deleted]
    assert all(task.status == TaskStatus.CANCELLED for task in cancelled_descendants)
    assert all(not task.is_deleted for task in cancelled_descendants)
    assert completed.status == TaskStatus.DONE
    assert not completed.is_deleted
    assert cancelled.status == TaskStatus.CANCELLED
    assert not cancelled.is_deleted
    assert deleted.status == TaskStatus.BACKLOG
    assert deleted.deleted_at == NOW
    assert peer.status == TaskStatus.IN_PROGRESS
    assert not peer.is_deleted
    assert {item.args[0].id for item in env.repo.update.await_args_list} == {
        root.id,
        *(task.id for task in cancelled_descendants),
    }
    env.authz.can_archive_task.assert_awaited_once_with(subject=env.subject, task=root)
    env.authz.can_change_status.assert_not_awaited()
    env.authz.can_edit_task.assert_not_awaited()
    env.repo.set_related.assert_not_awaited()
    env.uow.flush.assert_awaited_once()
    env.uow.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED])
async def test_archive_finishes_descendant_timer_and_records_reason_before_commit(
    env: SimpleNamespace,
    status: TaskStatus,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("src.tasks.domain.entities.current_datetime", lambda: NOW)
    root = make_task()
    child = make_task(
        status=status,
        parent_task_id=root.id,
        assignee_id=uuid4(),
        reviewer_id=uuid4(),
        started_at=NOW - timedelta(hours=1),
        working_since=NOW - timedelta(hours=1),
        actual_hours=Decimal("1.25"),
    )
    env.tasks.update({root.id: root, child.id: child})
    env.subtrees[root.id] = {root.id, child.id}
    order = Mock()
    order.attach_mock(env.recorder.record_all, "history")
    order.attach_mock(env.uow.commit, "commit")
    order.attach_mock(env.publisher.publish_all, "publish")

    await env.service.archive(root.id, env.subject)

    assert child.actual_hours == Decimal("2.25")
    assert child.working_since is None
    assert child.assignee_id is None
    assert child.reviewer_id is None
    events = env.recorder.record_all.await_args.args[0]
    status_events = [event for event in events if isinstance(event, TaskStatusChanged)]
    (status_event,) = status_events
    assert status_event.task_id == child.id
    assert status_event.old_status == status
    assert status_event.changed_by == env.subject.id
    assert map_event_to_activity_log(status_event).meta == {
        "reason": "Удаление вышестоящей задачи",
        "caused_by_task_id": str(root.id),
    }
    assert sum(isinstance(event, TaskWorkingFinished) for event in events) == 1
    (archived,) = [event for event in events if isinstance(event, TaskArchived)]
    assert archived.task_id == root.id
    assert [item[0] for item in order.mock_calls] == ["history", "commit", "publish"]


@pytest.mark.asyncio
async def test_repeated_archive_does_not_cancel_again_or_duplicate_history(
    env: SimpleNamespace,
) -> None:
    root = make_task(deleted_at=NOW)
    child = make_task(parent_task_id=root.id)
    env.tasks.update({root.id: root, child.id: child})
    env.subtrees[root.id] = {root.id, child.id}

    response = await env.service.archive(root.id, env.subject)

    assert response.is_archived
    assert root.deleted_at == NOW
    assert child.status == TaskStatus.BACKLOG
    env.repo.update.assert_not_awaited()
    env.uow.flush.assert_not_awaited()
    assert env.recorder.record_all.await_args.args[0] == []
    assert env.publisher.publish_all.await_args.args[0] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["archive", "related"])
async def test_history_failure_prevents_commit_and_event_publication(
    env: SimpleNamespace,
    operation: str,
) -> None:
    root, child = make_task(), make_task()
    env.tasks.update({root.id: root, child.id: child})
    env.subtrees[root.id] = {root.id, child.id}
    env.recorder.record_all.side_effect = RuntimeError("History write failed")

    if operation == "archive":
        action = env.service.archive(root.id, env.subject)
    else:
        action = env.service.set_related(
            root.id, child.id, linked=True, current_subject=env.subject
        )

    with pytest.raises(RuntimeError, match="History write failed"):
        await action

    env.uow.commit.assert_not_awaited()
    env.publisher.publish_all.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_related_change_preserves_statuses_and_records_both_directions(
    env: SimpleNamespace,
    linked: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("src.tasks.services.task.current_datetime", lambda: NOW)
    first = make_task(status=TaskStatus.IN_PROGRESS, project_id=uuid4())
    second = make_task(status=TaskStatus.DONE, project_id=uuid4())
    env.tasks.update({first.id: first, second.id: second})

    await env.service.set_related(first.id, second.id, linked=linked, current_subject=env.subject)

    assert first.status == TaskStatus.IN_PROGRESS
    assert second.status == TaskStatus.DONE
    assert first.updated_at == second.updated_at == NOW
    assert env.repo.method_calls[0] == call.lock_graph()
    assert env.repo.read_for_update.await_args_list == [
        call(item_id, include_deleted=not linked and item_id == second.id)
        for item_id in sorted((first.id, second.id))
    ]
    env.repo.set_related.assert_awaited_once_with(first.id, second.id, linked=linked)
    events = env.recorder.record_all.await_args.args[0]
    assert len(events) == ENDPOINT_COUNT
    assert all(isinstance(event, TaskRelationChanged) for event in events)
    assert {(event.task_id, event.related_task_id) for event in events} == {
        (first.id, second.id),
        (second.id, first.id),
    }
    expected_action = "task.related_added" if linked else "task.related_removed"
    assert all(event.linked == linked and event.changed_by == env.subject.id for event in events)
    assert all(map_event_to_activity_log(event).action == expected_action for event in events)
    env.uow.flush.assert_awaited_once()
    env.uow.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_repeated_related_change_does_not_update_tasks_or_history(
    env: SimpleNamespace,
    linked: bool,
) -> None:
    first, second = make_task(), make_task()
    timestamps = first.updated_at, second.updated_at
    env.tasks.update({first.id: first, second.id: second})
    env.repo.set_related.return_value = False

    await env.service.set_related(first.id, second.id, linked=linked, current_subject=env.subject)

    assert (first.updated_at, second.updated_at) == timestamps
    env.repo.update.assert_not_awaited()
    env.uow.flush.assert_not_awaited()
    assert env.recorder.record_all.await_args.args[0] == []
    env.uow.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_related_self_link_is_rejected_before_locking(
    env: SimpleNamespace,
    linked: bool,
) -> None:
    task_id = uuid4()

    with pytest.raises(InvalidStateError, match="itself"):
        await env.service.set_related(task_id, task_id, linked=linked, current_subject=env.subject)

    env.repo.lock_graph.assert_not_awaited()
    env.repo.read_for_update.assert_not_awaited()
    env.repo.set_related.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
@pytest.mark.parametrize("denied_target", ["first", "second"])
async def test_related_change_requires_edit_permission_for_both_tasks(
    env: SimpleNamespace,
    linked: bool,
    denied_target: str,
) -> None:
    first, second = make_task(), make_task()
    env.tasks.update({first.id: first, second.id: second})
    denied_id = first.id if denied_target == "first" else second.id

    def can_edit(*, subject, task):
        if task.id == denied_id:
            return PermissionResult(False, "Forbidden")
        return PermissionResult(True)

    env.authz.can_edit_task.side_effect = can_edit

    with pytest.raises(PermissionDeniedError):
        await env.service.set_related(
            first.id, second.id, linked=linked, current_subject=env.subject
        )

    env.repo.set_related.assert_not_awaited()
    env.repo.update.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_related_link_to_deleted_task_is_rejected(env: SimpleNamespace) -> None:
    first, second = make_task(), make_task(deleted_at=NOW)
    env.tasks.update({first.id: first, second.id: second})

    with pytest.raises(NotFoundError):
        await env.service.set_related(
            first.id, second.id, linked=True, current_subject=env.subject
        )

    env.repo.set_related.assert_not_awaited()
    env.uow.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_related_unlink_from_deleted_neighbor_is_allowed(env: SimpleNamespace) -> None:
    first, second = make_task(), make_task(deleted_at=NOW)
    env.tasks.update({first.id: first, second.id: second})

    await env.service.set_related(first.id, second.id, linked=False, current_subject=env.subject)

    assert second.deleted_at == NOW
    env.repo.read_for_update.assert_any_await(second.id, include_deleted=True)
    env.repo.set_related.assert_awaited_once_with(first.id, second.id, linked=False)
    assert env.authz.can_edit_task.await_count == ENDPOINT_COUNT


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_deleted_source_cannot_change_related_tasks(
    env: SimpleNamespace,
    linked: bool,
) -> None:
    first, second = make_task(deleted_at=NOW), make_task()
    env.tasks.update({first.id: first, second.id: second})

    with pytest.raises(NotFoundError):
        await env.service.set_related(
            first.id, second.id, linked=linked, current_subject=env.subject
        )

    env.repo.set_related.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_missing_related_task_is_rejected(env: SimpleNamespace, linked: bool) -> None:
    first = make_task()
    env.tasks[first.id] = first

    with pytest.raises(NotFoundError):
        await env.service.set_related(
            first.id, uuid4(), linked=linked, current_subject=env.subject
        )

    env.repo.set_related.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("lookup", ["missing", "deleted"])
async def test_get_does_not_return_missing_or_deleted_task(
    env: SimpleNamespace,
    lookup: str,
) -> None:
    task = make_task(deleted_at=NOW)
    if lookup == "deleted":
        env.tasks[task.id] = task

    with pytest.raises(NotFoundError):
        await env.service.get(task.id)

    env.repo.get_links.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["subtasks", "related"])
@pytest.mark.parametrize("lookup", ["missing", "deleted"])
async def test_lists_do_not_expose_relations_of_missing_or_deleted_owner(
    env: SimpleNamespace,
    kind: str,
    lookup: str,
) -> None:
    task = make_task(deleted_at=NOW)
    if lookup == "deleted":
        env.tasks[task.id] = task

    with pytest.raises(NotFoundError):
        await env.service.list_linked(task.id, kind, Pagination())

    env.repo.list_linked.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["subtasks", "related"])
async def test_lists_map_brief_responses_and_preserve_pagination(
    env: SimpleNamespace,
    kind: str,
) -> None:
    owner = make_task()
    env.tasks[owner.id] = owner
    brief = TaskBrief(id=uuid4(), number="TASK-001", title="Linked task", status=TaskStatus.DONE)
    env.repo.list_linked.return_value = Page.create([brief], total_items=3, page=2, size=1)
    pagination = Pagination(page=2, size=1)

    response = await env.service.list_linked(owner.id, kind, pagination)

    env.repo.list_linked.assert_awaited_once_with(owner.id, kind, pagination)
    assert (response.page, response.size, response.total_items, response.total_pages) == (
        2,
        1,
        3,
        3,
    )
    assert response.has_next
    assert response.has_prev
    (result,) = response.items
    assert isinstance(result, TaskBriefResponse)
    assert result.model_dump(mode="json") == {
        "id": str(brief.id),
        "number": "TASK-001",
        "title": "Linked task",
        "status": "done",
    }
