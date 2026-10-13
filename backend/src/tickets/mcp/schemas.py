from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeInt

from src.iam.mcp.schemas import UserBrief
from src.mcp.schemas import ProjectLink
from src.shared.domain.vo import Priority
from src.tasks.mcp.schemas import TaskBrief

from ..domain.vo import TicketStatus, TicketType


class TicketBrief(BaseModel):
    """Краткая карточка заявки (для списков)."""

    id: UUID = Field(description="ID заявки")
    number: str = Field(description="Номер заявки")
    title: str = Field(description="Заголовок")
    type: TicketType = Field(description="Вид заявки")
    status: TicketStatus = Field(description="Статус")
    priority: Priority = Field(description="Приоритет")
    reporter: UserBrief | None = Field(None, description="Инициатор")
    assignee: UserBrief | None = Field(None, description="Ответственный")
    tags: list[str] = Field(default_factory=list, description="Теги")
    created_at: datetime = Field(description="Дата создания")
    url: str = Field(description="Ссылка на заявку в веб-интерфейсе")


class TaskPoolSummary(BaseModel):
    """Сводка по задачам, созданным по заявке."""

    total: NonNegativeInt = Field(description="Всего задач")
    open: NonNegativeInt = Field(description="Незавершённых задач")
    done: NonNegativeInt = Field(description="Выполненных задач")
    unassigned: NonNegativeInt = Field(description="Незавершённых задач без исполнителя")
    story_points: NonNegativeInt = Field(description="Сумма story points незавершённых задач")
    estimated_hours: float = Field(description="Сумма оценок незавершённых задач, ч")


class TicketCard(TicketBrief):
    """Полная карточка заявки с пулом задач."""

    description: str = Field(description="Описание проблемы или запроса")
    project: ProjectLink | None = Field(None, description="Проект")
    counterparty_id: UUID | None = Field(None, description="ID контрагента (клиента)")
    updated_at: datetime = Field(description="Дата обновления")
    resolved_at: datetime | None = Field(None, description="Дата решения")
    closed_at: datetime | None = Field(None, description="Дата закрытия")
    is_archived: bool = Field(False, description="Заявка в архиве")
    task_pool: TaskPoolSummary = Field(description="Сводка по задачам заявки")
    tasks: list[TaskBrief] = Field(default_factory=list, description="Задачи по заявке")
