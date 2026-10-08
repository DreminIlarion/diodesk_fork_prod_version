from typing import Any

from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from src.comments.schemas import CommentResponse
from src.iam.domain.repos import UserRepository
from src.iam.mcp.presenters import UserBriefs, load_user_briefs
from src.iam.mcp.schemas import UserBrief
from src.mcp.schemas import CommentBrief, ProjectLink, TicketLink, task_url, ticket_url
from src.shared.schemas import Page
from src.shared.utils.time import current_datetime

from ..domain.assignment import AssigneeMatch, Expertise, TaskMatch, Workload
from ..domain.consts import TASK_STATUS_LABEL_MAP
from ..domain.repos import TaskView
from ..domain.vo import TaskStatus
from ..domain.workflow import task_workflow
from ..schemas import TaskResponse
from .schemas import (
    AssigneeSuggestion,
    CompletedTaskBrief,
    ExpertiseProfile,
    TagExperience,
    TaskBrief,
    TaskCard,
    TaskSuggestion,
    WorkloadEntry,
    WorkloadStats,
)

TOP_TAGS_LIMIT = 10


def _is_overdue(due_date: date | None, status: TaskStatus) -> bool:
    return due_date is not None and status.is_open and due_date < current_datetime().date()


def _hours(value: Decimal | float | None) -> float | None:
    return None if value is None else round(float(value), 2)


def _brief_fields(task: TaskView | TaskResponse, users: UserBriefs) -> dict[str, Any]:
    """Общие поля краткой и полной карточек (из модели чтения или ответа сервиса)."""

    return {
        "id": task.id,
        "number": str(task.number),
        "url": task_url(task.id),
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "story_points": None if task.story_points is None else int(task.story_points),
        "estimated_hours": _hours(task.estimated_hours),
        "due_date": task.due_date,
        "is_overdue": _is_overdue(task.due_date, task.status),
        "assignee": users.find(task.assignee_id),
        "tags": sorted(tag.name for tag in task.tags),
    }


def to_task_brief(task: TaskView | TaskResponse, users: UserBriefs) -> TaskBrief:
    return TaskBrief(**_brief_fields(task, users))


def to_task_card(task: TaskResponse, users: UserBriefs) -> TaskCard:
    ticket = task.source_ticket
    project = task.project

    return TaskCard(
        **_brief_fields(task, users),
        description=task.description,
        status_label=TASK_STATUS_LABEL_MAP[task.status],
        next_statuses=task_workflow.next_statuses(task.status),
        actual_hours=_hours(task.actual_hours) or 0,
        reviewer=users.find(task.reviewer_id),
        ticket=None if ticket is None else TicketLink(
            id=ticket.id, number=ticket.number, title=ticket.title, url=ticket_url(ticket.number),
        ),
        project=None if project is None else ProjectLink(
            id=project.id, key=project.key, name=project.name,
        ),
        created_by=task.created_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        is_archived=task.is_archived,
    )


async def present_task(task: TaskResponse, user_repo: UserRepository) -> TaskCard:
    users = await load_user_briefs(user_repo, (task.assignee_id, task.reviewer_id))
    return to_task_card(task, users)


async def present_task_briefs(
        tasks: Iterable[TaskView | TaskResponse], user_repo: UserRepository,
) -> list[TaskBrief]:
    tasks = list(tasks)
    users = await load_user_briefs(user_repo, (task.assignee_id for task in tasks))
    return [to_task_brief(task, users) for task in tasks]


async def present_task_page(page: Page[TaskView], user_repo: UserRepository) -> Page[TaskBrief]:
    users = await load_user_briefs(user_repo, (task.assignee_id for task in page.items))
    return page.to_response(lambda task: to_task_brief(task, users))


def to_comment_brief(comment: CommentResponse, authors: UserBriefs) -> CommentBrief:
    return CommentBrief(
        id=comment.id,
        created_at=comment.created_at,
        author=authors.get(comment.author_id),
        text=comment.text,
        visibility=comment.visibility,
        parent_comment_id=comment.parent_comment_id,
        reply_count=comment.reply_count,
    )


def to_workload_stats(workload: Workload) -> WorkloadStats:
    return WorkloadStats(
        open_tasks=workload.open_tasks,
        in_progress=workload.in_progress,
        overdue=workload.overdue,
        review_queue=workload.review_queue,
        active_tickets=workload.active_tickets,
        story_points=workload.story_points,
        remaining_hours=_hours(workload.remaining_hours) or 0,
        unestimated_tasks=workload.unestimated_tasks,
        load_hours=_hours(workload.load_hours) or 0,
    )


def to_workload_entry(workload: Workload, user: UserBrief) -> WorkloadEntry:
    return WorkloadEntry(user=user, **to_workload_stats(workload).model_dump())


def to_expertise_profile(
        expertise: Expertise, user: UserBrief, period_days: int,
) -> ExpertiseProfile:
    return ExpertiseProfile(
        user=user,
        period_days=period_days,
        completed_tasks=expertise.completed_tasks,
        top_tags=[
            TagExperience(tag=tag, tasks=count)
            for tag, count in expertise.tags.most_common(TOP_TAGS_LIMIT)
        ],
        top_keywords=expertise.top_keywords(),
        recent_tasks=[
            CompletedTaskBrief(
                number=task.number,
                title=task.title,
                completed_at=task.completed_at,
                actual_hours=_hours(task.actual_hours) or 0,
            )
            for task in expertise.recent_tasks
        ],
        estimation_ratio=expertise.estimation_ratio,
    )


def to_assignee_suggestion(match: AssigneeMatch, user: UserBrief) -> AssigneeSuggestion:
    return AssigneeSuggestion(
        user=user,
        score=round(match.score, 2),
        relevance=round(match.relevance, 2),
        availability=round(match.availability, 2),
        workload=to_workload_stats(match.workload),
        reasons=list(match.reasons),
    )


def to_task_suggestion(match: TaskMatch, users: UserBriefs) -> TaskSuggestion:
    return TaskSuggestion(
        task=to_task_brief(match.task, users),
        score=round(match.score, 2),
        relevance=round(match.relevance, 2),
        reasons=list(match.reasons),
    )
