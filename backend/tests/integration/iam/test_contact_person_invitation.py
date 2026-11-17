from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.crm.domain.entities import Counterparty
from src.crm.domain.vo import ContactPerson, CounterpartyType, Inn
from src.crm.infra.repos import SqlCounterpartyRepository
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.vo import Email, FullName, UserRole
from src.iam.infra.repos import SqlInvitationRepository, SqlUserRepository
from src.iam.schemas import InvitationCreate, UserCreate
from src.iam.services import AuthService, InvitationService
from src.shared.domain.exceptions import AlreadyExistsError

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


def make_counterparty() -> Counterparty:
    return Counterparty(
        counterparty_type=CounterpartyType.INDIVIDUAL,
        name="Тестовый клиент",
        legal_name="Тестовый клиент",
        inn=Inn("123456789012"),
        email=f"counterparty-{uuid4().hex}@example.com",
        contact_persons=[ContactPerson(full_name=FullName("Иванов Иван"))],
    )


def make_services(session):
    counterparty_repo = SqlCounterpartyRepository(session)
    invitation_repo = SqlInvitationRepository(session)
    invitation_service = InvitationService(
        uow=session,
        invitation_repo=invitation_repo,
        counterparty_repo=counterparty_repo,
        mail_sender=AsyncMock(),
        event_publisher=AsyncMock(),
    )
    auth_service = AuthService(
        uow=session,
        user_repo=SqlUserRepository(session),
        invitation_repo=invitation_repo,
        counterparty_repo=counterparty_repo,
        token_store=AsyncMock(),
    )
    return counterparty_repo, invitation_repo, invitation_service, auth_service


def admin_subject() -> Subject:
    return Subject(id=uuid4(), type=SubjectType.USER, roles=[UserRole.ADMIN])


@pytest.mark.parametrize("with_contact", [True, False])
async def test_registration_persists_optional_contact_link(session, engine, with_contact):
    counterparty_repo, invitation_repo, invitation_service, auth_service = make_services(session)
    counterparty = make_counterparty()
    await counterparty_repo.create(counterparty)
    await session.commit()
    contact_id = counterparty.contact_persons[0].id if with_contact else None
    email = f"invited-{uuid4().hex}@example.com"

    response = await invitation_service.create(
        InvitationCreate(
            email=email,
            granted_roles={UserRole.CUSTOMER},
            counterparty_id=counterparty.id,
            contactPersonId=contact_id,
        ),
        admin_subject(),
    )
    invitation = await invitation_repo.read(response.id)
    assert invitation.contact_person_id == contact_id

    await auth_service.register(
        invitation.token,
        UserCreate(password="TestPassword123", full_name="Иванов Иван"),
    )

    async with async_sessionmaker(engine, expire_on_commit=False)() as verify_session:
        stored_counterparty = await SqlCounterpartyRepository(verify_session).read(counterparty.id)
        stored_user = await SqlUserRepository(verify_session).get_by_email(Email(email))
        stored_invitation = await SqlInvitationRepository(verify_session).read(response.id)

    assert stored_user is not None
    assert stored_invitation.is_used is True
    assert stored_invitation.contact_person_id == contact_id
    assert stored_counterparty.contact_persons[0].user_id == (
        stored_user.id if with_contact else None
    )


async def test_registration_rejects_contact_linked_after_invitation(session, engine):
    counterparty_repo, invitation_repo, invitation_service, auth_service = make_services(session)
    counterparty = make_counterparty()
    await counterparty_repo.create(counterparty)
    await session.commit()
    contact_id = counterparty.contact_persons[0].id
    email = f"invited-{uuid4().hex}@example.com"

    response = await invitation_service.create(
        InvitationCreate(
            email=email,
            granted_roles={UserRole.CUSTOMER},
            counterparty_id=counterparty.id,
            contact_person_id=contact_id,
        ),
        admin_subject(),
    )
    invitation = await invitation_repo.read(response.id)
    existing_user_id = uuid4()
    counterparty = await counterparty_repo.read(counterparty.id)
    counterparty.contact_persons[0].user_id = existing_user_id
    await counterparty_repo.update(counterparty)
    await session.commit()

    with pytest.raises(AlreadyExistsError, match="already linked"):
        await auth_service.register(invitation.token, UserCreate(password="TestPassword123"))
    await session.rollback()

    async with async_sessionmaker(engine, expire_on_commit=False)() as verify_session:
        stored_counterparty = await SqlCounterpartyRepository(verify_session).read(counterparty.id)
        stored_user = await SqlUserRepository(verify_session).get_by_email(Email(email))
        stored_invitation = await SqlInvitationRepository(verify_session).read(response.id)

    assert stored_user is None
    assert stored_invitation.is_used is False
    assert stored_counterparty.contact_persons[0].user_id == existing_user_id
