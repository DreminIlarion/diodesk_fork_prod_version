from typing import Literal

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from src.shared.domain.vo import Priority, Tag

from ..domain.vo import TaskStatus
from ..schemas import TaskCreate, TaskUpdate

StoryPointsValue = Literal[1, 2, 3, 5, 8, 13, 21]


class TaskDraft(BaseModel):
    """Данные для создания задачи через ИИ-чат."""

    title: str = Field(
        min_length=3,
        max_length=255,
        description="Краткое название результата задачи",
    )
    description: str | None = Field(
        None,
        description="Описание и критерии готовности",
    )
    priority: Priority = Field(
        Priority.MEDIUM,
        description="Приоритет задачи",
    )
    story_points: StoryPointsValue | None = Field(
        None,
        description="Оценка сложности: 1, 2, 3, 5, 8, 13 или 21",
    )
    estimated_hours: float | None = Field(
        None,
        gt=0,
        description="Предварительная оценка трудозатрат в часах",
    )
    due_date: date | None = Field(None, description="Срок выполнения")
    assignee_id: UUID | None = Field(None, description="ID исполнителя")
    ticket_id: UUID | None = Field(None, description="ID исходной заявки")
    project_id: UUID | None = Field(None, description="ID проекта")
    stage_id: UUID | None = Field(None, description="ID этапа проекта")
    tags: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="Теги задачи",
    )
    ready_for_work: bool = Field(
        False,
        description="Создать сразу в статусе todo вместо backlog",
    )

    def to_task_create(self) -> TaskCreate:
        return TaskCreate(
            title=self.title,
            description=self.description,
            priority=self.priority,
            story_points=self.story_points,
            estimated_hours=self.estimated_hours,
            due_date=self.due_date,
            assignee_id=self.assignee_id,
            ticket_id=self.ticket_id,
            project_id=self.project_id,
            stage_id=self.stage_id,
            tags=[Tag(name=name) for name in self.tags],
            mark_as_todo=self.ready_for_work,
        )


class TaskChanges(BaseModel):
    """Поля задачи, которые нужно изменить."""

    title: str | None = Field(
        None,
        min_length=3,
        max_length=255,
        description="Новое название задачи",
    )
    description: str | None = Field(
        None,
        description="Новое описание задачи",
    )
    priority: Priority | None = Field(
        None,
        description="Новый приоритет",
    )
    story_points: StoryPointsValue | None = Field(
        None,
        description="Новая оценка сложности",
    )
    estimated_hours: float | None = Field(
        None,
        ge=0,
        description="Новая оценка трудозатрат в часах",
    )
    due_date: date | None = Field(
        None,
        description="Новый срок выполнения",
    )

    @model_validator(mode="after")
    def validate_changes(self) -> TaskChanges:
        if all(
            value is None
            for value in (
                self.title,
                self.description,
                self.priority,
                self.story_points,
                self.estimated_hours,
                self.due_date,
            )
        ):
            raise ValueError("At least one task field must be provided")

        return self

    def to_task_update(self) -> TaskUpdate:
        return TaskUpdate(
            title=self.title,
            description=self.description,
            priority=self.priority,
            story_points=self.story_points,
            estimated_hours=self.estimated_hours,
            due_date=self.due_date,
        )


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
