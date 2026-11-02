from collections import UserDict
from collections.abc import Iterable
from uuid import UUID

from ..domain.entities import User
from ..domain.repos import UserRepository
from .schemas import UserBrief


class UserBriefs(UserDict[UUID, UserBrief]):
    """Загруженные пользователи, индексированные по ID."""

    def find(self, user_id: UUID | None) -> UserBrief | None:
        return None if user_id is None else self.get(user_id)


def to_user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id,
        full_name=None if user.full_name is None else user.full_name.value,
        email=user.email.value,
        roles=sorted(user.roles),
        is_active=user.is_active,
    )


async def load_user_briefs(
    user_repo: UserRepository,
    user_ids: Iterable[UUID | None],
) -> UserBriefs:
    unique_ids = list({
        user_id
        for user_id in user_ids
        if user_id is not None
    })

    if not unique_ids:
        return UserBriefs()

    users = await user_repo.get_by_ids(unique_ids)

    return UserBriefs(
        (user.id, to_user_brief(user))
        for user in users
    )
