import asyncio
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from src.activity_logs.infra.models import ActivityLogOrm
from src.shared.domain.exceptions import InvalidStateError, NotFoundError
from src.shared.domain.vo import Priority
from src.shared.schemas import Pagination
from src.tasks.domain.vo import TaskStatus
from src.tasks.infra.models import TaskRelationOrm
from src.tasks.infra.repos import SqlTaskRepository
from src.tasks.schemas import TaskCreate

from .conftest import NOW

pytestmark = pytest.mark.integration


async def test_create_subtask_persists_parent_and_creation_history(
    task_env,
    add_task,
    engine: AsyncEngine,
) -> None:
    parent = await add_task()
    await task_env.session.commit()

    response = await task_env.service.create(
        TaskCreate(title="New child", priority=Priority.MEDIUM, parent_task_id=parent.id),
        task_env.subject,
    )

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        assert (await repo.read(response.id)).parent_task_id == parent.id
        assert (await repo.get_links([parent.id]))[parent.id].subtasks == {response.id}
        logs = (await observer.scalars(select(ActivityLogOrm))).all()
        assert {log.action for log in logs} == {"task.created", "task.parent_changed"}
        assert all(log.actor_id == task_env.subject.id for log in logs)
        assert all(log.event_id is not None for log in logs)


async def test_reparent_and_detach_preserve_branch_and_record_previous_parent(
    task_env,
    add_task,
    engine: AsyncEngine,
) -> None:
    old_parent, new_parent = await add_task(), await add_task()
    child = await add_task(parent=old_parent, status=TaskStatus.TODO)
    grandchild = await add_task(parent=child)
    await task_env.session.commit()

    for parent_id in (new_parent.id, None):
        await task_env.service.set_parent(child.id, parent_id, task_env.subject)
        async with AsyncSession(engine) as observer:
            repo = SqlTaskRepository(observer)
            stored = await repo.read(child.id)
            assert stored.parent_task_id == parent_id
            assert stored.status == child.status
            assert stored.project_id == child.project_id
            assert stored.ticket_id == child.ticket_id
            assert stored.stage_id == child.stage_id
            assert (await repo.read(grandchild.id)).parent_task_id == child.id
            logs = (await observer.scalars(select(ActivityLogOrm))).all()
            assert all(log.action == "task.parent_changed" for log in logs)
    assert {
        (log.changes["old_parent_task_id"], log.changes["new_parent_task_id"]) for log in logs
    } == {
        (str(old_parent.id), str(new_parent.id)),
        (str(new_parent.id), None),
    }


@pytest.mark.parametrize("target", ["self", "descendant", "another_project"])
async def test_invalid_reparent_leaves_tree_and_history_unchanged(
    task_env,
    add_task,
    target: str,
    engine: AsyncEngine,
) -> None:
    root = await add_task()
    child = await add_task(parent=root)
    foreign_parent = await add_task(project_id=uuid4())
    await task_env.session.commit()
    target_id = {"self": root.id, "descendant": child.id, "another_project": foreign_parent.id}[
        target
    ]

    with pytest.raises(InvalidStateError):
        await task_env.service.set_parent(root.id, target_id, task_env.subject)
    await task_env.session.rollback()

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        assert (await repo.read(root.id)).parent_task_id is None
        assert (await repo.read(child.id)).parent_task_id == root.id
        assert await observer.scalar(select(func.count()).select_from(ActivityLogOrm)) == 0


@pytest.mark.parametrize("root_status", [TaskStatus.BACKLOG, TaskStatus.DONE])
async def test_archive_cancels_only_live_unfinished_descendants_and_commits_history(
    task_env,
    add_task,
    engine: AsyncEngine,
    root_status: TaskStatus,
) -> None:
    root = await add_task(status=root_status)
    open_children = [await add_task(parent=root, status=s) for s in TaskStatus if s.is_open]
    done = await add_task(parent=root, status=TaskStatus.DONE)
    cancelled = await add_task(parent=root, status=TaskStatus.CANCELLED)
    archived = await add_task(parent=root, deleted=True)
    below_done, below_archived = await add_task(parent=done), await add_task(parent=archived)
    peer = await add_task()
    await task_env.repo.set_related(root.id, peer.id, linked=True)
    await task_env.session.commit()
    changed_ids = {task.id for task in [*open_children, below_done, below_archived]}

    async def assert_committed_before_publication(events) -> None:
        async with AsyncSession(engine) as observer:
            repo = SqlTaskRepository(observer)
            assert (await repo.read(root.id)).is_deleted
            logs = (await observer.scalars(select(ActivityLogOrm))).all()
            assert {
                log.aggregate_id for log in logs if log.action == "task.status_changed"
            } == changed_ids

    task_env.publisher.publish_all.side_effect = assert_committed_before_publication
    await task_env.service.archive(root.id, task_env.subject)

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        for task_id in changed_ids:
            stored = await repo.read(task_id)
            assert stored.status == TaskStatus.CANCELLED
            assert not stored.is_deleted
        assert (await repo.read(done.id)).status == TaskStatus.DONE
        assert (await repo.read(cancelled.id)).status == TaskStatus.CANCELLED
        assert (await repo.read(archived.id)).deleted_at == archived.deleted_at
        assert (await repo.read(archived.id)).status == archived.status
        assert (await repo.read(peer.id)).status == peer.status
        assert (await repo.get_links([peer.id]))[peer.id].related_tasks == set()
        logs = (
            await observer.scalars(
                select(ActivityLogOrm).where(ActivityLogOrm.action == "task.status_changed")
            )
        ).all()
        assert {log.aggregate_id for log in logs} == changed_ids
        assert len(logs) == len(changed_ids)
        assert all(log.changes["new_status"] == TaskStatus.CANCELLED.value for log in logs)
        assert all(
            log.meta
            == {
                "reason": "Удаление вышестоящей задачи",
                "caused_by_task_id": str(root.id),
            }
            for log in logs
        )


@pytest.mark.parametrize("status", [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED])
async def test_archive_stops_timer_and_persists_worked_hours(
    task_env,
    add_task,
    monkeypatch: pytest.MonkeyPatch,
    engine: AsyncEngine,
    status: TaskStatus,
) -> None:
    monkeypatch.setattr("src.tasks.domain.entities.current_datetime", lambda: NOW)
    root = await add_task()
    child = await add_task(parent=root, status=status, running=True)
    await task_env.session.commit()

    await task_env.service.archive(root.id, task_env.subject)

    async with AsyncSession(engine) as observer:
        stored = await SqlTaskRepository(observer).read(child.id)
        assert stored.working_since is None
        assert stored.assignee_id is None
        assert stored.reviewer_id is None
        assert stored.actual_hours == Decimal(1)


async def test_repeated_archive_does_not_duplicate_history_or_cancel_reopened_child(
    task_env,
    add_task,
) -> None:
    root = await add_task()
    child = await add_task(parent=root)
    await task_env.session.commit()
    await task_env.service.archive(root.id, task_env.subject)
    await task_env.service.change_status(child.id, TaskStatus.TODO, task_env.subject)
    previous_count = await task_env.session.scalar(
        select(func.count()).select_from(ActivityLogOrm)
    )
    archived_at = (await task_env.repo.read(root.id)).deleted_at

    await task_env.service.archive(root.id, task_env.subject)

    assert (await task_env.repo.read(child.id)).status == TaskStatus.TODO
    assert (await task_env.repo.read(root.id)).deleted_at == archived_at
    assert (
        await task_env.session.scalar(select(func.count()).select_from(ActivityLogOrm))
        == previous_count
    )
    assert task_env.publisher.publish_all.await_args.args[0] == []
    with pytest.raises(NotFoundError):
        await task_env.service.get(root.id)
    with pytest.raises(NotFoundError):
        await task_env.service.list_linked(root.id, "subtasks", Pagination())


async def test_related_service_persists_two_sided_history_without_changing_statuses(
    task_env,
    add_task,
    engine: AsyncEngine,
) -> None:
    first = await add_task(project_id=uuid4())
    second = await add_task(project_id=uuid4(), status=TaskStatus.DONE)
    await task_env.session.commit()
    for linked in (True, False, True):
        await task_env.service.set_related(
            first.id,
            second.id,
            linked=linked,
            current_subject=task_env.subject,
        )
        # Повтор в обратном направлении не добавляет историю.
        await task_env.service.set_related(
            second.id,
            first.id,
            linked=linked,
            current_subject=task_env.subject,
        )

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        assert (await repo.read(first.id)).status == first.status
        assert (await repo.read(second.id)).status == second.status
        assert (await repo.get_links([first.id]))[first.id].related_tasks == {second.id}
        assert await observer.scalar(select(func.count()).select_from(TaskRelationOrm)) == 1
        logs = (await observer.scalars(select(ActivityLogOrm))).all()
        for owner, peer in ((first, second), (second, first)):
            owned = [log for log in logs if log.aggregate_id == owner.id]
            assert sorted(log.action for log in owned) == [
                "task.related_added",
                "task.related_added",
                "task.related_removed",
            ]
            assert all(log.changes == {"related_task_id": str(peer.id)} for log in owned)
            assert all(log.actor_id == task_env.subject.id for log in owned)


async def test_unlink_from_archived_neighbor_persists_soft_deleted_relation(
    task_env, add_task
) -> None:
    first, second = await add_task(), await add_task()
    await task_env.service.set_related(
        first.id,
        second.id,
        linked=True,
        current_subject=task_env.subject,
    )
    await task_env.service.archive(second.id, task_env.subject)

    await task_env.service.set_related(
        first.id,
        second.id,
        linked=False,
        current_subject=task_env.subject,
    )

    relation = await task_env.session.scalar(select(TaskRelationOrm))
    assert relation.deleted_at is not None
    assert not (await task_env.repo.read(first.id)).is_deleted
    assert (await task_env.repo.read(second.id)).is_deleted


@pytest.mark.parametrize("operation", ["archive", "related", "parent"])
async def test_history_failure_rolls_back_tasks_relations_and_already_flushed_history(
    task_env,
    add_task,
    service_factory,
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    root, peer = await add_task(), await add_task()
    child = await add_task(parent=root)
    await task_env.session.commit()

    async with AsyncSession(engine, autoflush=False, expire_on_commit=False) as failing_session:
        service = service_factory(failing_session)
        record_all = service.activity_log_recorder.record_all

        async def fail_after_writing_history(events) -> None:
            await record_all(events)
            await failing_session.flush()
            raise RuntimeError("History unavailable")

        monkeypatch.setattr(
            service.activity_log_recorder, "record_all", fail_after_writing_history
        )
        if operation == "archive":
            action = service.archive(root.id, task_env.subject)
        elif operation == "related":
            action = service.set_related(
                root.id, peer.id, linked=True, current_subject=task_env.subject
            )
        else:
            action = service.set_parent(child.id, peer.id, task_env.subject)
        with pytest.raises(RuntimeError, match="History unavailable"):
            await action
        service.event_publisher.publish_all.assert_not_awaited()
        # Закрытие сессии повторяет rollback при завершении запроса с ошибкой.

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        assert not (await repo.read(root.id)).is_deleted
        assert (await repo.read(child.id)).status == child.status
        assert (await repo.read(child.id)).parent_task_id == root.id
        assert await observer.scalar(select(func.count()).select_from(ActivityLogOrm)) == 0
        assert await observer.scalar(select(func.count()).select_from(TaskRelationOrm)) == 0


async def test_concurrent_parent_changes_cannot_create_a_cycle(
    task_env: SimpleNamespace,
    add_task,
    service_factory,
    engine: AsyncEngine,
) -> None:
    first, second = await add_task(), await add_task()
    await task_env.session.commit()
    async with (
        AsyncSession(engine, expire_on_commit=False) as first_session,
        AsyncSession(engine, expire_on_commit=False) as second_session,
    ):
        results = await asyncio.wait_for(
            asyncio.gather(
                service_factory(first_session).set_parent(first.id, second.id, task_env.subject),
                service_factory(second_session).set_parent(second.id, first.id, task_env.subject),
                return_exceptions=True,
            ),
            timeout=10,
        )
        assert sum(isinstance(result, InvalidStateError) for result in results) == 1
        assert sum(not isinstance(result, BaseException) for result in results) == 1

    async with AsyncSession(engine) as observer:
        repo = SqlTaskRepository(observer)
        stored_first, stored_second = await repo.read(first.id), await repo.read(second.id)
        assert (stored_first.parent_task_id, stored_second.parent_task_id) in {
            (second.id, None),
            (None, first.id),
        }
        assert await observer.scalar(select(func.count()).select_from(ActivityLogOrm)) == 1
