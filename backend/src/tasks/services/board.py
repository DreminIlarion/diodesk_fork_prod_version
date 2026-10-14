from uuid import UUID

from ddf.application.dsl import Expression

from src.iam.domain.authz import Subject
from src.iam.domain.entities import User
from src.iam.domain.repos import UserRepository
from src.projects.domain.entities import Project
from src.projects.domain.repos import ProjectRepository
from src.tickets.domain.entities import Ticket
from src.tickets.domain.repos import TicketRepository

from ...shared.schemas import Pagination
from ..domain.consts import TASK_STATUS_LABEL_MAP
from ..domain.repos import TaskRepository, TaskView
from ..dsl import apply_kanban_context
from ..mappers import map_task_view_to_response
from ..schemas import (
    KanbanBoard,
    KanbanColumn,
    KanbanContextType,
    TaskViewResponse,
)


class TaskBoardService:
    def __init__(
            self,
            task_repo: TaskRepository,
            ticket_repo: TicketRepository,
            user_repo: UserRepository,
            project_repo: ProjectRepository,
    ) -> None:
        self.task_repo = task_repo
        self.ticket_repo = ticket_repo
        self.user_repo = user_repo
        self.project_repo = project_repo

    async def get_kanban_board(
        self,
        pagination: Pagination,
        context: KanbanContextType,
        query: Expression | None,
        current_subject: Subject,
    ) -> KanbanBoard:
        """Получение канбан доски с задачами"""

        # 2. Определение контекста задач
        query = apply_kanban_context(
            context,
            current_subject_id=current_subject.id,
            query=query,
        )

        # 3. Формирование канбан доски
        groups = await self.task_repo.get_grouped_by_status(
            pagination,
            query=query,
        )

        all_tasks = [
            task
            for page in groups.values()
            for task in page.items
        ]

        ticket_ids = list({
            task.ticket_id
            for task in all_tasks
            if task.ticket_id is not None
        })
        project_ids = list({
            task.project_id
            for task in all_tasks
            if task.project_id is not None
        })

        ticket_list = await self.ticket_repo.get_by_ids(ticket_ids)
        project_list = await self.project_repo.get_by_ids(project_ids)

        tickets: dict[UUID, Ticket] = {
            ticket.id: ticket
            for ticket in ticket_list
        }
        projects: dict[UUID, Project] = {
            project.id: project
            for project in project_list
        }

        reporter_ids = list({
            ticket.reporter_id
            for ticket in ticket_list
        })
        reporter_list = await self.user_repo.get_by_ids(reporter_ids)

        reporters: dict[UUID, User] = {
            reporter.id: reporter
            for reporter in reporter_list
        }

        def mapper(task: TaskView) -> TaskViewResponse:
            ticket = (
                tickets.get(task.ticket_id)
                if task.ticket_id is not None
                else None
            )
            reporter = (
                reporters.get(ticket.reporter_id)
                if ticket is not None
                else None
            )
            project = (
                projects.get(task.project_id)
                if task.project_id is not None
                else None
            )
    
            return map_task_view_to_response(
                task,
                ticket=ticket,
                reporter=reporter,
                project=project,
            )

        columns = [
            KanbanColumn(
                status=status,
                label=TASK_STATUS_LABEL_MAP[status],
                tasks=tasks_page.to_response(mapper),
            )
            for status, tasks_page in groups.items()
        ]

        # 4. Общее количество задач с учётом контекста
        total_tasks = sum(column.tasks.total_items for column in columns)

        return KanbanBoard(context=context, columns=columns, total_tasks=total_tasks)
