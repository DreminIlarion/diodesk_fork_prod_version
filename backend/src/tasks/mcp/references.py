from typing import Annotated

from uuid import UUID

from pydantic import Field

from src.shared.domain.exceptions import NotFoundError

from ..domain.entities import Task
from ..domain.repos import TaskRepository
from ..domain.vo import TaskNumber

TaskRef = Annotated[
    str,
    Field(
        min_length=1,
        description=(
            "UUID или человекочитаемый номер задачи, "
            "например TASK-001 или RSD-26-00000001-001"
        ),
    ),
]


async def find_task(
    task_repo: TaskRepository,
    reference: str,
) -> Task:
    """Найти задачу по UUID или человекочитаемому номеру."""

    reference = reference.strip()

    try:
        task_id = UUID(reference)
    except ValueError:
        try:
            number = TaskNumber(reference.upper())
        except ValueError:
            raise NotFoundError(f"Task '{reference}' not found") from None

        task = await task_repo.get_by_number(number)
    else:
        task = await task_repo.read(task_id)

    if task is None:
        raise NotFoundError(f"Task '{reference}' not found")

    return task
