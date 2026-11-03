from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from src.shared.domain.vo import Priority

from ..domain.vo import TaskStatus


class TaskBrief(BaseModel):
    """Краткая карточка задачи для ИИ-модели."""

    id: UUID = Field(description="ID задачи")
    number: str = Field(description="Человекочитаемый номер задачи")
    url: str = Field(description="Ссылка на задачу в ДИО-Деск")
    title: str = Field(description="Название задачи")
    description: str | None = Field(None, description="Описание задачи")
    status: TaskStatus = Field(description="Статус")
    priority: Priority = Field(description="Приоритет")
    story_points: int | None = Field(None, description="Оценка сложности")
    estimated_hours: float | None = Field(None, description="Оценка трудозатрат")
    due_date: date | None = Field(None, description="Срок выполнения")
    assignee_id: UUID | None = Field(None, description="ID исполнителя")
    reviewer_id: UUID | None = Field(None, description="ID проверяющего")
    project_id: UUID | None = Field(None, description="ID проекта")
    stage_id: UUID | None = Field(None, description="ID этапа проекта")
    ticket_id: UUID | None = Field(None, description="ID заявки")
    tags: list[str] = Field(default_factory=list, description="Теги")


class TaskCard(TaskBrief):
    """Полная карточка задачи для ИИ-модели."""

    status_label: str = Field(description="Человекочитаемое название статуса")
    next_statuses: list[TaskStatus] = Field(
        default_factory=list,
        description="Статусы, в которые задачу можно перевести",
    )
    actual_hours: float = Field(description="Фактически потраченные часы")
    created_by: UUID = Field(description="ID автора задачи")
    created_at: datetime = Field(description="Дата создания")
    updated_at: datetime = Field(description="Дата последнего изменения")
    started_at: datetime | None = Field(None, description="Дата начала работы")
    completed_at: datetime | None = Field(None, description="Дата завершения")
    working_since: datetime | None = Field(
        None,
        description="Начало текущей рабочей сессии",
    )
    is_archived: bool = Field(description="Находится ли задача в архиве")
