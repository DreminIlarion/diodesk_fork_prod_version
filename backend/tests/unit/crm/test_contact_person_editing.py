from dataclasses import replace
from datetime import timedelta
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
from src.crm.infra.repos import CounterpartyMapper
from src.crm.router import router
from src.crm.services import CounterpartyService
from src.iam.dependencies import get_current_subject
from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.vo import UserRole
from src.shared.domain.exceptions import AppError
from src.shared.utils.time import current_datetime


@pytest.fixture
def counterparty():
    contact = ContactPerson.create(
        last_name="Иванов",
        first_name="Иван",
        middle_name="Иванович",
        phone="88005553535",
        email="contact@example.com",
        position="Менеджер",
        extension="123",
        messengers={"telegram": "original", "vk": "original-vk"},
    )
    contact.user_id = uuid4()
    contact.updated_at = current_datetime() - timedelta(days=1)
    duplicate = replace(contact, id=uuid4(), user_id=None, messengers=contact.messengers.copy())
    return Counterparty(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Компания",
        legal_name="ООО Компания",
        inn=Inn("7707083893"),
        kpp=Kpp("773301001"),
        email="company@example.com",
        contact_persons=[contact, duplicate],
        updated_at=contact.updated_at,
    )


@pytest.fixture
def repository(counterparty):
    repository = AsyncMock(spec=CounterpartyRepository)
    repository.read_for_update.return_value = counterparty
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

    @app.exception_handler(ValueError)
    def handle_value_error(request: Request, exc: ValueError):
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})

    return app


@pytest.fixture
async def contact_client(contact_app):
    async with AsyncClient(
        transport=ASGITransport(app=contact_app), base_url="http://test"
    ) as client:
        yield client


def contact_url(counterparty):
    return (
        f"/api/v1/counterparties/{counterparty.id}"
        f"/contact-persons/{counterparty.contact_persons[0].id}"
    )


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("full_name", "  петрова анна  ", "Петрова Анна"),
        ("full_name", "  анна  ", "Анна"),
        ("phone", "  89991234567  ", "+79991234567"),
        ("email", "  new@EXAMPLE.COM  ", "new@example.com"),
        ("position", "  Главный бухгалтер  ", "Главный бухгалтер"),
        ("extension", "  456  ", "456"),
        ("messengers", {"signal": "new-user"}, {"signal": "new-user"}),
    ],
)
async def test_patch_updates_only_selected_field_and_preserves_identity(
    contact_client, counterparty, repository, mock_session, field, value, expected
):
    original = counterparty.contact_persons[0]
    created_at = original.created_at
    updated_at = original.updated_at
    before = CounterpartyMapper.from_entity(counterparty).contact_persons

    response = await contact_client.patch(contact_url(counterparty), json={field: value})

    assert response.status_code == status.HTTP_200_OK
    after = CounterpartyMapper.from_entity(counterparty).contact_persons
    assert after == [{**before[0], field: expected}, before[1]]
    assert counterparty.contact_persons[0] is original
    assert original.created_at == created_at
    assert original.updated_at != updated_at
    assert counterparty.updated_at == original.updated_at
    repository.read_for_update.assert_awaited_once_with(counterparty.id)
    repository.update.assert_awaited_once_with(counterparty)
    mock_session.commit.assert_awaited_once()

    restored = CounterpartyMapper.to_entity(CounterpartyMapper.from_entity(counterparty))
    restored_contact = restored.contact_persons[0]
    assert restored_contact.id == original.id
    assert restored_contact.user_id == original.user_id
    assert response.json()["contact_persons"][0]["id"] == str(original.id)
    assert response.json()["contact_persons"][0]["user_id"] == str(original.user_id)
    assert CounterpartyMapper.from_entity(restored).contact_persons == after


@pytest.mark.parametrize("field", ["full_name", "phone", "email", "position", "extension"])
@pytest.mark.parametrize("blank", [None, "", " \t ", "\u00a0"])
async def test_patch_clears_only_supplied_optional_field(
    contact_client, counterparty, field, blank
):
    before = CounterpartyMapper.from_entity(counterparty).contact_persons

    response = await contact_client.patch(contact_url(counterparty), json={field: blank})

    assert response.status_code == status.HTTP_200_OK
    assert CounterpartyMapper.from_entity(counterparty).contact_persons == [
        {**before[0], field: None}, before[1],
    ]
    assert response.json()["contact_persons"][0][field] is None


async def test_patch_fills_empty_contact(contact_client, counterparty):
    empty_contact = ContactPerson.create()
    counterparty.contact_persons = [empty_contact]

    response = await contact_client.patch(
        contact_url(counterparty),
        json={"full_name": "  иван  ", "email": "new@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["contact_persons"] == [{
        "id": str(empty_contact.id),
        "user_id": None,
        "full_name": "Иван",
        "email": "new@example.com",
        "phone": None,
        "position": None,
        "extension": None,
        "messengers": {},
    }]


@pytest.mark.parametrize("value", [None, {}])
async def test_patch_can_clear_messengers(contact_client, counterparty, value):
    before = CounterpartyMapper.from_entity(counterparty).contact_persons

    response = await contact_client.patch(contact_url(counterparty), json={"messengers": value})

    assert response.status_code == status.HTTP_200_OK
    assert CounterpartyMapper.from_entity(counterparty).contact_persons == [
        {**before[0], "messengers": {}}, before[1],
    ]


async def test_patch_can_clear_all_fields_without_deleting_contact(contact_client, counterparty):
    original = counterparty.contact_persons[0]
    contact_ids = [contact.id for contact in counterparty.contact_persons]
    payload = dict.fromkeys(["full_name", "phone", "email", "position", "extension", "messengers"])

    response = await contact_client.patch(contact_url(counterparty), json=payload)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()["contact_persons"][0]
    assert data == {
        "id": str(original.id),
        "user_id": str(original.user_id),
        **dict.fromkeys(["full_name", "phone", "email", "position", "extension"]),
        "messengers": {},
    }
    assert [contact.id for contact in counterparty.contact_persons] == contact_ids


@pytest.mark.parametrize("payload", [{}, {"position": "  Менеджер  "}])
async def test_patch_without_changes_preserves_timestamps(
    contact_client, counterparty, repository, mock_session, payload
):
    before = CounterpartyMapper.from_entity(counterparty).contact_persons
    timestamp = counterparty.updated_at

    response = await contact_client.patch(contact_url(counterparty), json=payload)

    assert response.status_code == status.HTTP_200_OK
    assert CounterpartyMapper.from_entity(counterparty).contact_persons == before
    assert counterparty.updated_at == counterparty.contact_persons[0].updated_at == timestamp
    repository.update.assert_not_awaited()
    mock_session.commit.assert_awaited_once()


async def test_patch_allows_duplicate_contact_fields(contact_client, counterparty):
    response = await contact_client.patch(
        contact_url(counterparty),
        json={"email": "contact@example.com", "phone": "88005553535", "position": "Директор"},
    )

    assert response.status_code == status.HTTP_200_OK
    first, second = response.json()["contact_persons"]
    assert first["id"] != second["id"]
    assert first["email"] == second["email"]
    assert first["phone"] == second["phone"]
    assert first["position"] == "Директор"
    assert second["position"] == "Менеджер"


@pytest.mark.parametrize(
    ("payload", "expected_status"),
    [
        ({"full_name": "Иван123"}, status.HTTP_400_BAD_REQUEST),
        ({"full_name": "А" * 155}, status.HTTP_400_BAD_REQUEST),
        ({"phone": "123"}, status.HTTP_400_BAD_REQUEST),
        ({"messengers": {"unknown": "value"}}, status.HTTP_400_BAD_REQUEST),
        ({"messengers": {"telegram": ""}}, status.HTTP_400_BAD_REQUEST),
        ({"email": "invalid-email"}, status.HTTP_422_UNPROCESSABLE_CONTENT),
        ({"position": 123}, status.HTTP_422_UNPROCESSABLE_CONTENT),
        ({"messengers": []}, status.HTTP_422_UNPROCESSABLE_CONTENT),
        ({"id": str(uuid4())}, status.HTTP_422_UNPROCESSABLE_CONTENT),
        ({"user_id": str(uuid4())}, status.HTTP_422_UNPROCESSABLE_CONTENT),
        ({"first_name": "Иван"}, status.HTTP_422_UNPROCESSABLE_CONTENT),
    ],
)
async def test_invalid_patch_leaves_contact_unchanged(
    contact_client, counterparty, repository, mock_session, payload, expected_status
):
    before = CounterpartyMapper.from_entity(counterparty).contact_persons
    timestamp = counterparty.updated_at

    response = await contact_client.patch(
        contact_url(counterparty), json={"position": "Новое значение", **payload}
    )

    assert response.status_code == expected_status
    assert CounterpartyMapper.from_entity(counterparty).contact_persons == before
    assert counterparty.updated_at == counterparty.contact_persons[0].updated_at == timestamp
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


@pytest.mark.parametrize("missing", ["contact", "counterparty", "foreign-contact"])
async def test_patch_missing_or_foreign_contact_returns_404(
    contact_client, counterparty, repository, mock_session, missing
):
    before = CounterpartyMapper.from_entity(counterparty).contact_persons
    contact_id = uuid4()
    if missing == "counterparty":
        repository.read_for_update.return_value = None
    elif missing == "foreign-contact":
        foreign = replace(counterparty, id=uuid4(), contact_persons=[ContactPerson.create()])
        contact_id = foreign.contact_persons[0].id
        repository.read_for_update.side_effect = {
            counterparty.id: counterparty, foreign.id: foreign,
        }.get

    response = await contact_client.patch(
        f"/api/v1/counterparties/{counterparty.id}/contact-persons/{contact_id}",
        json={"position": "Изменено"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert CounterpartyMapper.from_entity(counterparty).contact_persons == before
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


@pytest.mark.parametrize(
    "subject",
    [[UserRole.ADMIN], [UserRole.SUPPORT_MANAGER], [UserRole.ACCOUNT_MANAGER]],
    indirect=True,
)
async def test_patch_accepts_allowed_roles(contact_client, counterparty):
    response = await contact_client.patch(contact_url(counterparty), json={"position": "Директор"})

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.parametrize(
    "subject",
    [[], [UserRole.CUSTOMER], [UserRole.CUSTOMER_ADMIN], [UserRole.SUPPORT_AGENT],
     [UserRole.DEVELOPER], [UserRole.FINANCE]],
    indirect=True,
)
async def test_patch_rejects_disallowed_roles(
    contact_client, counterparty, repository, mock_session
):
    response = await contact_client.patch(contact_url(counterparty), json={"position": "Директор"})

    assert response.status_code == status.HTTP_403_FORBIDDEN
    repository.read_for_update.assert_not_awaited()
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


async def test_patch_requires_authentication(
    contact_client, contact_app, counterparty, repository, mock_session
):
    contact_app.dependency_overrides.pop(get_current_subject)

    response = await contact_client.patch(contact_url(counterparty), json={"position": "Директор"})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    repository.read_for_update.assert_not_awaited()
    repository.update.assert_not_awaited()
    mock_session.commit.assert_not_awaited()


@pytest.mark.parametrize("invalid_id", ["counterparty", "contact"])
async def test_patch_invalid_ids_return_422(contact_client, counterparty, repository, invalid_id):
    url = contact_url(counterparty)
    valid_id = (
        counterparty.id if invalid_id == "counterparty" else counterparty.contact_persons[0].id
    )

    response = await contact_client.patch(
        url.replace(str(valid_id), "not-a-uuid"), json={"position": "Директор"}
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    repository.read_for_update.assert_not_awaited()
