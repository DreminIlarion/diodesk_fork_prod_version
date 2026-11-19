from uuid import UUID

from pydantic import BaseModel, Field

from ..domain.vo import UserRole


class UserBrief(BaseModel):
    """Краткая карточка пользователя для ИИ-модели."""

    id: UUID = Field(description="ID пользователя")
    full_name: str | None = Field(None, description="ФИО")
    email: str = Field(description="Email пользователя")
    roles: list[UserRole] = Field(description="Роли в ДИО-Деск")
    is_active: bool = Field(description="Активна ли учётная запись")
