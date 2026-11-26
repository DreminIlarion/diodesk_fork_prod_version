from typing import Any

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from src.activity_logs.registry import map_event_to_activity_log
from src.shared.domain.exceptions import InvalidStateError, InvariantViolationError
from src.shared.domain.vo import Priority
from src.tasks.domain.entities import Task
from src.tasks.domain.events import (
    TaskArchived,
    TaskParentChanged,
    TaskRelationChanged,
    TaskStatusChanged,
    TaskUnassigned,
    TaskWorkingFinished,
)
from src.tasks.domain.vo import TaskNumber, TaskStatus

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 24, 9, 0, tzinfo=UTC)
OLD_PARENT_ID = UUID("00000000-0000-4000-8000-000000000001")
NEW_PARENT_ID = UUID("00000000-0000-4000-8000-000000000002")


def make_task(
    *,
    status: TaskStatus = TaskStatus.BACKLOG,
    **overrides: Any,
) -> Task:
    values = {
        "number": TaskNumber("TEST-26-00000001-001"),
        "title": "Task relations test",
        "status": status,
        "priority": Priority.MEDIUM,
        "created_by": uuid4(),
        "created_at": NOW,
        "updated_at": NOW - timedelta(minutes=10),
        "assignee_id": uuid4() if status == TaskStatus.IN_PROGRESS else None,
        "completed_at": NOW if status == TaskStatus.DONE else None,
    }
    values.update(overrides)
    return Task(**values)


@pytest.mark.parametrize(
    ("old_parent_id", "new_parent_id"),
    [
        (None, NEW_PARENT_ID),
        (OLD_PARENT_ID, NEW_PARENT_ID),
        (OLD_PARENT_ID, None),
    ],
    ids=["assign", "reparent", "detach"],
)
def test_change_parent_records_previous_and_new_parent(
    old_parent_id: UUID | None,
    new_parent_id: UUID | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("src.tasks.domain.entities.current_datetime", lambda: NOW)
    task = make_task(parent_task_id=old_parent_id)
    actor_id = uuid4()

    task.change_parent(new_parent_id, actor_id)

    assert task.parent_task_id == new_parent_id
    assert task.updated_at == NOW
    event, = list(task.collect_events())
    assert isinstance(event, TaskParentChanged)
    assert event.task_id == task.id
    assert event.old_parent_task_id == old_parent_id
    assert event.new_parent_task_id == new_parent_id
    assert event.changed_by == actor_id

    log = map_event_to_activity_log(event)
    assert log.action == "task.parent_changed"
    assert log.aggregate_id == task.id
    assert log.actor_id == actor_id
    assert log.occurred_on == event.occurred_on
    assert log.event_id == event.event_id
    assert log.changes == {
        "old_parent_task_id": str(old_parent_id) if old_parent_id is not None else None,
        "new_parent_task_id": str(new_parent_id) if new_parent_id is not None else None,
    }


@pytest.mark.parametrize("parent_id", [None, OLD_PARENT_ID])
def test_repeating_parent_assignment_has_no_side_effects(parent_id: UUID | None) -> None:
    task = make_task(parent_task_id=parent_id)
    previous_updated_at = task.updated_at

    task.change_parent(parent_id, uuid4())

    assert task.parent_task_id == parent_id
    assert task.updated_at == previous_updated_at
    assert list(task.collect_events()) == []


def test_task_cannot_be_constructed_with_itself_as_parent() -> None:
    task_id = uuid4()

    with pytest.raises(InvariantViolationError, match="own parent"):
        make_task(id=task_id, parent_task_id=task_id)


def test_self_parent_assignment_does_not_change_task() -> None:
    task = make_task(parent_task_id=OLD_PARENT_ID)
    previous_updated_at = task.updated_at

    with pytest.raises(InvariantViolationError, match="own parent"):
        task.change_parent(task.id, uuid4())

    assert task.parent_task_id == OLD_PARENT_ID
    assert task.updated_at == previous_updated_at
    assert list(task.collect_events()) == []


def test_deleted_task_cannot_be_detached_from_parent() -> None:
    task = make_task(parent_task_id=OLD_PARENT_ID, deleted_at=NOW)
    previous_updated_at = task.updated_at

    with pytest.raises(InvalidStateError, match="deleted task"):
        task.change_parent(None, uuid4())

    assert task.parent_task_id == OLD_PARENT_ID
    assert task.updated_at == previous_updated_at
    assert list(task.collect_events()) == []


@pytest.mark.parametrize("status", list(TaskStatus))
def test_parent_assignment_preserves_child_status(status: TaskStatus) -> None:
    task = make_task(status=status)
    previous_assignee_id = task.assignee_id
    previous_completed_at = task.completed_at

    task.change_parent(NEW_PARENT_ID, uuid4())

    assert task.status == status
    assert task.assignee_id == previous_assignee_id
    assert task.completed_at == previous_completed_at
    assert task.parent_task_id == NEW_PARENT_ID


def test_two_argument_status_change_remains_supported() -> None:
    task = make_task()
    actor_id = uuid4()

    task.change_status(TaskStatus.TODO, actor_id)

    event, = list(task.collect_events())
    assert isinstance(event, TaskStatusChanged)
    assert event.old_status == TaskStatus.BACKLOG
    assert event.new_status == TaskStatus.TODO
    assert event.changed_by == actor_id
    assert event.reason is None
    assert event.caused_by_task_id is None
    assert map_event_to_activity_log(event).meta == {}


def test_repeating_status_change_has_no_side_effects() -> None:
    task = make_task()
    previous_updated_at = task.updated_at

    task.change_status(TaskStatus.BACKLOG, uuid4(), reason="No state change")

    assert task.updated_at == previous_updated_at
    assert list(task.collect_events()) == []


@pytest.mark.parametrize("new_status", [TaskStatus.BACKLOG, TaskStatus.TODO])
def test_deleted_task_rejects_status_changes(new_status: TaskStatus) -> None:
    task = make_task(deleted_at=NOW)
    previous_updated_at = task.updated_at

    with pytest.raises(InvalidStateError, match="deleted task"):
        task.change_status(new_status, uuid4())

    assert task.status == TaskStatus.BACKLOG
    assert task.updated_at == previous_updated_at
    assert list(task.collect_events()) == []


@pytest.mark.parametrize("status", [status for status in TaskStatus if status.is_open])
def test_every_unfinished_status_can_be_cancelled(status: TaskStatus) -> None:
    task = make_task(status=status)

    task.change_status(
        TaskStatus.CANCELLED,
        uuid4(),
        reason="Ancestor deleted",
        caused_by_task_id=OLD_PARENT_ID,
    )

    assert task.status == TaskStatus.CANCELLED
    assert task.assignee_id is None
    assert task.reviewer_id is None
    status_events = [
        event for event in task.collect_events() if isinstance(event, TaskStatusChanged)
    ]
    event, = status_events
    assert event.old_status == status
    assert event.reason == "Ancestor deleted"
    assert event.caused_by_task_id == OLD_PARENT_ID


@pytest.mark.parametrize("status", [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED])
def test_cancellation_finishes_timer_before_unassigning_exactly_once(
    status: TaskStatus,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("src.tasks.domain.entities.current_datetime", lambda: NOW)
    started_at = NOW - timedelta(hours=1)
    assignee_id = uuid4()
    task = make_task(
        status=status,
        assignee_id=assignee_id,
        reviewer_id=uuid4(),
        started_at=started_at,
        working_since=started_at,
        actual_hours=Decimal("2.25"),
    )

    task.change_status(TaskStatus.CANCELLED, uuid4())

    assert task.working_since is None
    assert task.assignee_id is None
    assert task.reviewer_id is None
    assert task.actual_hours == Decimal("3.25")
    events = list(task.collect_events())
    assert [type(event) for event in events] == [
        TaskWorkingFinished,
        TaskUnassigned,
        TaskStatusChanged,
    ]
    assert events[0].assignee_id == assignee_id
    assert events[0].actual_hours == Decimal("3.25")

    task.change_status(TaskStatus.CANCELLED, uuid4())

    assert task.actual_hours == Decimal("3.25")
    assert list(task.collect_events()) == []


@pytest.mark.parametrize(
    ("reason", "ancestor_id", "expected_meta"),
    [
        (None, None, {}),
        ("Ancestor deleted", None, {"reason": "Ancestor deleted"}),
        (None, OLD_PARENT_ID, {"caused_by_task_id": str(OLD_PARENT_ID)}),
        (
            "Ancestor deleted",
            OLD_PARENT_ID,
            {"reason": "Ancestor deleted", "caused_by_task_id": str(OLD_PARENT_ID)},
        ),
    ],
)
def test_status_history_preserves_optional_cancellation_context(
    reason: str | None,
    ancestor_id: UUID | None,
    expected_meta: dict[str, str],
) -> None:
    event = TaskStatusChanged(
        task_id=uuid4(),
        old_status=TaskStatus.BLOCKED,
        new_status=TaskStatus.CANCELLED,
        changed_by=uuid4(),
        reason=reason,
        caused_by_task_id=ancestor_id,
        occurred_on=NOW,
    )

    log = map_event_to_activity_log(event)

    assert log.aggregate_type == "task"
    assert log.aggregate_id == event.task_id
    assert log.action == "task.status_changed"
    assert log.actor_id == event.changed_by
    assert log.occurred_on == NOW
    assert log.event_id == event.event_id
    assert log.meta == expected_meta
    assert json.loads(json.dumps(log.changes)) == {
        "old_status": "blocked",
        "new_status": "cancelled",
    }


@pytest.mark.parametrize(
    ("linked", "expected_action"),
    [(True, "task.related_added"), (False, "task.related_removed")],
)
def test_related_task_history_preserves_both_endpoints_and_actor(
    linked: bool,
    expected_action: str,
) -> None:
    event = TaskRelationChanged(
        task_id=uuid4(),
        related_task_id=uuid4(),
        linked=linked,
        changed_by=uuid4(),
        occurred_on=NOW,
    )

    log = map_event_to_activity_log(event)

    assert log.action == expected_action
    assert log.aggregate_id == event.task_id
    assert log.actor_id == event.changed_by
    assert log.changes == {"related_task_id": str(event.related_task_id)}
    assert log.event_id == event.event_id
    assert log.occurred_on == NOW


def test_archive_event_is_registered_in_history() -> None:
    task = make_task()
    actor_id = uuid4()

    task.archive(actor_id)

    event, = list(task.collect_events())
    assert isinstance(event, TaskArchived)
    log = map_event_to_activity_log(event)
    assert log.aggregate_type == "task"
    assert log.aggregate_id == task.id
    assert log.action == "task.archived"
    assert log.actor_id == actor_id
    assert log.event_id == event.event_id
    assert log.occurred_on == event.occurred_on
