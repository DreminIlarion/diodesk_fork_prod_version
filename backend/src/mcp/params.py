"""Переиспользуемые параметры инструментов (типы + описания для LLM)."""

from typing import Annotated, Literal, overload

from uuid import UUID

from pydantic import Field

from src.iam.domain.authz import Subject
from src.shared.schemas import Pagination

ME = "me"

PageNumber = Annotated[int, Field(ge=1, description="Номер страницы, начиная с 1")]
PageSize = Annotated[int, Field(ge=1, le=50, description="Количество элементов на странице")]
ResultLimit = Annotated[int, Field(ge=1, le=20, description="Максимальное количество вариантов")]

UserSelector = Annotated[
    UUID | Literal["me"],
    Field(description='ID пользователя или "me" для текущего пользователя'),
]


@overload
def resolve_user(selector: UUID | Literal["me"], subject: Subject) -> UUID: ...


@overload
def resolve_user(selector: None, subject: Subject) -> None: ...


def resolve_user(selector: UUID | Literal["me"] | None, subject: Subject) -> UUID | None:
    """Подставляет ID текущего пользователя вместо "me"."""

    return subject.id if isinstance(selector, str) else selector


def paginate(page: int, size: int) -> Pagination:
    return Pagination(page=page, size=size)
