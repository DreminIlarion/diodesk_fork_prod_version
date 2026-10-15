import pytest
from sqlalchemy.exc import IntegrityError

from src.crm.domain.entities import CounterpartyProduct
from src.crm.domain.vo import CounterpartyType
from src.crm.infra.models import CounterpartyOrm, CounterpartyProductOrm
from src.crm.infra.repos import SqlCounterpartyRepository
from src.products.domain.vo import ProductCategory, ProductStatus
from src.products.infra.models import SoftwareProductOrm
from src.products.infra.repo import SoftwareProductMapper
from src.shared.schemas import Pagination

PRODUCT_INSTANCE_COUNT = 2


@pytest.fixture
def counterparty_repo(session):
    return SqlCounterpartyRepository(session)


@pytest.fixture
async def counterparty_and_product(session):
    counterparty = CounterpartyOrm(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Test company",
        legal_name="Test company LLC",
        inn="1234567890",
        kpp="123456789",
        phone="88005553535",
        email="serials@example.com",
        address=None,
        avatar_url=None,
        contact_persons=[],
        is_active=True,
    )
    product = SoftwareProductOrm(
        name="Product",
        vendor="Vendor",
        registration_number="REG-001",
        category=ProductCategory.OTHER,
        status=ProductStatus.ACTIVE,
        attributes={},
    )
    session.add_all([counterparty, product])
    await session.flush()
    return counterparty, product


@pytest.mark.integration
@pytest.mark.asyncio
async def test_multiple_serials_for_same_counterparty_product(
        session, counterparty_repo, counterparty_and_product
):
    counterparty, product_model = counterparty_and_product
    product = SoftwareProductMapper.to_entity(product_model)
    links = [
        CounterpartyProduct(
            counterparty_id=counterparty.id,
            product_id=product.id,
            serial_number=f"SERIAL-{index}",
            product=product,
        )
        for index in range(2)
    ]
    for link in links:
        await counterparty_repo.link_product(link)
    await session.commit()

    page = await counterparty_repo.get_products(
        counterparty.id, Pagination(page=1, size=10)
    )

    assert page.total_items == PRODUCT_INSTANCE_COUNT
    assert {item.id for item in page.items} == {link.id for link in links}
    assert {item.serial_number for item in page.items} == {"SERIAL-0", "SERIAL-1"}

    links[0].change_serial_number("SERIAL-UPDATED")
    await counterparty_repo.update_product_link(links[0])
    await counterparty_repo.unlink_product(counterparty.id, links[1].id)
    await session.commit()

    page = await counterparty_repo.get_products(
        counterparty.id, Pagination(page=1, size=10)
    )
    assert page.total_items == 1
    assert page.items[0].id == links[0].id
    assert page.items[0].serial_number == "SERIAL-UPDATED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_serial_number_is_globally_unique(session, counterparty_and_product):
    counterparty, product = counterparty_and_product
    session.add_all([
        CounterpartyProductOrm(
            counterparty_id=counterparty.id,
            product_id=product.id,
            serial_number="SERIAL-DUPLICATE",
        ),
        CounterpartyProductOrm(
            counterparty_id=counterparty.id,
            product_id=product.id,
            serial_number="SERIAL-DUPLICATE",
        ),
    ])

    with pytest.raises(IntegrityError):
        await session.commit()

    await session.rollback()
