from uuid import UUID, uuid4

import pytest

from src.iam.dependencies import _build_subject_from_payload  # noqa: PLC2701
from src.iam.domain.authz import SubjectType
from src.iam.domain.exceptions import UnauthorizedError
from src.iam.domain.vo import UserRole


def test_build_subject_parses_uuid_claims():
    user_id = uuid4()
    counterparty_id = uuid4()

    subject = _build_subject_from_payload({
        "type": "access",
        "sub": str(user_id),
        "sub_type": "user",
        "email": "user@example.com",
        "roles": ["support_agent"],
        "counterparty_id": str(counterparty_id),
        "scopes": [],
    })

    assert subject.id == user_id
    assert isinstance(subject.id, UUID)

    assert subject.counterparty_id == counterparty_id
    assert isinstance(subject.counterparty_id, UUID)

    assert subject.type is SubjectType.USER
    assert subject.roles == [UserRole.SUPPORT_AGENT]


def test_build_subject_rejects_invalid_sub():
    with pytest.raises(UnauthorizedError):
        _build_subject_from_payload({
            "type": "access",
            "sub": "not-a-uuid",
            "sub_type": "user",
            "roles": ["support_agent"],
        })


def test_build_subject_rejects_refresh_token():
    with pytest.raises(UnauthorizedError):
        _build_subject_from_payload({
            "type": "refresh",
            "sub": str(uuid4()),
        })
