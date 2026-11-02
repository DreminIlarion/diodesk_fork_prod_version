from uuid import UUID

from pydantic import BaseModel, Field

from ..domain.vo import UserRole


class UserBrief(BaseModel):
    """Краткая информация о пользователе."""

    id: UUID = Field(description="ID пользователя")
    full_name: str | None = Field(None, description="ФИО")
    email: str = Field(description="Email (логин)")
    roles: list[UserRole] = Field(description="Роли в системе")
    is_active: bool = Field(True, description="Активна ли учётная запись")
