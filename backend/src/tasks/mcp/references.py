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
        description="Номер задачи (например, TASK-001 или INT-26-00000012-001) или её UUID",
    ),
]


async def find_task(task_repo: TaskRepository, reference: str) -> Task:
    """Находит задачу по UUID или человеко-читаемому номеру."""

    reference = reference.strip()
    try:
        task_id = UUID(reference)
    except ValueError:
        task = await task_repo.get_by_number(TaskNumber(reference.upper()))
    else:
        task = await task_repo.read(task_id)

    if task is None:
        raise NotFoundError(f"Task '{reference}' not found")

    return task
