from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from src.shared.domain.vo import Priority, Tag
from src.shared.utils.time import current_datetime
from src.tasks.domain.assignment import (
    CAPACITY_HOURS,
    CompletedTask,
    Expertise,
    TaskProfile,
    Workload,
    assess_relevance,
    assess_urgency,
    extract_keywords,
    rank_assignees,
    rank_tasks,
)
from src.tasks.domain.repos import TaskView
from src.tasks.domain.vo import TaskNumber, TaskStatus
from src.tasks.domain.workflow import task_workflow

pytestmark = pytest.mark.unit


def make_completed(assignee_id, title, *tags, estimated=None, actual=Decimal(1)):
    return CompletedTask(
        assignee_id=assignee_id,
        number="TASK-001",
        title=title,
        tags=frozenset(tags),
        estimated_hours=estimated,
        actual_hours=actual,
    )


def make_view(title, *tags, priority=Priority.MEDIUM, due_date=None) -> TaskView:
    now = current_datetime()
    return TaskView(
        id=uuid4(),
        created_at=now,
        updated_at=now,
        number=TaskNumber("TASK-001"),
        title=title,
        status=TaskStatus.TODO,
        priority=priority,
        due_date=due_date,
        tags={Tag(name=tag) for tag in tags},
    )


class TestExtractKeywords:
    def test_normalizes_word_forms_to_common_stem(self):
        assert extract_keywords("Интеграция с 1С").keys() == extract_keywords("интеграции").keys()

    def test_skips_short_and_stop_words(self):
        assert extract_keywords("Нужно сделать API для 1С") == {}

    def test_keeps_first_seen_word_as_label(self):
        assert extract_keywords("Интеграция", "интеграции") == {"интегр": "интеграция"}


class TestWorkload:
    def test_free_employee_is_fully_available(self):
        assert Workload(user_id=uuid4()).availability == 1.0

    def test_load_counts_unestimated_tasks_and_tickets(self):
        workload = Workload(
            user_id=uuid4(), remaining_hours=Decimal(10), unestimated_tasks=1, active_tickets=2,
        )

        assert workload.load_hours == Decimal(18)

    def test_full_capacity_halves_availability(self):
        workload = Workload(user_id=uuid4(), remaining_hours=CAPACITY_HOURS)

        assert workload.availability == pytest.approx(0.5)


class TestExpertise:
    def test_builds_profile_from_history(self):
        user_id = uuid4()
        history = [
            make_completed(user_id, "Обмен с 1С", "1С", "интеграция", estimated=Decimal(4),
                           actual=Decimal(6)),
            make_completed(user_id, "Выгрузка в 1С", "1с", estimated=Decimal(2),
                           actual=Decimal(2)),
        ]

        expertise = Expertise.from_history(user_id, history)

        assert expertise.completed_tasks == 2
        assert expertise.tags == {"1с": 2, "интеграция": 1}
        assert expertise.estimation_ratio == pytest.approx(1.25)
        assert "выгрузка" in expertise.top_keywords()

    def test_empty_history(self):
        expertise = Expertise.from_history(uuid4(), [])

        assert expertise.completed_tasks == 0
        assert expertise.estimation_ratio is None


class TestRelevance:
    def test_matches_tags_case_insensitive(self):
        user_id = uuid4()
        expertise = Expertise.from_history(user_id, [make_completed(user_id, "Задача", "React")])

        relevance = assess_relevance(TaskProfile.of("Форма", None, ["react"]), expertise)

        assert relevance.score > 0
        assert any("react" in reason for reason in relevance.reasons)

    def test_no_experience_gives_zero(self):
        relevance = assess_relevance(
            TaskProfile.of("Отчёт по заявкам", None, ["postgresql"]), Expertise(user_id=uuid4()),
        )

        assert relevance.score == 0


class TestRankAssignees:
    def test_prefers_experienced_candidate_with_equal_load(self):
        expert_id, novice_id = uuid4(), uuid4()
        expert = Expertise.from_history(
            expert_id, [make_completed(expert_id, "Обмен с 1С", "1с", "интеграция")] * 3,
        )
        novice = Expertise.from_history(novice_id, [make_completed(novice_id, "Вёрстка", "ui")])

        [best, *_] = rank_assignees(
            TaskProfile.of("Загрузка актов из 1С", None, ["1с"]),
            [(novice, Workload(user_id=novice_id)), (expert, Workload(user_id=expert_id))],
            limit=2,
        )

        assert best.user_id == expert_id

    def test_prefers_free_candidate_with_equal_experience(self):
        busy_id, free_id = uuid4(), uuid4()
        candidates = [
            (Expertise(user_id=busy_id), Workload(user_id=busy_id, remaining_hours=Decimal(80))),
            (Expertise(user_id=free_id), Workload(user_id=free_id)),
        ]

        [best, *_] = rank_assignees(TaskProfile.of("Задача", None, []), candidates, limit=2)

        assert best.user_id == free_id
        assert any("Загрузка" in reason for reason in best.reasons)

    def test_respects_limit(self):
        candidates = [(Expertise(user_id=uid), Workload(user_id=uid)) for uid in [uuid4()] * 5]

        assert len(rank_assignees(TaskProfile.of("x", None, []), candidates, limit=3)) == 3


class TestRankTasks:
    def test_relevant_task_goes_first(self):
        user_id = uuid4()
        expertise = Expertise.from_history(user_id, [make_completed(user_id, "Форма", "react")])
        relevant = make_view("Форма обратной связи", "react")
        other = make_view("Отчёт в PostgreSQL", "postgresql")

        [best, *_] = rank_tasks(expertise, [other, relevant], today=date.today(), limit=2)

        assert best.task is relevant

    def test_urgency_grows_with_priority_and_close_deadline(self):
        today = date.today()

        assert assess_urgency(Priority.CRITICAL, None, today) > assess_urgency(
            Priority.LOW, None, today,
        )
        assert assess_urgency(Priority.MEDIUM, today + timedelta(days=1), today) > assess_urgency(
            Priority.MEDIUM, None, today,
        )


class TestWorkflowNextStatuses:
    def test_matches_resolve(self):
        for status in TaskStatus:
            for candidate in task_workflow.next_statuses(status):
                task_workflow.resolve(status, candidate)

    def test_backlog_transitions(self):
        assert set(task_workflow.next_statuses(TaskStatus.BACKLOG)) == {
            TaskStatus.TODO, TaskStatus.CANCELLED,
        }
