from collections import defaultdict
from collections.abc import Collection
from dataclasses import replace
from datetime import timedelta
from uuid import UUID

from src.iam.domain.entities import User
from src.iam.domain.repos import UserRepository
from src.iam.domain.vo import UserRole
from src.shared.domain.repos import get_or_raise_404
from src.shared.schemas import Pagination
from src.shared.utils.time import current_datetime
from src.tickets.domain.repos import TicketRepository

from ..domain.assignment import (
    AssigneeMatch,
    CompletedTask,
    Expertise,
    TaskMatch,
    TaskProfile,
    Workload,
    rank_assignees,
    rank_tasks,
)
from ..domain.dtos import TaskSearchFilters
from ..domain.entities import Task
from ..domain.repos import TaskRepository
from ..domain.vo import TaskStatus

# Роли, среди которых по умолчанию ищутся исполнители задач
DEFAULT_ASSIGNEE_ROLES = frozenset({
    UserRole.DEVELOPER, UserRole.SUPPORT_AGENT, UserRole.SUPPORT_MANAGER,
})
# Глубина истории для построения профиля опыта
DEFAULT_EXPERTISE_PERIOD = timedelta(days=180)

MAX_CANDIDATES = 200
MAX_HISTORY_ITEMS = 2000
# Сколько свободных задач анализируется при подборе задач для сотрудника
MAX_OPEN_TASKS_SCAN = 100


class TaskAssignmentService:
    """
    Подбор исполнителей для задач (с учётом опыта и загрузки)
    и подбор задач для сотрудника (с учётом его опыта и срочности задач).
    """

    def __init__(
            self,
            task_repo: TaskRepository,
            ticket_repo: TicketRepository,
            user_repo: UserRepository,
    ) -> None:
        self.task_repo = task_repo
        self.ticket_repo = ticket_repo
        self.user_repo = user_repo

    async def find_candidates(self, roles: Collection[UserRole] | None = None) -> list[User]:
        """Активные сотрудники, которых можно рассматривать как исполнителей."""

        return await self.user_repo.search(
            roles=roles or DEFAULT_ASSIGNEE_ROLES, limit=MAX_CANDIDATES,
        )

    async def get_workloads(self, user_ids: Collection[UUID]) -> dict[UUID, Workload]:
        """Загрузка сотрудников по задачам и активным заявкам."""

        task_workloads = {
            workload.user_id: workload
            for workload in await self.task_repo.get_workloads(user_ids)
        }
        active_tickets = await self.ticket_repo.count_active_by_assignee(user_ids)

        return {
            user_id: replace(
                task_workloads.get(user_id, Workload(user_id=user_id)),
                active_tickets=active_tickets.get(user_id, 0),
            )
            for user_id in user_ids
        }

    async def get_expertise(
            self,
            user_ids: Collection[UUID],
            period: timedelta = DEFAULT_EXPERTISE_PERIOD,
    ) -> dict[UUID, Expertise]:
        """Профили опыта сотрудников по выполненным за период задачам."""

        history = await self.task_repo.get_completed(
            user_ids, since=current_datetime() - period, limit=MAX_HISTORY_ITEMS,
        )

        by_assignee: defaultdict[UUID, list[CompletedTask]] = defaultdict(list)
        for task in history:
            by_assignee[task.assignee_id].append(task)

        return {
            user_id: Expertise.from_history(user_id, by_assignee[user_id])
            for user_id in user_ids
        }

    async def suggest_assignees(
            self,
            task_id: UUID,
            *,
            roles: Collection[UserRole] | None = None,
            limit: int = 5,
    ) -> list[AssigneeMatch]:
        """Лучшие кандидаты в исполнители задачи."""

        task = await get_or_raise_404(self.task_repo.read, task_id, Task)
        candidate_ids = [user.id for user in await self.find_candidates(roles)]

        workloads = await self.get_workloads(candidate_ids)
        expertise = await self.get_expertise(candidate_ids)

        profile = TaskProfile.of(task.title, task.description, (tag.name for tag in task.tags))
        return rank_assignees(
            profile,
            ((expertise[user_id], workloads[user_id]) for user_id in candidate_ids),
            limit=limit,
        )

    async def suggest_tasks(
            self,
            user_id: UUID,
            *,
            project_id: UUID | None = None,
            limit: int = 5,
    ) -> list[TaskMatch]:
        """Свободные задачи, которые лучше всего подходят сотруднику."""

        expertise = (await self.get_expertise([user_id]))[user_id]
        open_tasks = await self.task_repo.search(
            TaskSearchFilters(
                statuses={TaskStatus.BACKLOG, TaskStatus.TODO},
                unassigned_only=True,
                project_id=project_id,
            ),
            Pagination(page=1, size=MAX_OPEN_TASKS_SCAN),
        )

        return rank_tasks(
            expertise, open_tasks.items, today=current_datetime().date(), limit=limit,
        )
