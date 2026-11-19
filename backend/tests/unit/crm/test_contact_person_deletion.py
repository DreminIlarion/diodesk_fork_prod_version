from dataclasses import replace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.crm.dependencies import get_counterparty_service
from src.crm.domain.entities import Counterparty
from src.crm.domain.repo import CounterpartyRepository
from src.crm.domain.vo import ContactPerson, CounterpartyType, Inn, Kpp
from src.crm.router import router
from src.crm.services import CounterpartyService
from src.iam.dependencies import get_current_subject
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.vo import UserRole
from src.shared.domain.exceptions import AppError, NotFoundError


@pytest.fixture
def counterparty():
    return Counterparty(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Компания",
        legal_name="ООО Компания",
        inn=Inn("7707083893"),
        kpp=Kpp("773301001"),
        email="company@example.com",
    )


@pytest.fixture
def repository(counterparty):
    repository = AsyncMock(spec=CounterpartyRepository)
    repository.read.return_value = counterparty
    return repository


@pytest.fixture
def subject(request):
    roles = getattr(request, "param", [UserRole.ADMIN])
    return Subject(id=uuid4(), type=SubjectType.USER, roles=roles)


@pytest.fixture
def contact_app(repository, mock_session, subject):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    service = CounterpartyService(session=mock_session, repository=repository)
    app.dependency_overrides[get_counterparty_service] = lambda: service
    app.dependency_overrides[get_current_subject] = lambda: subject

    @app.exception_handler(AppError)
    def handle_app_error(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    return app


@pytest.fixture
async def contact_client(contact_app):
    async with AsyncClient(
        transport=ASGITransport(app=contact_app), base_url="http://test"
    ) as client:
        yield client


@pytest.mark.parametrize(
    "subject",
    [
        [UserRole.ADMIN],
        [UserRole.SUPPORT_MANAGER],
        [UserRole.ACCOUNT_MANAGER],
        [UserRole.FINANCE, UserRole.ACCOUNT_MANAGER],
    ],
    indirect=True,
    ids=["admin", "support-manager", "account-manager", "multiple-roles"],
)
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"email": "contact@example.com"},
        {"phone": "+78005553535", "email": "contact@example.com"},
    ],
    ids=["empty", "email-only", "duplicate-phone-and-email"],
)
async def test_delete_by_id_removes_selected_duplicate(
    contact_client, counterparty, repository, mock_session, payload
):
    first = ContactPerson.create(**payload)
    second = ContactPerson.create(**payload)
    counterparty.contact_persons = [first, second]

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{second.id}"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(counterparty.id)
    assert [person["id"] for person in response.json()["contact_persons"]] == [str(first.id)]
    assert counterparty.contact_persons == [first]
    repository.read.assert_awaited_once_with(counterparty.id)
    repository.update.assert_awaited_once_with(counterparty)
    mock_session.commit.assert_awaited_once()


@pytest.mark.parametrize(
    "subject",
    [
        [],
        [UserRole.CUSTOMER],
        [UserRole.CUSTOMER_ADMIN],
        [UserRole.SUPPORT_AGENT],
        [UserRole.DEVELOPER],
        [UserRole.FINANCE],
    ],
    indirect=True,
    ids=["no-roles", "customer", "customer-admin", "support-agent", "developer", "finance"],
)
async def test_delete_by_id_requires_allowed_role(
    contact_client, counterparty, repository, mock_session
):
    contact = ContactPerson.create()
    counterparty.contact_persons = [contact]

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{contact.id}"
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert counterparty.contact_persons == [contact]
    repository.read.assert_not_awaited()
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_delete_by_id_requires_authentication(
    contact_client, contact_app, counterparty, repository, mock_session
):
    contact_app.dependency_overrides.pop(get_current_subject)
    contact = ContactPerson.create()
    counterparty.contact_persons = [contact]

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{contact.id}"
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert counterparty.contact_persons == [contact]
    repository.read.assert_not_awaited()
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_delete_unknown_contact_returns_404_without_changes(
    contact_client, counterparty, repository, mock_session
):
    existing = ContactPerson.create()
    counterparty.contact_persons = [existing]
    previous_updated_at = counterparty.updated_at

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{uuid4()}"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert counterparty.contact_persons == [existing]
    assert counterparty.updated_at == previous_updated_at
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_delete_unknown_counterparty_returns_404(
    contact_client, repository, mock_session
):
    repository.read.return_value = None
    missing_counterparty_id = uuid4()

    response = await contact_client.delete(
        f"/api/v1/counterparties/{missing_counterparty_id}/contact-persons/{uuid4()}"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    repository.read.assert_awaited_once_with(missing_counterparty_id)
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_cannot_delete_contact_from_another_counterparty(
    contact_client, counterparty, repository, mock_session
):
    own_contact = ContactPerson.create()
    foreign_contact = ContactPerson.create()
    counterparty.contact_persons = [own_contact]
    other_counterparty = replace(
        counterparty, id=uuid4(), contact_persons=[foreign_contact]
    )
    counterparties = {
        counterparty.id: counterparty,
        other_counterparty.id: other_counterparty,
    }
    repository.read.side_effect = counterparties.get

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{foreign_contact.id}"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert counterparty.contact_persons == [own_contact]
    assert other_counterparty.contact_persons == [foreign_contact]
    repository.read.assert_awaited_once_with(counterparty.id)
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_delete_invalid_contact_id_returns_422(
    contact_client, counterparty, repository, mock_session
):
    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/not-a-uuid"
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    repository.read.assert_not_awaited()
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_delete_last_contact_by_id_returns_empty_list(
    contact_client, counterparty, repository, mock_session
):
    contact = ContactPerson.create(phone="+78005553535", email="contact@example.com")
    counterparty.contact_persons = [contact]

    response = await contact_client.delete(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{contact.id}",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["contact_persons"] == []
    assert counterparty.contact_persons == []
    repository.update.assert_awaited_once_with(counterparty)
    mock_session.commit.assert_awaited_once()


def test_repeated_deletion_raises_not_found(counterparty):
    contact = ContactPerson.create()
    counterparty.contact_persons = [contact]
    counterparty.remove_contact_person_by_id(contact.id)
    previous_updated_at = counterparty.updated_at

    with pytest.raises(NotFoundError, match=str(contact.id)):
        counterparty.remove_contact_person_by_id(contact.id)

    assert counterparty.contact_persons == []
    assert counterparty.updated_at == previous_updated_at
