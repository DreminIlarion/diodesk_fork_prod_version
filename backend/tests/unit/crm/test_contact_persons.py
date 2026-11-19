from itertools import combinations
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.crm.domain.entities import Counterparty
from src.crm.domain.vo import ContactPerson, ContactPersonFullName, CounterpartyType, Inn, Kpp
from src.crm.infra.repos import CounterpartyMapper
from src.crm.mappers import map_counterparty_to_response
from src.crm.schemas import ContactPersonIn, CounterpartyCreate
from src.crm.services import CounterpartyService
from src.iam.domain.vo import FullName

CONTACT_FIELDS = {
    "first_name": "иван",
    "last_name": "иванов",
    "middle_name": "иванович",
    "phone": "88005553535",
    "email": "contact@example.com",
    "position": "Менеджер",
    "extension": "1234",
    "messengers": {"telegram": "contact"},
}
FIELD_COMBINATIONS = [
    fields
    for count in range(len(CONTACT_FIELDS) + 1)
    for fields in combinations(CONTACT_FIELDS, count)
]


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


@pytest.mark.parametrize(
    "fields", FIELD_COMBINATIONS, ids=lambda fields: "+".join(fields) or "empty"
)
def test_optional_contact_fields_round_trip(counterparty, fields):
    payload = {key: CONTACT_FIELDS[key] for key in fields}
    data = ContactPersonIn.model_validate(payload)
    counterparty.add_contact_person(**data.model_dump())
    original = counterparty.contact_persons[0]

    model = CounterpartyMapper.from_entity(counterparty)
    restored = CounterpartyMapper.to_entity(model)
    contact = restored.contact_persons[0]
    response = map_counterparty_to_response(restored).contact_persons[0]
    expected_name = " ".join(
        CONTACT_FIELDS[key].title()
        for key in ("last_name", "first_name", "middle_name")
        if key in fields
    ) or None
    expected_phone = "+78005553535" if "phone" in fields else None

    assert contact.id == original.id == response.id
    assert model.contact_persons[0]["full_name"] == expected_name
    assert response.full_name == expected_name
    assert (contact.full_name.value if contact.full_name else None) == expected_name
    assert (contact.phone.value if contact.phone else None) == expected_phone
    assert contact.email == response.email == payload.get("email")
    assert contact.position == response.position == payload.get("position")
    assert contact.extension == response.extension == payload.get("extension")
    assert contact.messengers == response.messengers == payload.get("messengers", {})


@pytest.mark.parametrize("blank", [None, "", " \t "])
def test_blank_optional_fields_are_normalized(blank):
    payload = {key: blank for key in CONTACT_FIELDS if key != "messengers"}
    payload["messengers"] = None
    data = ContactPersonIn.model_validate(payload)

    assert data.model_dump() == {
        **dict.fromkeys(payload),
        "messengers": {},
    }
    contact = ContactPerson.create(**data.model_dump())
    assert contact.full_name is None
    assert contact.phone is None
    assert contact.email is None
    assert contact.position is None
    assert contact.extension is None
    assert contact.messengers == {}


def test_contact_factory_accepts_no_arguments():
    contact = ContactPerson.create()

    assert contact.full_name is None
    assert contact.phone is None
    assert contact.email is None
    assert contact.position is None
    assert contact.extension is None
    assert contact.messengers == {}


@pytest.mark.parametrize("name", ["Иван123", "Иван@", "Иван🙂"])
def test_contact_name_still_rejects_invalid_characters(name):
    with pytest.raises(ValueError, match="Invalid characters in full name"):
        ContactPerson.create(first_name=name)


def test_contact_name_preserves_length_limit():
    contact = ContactPerson.create(first_name="а" * 154)
    assert contact.full_name.value == "А" + "а" * 153

    with pytest.raises(ValueError, match="Full name cannot be longer"):
        ContactPerson.create(first_name="а" * 155)


def test_only_contact_names_accept_single_part():
    name = ContactPersonFullName("иван")
    assert name.value == "Иван"
    assert name.middle_name is None
    assert FullName("иван иванов").value == "Иван Иванов"
    with pytest.raises(ValueError, match="at least 2 parts"):
        FullName("иван")


def test_mapper_reads_contact_with_missing_optional_keys(counterparty):
    model = CounterpartyMapper.from_entity(counterparty)
    contact_id = uuid4()
    model.contact_persons = [{"id": str(contact_id)}]

    restored = CounterpartyMapper.to_entity(model)
    contact = restored.contact_persons[0]

    assert contact.id == contact_id
    assert contact.full_name is None
    assert contact.phone is None
    assert contact.email is None
    assert contact.position is None
    assert contact.extension is None
    assert contact.messengers == {}


def test_supplied_email_still_requires_valid_format():
    with pytest.raises(ValidationError, match="email"):
        ContactPersonIn(email="invalid-email")


def test_supplied_phone_still_requires_valid_format():
    with pytest.raises(ValueError, match="Invalid phone number"):
        ContactPerson.create(phone="123")


@pytest.mark.parametrize(
    ("messengers", "message"),
    [
        ({"unknown": "contact"}, "Disabled messengers"),
        ({"telegram": ""}, "must be non empty string"),
    ],
)
def test_supplied_messengers_still_require_valid_values(messengers, message):
    with pytest.raises(ValueError, match=message):
        ContactPerson.create(messengers=messengers)


@pytest.mark.parametrize("payload", [{}, {"first_name": "Иван"}, {"email": "contact@example.com"}])
async def test_service_creates_and_adds_optional_contacts(
    mock_session, fake_counterparty_repo, payload
):
    service = CounterpartyService(session=mock_session, repository=fake_counterparty_repo)
    data = CounterpartyCreate(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Компания",
        legal_name="ООО Компания",
        inn="7707083893",
        kpp="773301001",
        email="company@example.com",
        contact_persons=[ContactPersonIn.model_validate(payload)],
    )

    expected_contact_count = len(data.contact_persons) + 1
    created = await service.create(data)
    response = await service.add_contact_person(
        created.id, ContactPersonIn.model_validate(payload)
    )
    stored = await fake_counterparty_repo.read(created.id)

    assert len(response.contact_persons) == len(stored.contact_persons) == expected_contact_count
    first, second = response.contact_persons
    assert first.id != second.id
    assert first.full_name == second.full_name == payload.get("first_name")
    assert first.email == second.email == payload.get("email")
    mock_session.commit.assert_awaited()
