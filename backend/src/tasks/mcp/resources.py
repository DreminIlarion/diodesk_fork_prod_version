from fastmcp.dependencies import Depends
from fastmcp.resources import resource

from src.iam.domain.repos import UserRepository
from src.iam.mcp.dependencies import get_user_repo

from ..domain.consts import ALLOWED_ASSIGN_STATUSES, ALLOWED_EDIT_STATUSES, TASK_STATUS_LABEL_MAP
from ..domain.repos import TaskRepository
from ..domain.vo import StoryPoints, TaskStatus
from ..domain.workflow import task_workflow
from ..services import TaskService
from .dependencies import get_task_repo, get_task_service
from .presenters import present_task
from .references import find_task
from .schemas import TaskWorkflowGuide, WorkflowStatus

WORKFLOW_RULES = (
    (
        "На ревью (to_review) задача отправляется только через request_task_review: "
        "нужен проверяющий, и он не может быть исполнителем."
    ),
    (
        "В статусе in_progress у задачи обязан быть исполнитель. Вход в работу запускает "
        "учёт времени, выход из работы добавляет потраченное время в фактические часы."
    ),
    "Отмена задачи и возврат из todo в backlog снимают исполнителя и проверяющего.",
    "Задачи по заявке наследуют её приоритет и проект, номер задачи - <номер заявки>-NNN.",
    "Story points - шкала Фибоначчи. Задачи на 13 SP и больше стоит декомпозировать.",
)


@resource(
    "tasks://workflow",
    name="task_workflow",
    description="Жизненный цикл задачи: статусы, допустимые переходы и правила",
    mime_type="application/json",
    tags={"tasks"},
)
def get_task_workflow() -> str:
    guide = TaskWorkflowGuide(
        statuses=[
            WorkflowStatus(
                status=status,
                label=TASK_STATUS_LABEL_MAP[status],
                next_statuses=task_workflow.next_statuses(status),
                editable=status in ALLOWED_EDIT_STATUSES,
                assignable=status in ALLOWED_ASSIGN_STATUSES,
            )
            for status in TaskStatus
        ],
        story_points_scale=sorted(StoryPoints.ALLOWED_VALUES),
        rules=list(WORKFLOW_RULES),
    )
    return guide.model_dump_json()


@resource(
    "tasks://{reference}",
    name="task",
    description="Карточка задачи по номеру или ID",
    mime_type="application/json",
    tags={"tasks"},
)
async def get_task_card(
        reference: str,
        task_repo: TaskRepository = Depends(get_task_repo),
        service: TaskService = Depends(get_task_service),
        user_repo: UserRepository = Depends(get_user_repo),
) -> str:
    task = await find_task(task_repo, reference)
    card = await present_task(await service.get(task.id), user_repo)
    return card.model_dump_json()


RESOURCES = (get_task_workflow, get_task_card)
