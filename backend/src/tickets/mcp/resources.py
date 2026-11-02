from fastmcp.dependencies import Depends
from fastmcp.resources import resource

from src.iam.domain.repos import UserRepository
from src.iam.mcp.dependencies import get_user_repo
from src.mcp.dependencies import get_project_repo
from src.projects.domain.repos import ProjectRepository
from src.tasks.domain.repos import TaskRepository
from src.tasks.mcp.dependencies import get_task_repo

from ..domain.repos import TicketRepository
from .dependencies import get_ticket_repo
from .presenters import present_ticket
from .references import find_ticket


@resource(
    "tickets://{reference}",
    name="ticket",
    description="Карточка заявки с пулом задач по номеру или ID",
    mime_type="application/json",
    tags={"tickets"},
)
async def get_ticket_card(
        reference: str,
        ticket_repo: TicketRepository = Depends(get_ticket_repo),
        task_repo: TaskRepository = Depends(get_task_repo),
        user_repo: UserRepository = Depends(get_user_repo),
        project_repo: ProjectRepository = Depends(get_project_repo),
) -> str:
    ticket = await find_ticket(ticket_repo, reference)
    card = await present_ticket(
        ticket, task_repo=task_repo, user_repo=user_repo, project_repo=project_repo,
    )
    return card.model_dump_json()


RESOURCES = (get_ticket_card,)
