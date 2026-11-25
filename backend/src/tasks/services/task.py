from decimal import Decimal
from uuid import UUID

from src.activity_logs.recorder import ActivityLogRecorder
from src.iam.domain.authz import Subject
from src.iam.domain.entities import User
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.repos import UserRepository
from src.projects.domain.entities import Project
from src.projects.domain.repos import ProjectRepository
from src.shared.domain.events import EventPublisher
from src.shared.domain.exceptions import InvalidStateError, NotFoundError
from src.shared.domain.repos import UnitOfWork, finalize, get_or_raise_404
from src.shared.domain.vo import Priority, Tag
from src.tickets.domain.entities import Ticket
from src.tickets.domain.repos import TicketRepository

from ..domain.authz import TaskAuthZService
from ..domain.entities import Task
from ..domain.repos import TaskRepository
from ..domain.vo import TaskNumber, TaskStatus
from ..mappers import map_task_to_response
from ..schemas import ReviewDecision, TaskCreate, TaskResponse, TaskUpdate
from ..validators import inherit_parent_context, validate_parent_target


async def _require_edit(
    authz: TaskAuthZService,
    subject: Subject,
    *tasks: Task,
) -> None:
    """Проверить право изменения каждой переданной задачи."""

    checked_ids: set[UUID] = set()

    for task in tasks:
        if task.id in checked_ids:
            continue

        permission = await authz.can_edit_task(
            subject=subject,
            task=task,
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        checked_ids.add(task.id)


def _resolve_stage_id(
    stage_id: UUID | None,
    project_id: UUID | None,
    project: Project | None,
    ticket: Ticket | None,
    *,
    inherit_from_ticket: bool,
) -> UUID | None:
    if inherit_from_ticket and stage_id is None and ticket is not None:
        stage_id = getattr(ticket, "stage_id", None)

    if stage_id is None:
        return None

    if project_id is None:
        raise InvalidStateError("Stage cannot be specified without project")
    if project is None:
        raise NotFoundError(f"Project with ID {project_id} not found")
    if project.find_stage(stage_id) is None:
        raise NotFoundError(
            f"Stage with ID {stage_id} does not exist in project {project_id}"
        )

    return stage_id


class TaskService:
    def __init__(
            self,
            uow: UnitOfWork,
            task_repo: TaskRepository,
            ticket_repo: TicketRepository,
            user_repo: UserRepository,
            project_repo: ProjectRepository,
            task_authz_service: TaskAuthZService,
            activity_log_recorder: ActivityLogRecorder,
            event_publisher: EventPublisher,
    ) -> None:
        self.uow = uow
        self.task_repo = task_repo
        self.ticket_repo = ticket_repo
        self.user_repo = user_repo
        self.project_repo = project_repo
        self.task_authz_service = task_authz_service
        self.activity_log_recorder = activity_log_recorder
        self.event_publisher = event_publisher

    @staticmethod
    def _resolve_project_id(
            data: TaskCreate, ticket: Ticket | None = None
    ) -> UUID | None:
        """
        Определение правильного ID проекта для привязи к задаче.
        """

        project_id = data.project_id

        # Если указан тикет - проверка на его существование + подтягивание проекта
        if ticket is not None and ticket.project_id is not None:

            # Указанный проект и проект тикета должны совпадать
            if project_id is not None and project_id != ticket.project_id:
                raise InvalidStateError("Project mismatch with ticket")

            project_id = ticket.project_id

        return project_id

    @staticmethod
    def _resolve_priority(
        data: TaskCreate,
        ticket: Ticket | None = None,
    ) -> Priority:
        if ticket is not None:
            return ticket.priority

        return data.priority

    async def _load_creation_context(
        self,
        data: TaskCreate,
        parent: Task | None,
    ) -> tuple[Ticket | None, Project | None, UUID | None, UUID | None]:
        ticket = None
        if data.ticket_id is not None:
            ticket = await self.ticket_repo.read(data.ticket_id)
            if ticket is None:
                raise NotFoundError(f"Ticket with ID {data.ticket_id} not found")
            if parent is not None and ticket.project_id != parent.project_id:
                raise InvalidStateError("Ticket project mismatch with parent task")

        project_id = self._resolve_project_id(data, ticket)
        if parent is not None and project_id != parent.project_id:
            raise InvalidStateError("Project mismatch with parent task")

        project = None
        if project_id is not None:
            project = await self.project_repo.read(project_id)
            if project is None:
                raise NotFoundError(f"Project with ID {project_id} not found")

        stage_id = _resolve_stage_id(
            data.stage_id,
            project_id,
            project,
            ticket,
            inherit_from_ticket=parent is None,
        )
        return ticket, project, project_id, stage_id

    async def create(self, data: TaskCreate, current_subject: Subject) -> TaskResponse:
        """
        Создание новой задачи.
        """
        parent = None

        if data.parent_task_id is not None:
            await self.task_repo.lock_graph()

            parent = await get_or_raise_404(
                self.task_repo.read_for_update,
                data.parent_task_id,
                Task,
            )

            await _require_edit(
                self.task_authz_service,
                current_subject,
                parent,
            )

            data = inherit_parent_context(data, parent)
            validate_parent_target(parent, data.project_id)

        permission = await self.task_authz_service.can_create_task(
            subject=current_subject, project_id=data.project_id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        ticket, project, project_id, stage_id = await self._load_creation_context(data, parent)
        project_key = None if project is None else project.key

        ticket_id = None if ticket is None else ticket.id
        sequence = await self.task_repo.get_next_sequence(
            ticket_id=ticket_id, project_id=project_id
        )

        ticket_number = None if ticket is None else ticket.number
        task_number = TaskNumber.create(
            ticket_number=ticket_number,
            project_key=project_key,
            sequence=sequence,
        )

        priority = self._resolve_priority(data, ticket)

        task = Task.create(
            number=task_number,
            title=data.title,
            description=data.description,
            priority=priority,
            due_date=data.due_date,
            estimated_hours=data.estimated_hours,
            story_points=data.story_points,
            project_id=project_id,
            stage_id=stage_id,
            ticket_id=ticket_id,
            created_by=current_subject.id,
            tags=[
                Tag(name=tag.name, color=tag.color)
                for tag in data.tags
            ],
        )

        if parent is not None:
            task.change_parent(
                parent.id,
                current_subject.id,
            )

        if data.mark_as_todo:
            task.change_status(new_status=TaskStatus.TODO, changed_by=current_subject.id)

        # ✅ Добавить назначение исполнителя при создании
        if data.assignee_id:
            assignee = await get_or_raise_404(self.user_repo.read, data.assignee_id, User)
            permission = await self.task_authz_service.can_assign_task(
                subject=current_subject, task=task, assignee=assignee
            )
            if permission.allowed:
                task.assign_to(assignee_id=data.assignee_id, assigned_by=current_subject.id)

        await self.task_repo.create(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def set_parent(
        self,
        task_id: UUID,
        parent_task_id: UUID | None,
        current_subject: Subject,
    ) -> TaskResponse:
        await self.task_repo.lock_graph()

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        old_parent = None

        if task.parent_task_id is not None:
            old_parent = await self.task_repo.read_for_update(
                task.parent_task_id,
                include_deleted=True,
            )

            if old_parent is None:
                raise NotFoundError(
                    "Previous parent task not found"
                )

        affected_tasks = [task]

        if old_parent is not None:
            affected_tasks.append(old_parent)

        await _require_edit(
            self.task_authz_service,
            current_subject,
            *affected_tasks,
        )

        if parent_task_id == task.parent_task_id:
            await finalize(
                self.uow,
                task,
                event_publisher=self.event_publisher,
                activity_recorder=self.activity_log_recorder,
            )

            return await self._map_response(task)

        if parent_task_id is not None:
            parent = await get_or_raise_404(
                self.task_repo.read_for_update,
                parent_task_id,
                Task,
            )

            await _require_edit(
                self.task_authz_service,
                current_subject,
                parent,
            )

            validate_parent_target(
                parent,
                task.project_id,
            )

            subtree_ids = await self.task_repo.subtree_ids(
                task.id
            )

            if parent.id in subtree_ids:
                raise InvalidStateError(
                    "Parent assignment would create a task cycle"
                )

        task.change_parent(
            parent_task_id,
            current_subject.id,
        )

        await self.task_repo.update(task)
        await self.uow.flush()

        await finalize(
            self.uow,
            task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder,
        )

        return await self._map_response(task)

    async def change_status(
            self, task_id: UUID, new_status: TaskStatus, current_subject: Subject
    ) -> TaskResponse:
        """
        Изменение статуса задачи.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        if new_status == TaskStatus.TO_REVIEW:
            raise InvalidStateError(
                "Use the request-review endpoint to move a task to review"
            )

        permission = await self.task_authz_service.can_change_status(
            subject=current_subject,
            task=task,
            new_status=new_status
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.change_status(new_status=new_status, changed_by=current_subject.id)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def edit(
            self, task_id: UUID, data: TaskUpdate, current_subject: Subject
    ) -> TaskResponse:
        """
        Редактировать содержание задачи.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        permission = await self.task_authz_service.can_edit_task(
            subject=current_subject, task=task
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.edit(
            title=data.title,
            description=data.description,
            priority=data.priority,
            story_points=data.story_points,
            estimated_hours=data.estimated_hours,
            due_date=data.due_date,
        )

        if data.actual_hours is not None:
            task.actual_hours = Decimal(str(data.actual_hours))

        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def assign_to(
            self, task_id: UUID, assignee_id: UUID, current_subject: Subject
    ) -> TaskResponse:
        """
        Назначить исполнителя на задачу.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )
        assignee = await get_or_raise_404(self.user_repo.read, assignee_id, User)

        permission = await self.task_authz_service.can_assign_task(
            subject=current_subject, task=task, assignee=assignee
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.assign_to(assignee_id=assignee_id, assigned_by=current_subject.id)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def request_review(
            self, task_id: UUID, reviewer_id: UUID, current_subject: Subject
    ) -> TaskResponse:
        """
        Запросить ревью на задачу у пользователя.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )
        reviewer = await get_or_raise_404(self.user_repo.read, reviewer_id, User)

        permission = await self.task_authz_service.can_request_review(
            subject=current_subject,
            task=task,
            reviewer=reviewer
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.request_review(reviewer_id=reviewer_id, requested_by=current_subject.id)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def review(
            self, task_id: UUID, decision: ReviewDecision, current_subject: Subject
    ) -> TaskResponse:
        """
        Провести ревью задачи.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        permission = await self.task_authz_service.can_review_task(
            subject=current_subject, task=task
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.complete_review(decision, reviewed_by=current_subject.id)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def archive(self, task_id: UUID, current_subject: Subject) -> TaskResponse:
        """
        Перенос задачи в архив.
        """

        await self.task_repo.lock_graph()

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        permission = await self.task_authz_service.can_archive_task(
            subject=current_subject, task=task
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        task.archive(archived_by=current_subject.id)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

        return await self._map_response(task)

    async def add_actual_hours(self, task_id: UUID, hours: Decimal) -> None:
        """
        Добавить факт потраченного времени на задачу.
        """

        task = await get_or_raise_404(
            self.task_repo.read_for_update,
            task_id,
            Task,
        )

        task.add_actual_hours(hours)
        await self.task_repo.update(task)

        await finalize(
            self.uow, task,
            event_publisher=self.event_publisher,
            activity_recorder=self.activity_log_recorder
        )

    async def _map_response(self, task: Task) -> TaskResponse:
        ticket = None
        reporter = None
        project = None

        if task.ticket_id is not None:
            ticket = await self.ticket_repo.read(task.ticket_id)

            if ticket is not None:
                reporter = await self.user_repo.read(ticket.reporter_id)

        if task.project_id is not None:
            project = await self.project_repo.read(task.project_id)

        links_by_id = await self.task_repo.get_links([task.id])

        return map_task_to_response(
            task,
            ticket=ticket,
            reporter=reporter,
            project=project,
            links=links_by_id[task.id],
        )

    async def get(self, task_id: UUID) -> TaskResponse:
        task = await get_or_raise_404(
            self.task_repo.read,
            task_id,
            Task,
        )

        return await self._map_response(task)
