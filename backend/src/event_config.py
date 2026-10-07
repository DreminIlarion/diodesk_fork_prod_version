from typing import TypeVar

from .iam.domain.events import UserInvited
from .knowledge.domain.events import ArticlePublished
from .shared.domain.events import Event
from .tickets.domain.events import TicketCreated, TicketStatusChanged
from .timetracking.domain.events import WorklogApproved

EventT = TypeVar("EventT", bound=Event)

ARTICLE_PUBLISHED_QUEUE = "knowledge.article.published"

# Маппинг доменных событий к топикам в которых они будут обработаны (очереди)
EVENT_TOPIC_MAP: dict[type[EventT], str] = {
    TicketCreated: "tickets.create",
    TicketStatusChanged: "tickets.status_changed",
    WorklogApproved: "worklogs.approve",
    UserInvited: "user.invite",
    ArticlePublished: ARTICLE_PUBLISHED_QUEUE,
}
