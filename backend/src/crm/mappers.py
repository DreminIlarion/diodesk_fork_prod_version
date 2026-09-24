from .domain.entities import Counterparty
from .schemas import ContactPersonOut, CounterpartyResponse


def map_counterparty_to_response(counterparty: Counterparty) -> CounterpartyResponse:
    """
    Преобразование доменной сущности контрагента к API схеме ответа
    """

    return CounterpartyResponse(
        id=counterparty.id,
        created_at=counterparty.created_at,
        updated_at=counterparty.updated_at,
        counterparty_type=counterparty.counterparty_type,
        name=counterparty.name,
        legal_name=counterparty.legal_name,
        inn=str(counterparty.inn) if counterparty.inn else None,
        kpp=str(counterparty.kpp) if counterparty.kpp else None,
        okpo=str(counterparty.okpo) if counterparty.okpo else None,
        phone=str(counterparty.phone) if counterparty.phone else None,
        email=counterparty.email,
        address=counterparty.address,
        avatar_url=counterparty.avatar_url,
        is_head=counterparty.is_head,
        parent_id=counterparty.parent_id,
        is_branch=counterparty.is_branch,
        is_active=counterparty.is_active,
        contact_persons=[
            ContactPersonOut(
                full_name=str(contact_person.full_name) if contact_person.full_name else None,
                phone=str(contact_person.phone) if contact_person.phone else None,
                email=str(contact_person.email) if contact_person.email else None,
                position=contact_person.position,
                extension=contact_person.extension,
                messengers=contact_person.messengers,
            )
            for contact_person in counterparty.contact_persons
        ],
    )
