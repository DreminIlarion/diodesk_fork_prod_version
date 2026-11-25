from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from src.shared.schemas import Pagination
from src.tasks.domain.vo import TaskStatus
from src.tasks.infra.models import TaskOrm, TaskRelationOrm
from src.tasks.infra.repos import SqlTaskRepository

pytestmark = pytest.mark.integration


async def test_subtree_traverses_terminal_and_archived_nodes(task_env, add_task) -> None:
    root = await add_task()
    done = await add_task(parent=root, status=TaskStatus.DONE)
    archived = await add_task(parent=done, deleted=True)
    leaf = await add_task(parent=archived)
    unrelated = await add_task()
    await task_env.session.commit()

    expected = {root.id, done.id, archived.id, leaf.id}
    assert await task_env.repo.subtree_ids(root.id) == expected
    branch = await task_env.repo.subtree_for_update(root.id)
    assert [task.id for task in branch] == sorted(expected)
    assert unrelated.id not in expected
    assert await task_env.repo.subtree_ids(uuid4()) == set()
    assert await task_env.repo.subtree_for_update(uuid4()) == []


@pytest.mark.parametrize("loader", ["read_for_update", "subtree_for_update"])
async def test_locked_reads_prevent_updates_from_another_transaction(
    task_env,
    add_task,
    engine: AsyncEngine,
    loader: str,
) -> None:
    root = await add_task()
    child = await add_task(parent=root)
    await task_env.session.commit()
    await getattr(task_env.repo, loader)(root.id)
    locked_id = root.id if loader == "read_for_update" else child.id

    async with AsyncSession(engine) as competitor:
        with pytest.raises(DBAPIError) as error:
            await competitor.execute(
                select(TaskOrm.id).where(TaskOrm.id == locked_id).with_for_update(nowait=True)
            )
        assert error.value.orig.sqlstate == "55P03"


async def test_locked_read_refreshes_an_already_loaded_model(
    task_env,
    add_task,
    engine: AsyncEngine,
) -> None:
    task = await add_task()
    await task_env.session.commit()
    cached = await task_env.session.get(TaskOrm, task.id)
    async with AsyncSession(engine) as competitor:
        await competitor.execute(
            update(TaskOrm).where(TaskOrm.id == task.id).values(title="Updated")
        )
        await competitor.commit()

    loaded = await task_env.repo.read_for_update(task.id)

    assert loaded.title == "Updated"
    assert cached.title == "Updated"


async def test_graph_lock_serializes_independent_sessions(task_env, engine: AsyncEngine) -> None:
    await task_env.repo.lock_graph()
    async with AsyncSession(engine) as competitor:
        await competitor.execute(select(func.set_config("lock_timeout", "100ms", True)))
        with pytest.raises(DBAPIError) as error:
            await SqlTaskRepository(competitor).lock_graph()
        assert error.value.orig.sqlstate == "55P03"
        await competitor.rollback()
        await task_env.session.rollback()
        await SqlTaskRepository(competitor).lock_graph()


@pytest.mark.parametrize("invalid_parent", ["self", "missing"])
async def test_database_rejects_invalid_parent(task_env, add_task, invalid_parent: str) -> None:
    task = await add_task()
    await task_env.session.commit()
    parent_id = task.id if invalid_parent == "self" else uuid4()
    expected_state = "23514" if invalid_parent == "self" else "23503"

    with pytest.raises(IntegrityError) as error:
        async with task_env.session.begin_nested():
            await task_env.session.execute(
                update(TaskOrm).where(TaskOrm.id == task.id).values(parent_task_id=parent_id)
            )

    assert error.value.orig.sqlstate == expected_state
    assert (await task_env.repo.read(task.id)).parent_task_id is None


@pytest.mark.parametrize("invalid_pair", ["self", "reversed", "missing", "duplicate"])
async def test_database_rejects_invalid_related_pairs(
    task_env, add_task, invalid_pair: str
) -> None:
    first, second = await add_task(), await add_task()
    left, right = sorted((first.id, second.id))
    expected_state = "23514"
    if invalid_pair == "self":
        right = left
    elif invalid_pair == "reversed":
        left, right = right, left
    elif invalid_pair == "missing":
        left, right = sorted((first.id, uuid4()))
        expected_state = "23503"
    else:
        await task_env.repo.set_related(left, right, linked=True)
        expected_state = "23505"
    await task_env.session.commit()

    with pytest.raises(IntegrityError) as error:
        async with task_env.session.begin_nested():
            await task_env.session.execute(
                insert(TaskRelationOrm).values(left_task_id=left, right_task_id=right)
            )

    assert error.value.orig.sqlstate == expected_state


async def test_related_upsert_is_symmetric_idempotent_and_restores_soft_deleted_pair(
    task_env: SimpleNamespace,
    add_task,
) -> None:
    first, second = await add_task(), await add_task()
    assert await task_env.repo.set_related(first.id, second.id, linked=True)
    assert not await task_env.repo.set_related(second.id, first.id, linked=True)
    links = await task_env.repo.get_links([first.id, second.id])
    assert links[first.id].related_tasks == {second.id}
    assert links[second.id].related_tasks == {first.id}

    assert await task_env.repo.set_related(second.id, first.id, linked=False)
    assert not await task_env.repo.set_related(first.id, second.id, linked=False)
    assert (await task_env.repo.get_links([first.id]))[first.id].related_tasks == set()
    assert await task_env.repo.set_related(first.id, second.id, linked=True)
    await task_env.session.commit()
    rows = (await task_env.session.scalars(select(TaskRelationOrm))).all()
    (row,) = rows
    assert (row.left_task_id, row.right_task_id) == tuple(sorted((first.id, second.id)))
    assert row.deleted_at is None


async def test_batch_links_exclude_deleted_owners_children_and_peers(task_env, add_task) -> None:
    root = await add_task()
    child = await add_task(parent=root)
    archived_child = await add_task(parent=root, deleted=True)
    peer = await add_task()
    archived_peer = await add_task(deleted=True)
    for target in (peer, archived_peer):
        await task_env.repo.set_related(root.id, target.id, linked=True)
    links = await task_env.repo.get_links([root.id, peer.id, archived_child.id, archived_peer.id])

    assert links[root.id].subtasks == {child.id}
    assert links[root.id].related_tasks == {peer.id}
    assert links[peer.id].related_tasks == {root.id}
    assert links[archived_peer.id].related_tasks == set()
    assert links[archived_child.id].subtasks == set()
    assert await task_env.repo.get_links([]) == {}


@pytest.mark.parametrize("kind", ["subtasks", "related"])
async def test_link_lists_have_stable_pagination_and_exclude_archived_targets(
    task_env,
    add_task,
    kind: str,
) -> None:
    root = await add_task()
    children = [await add_task(parent=root) for _ in range(3)]
    archived = await add_task(parent=root, deleted=True)
    await add_task(parent=children[0])
    if kind == "related":
        for child in [*children, archived]:
            await task_env.repo.set_related(root.id, child.id, linked=True)
    expected = sorted(child.id for child in children)

    pages = [
        await task_env.repo.list_linked(root.id, kind, Pagination(page=page, size=1))
        for page in range(1, 4)
    ]

    assert [page.items[0].id for page in pages] == expected
    assert all(page.total_items == len(children) for page in pages)
    assert pages[0].has_next
    assert not pages[-1].has_next
    assert pages[-1].has_prev
