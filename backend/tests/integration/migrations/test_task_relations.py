from typing import Any

from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import MetaData, Table, insert, inspect, select, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
from testcontainers.postgres import PostgresContainer

pytestmark = pytest.mark.integration

REVISION = "a6e48d957c21"
PARENT_REVISIONS = ("06d3fd2fdcaa", "d2f6b87c1a04")
MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"


def _run_migration(connection: Connection, operation: str, revision: str) -> None:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.attributes["connection"] = connection
    getattr(command, operation)(config, revision)


def _schema_snapshot(connection: Connection) -> dict[str, Any]:
    inspector = inspect(connection)
    return {
        name: {
            "columns": [
                (
                    column["name"],
                    column["type"].compile(dialect=connection.dialect),
                    column["nullable"],
                    column["default"],
                )
                for column in inspector.get_columns(name)
            ],
            "pk": inspector.get_pk_constraint(name),
            "unique": inspector.get_unique_constraints(name),
            "checks": inspector.get_check_constraints(name),
            "indexes": inspector.get_indexes(name),
            "foreign_keys": inspector.get_foreign_keys(name),
        }
        for name in inspector.get_table_names()
    }


def _reflect_tasks(connection: Connection) -> Table:
    return Table("tasks", MetaData(), autoload_with=connection)


def _reflect_relations(connection: Connection) -> Table:
    return Table("task_relations", MetaData(), autoload_with=connection)


async def _heads(connection: AsyncConnection) -> set[str]:
    return await connection.run_sync(
        lambda conn: set(MigrationContext.configure(conn).get_current_heads())
    )


@pytest.fixture(scope="module")
def migration_postgres() -> Iterator[PostgresContainer]:
    # Собственный контейнер: расширения старых миграций не затрагивают другие наборы.
    with PostgresContainer("postgres:18.6", driver="asyncpg") as postgres:
        yield postgres


@pytest.fixture
async def migration_db(migration_postgres: PostgresContainer) -> AsyncIterator[SimpleNamespace]:
    schema_name = f"migration_tests_{uuid4().hex}"
    engine = create_async_engine(
        migration_postgres.get_connection_url(),
        connect_args={"server_settings": {"search_path": schema_name}},
    )
    try:
        async with engine.connect() as connection:
            await connection.execute(CreateSchema(schema_name))
            await connection.commit()
            for revision in PARENT_REVISIONS:
                await connection.run_sync(_run_migration, "upgrade", revision)
            assert await _heads(connection) == set(PARENT_REVISIONS)
            baseline = await connection.run_sync(_schema_snapshot)
            tasks = await connection.run_sync(_reflect_tasks)
            ids = [uuid4() for _ in range(3)]
            await connection.execute(
                insert(tasks),
                [
                    {
                        "id": task_id,
                        "number": f"TASK-{index}",
                        "title": f"Existing task {index}",
                        "status": "BACKLOG",
                        "priority": "MEDIUM",
                        "actual_hours": 0,
                        "created_by": uuid4(),
                        "tags": [],
                    }
                    for index, task_id in enumerate(ids)
                ],
            )
            rows = (await connection.execute(select(tasks).order_by(tasks.c.id))).mappings().all()
            await connection.commit()
            yield SimpleNamespace(
                connection=connection,
                baseline=baseline,
                tasks=tasks,
                ids=ids,
                original_rows=[dict(row) for row in rows],
            )
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema_name, cascade=True, if_exists=True))
        await engine.dispose()


async def _upgrade(db: SimpleNamespace) -> tuple[Table, Table]:
    await db.connection.run_sync(_run_migration, "upgrade", REVISION)
    assert await _heads(db.connection) == {REVISION}
    return (
        await db.connection.run_sync(_reflect_tasks),
        await db.connection.run_sync(_reflect_relations),
    )


async def _populate_links(db: SimpleNamespace, tasks: Table, relations: Table) -> None:
    parent_id, child_id, peer_id = db.ids
    await db.connection.execute(
        update(tasks).where(tasks.c.id == child_id).values(parent_task_id=parent_id)
    )
    left, right = sorted((parent_id, peer_id))
    await db.connection.execute(insert(relations).values(left_task_id=left, right_task_id=right))
    await db.connection.commit()


async def _assert_original_rows(db: SimpleNamespace) -> None:
    rows = (await db.connection.execute(select(db.tasks).order_by(db.tasks.c.id))).mappings().all()
    assert [dict(row) for row in rows] == db.original_rows


async def test_upgrade_creates_expected_columns_indexes_and_constraints(migration_db) -> None:
    db = migration_db
    assert "parent_task_id" not in db.tasks.c
    assert "task_relations" not in db.baseline
    await _upgrade(db)
    schema = await db.connection.run_sync(_schema_snapshot)

    assert set(schema) == {*db.baseline, "task_relations"}
    tasks = schema["tasks"]
    assert ("parent_task_id", "UUID", True, None) in tasks["columns"]
    assert any(index["column_names"] == ["parent_task_id"] for index in tasks["indexes"])
    (parent_fk,) = [
        fk for fk in tasks["foreign_keys"] if fk["constrained_columns"] == ["parent_task_id"]
    ]
    assert parent_fk["referred_table"] == "tasks"
    assert parent_fk["referred_columns"] == ["id"]
    assert parent_fk["options"]["ondelete"] == "RESTRICT"
    assert {check["name"] for check in tasks["checks"]} == {"ck_tasks_parent_not_self"}

    relations = schema["task_relations"]
    assert relations["pk"]["constrained_columns"] == ["left_task_id", "right_task_id"]
    assert {fk["constrained_columns"][0] for fk in relations["foreign_keys"]} == {
        "left_task_id",
        "right_task_id",
    }
    assert all(fk["referred_table"] == "tasks" for fk in relations["foreign_keys"])
    assert all(fk["options"]["ondelete"] == "RESTRICT" for fk in relations["foreign_keys"])
    assert any(index["column_names"] == ["right_task_id"] for index in relations["indexes"])
    assert {check["name"] for check in relations["checks"]} == {"ck_task_relations_ordered_pair"}
    columns = {column[0]: column for column in relations["columns"]}
    assert set(columns) == {
        "left_task_id",
        "right_task_id",
        "created_at",
        "updated_at",
        "deleted_at",
    }
    for name in ("created_at", "updated_at"):
        assert columns[name][1] == "TIMESTAMP WITH TIME ZONE"
        assert columns[name][2] is False
        assert columns[name][3] is not None
    assert columns["deleted_at"][2] is True
    assert columns["deleted_at"][1] == "TIMESTAMP WITH TIME ZONE"
    await _assert_original_rows(db)


async def test_downgrade_restores_both_heads_and_preserves_existing_tasks(migration_db) -> None:
    db = migration_db
    tasks, relations = await _upgrade(db)
    await _populate_links(db, tasks, relations)

    # У merge-ревизии относительный downgrade -1 неоднозначен.
    await db.connection.run_sync(_run_migration, "downgrade", PARENT_REVISIONS[0])

    assert await _heads(db.connection) == set(PARENT_REVISIONS)
    assert await db.connection.run_sync(_schema_snapshot) == db.baseline
    await _assert_original_rows(db)


async def test_reupgrade_after_downgrade_restores_usable_relation_schema(migration_db) -> None:
    db = migration_db
    tasks, relations = await _upgrade(db)
    await _populate_links(db, tasks, relations)
    upgraded_schema = await db.connection.run_sync(_schema_snapshot)
    await db.connection.commit()
    await db.connection.run_sync(_run_migration, "downgrade", PARENT_REVISIONS[0])
    await db.connection.commit()

    tasks, relations = await _upgrade(db)

    assert await db.connection.run_sync(_schema_snapshot) == upgraded_schema
    await _assert_original_rows(db)
    assert (await db.connection.execute(select(relations))).all() == []
    assert (await db.connection.execute(select(tasks.c.parent_task_id))).scalars().all() == [
        None
    ] * len(db.ids)
    await _populate_links(db, tasks, relations)
    parent_id, child_id, peer_id = db.ids
    assert (
        await db.connection.scalar(select(tasks.c.parent_task_id).where(tasks.c.id == child_id))
        == parent_id
    )
    (row,) = (await db.connection.execute(select(relations))).mappings().all()
    assert (row["left_task_id"], row["right_task_id"]) == tuple(sorted((parent_id, peer_id)))
    assert row["created_at"] is not None
    assert row["updated_at"] is not None
    assert row["deleted_at"] is None


@pytest.mark.parametrize(
    ("case", "sqlstate"),
    [
        ("self_parent", "23514"),
        ("missing_parent", "23503"),
        ("delete_parent", "23001"),
        ("self_relation", "23514"),
        ("reversed_relation", "23514"),
        ("missing_left_peer", "23503"),
        ("missing_right_peer", "23503"),
        ("duplicate_relation", "23505"),
    ],
)
async def test_migrated_database_enforces_relation_constraints(
    migration_db,
    case: str,
    sqlstate: str,
) -> None:
    db = migration_db
    tasks, relations = await _upgrade(db)
    await _populate_links(db, tasks, relations)
    parent_id, child_id, peer_id = db.ids
    left, right = sorted((parent_id, peer_id))
    if case == "self_parent":
        statement = update(tasks).where(tasks.c.id == parent_id).values(parent_task_id=parent_id)
    elif case == "missing_parent":
        statement = update(tasks).where(tasks.c.id == child_id).values(parent_task_id=uuid4())
    elif case == "delete_parent":
        await db.connection.execute(relations.delete())
        await db.connection.commit()
        statement = tasks.delete().where(tasks.c.id == parent_id)
    else:
        if case == "self_relation":
            right = left
        elif case == "reversed_relation":
            left, right = right, left
        elif case == "missing_left_peer":
            left = UUID(int=0)
        elif case == "missing_right_peer":
            right = UUID(int=2**128 - 1)
        statement = insert(relations).values(left_task_id=left, right_task_id=right)
    with pytest.raises(IntegrityError) as error:
        async with db.connection.begin_nested():
            await db.connection.execute(statement)
    assert error.value.orig.sqlstate == sqlstate
