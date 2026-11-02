from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeInt

from src.comments.domain.vo import CommentVisibility
from src.core.settings import settings
from src.iam.mcp.schemas import UserBrief


def ticket_url(number: str) -> str:
    """Ссылка на заявку в веб-интерфейсе."""

    return f"{settings.frontend_url.rstrip('/')}/tickets/{number}"


class TicketLink(BaseModel):
    """Ссылка на заявку."""

    id: UUID = Field(description="ID заявки")
    number: str = Field(description="Номер заявки")
    title: str = Field(description="Заголовок")
    url: str = Field(description="Ссылка на заявку в веб-интерфейсе")


class ProjectLink(BaseModel):
    """Ссылка на проект."""

    id: UUID = Field(description="ID проекта")
    key: str = Field(description="Ключ проекта")
    name: str = Field(description="Название проекта")


class CommentBrief(BaseModel):
    """Комментарий к заявке или задаче."""

    id: UUID = Field(description="ID комментария")
    created_at: datetime = Field(description="Дата создания")
    author: UserBrief | None = Field(None, description="Автор комментария")
    text: str = Field(description="Текст")
    visibility: CommentVisibility = Field(
        description="public - виден клиенту, internal - только сотрудникам, note - только автору",
    )
    parent_comment_id: UUID | None = Field(None, description="Комментарий, на который это ответ")
    reply_count: NonNegativeInt = Field(0, description="Количество ответов")
