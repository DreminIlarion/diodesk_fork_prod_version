from types import SimpleNamespace
from unittest.mock import AsyncMock, sentinel
from uuid import uuid4

import pytest

from src.crm.domain.entities import Counterparty
from src.crm.domain.vo import ContactPerson, CounterpartyType, Inn
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.entities import Invitation
from src.iam.domain.vo import Email, FullName, UserRole
from src.iam.schemas import InvitationCreate, UserCreate
from src.iam.services import AuthService, InvitationService
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


def make_service() -> tuple[InvitationService, AsyncMock, AsyncMock, AsyncMock]:
    invitation_repo = AsyncMock()
    invitation_repo.get_active.return_value = None
    counterparty_repo = AsyncMock()
    publisher = AsyncMock()
    service = InvitationService(
        uow=AsyncMock(),
        invitation_repo=invitation_repo,
        counterparty_repo=counterparty_repo,
        mail_sender=AsyncMock(),
        event_publisher=publisher,
    )
    return service, invitation_repo, counterparty_repo, publisher


def admin_subject() -> Subject:
    return Subject(id=uuid4(), type=SubjectType.USER, roles=[UserRole.ADMIN])


def make_counterparty() -> Counterparty:
    return Counterparty(
        counterparty_type=CounterpartyType.INDIVIDUAL,
        name="Клиент",
        legal_name="Клиент",
        inn=Inn("123456789012"),
        email="counterparty@example.com",
        contact_persons=[ContactPerson(full_name=FullName("Иванов Иван"))],
    )


@pytest.mark.asyncio
async def test_create_invitation_for_contact_person() -> None:
    service, invitation_repo, counterparty_repo, publisher = make_service()
    counterparty_id, contact_person_id = uuid4(), uuid4()
    counterparty_repo.read.return_value = SimpleNamespace(
        contact_persons=[SimpleNamespace(id=contact_person_id, user_id=None)]
    )
    data = InvitationCreate(
        email="customer@example.com",
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=counterparty_id,
        contactPersonId=contact_person_id,
    )

    response = await service.create(data, admin_subject())

    invitation = invitation_repo.create.await_args.args[0]
    assert invitation.contact_person_id == contact_person_id
    assert response.contact_person_id == contact_person_id
    publisher.publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_invitation_rejects_contact_from_another_counterparty() -> None:
    service, invitation_repo, counterparty_repo, publisher = make_service()
    counterparty_repo.read.return_value = SimpleNamespace(contact_persons=[])
    data = InvitationCreate(
        email="customer@example.com",
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=uuid4(),
        contact_person_id=uuid4(),
    )

    with pytest.raises(NotFoundError, match="Contact person not found"):
        await service.create(data, admin_subject())

    invitation_repo.get_active.assert_not_awaited()
    publisher.publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_invitation_rejects_changed_contact_on_existing_invitation() -> None:
    service, invitation_repo, counterparty_repo, publisher = make_service()
    counterparty_id, contact_person_id = uuid4(), uuid4()
    counterparty_repo.read.return_value = SimpleNamespace(
        contact_persons=[SimpleNamespace(id=contact_person_id, user_id=None)]
    )
    invitation_repo.get_active.return_value = Invitation.create(
        email=Email("customer@example.com"),
        invited_by=uuid4(),
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=counterparty_id,
        contact_person_id=uuid4(),
    )
    data = InvitationCreate(
        email="customer@example.com",
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=counterparty_id,
        contact_person_id=contact_person_id,
    )

    with pytest.raises(AlreadyExistsError, match="different counterparty or contact person"):
        await service.create(data, admin_subject())

    invitation_repo.create.assert_not_awaited()
    publisher.publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_register_links_user_to_contact_in_same_transaction(monkeypatch) -> None:
    counterparty = make_counterparty()
    contact_person = counterparty.contact_persons[0]
    invitation = Invitation.create(
        email=Email("customer@example.com"),
        invited_by=uuid4(),
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=counterparty.id,
        contact_person_id=contact_person.id,
    )
    uow, user_repo, invitation_repo, counterparty_repo = (AsyncMock() for _ in range(4))
    user_repo.get_by_email.return_value = None
    invitation_repo.get_by_token.return_value = invitation
    counterparty_repo.read_for_update.return_value = counterparty
    monkeypatch.setattr(
        "src.iam.services.hash_password_async", AsyncMock(return_value="hashed")
    )
    monkeypatch.setattr("src.iam.services.create_tokens_for_user", lambda user: sentinel.tokens)
    service = AuthService(
        uow=uow,
        user_repo=user_repo,
        invitation_repo=invitation_repo,
        counterparty_repo=counterparty_repo,
        token_store=AsyncMock(),
    )

    tokens = await service.register(
        invitation.token, UserCreate(password="password123")
    )

    user = user_repo.create.await_args.args[0]
    assert tokens is sentinel.tokens
    assert contact_person.user_id == user.id
    counterparty_repo.read_for_update.assert_awaited_once_with(counterparty.id)
    counterparty_repo.update.assert_awaited_once_with(counterparty)
    invitation_repo.update.assert_awaited_once_with(invitation)
    uow.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("deleted", "error", "message"),
    [
        (False, AlreadyExistsError, "already linked"),
        (True, NotFoundError, "Contact person not found"),
    ],
)
async def test_register_rejects_unavailable_contact_after_invitation(
    monkeypatch, deleted, error, message
) -> None:
    counterparty = make_counterparty()
    contact_person = counterparty.contact_persons[0]
    invitation = Invitation.create(
        email=Email("customer@example.com"),
        invited_by=uuid4(),
        granted_roles={UserRole.CUSTOMER},
        counterparty_id=counterparty.id,
        contact_person_id=contact_person.id,
    )
    if deleted:
        counterparty.contact_persons.clear()
    else:
        contact_person.user_id = uuid4()
    uow, user_repo, invitation_repo, counterparty_repo = (AsyncMock() for _ in range(4))
    user_repo.get_by_email.return_value = None
    invitation_repo.get_by_token.return_value = invitation
    counterparty_repo.read_for_update.return_value = counterparty
    monkeypatch.setattr(
        "src.iam.services.hash_password_async", AsyncMock(return_value="hashed")
    )
    service = AuthService(
        uow=uow,
        user_repo=user_repo,
        invitation_repo=invitation_repo,
        counterparty_repo=counterparty_repo,
        token_store=AsyncMock(),
    )

    with pytest.raises(error, match=message):
        await service.register(invitation.token, UserCreate(password="password123"))

    user_repo.create.assert_not_awaited()
    invitation_repo.update.assert_not_awaited()
    counterparty_repo.update.assert_not_awaited()
    uow.commit.assert_not_awaited()
