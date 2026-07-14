from dataclasses import dataclass, field
from uuid import UUID

from src.activity_logs.domain.models import ActivityLog
from src.activity_logs.registry import register_activity_log_mapper
from src.shared.domain.events import Event
from src.shared.domain.vo import Priority

from .vo import CommentType, ReactionType, TicketNumber, TicketStatus


@dataclass(frozen=True, kw_only=True)
class TicketCreated(Event):
    """Тикет успешно создан"""

    ticket_id: UUID
    title: str
    number: TicketNumber
    created_by: UUID
    reporter_id: UUID
    priority: Priority
    project_id: UUID | None = None
    counterparty_id: UUID | None = None


@dataclass(frozen=True, kw_only=True)
class TicketEdited(Event):
    """Тикет был изменён."""

    ticket_id: UUID
    number: TicketNumber
    changes: dict[str, list[str]] = field(default_factory=dict)
    edited_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketApprovalSubmitted(Event):
    """
    Тикет отправлен на согласование.
    """

    ticket_id: UUID
    number: TicketNumber
    submitted_by: UUID
    counterparty_id: UUID | None = None


@dataclass(frozen=True, kw_only=True)
class TicketApproved(Event):
    """
    Тикет был успешно согласован.
    """

    ticket_id: UUID
    number: TicketNumber
    approved_by: UUID
    counterparty_id: UUID | None = None


@dataclass(frozen=True, kw_only=True)
class TicketAssigned(Event):
    """
    Тикет назначен на исполнителя.
    """

    ticket_id: UUID
    number: TicketNumber
    title: str
    assignee_id: UUID | None = None
    assigned_by: UUID
    old_assignee: UUID | None = None


@dataclass(frozen=True, kw_only=True)
class TicketStatusChanged(Event):
    """
    Изменён статус заявки.
    """

    ticket_id: UUID
    number: TicketNumber
    old_status: TicketStatus
    new_status: TicketStatus
    changed_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketPriorityChanged(Event):
    """Изменён приоритет тикета"""

    ticket_id: UUID
    number: TicketNumber
    changed_by: UUID
    old_priority: Priority
    new_priority: Priority


@dataclass(frozen=True, kw_only=True)
class TicketPaused(Event):
    """
    Тикет был поставлен на паузу.
    """

    ticket_id: UUID
    ticket_number: TicketNumber
    reason: str
    paused_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketResolved(Event):
    """
    Тикет решён.
    """

    ticket_id: UUID
    number: TicketNumber
    reporter_id: UUID
    resolved_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketClosed(Event):
    """
    Тикет был успешно закрыт.
    """

    ticket_id: UUID
    number: TicketNumber
    closed_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketReopened(Event):
    """
    Тикет был переоткрыт после завершения.
    """

    ticket_id: UUID
    number: TicketNumber
    assignee_id: UUID | None = None
    reopened_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketCanceled(Event):
    """Тикет был отменён."""

    ticket_id: UUID
    number: TicketNumber
    reporter_id: UUID
    assignee_id: UUID | None = None
    canceled_by: UUID


@dataclass(frozen=True, kw_only=True)
class TicketArchived(Event):
    """Тикет архивирован"""

    ticket_id: UUID
    number: TicketNumber
    reporter_id: UUID
    archived_by: UUID


# =========================== Аудит бизнес действий ===========================

@register_activity_log_mapper(TicketCreated)
def map_ticket_created_to_activity_log(event: TicketCreated) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.created",
        actor_id=event.created_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketApprovalSubmitted)
def map_ticket_approval_submitted_to_activity_log(event: TicketApprovalSubmitted) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.approval_submitted",
        actor_id=event.submitted_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketApproved)
def map_ticket_approved_to_activity_log(event: TicketApproved) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.approved",
        actor_id=event.approved_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketAssigned)
def map_ticket_assigned_to_activity_log(event: TicketAssigned) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.assigned",
        actor_id=event.assigned_by,
        changes={"old_assignee": event.old_assignee, "new_assignee": event.assignee_id},
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketStatusChanged)
def map_ticket_status_changed_to_activity_log(event: TicketStatusChanged) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.status_changed",
        actor_id=event.changed_by,
        changes={"old_status": event.old_status.value, "new_status": event.new_status.value},
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketPriorityChanged)
def map_ticket_priority_changed_to_activity_log(event: TicketPriorityChanged) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.priority_changed",
        actor_id=event.changed_by,
        changes={
            "old_priority": event.old_priority.value, "new_priority": event.new_priority.value
        },
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketPaused)
def map_ticket_paused_to_activity_log(event: TicketPaused) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.paused",
        actor_id=event.paused_by,
        changes={"reason": event.reason},
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketResolved)
def map_ticket_resolved_to_activity_log(event: TicketResolved) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.resolved",
        actor_id=event.resolved_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketClosed)
def map_ticket_closed_to_activity_log(event: TicketClosed) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.closed",
        actor_id=event.closed_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketReopened)
def map_ticket_reopened_to_activity_log(event: TicketReopened) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.reopened",
        actor_id=event.reopened_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketCanceled)
def map_ticket_canceled_to_activity_log(event: TicketCanceled) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.canceled",
        actor_id=event.canceled_by,
        event_id=event.event_id,
    )


@register_activity_log_mapper(TicketArchived)
def map_ticket_archived_to_activity_log(event: TicketArchived) -> ActivityLog:
    return ActivityLog(
        aggregate_type="ticket",
        aggregate_id=event.ticket_id,
        action="ticket.archived",
        actor_id=event.archived_by,
        event_id=event.event_id,
    )


@dataclass(frozen=True, kw_only=True)
class CommentAdded(Event):
    """Добавлен комментарий"""

    ticket_id: UUID
    comment_id: UUID
    author_id: UUID
    comment_type: CommentType
    is_public: bool


@dataclass(frozen=True, kw_only=True)
class CommentEdited(Event):
    """Комментарий отредактирован"""

    ticket_id: UUID
    comment_id: UUID
    edited_by: UUID


@dataclass(frozen=True, kw_only=True)
class ReactionAdded(Event):
    """Реакция поставлена"""

    comment_id: UUID
    author_id: UUID
    reaction_type: ReactionType
