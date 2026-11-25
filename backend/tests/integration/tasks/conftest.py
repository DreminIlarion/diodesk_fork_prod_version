from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from ddf.infra.database.sqlalchemy import Base
from sqlalchemy import DDL
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from src.activity_logs.infra.models import ActivityLogOrm
from src.activity_logs.infra.repos import SqlActivityLogRepository
from src.activity_logs.recorder import ActivityLogRecorder
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.repos import UserRepository
from src.iam.domain.vo import UserRole
from src.media.infra.models import AttachmentOrm
from src.projects.domain.repos import ProjectRepository
from src.shared.domain.events import EventPublisher
from src.shared.domain.vo import Priority
from src.tasks.domain.authz import TaskAuthZService
from src.tasks.domain.entities import Task
from src.tasks.domain.vo import TaskNumber, TaskStatus
from src.tasks.infra.models import TaskOrm, TaskRelationOrm, TaskSequence
from src.tasks.infra.repos import SqlTaskRepository
from src.tasks.services.task import TaskService
from src.tickets.domain.repos import TicketRepository

NOW = datetime(2026, 11, 25, 9, tzinfo=UTC)
TASK_TABLES = (
    AttachmentOrm.__table__,
    TaskOrm.__table__,
    TaskSequence.__table__,
    TaskRelationOrm.__table__,
    ActivityLogOrm.__table__,
)


@pytest.fixture
async def engine(postgres_container) -> AsyncIterator[AsyncEngine]:
    """Изолировать реальные коммиты теста в отдельной схеме контейнера."""
    schema_name = f"task_tests_{uuid4().hex}"
    test_engine = create_async_engine(
        postgres_container.get_connection_url(),
        connect_args={"server_settings": {"search_path": schema_name}},
    )
    try:
        async with test_engine.begin() as connection:
            await connection.execute(CreateSchema(schema_name))
            # Совместимость server_default из DDF с PostgreSQL 18.
            await connection.execute(
                DDL(
                    "CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid "
                    "LANGUAGE sql AS 'SELECT uuidv7()'"
                )
            )
            await connection.run_sync(
                lambda conn: Base.metadata.create_all(conn, tables=TASK_TABLES)
            )
        yield test_engine
    finally:
        async with test_engine.begin() as connection:
            await connection.execute(DropSchema(schema_name, cascade=True, if_exists=True))
        await test_engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine, autoflush=False, expire_on_commit=False) as test_session:
        yield test_session


@pytest.fixture
def subject() -> Subject:
    return Subject(id=uuid4(), type=SubjectType.USER, roles=[UserRole.ADMIN])


@pytest.fixture
def service_factory():
    def build(session: AsyncSession) -> TaskService:
        ticket_repo = AsyncMock(spec=TicketRepository)
        ticket_repo.read.return_value = None
        user_repo = AsyncMock(spec=UserRepository)
        user_repo.read.return_value = None
        project_repo = AsyncMock(spec=ProjectRepository)
        project_repo.read.return_value = None
        return TaskService(
            uow=session,
            task_repo=SqlTaskRepository(session),
            ticket_repo=ticket_repo,
            user_repo=user_repo,
            project_repo=project_repo,
            task_authz_service=TaskAuthZService(),
            activity_log_recorder=ActivityLogRecorder(SqlActivityLogRepository(session)),
            event_publisher=AsyncMock(spec=EventPublisher),
        )

    return build


@pytest.fixture
def task_env(session: AsyncSession, subject: Subject, service_factory) -> SimpleNamespace:
    service = service_factory(session)
    return SimpleNamespace(
        session=session,
        subject=subject,
        service=service,
        repo=service.task_repo,
        publisher=service.event_publisher,
    )


@pytest.fixture
def add_task(session: AsyncSession, subject: Subject):
    async def create(
        *,
        parent: Task | None = None,
        status: TaskStatus = TaskStatus.BACKLOG,
        project_id: UUID | None = None,
        deleted: bool = False,
        running: bool = False,
    ) -> Task:
        has_timer = running or status == TaskStatus.IN_PROGRESS
        task = Task(
            number=TaskNumber(f"TASK-{uuid4().int % 10**20:020d}"),
            title="Integration task",
            status=status,
            priority=Priority.MEDIUM,
            created_by=subject.id,
            created_at=NOW,
            updated_at=NOW,
            parent_task_id=parent.id if parent else None,
            project_id=project_id,
            completed_at=NOW if status == TaskStatus.DONE else None,
            deleted_at=NOW if deleted else None,
            assignee_id=subject.id if has_timer else None,
            reviewer_id=uuid4() if has_timer else None,
            started_at=NOW - timedelta(hours=1) if has_timer else None,
            working_since=NOW - timedelta(hours=1) if has_timer else None,
        )
        return await SqlTaskRepository(session).create(task)

    return create
