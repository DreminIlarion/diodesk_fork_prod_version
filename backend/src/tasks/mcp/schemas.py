from typing import Literal

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeInt

from src.iam.mcp.schemas import UserBrief
from src.mcp.schemas import ProjectLink, TicketLink
from src.shared.domain.vo import Priority, Tag

from ..domain.assignment import ACTIVE_TICKET_HOURS, UNESTIMATED_TASK_HOURS
from ..domain.vo import TaskStatus
from ..schemas import TaskCreate

StoryPointsValue = Literal[1, 2, 3, 5, 8, 13, 21]


class TaskBrief(BaseModel):
    """Краткая карточка задачи (для списков)."""

    id: UUID = Field(description="ID задачи")
    number: str = Field(description="Номер задачи")
    title: str = Field(description="Тема")
    status: TaskStatus = Field(description="Статус")
    priority: Priority = Field(description="Приоритет")
    story_points: int | None = Field(None, description="Оценка сложности в story points")
    estimated_hours: float | None = Field(None, description="Оценка трудозатрат, ч")
    due_date: date | None = Field(None, description="Срок выполнения")
    is_overdue: bool = Field(False, description="Срок прошёл, а задача не завершена")
    assignee: UserBrief | None = Field(None, description="Исполнитель")
    tags: list[str] = Field(default_factory=list, description="Теги")


class TaskCard(TaskBrief):
    """Полная карточка задачи."""

    description: str | None = Field(None, description="Постановка задачи")
    status_label: str = Field(description="Название статуса для пользователя")
    next_statuses: list[TaskStatus] = Field(
        default_factory=list, description="Статусы, в которые разрешён переход",
    )
    actual_hours: float = Field(0, description="Фактические трудозатраты, ч")
    reviewer: UserBrief | None = Field(None, description="Проверяющий")
    ticket: TicketLink | None = Field(None, description="Заявка, из которой создана задача")
    project: ProjectLink | None = Field(None, description="Проект")
    created_by: UUID = Field(description="ID автора задачи")
    created_at: datetime = Field(description="Дата создания")
    updated_at: datetime = Field(description="Дата обновления")
    started_at: datetime | None = Field(None, description="Начало выполнения")
    completed_at: datetime | None = Field(None, description="Дата завершения")
    is_archived: bool = Field(False, description="Задача в архиве")


class TaskDraft(BaseModel):
    """Черновик задачи для создания."""

    title: str = Field(
        min_length=3, max_length=255, description="Тема: краткая формулировка результата",
    )
    description: str | None = Field(
        None, description="Постановка: что сделать и критерии готовности",
    )
    priority: Priority = Field(
        Priority.MEDIUM,
        description="Приоритет. Для задач по заявке будет взят приоритет заявки",
    )
    story_points: StoryPointsValue | None = Field(
        None, description="Сложность по шкале Фибоначчи (1 - очень легко, 21 - очень сложно)",
    )
    estimated_hours: float | None = Field(
        None, gt=0, le=1000, description="Оценка трудозатрат в часах",
    )
    due_date: date | None = Field(None, description="Срок выполнения")
    assignee_id: UUID | None = Field(None, description="ID исполнителя")
    tags: list[str] = Field(
        default_factory=list, max_length=10, description="Теги (навыки, компоненты, тематика)",
    )
    ready_for_work: bool = Field(
        False, description="Сразу перевести в статус todo (готово к выполнению)",
    )

    def to_task_create(
            self,
            *,
            ticket_id: UUID | None = None,
            project_id: UUID | None = None,
            description: str | None = None,
            default_tags: list[str] | None = None,
    ) -> TaskCreate:
        return TaskCreate(
            ticket_id=ticket_id,
            project_id=project_id,
            title=self.title,
            description=description or self.description,
            priority=self.priority,
            story_points=self.story_points,
            assignee_id=self.assignee_id,
            estimated_hours=self.estimated_hours,
            due_date=self.due_date,
            tags=[Tag(name=name) for name in self.tags or default_tags or []],
            mark_as_todo=self.ready_for_work,
        )


class DraftFailure(BaseModel):
    """Черновик, по которому не удалось создать задачу."""

    index: NonNegativeInt = Field(description="Позиция черновика в запросе (с 0)")
    title: str = Field(description="Тема черновика")
    error: str = Field(description="Причина ошибки")


class TaskBatchResult(BaseModel):
    """Результат пакетного создания задач."""

    created: list[TaskBrief] = Field(default_factory=list, description="Созданные задачи")
    failed: list[DraftFailure] = Field(default_factory=list, description="Ошибки создания")


class WorkloadStats(BaseModel):
    """Показатели загрузки сотрудника."""

    open_tasks: NonNegativeInt = Field(description="Открытых задач")
    in_progress: NonNegativeInt = Field(description="Задач в работе")
    overdue: NonNegativeInt = Field(description="Просроченных задач")
    review_queue: NonNegativeInt = Field(description="Задач, ожидающих его ревью")
    active_tickets: NonNegativeInt = Field(description="Активных заявок на нём")
    story_points: NonNegativeInt = Field(description="Сумма story points открытых задач")
    remaining_hours: float = Field(description="Остаток по оценкам открытых задач, ч")
    unestimated_tasks: NonNegativeInt = Field(description="Открытых задач без оценки")
    load_hours: float = Field(
        description=(
            "Условная загрузка, ч: остаток оценок "
            f"+ {UNESTIMATED_TASK_HOURS} ч за неоценённую задачу "
            f"+ {ACTIVE_TICKET_HOURS} ч за активную заявку"
        ),
    )


class WorkloadEntry(WorkloadStats):
    """Загрузка конкретного сотрудника."""

    user: UserBrief = Field(description="Сотрудник")


class TagExperience(BaseModel):
    tag: str = Field(description="Тег")
    tasks: NonNegativeInt = Field(description="Выполнено задач с тегом")


class CompletedTaskBrief(BaseModel):
    number: str = Field(description="Номер задачи")
    title: str = Field(description="Тема")
    completed_at: datetime | None = Field(None, description="Дата завершения")
    actual_hours: float = Field(description="Фактические трудозатраты, ч")


class ExpertiseProfile(BaseModel):
    """Профиль опыта сотрудника по выполненным задачам."""

    user: UserBrief = Field(description="Сотрудник")
    period_days: int = Field(description="Анализируемый период, дней")
    completed_tasks: NonNegativeInt = Field(description="Выполнено задач за период")
    top_tags: list[TagExperience] = Field(description="Самые частые теги")
    top_keywords: list[str] = Field(description="Частые темы из названий и описаний задач")
    recent_tasks: list[CompletedTaskBrief] = Field(description="Последние выполненные задачи")
    estimation_ratio: float | None = Field(
        None,
        description="Медиана отношения факта к оценке: >1 - задачи занимают больше оценки",
    )


class AssigneeSuggestion(BaseModel):
    """Кандидат в исполнители."""

    user: UserBrief = Field(description="Сотрудник")
    score: float = Field(description="Итоговая оценка от 0 до 1")
    relevance: float = Field(description="Соответствие опыта задаче от 0 до 1")
    availability: float = Field(description="Доступность от 0 до 1 (1 - свободен)")
    workload: WorkloadStats = Field(description="Текущая загрузка")
    reasons: list[str] = Field(description="Обоснование")


class TaskSuggestion(BaseModel):
    """Задача, подходящая сотруднику."""

    task: TaskBrief = Field(description="Задача")
    score: float = Field(description="Итоговая оценка от 0 до 1")
    relevance: float = Field(description="Соответствие опыту сотрудника от 0 до 1")
    reasons: list[str] = Field(description="Обоснование")


class WorkflowStatus(BaseModel):
    status: TaskStatus = Field(description="Статус")
    label: str = Field(description="Название для пользователя")
    next_statuses: list[TaskStatus] = Field(description="Разрешённые переходы")
    editable: bool = Field(description="Можно ли редактировать задачу в этом статусе")
    assignable: bool = Field(description="Можно ли назначать исполнителя в этом статусе")


class TaskWorkflowGuide(BaseModel):
    """Жизненный цикл задачи и правила работы с ней."""

    statuses: list[WorkflowStatus]
    story_points_scale: list[int]
    rules: list[str]
