from uuid import uuid4

import pytest
from fastapi import status

from src.iam.dependencies import require_role
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole


@pytest.mark.parametrize("role", list(UserRole))
def test_require_role_allows_matching_role(role):
    subject = Subject(id=uuid4(), type=SubjectType.USER, roles=[role])

    assert require_role({role})(subject) is True


@pytest.mark.parametrize("roles", [[], [UserRole.CUSTOMER], [UserRole.SUPPORT_AGENT]])
def test_require_role_raises_for_missing_permission(roles):
    subject = Subject(id=uuid4(), type=SubjectType.USER, roles=roles)

    with pytest.raises(PermissionDeniedError) as exc:
        require_role({UserRole.ADMIN})(subject)

    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_require_role_accepts_any_matching_role():
    subject = Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[UserRole.CUSTOMER, UserRole.ACCOUNT_MANAGER],
    )

    assert require_role({UserRole.ADMIN, UserRole.ACCOUNT_MANAGER})(subject) is True
