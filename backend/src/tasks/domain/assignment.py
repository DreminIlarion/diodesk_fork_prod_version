"""
Подбор исполнителей и задач.

Модель намеренно простая и объяснимая: итоговая оценка складывается из
релевантности опыта (теги и ключевые слова выполненных задач) и доступности
сотрудника (его текущей загрузки). Каждая рекомендация сопровождается причинами,
чтобы человек или AI-агент мог проверить и оспорить выбор.
"""

from typing import Self

import re
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from statistics import median
from uuid import UUID

from src.shared.domain.vo import Priority

from .repos import TaskView

# Условная оценка задачи без оценки трудозатрат (часы)
UNESTIMATED_TASK_HOURS = Decimal(4)
# Условная нагрузка от одной активной заявки (часы)
ACTIVE_TICKET_HOURS = Decimal(2)
# Ёмкость сотрудника, относительно которой считается доступность (часы)
CAPACITY_HOURS = Decimal(40)

# Сколько выполненных задач с тегом считается "полным" опытом по нему
TAG_SATURATION = 3
TAG_WEIGHT = 0.6
KEYWORD_WEIGHT = 0.4

# Веса итоговой оценки кандидата
RELEVANCE_WEIGHT = 0.6
AVAILABILITY_WEIGHT = 0.4

# Веса итоговой оценки задачи для сотрудника
TASK_RELEVANCE_WEIGHT = 0.75
TASK_URGENCY_WEIGHT = 0.25
URGENT_DUE_DAYS = 3

PRIORITY_URGENCY: Mapping[Priority, float] = {
    Priority.LOW: 0.25,
    Priority.MEDIUM: 0.5,
    Priority.HIGH: 0.75,
    Priority.CRITICAL: 1.0,
}

MIN_KEYWORD_LENGTH = 4
KEYWORD_STEM_LENGTH = 6
STOP_WORDS = frozenset({
    "будет", "если", "задача", "задачи", "задачу", "иметь", "какие", "когда", "который",
    "которые", "можно", "надо", "нужно", "необходимо", "после", "перед", "сделать",
    "также", "требуется", "чтобы", "этого", "этой", "этот", "with", "from", "that", "this",
})

_WORD_PATTERN = re.compile(r"[a-zа-яё0-9]+")


def extract_keywords(*texts: str | None) -> dict[str, str]:
    """
    Извлекает ключевые слова из текстов.
    Возвращает отображение "основа слова -> исходное слово". Обрезка до основы -
    дешёвая замена морфологии, чтобы "интеграция" и "интеграции" совпадали.
    """

    keywords: dict[str, str] = {}
    for text in texts:
        for word in _WORD_PATTERN.findall((text or "").lower()):
            if len(word) < MIN_KEYWORD_LENGTH or word in STOP_WORDS or word.isdigit():
                continue
            keywords.setdefault(word[:KEYWORD_STEM_LENGTH], word)

    return keywords


def normalize_tag(name: str) -> str:
    return name.strip().lower()


@dataclass(frozen=True, slots=True)
class Workload:
    """Текущая загрузка сотрудника по открытым задачам и заявкам."""

    user_id: UUID
    open_tasks: int = 0
    in_progress: int = 0
    overdue: int = 0
    review_queue: int = 0
    story_points: int = 0
    remaining_hours: Decimal = Decimal(0)
    unestimated_tasks: int = 0
    active_tickets: int = 0

    @property
    def load_hours(self) -> Decimal:
        """Условная загрузка в часах: остаток оценок + условные часы за остальное."""

        return (
            self.remaining_hours
            + UNESTIMATED_TASK_HOURS * self.unestimated_tasks
            + ACTIVE_TICKET_HOURS * self.active_tickets
        )

    @property
    def availability(self) -> float:
        """Доступность от 0 до 1: 1 - свободен, 0.5 - загружен на полную ёмкость."""

        return float(CAPACITY_HOURS / (CAPACITY_HOURS + self.load_hours))


@dataclass(frozen=True, slots=True)
class CompletedTask:
    """Выполненная задача - единица опыта сотрудника."""

    assignee_id: UUID
    number: str
    title: str
    description: str | None = None
    tags: frozenset[str] = frozenset()
    estimated_hours: Decimal | None = None
    actual_hours: Decimal = Decimal(0)
    completed_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class Expertise:
    """Профиль опыта сотрудника, построенный по выполненным задачам."""

    user_id: UUID
    completed_tasks: int = 0
    tags: Counter[str] = field(default_factory=Counter)
    keywords: Counter[str] = field(default_factory=Counter)
    keyword_labels: Mapping[str, str] = field(default_factory=dict)
    recent_tasks: tuple[CompletedTask, ...] = ()
    estimation_ratio: float | None = None

    @classmethod
    def from_history(
            cls, user_id: UUID, history: Sequence[CompletedTask], *, recent_limit: int = 5,
    ) -> Self:
        """Строит профиль по истории задач (ожидается сортировка от новых к старым)."""

        tags: Counter[str] = Counter()
        keywords: Counter[str] = Counter()
        labels: dict[str, str] = {}

        for task in history:
            tags.update(normalize_tag(tag) for tag in task.tags)
            task_keywords = extract_keywords(task.title, task.description)
            keywords.update(task_keywords.keys())
            for stem, word in task_keywords.items():
                labels.setdefault(stem, word)

        ratios = [
            float(task.actual_hours / task.estimated_hours)
            for task in history
            if task.estimated_hours and task.actual_hours
        ]

        return cls(
            user_id=user_id,
            completed_tasks=len(history),
            tags=tags,
            keywords=keywords,
            keyword_labels=labels,
            recent_tasks=tuple(history[:recent_limit]),
            estimation_ratio=round(median(ratios), 2) if ratios else None,
        )

    def top_keywords(self, limit: int = 10) -> list[str]:
        return [self.keyword_labels[stem] for stem, _ in self.keywords.most_common(limit)]


@dataclass(frozen=True, slots=True)
class TaskProfile:
    """Признаки задачи, по которым ищется подходящий опыт."""

    tags: frozenset[str]
    keywords: Mapping[str, str]

    @classmethod
    def of(cls, title: str, description: str | None, tags: Iterable[str]) -> Self:
        return cls(
            tags=frozenset(normalize_tag(tag) for tag in tags),
            keywords=extract_keywords(title, description),
        )


@dataclass(frozen=True, slots=True)
class Relevance:
    """Насколько опыт сотрудника соответствует задаче (от 0 до 1)."""

    score: float
    reasons: tuple[str, ...] = ()


def assess_relevance(task: TaskProfile, expertise: Expertise) -> Relevance:
    """Оценивает соответствие задачи опыту по тегам и ключевым словам."""

    components: list[tuple[float, float]] = []
    reasons: list[str] = []

    if task.tags:
        tag_hits = {tag: expertise.tags[tag] for tag in task.tags if expertise.tags[tag]}
        saturated = sum(min(count, TAG_SATURATION) for count in tag_hits.values())
        components.append((TAG_WEIGHT, saturated / (TAG_SATURATION * len(task.tags))))
        if tag_hits:
            hits = ", ".join(f"{tag} ({count})" for tag, count in sorted(tag_hits.items()))
            reasons.append(f"Выполнял задачи с тегами: {hits}")

    if task.keywords:
        keyword_hits = [word for stem, word in task.keywords.items() if expertise.keywords[stem]]
        components.append((KEYWORD_WEIGHT, len(keyword_hits) / len(task.keywords)))
        if keyword_hits:
            reasons.append(f"Похожие темы в выполненных задачах: {', '.join(keyword_hits[:5])}")

    if not components:
        return Relevance(score=0.0)

    total_weight = sum(weight for weight, _ in components)
    score = sum(weight * value for weight, value in components) / total_weight
    return Relevance(score=score, reasons=tuple(reasons))


@dataclass(frozen=True, slots=True)
class AssigneeMatch:
    """Кандидат в исполнители задачи."""

    user_id: UUID
    score: float
    relevance: float
    availability: float
    workload: Workload
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TaskMatch:
    """Задача, подходящая сотруднику."""

    task: TaskView
    score: float
    relevance: float
    reasons: tuple[str, ...]


def _describe_workload(workload: Workload) -> str:
    description = (
        f"Загрузка: ~{workload.load_hours:.0f} ч, открытых задач {workload.open_tasks}, "
        f"в работе {workload.in_progress}, активных заявок {workload.active_tickets}"
    )
    if workload.overdue:
        description += f", просрочено {workload.overdue}"
    return description


def rank_assignees(
        task: TaskProfile,
        candidates: Iterable[tuple[Expertise, Workload]],
        *,
        limit: int,
) -> list[AssigneeMatch]:
    """Ранжирует кандидатов по сочетанию релевантности опыта и доступности."""

    matches = []
    for expertise, workload in candidates:
        relevance = assess_relevance(task, expertise)
        score = (
            RELEVANCE_WEIGHT * relevance.score
            + AVAILABILITY_WEIGHT * workload.availability
        )
        reasons = relevance.reasons or ("Нет выполненных задач по похожей тематике",)
        matches.append(
            AssigneeMatch(
                user_id=expertise.user_id,
                score=score,
                relevance=relevance.score,
                availability=workload.availability,
                workload=workload,
                reasons=(*reasons, _describe_workload(workload)),
            )
        )

    return sorted(matches, key=lambda match: match.score, reverse=True)[:limit]


def assess_urgency(priority: Priority, due_date: date | None, today: date) -> float:
    """Срочность задачи от 0 до 1 по приоритету и близости дедлайна."""

    urgency = PRIORITY_URGENCY[priority]
    if due_date is not None and (due_date - today).days <= URGENT_DUE_DAYS:
        urgency = min(1.0, urgency + 0.25)
    return urgency


def rank_tasks(
        expertise: Expertise,
        tasks: Iterable[TaskView],
        *,
        today: date,
        limit: int,
) -> list[TaskMatch]:
    """Ранжирует задачи для сотрудника по релевантности его опыту и срочности."""

    matches = []
    for task in tasks:
        profile = TaskProfile.of(task.title, task.description, (tag.name for tag in task.tags))
        relevance = assess_relevance(profile, expertise)
        urgency = assess_urgency(task.priority, task.due_date, today)

        reasons = list(relevance.reasons)
        reasons.append(f"Приоритет: {task.priority.value}")
        if task.due_date is not None:
            reasons.append(f"Срок: {task.due_date.isoformat()}")

        matches.append(
            TaskMatch(
                task=task,
                score=TASK_RELEVANCE_WEIGHT * relevance.score + TASK_URGENCY_WEIGHT * urgency,
                relevance=relevance.score,
                reasons=tuple(reasons),
            )
        )

    return sorted(matches, key=lambda match: match.score, reverse=True)[:limit]
