from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.crm.domain.entities import CounterpartyProduct
from src.crm.domain.repo import CounterpartyRepository
from src.crm.schemas import CounterpartyProductCreate, CounterpartyProductUpdate
from src.crm.services import CounterpartyService
from src.products.domain.entities import SoftwareProduct
from src.products.domain.vo import ProductCategory, ProductStatus
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


@pytest.fixture
def product():
    return SoftwareProduct(
        name="Product",
        vendor="Vendor",
        registration_number="REG-001",
        category=ProductCategory.OTHER,
        status=ProductStatus.ACTIVE,
    )


@pytest.fixture
def counterparty_id():
    return uuid4()


@pytest.fixture
def product_link_service(mock_session, counterparty_id, product):
    repository = AsyncMock(spec=CounterpartyRepository)
    repository.read.return_value = type("CounterpartyRef", (), {"id": counterparty_id})()
    repository.get_product.return_value = product
    repository.get_product_link_by_serial.return_value = None
    repository.link_product.side_effect = lambda link: link
    return CounterpartyService(mock_session, repository), repository


@pytest.mark.parametrize("serial_number", [None, "", "   "])
def test_serial_number_is_required(serial_number):
    with pytest.raises(ValidationError):
        CounterpartyProductCreate(product_id=uuid4(), serial_number=serial_number)


@pytest.mark.asyncio
async def test_link_product_creates_serialized_instance(
        product_link_service, counterparty_id, product, mock_session
):
    service, repository = product_link_service

    response = await service.link_product(
        counterparty_id,
        CounterpartyProductCreate(product_id=product.id, serial_number="  SERIAL-001  "),
    )

    assert response.counterparty_id == counterparty_id
    assert response.product_id == product.id
    assert response.serial_number == "SERIAL-001"
    repository.link_product.assert_awaited_once()
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_link_product_rejects_duplicate_serial(
        product_link_service, counterparty_id, product
):
    service, repository = product_link_service
    repository.get_product_link_by_serial.return_value = CounterpartyProduct(
        counterparty_id=uuid4(),
        product_id=product.id,
        serial_number="SERIAL-001",
        product=product,
    )

    with pytest.raises(AlreadyExistsError):
        await service.link_product(
            counterparty_id,
            CounterpartyProductCreate(product_id=product.id, serial_number="SERIAL-001"),
        )


@pytest.mark.asyncio
async def test_link_product_rejects_missing_product(
        product_link_service, counterparty_id, product
):
    service, repository = product_link_service
    repository.get_product.return_value = None

    with pytest.raises(NotFoundError):
        await service.link_product(
            counterparty_id,
            CounterpartyProductCreate(product_id=product.id, serial_number="SERIAL-001"),
        )


@pytest.mark.asyncio
async def test_update_changes_only_selected_link(
        product_link_service, counterparty_id, product, mock_session
):
    service, repository = product_link_service
    link = CounterpartyProduct(
        counterparty_id=counterparty_id,
        product_id=product.id,
        serial_number=None,
        product=product,
    )
    repository.read_product_link.return_value = link

    response = await service.update_product_link(
        counterparty_id,
        link.id,
        CounterpartyProductUpdate(serial_number="SERIAL-NEW"),
    )

    assert response.id == link.id
    assert response.serial_number == "SERIAL-NEW"
    repository.update_product_link.assert_awaited_once_with(link)
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_unlink_missing_link_fails(
        product_link_service, counterparty_id
):
    service, repository = product_link_service
    repository.unlink_product.return_value = False

    with pytest.raises(NotFoundError):
        await service.unlink_product(counterparty_id, uuid4())
