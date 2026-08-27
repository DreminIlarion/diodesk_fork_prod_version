from typing import TypeVar

from src.iam.domain.events import UserInvited

from .shared.domain.events import Event
from .tickets.domain.events import TicketCreated, TicketStatusChanged
from .timetracking.domain.events import WorklogApproved

EventT = TypeVar("EventT", bound=Event)

# Маппинг доменных событий к топикам в которых они будут обработаны (очереди)
EVENT_TOPIC_MAP: dict[type[EventT], str] = {
    TicketCreated: "tickets.create",
    TicketStatusChanged: "tickets.status_changed",
    WorklogApproved: "worklogs.approve",
    UserInvited: "user.invite",
}
