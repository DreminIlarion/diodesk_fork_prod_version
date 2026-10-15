from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError

from .domain.entities import Counterparty, CounterpartyProduct
from .domain.repo import CounterpartyRepository
from .domain.vo import ContactPerson, Inn, Kpp, Okpo, Phone
from .mappers import map_counterparty_product_to_response, map_counterparty_to_response
from .schemas import (
    BranchAdd,
    ContactPersonIn,
    CounterpartyCreate,
    CounterpartyEdit,
    CounterpartyProductCreate,
    CounterpartyProductResponse,
    CounterpartyProductUpdate,
    CounterpartyResponse,
)


class CounterpartyService:
    def __init__(self, session: AsyncSession, repository: CounterpartyRepository) -> None:
        self.session = session
        self.repository = repository

    async def create(self, data: CounterpartyCreate) -> CounterpartyResponse:
        """Создание нового контрагента (по умолчанию головной)"""

        # 1. Проверка на уникальность (ИНН + email)
        exists_counterparty = await self.repository.get_by_inn(Inn(data.inn))
        if exists_counterparty is not None:
            raise AlreadyExistsError(f"Counterparty with INN {data.inn} already exists")
        if data.email:
            exists_counterparty = await self.repository.get_by_email(data.email)
            if exists_counterparty:
                raise AlreadyExistsError(f"This {data.email} email address already used")

        # 2. Создание доменных примитивов и объектов значений
        inn = Inn(data.inn)
        kpp = None if data.kpp is None else Kpp(data.kpp)
        okpo = None if data.okpo is None else Okpo(data.okpo)
        phone = Phone(data.phone)

        # 3. Формирование контактных лиц лица
        contact_persons = [
            ContactPerson.create(
                first_name=contact_person.first_name,
                last_name=contact_person.last_name,
                middle_name=contact_person.middle_name,
                phone=contact_person.phone,
                email=contact_person.email,
                messengers=contact_person.messengers,
                position=contact_person.position,      # ← добавить
                extension=contact_person.extension,
            )
            for contact_person in data.contact_persons
        ]

        # 4. Создание доменной сущности
        counterparty = Counterparty(
            counterparty_type=data.counterparty_type,
            name=data.name,
            legal_name=data.legal_name,
            inn=inn,
            kpp=kpp,
            okpo=okpo,
            phone=phone,
            email=data.email,
            address=data.address,
            contact_persons=contact_persons,
        )

        # 5. Запись в базу данных
        await self.repository.create(counterparty)
        await self.session.commit()

        return map_counterparty_to_response(counterparty)

    async def edit(self, counterparty_id: UUID, data: CounterpartyEdit) -> CounterpartyResponse:
        """
        Редактирование информации о контрагенте
        """

        # 1. Проверка на существование
        counterparty = await self.repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Parent counterparty with ID {counterparty_id} not found")

        # 2. Редактирование и обновление сущности
        counterparty.edit(
            name=data.name,
            legal_name=data.legal_name,
            okpo=None if data.okpo is None else Okpo(data.okpo),
            phone=None if data.phone is None else Phone(data.phone),
            email=data.email,
            address=data.address,
        )
        await self.repository.update(counterparty)
        await self.session.commit()

        return map_counterparty_to_response(counterparty)

    async def add_branch(self, counterparty_id, data: BranchAdd) -> CounterpartyResponse:
        """
        Привязка обособленного подразделения (например другой филиал)
        """

        # 1. Проверка на существование
        exists_counterparty = await self.repository.read(counterparty_id)
        if exists_counterparty is None:
            raise NotFoundError(f"Parent counterparty with ID {counterparty_id} not found")

        # 2. Создание обособленного подразделения
        branch = exists_counterparty.create_branch(
            name=data.name,
            legal_name=data.legal_name,
            kpp=data.kpp,
            phone=data.phone,
            email=data.email,
            okpo=data.okpo,
            address=data.address,
        )

        # 3. Запись в базу данных
        await self.repository.create(branch)
        await self.session.commit()

        return map_counterparty_to_response(branch)

    async def add_contact_person(
            self, counterparty_id: UUID, data: ContactPersonIn
    ) -> CounterpartyResponse:
        """Добавление контактного лица"""

        # 1. Получение и проверка на существование контрагента
        counterparty = await self.repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Counterparty with ID {counterparty_id} not found")

        # 2. Добавление контактного лица и обновление сущности
        counterparty.add_contact_person(
            first_name=data.first_name,
            last_name=data.last_name,
            middle_name=data.middle_name,
            phone=data.phone,
            email=data.email,
            messengers=data.messengers,
            position=data.position,      # ← добавил
            extension=data.extension,
        )
        await self.repository.update(counterparty)
        await self.session.commit()

        return map_counterparty_to_response(counterparty)

    async def link_product(
            self, counterparty_id: UUID, data: CounterpartyProductCreate
    ) -> CounterpartyProductResponse:
        """
        Привязка программного продукта к контрагенту
        (программны продукт из общего справочника)
        """

        # 1. Получение и проверка на существование контрагента
        counterparty = await self.repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Counterparty with ID {counterparty_id} not found")

        existing_link = await self.repository.get_product_link_by_serial(data.serial_number)
        if existing_link is not None:
            raise AlreadyExistsError(
                f"Product with serial number {data.serial_number} is already linked"
            )

        product = await self.repository.get_product(data.product_id)
        if product is None:
            raise NotFoundError(f"Product with ID {data.product_id} not found")

        link = CounterpartyProduct(
            counterparty_id=counterparty.id,
            product_id=data.product_id,
            serial_number=data.serial_number,
            product=product,
        )
        await self.repository.link_product(link)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise AlreadyExistsError(
                f"Product with serial number {data.serial_number} is already linked"
            ) from exc

        return map_counterparty_product_to_response(link)

    async def update_product_link(
            self,
            counterparty_id: UUID,
            link_id: UUID,
            data: CounterpartyProductUpdate,
    ) -> CounterpartyProductResponse:
        link = await self.repository.read_product_link(counterparty_id, link_id)
        if link is None:
            raise NotFoundError(
                f"Product link with ID {link_id} not found for counterparty {counterparty_id}"
            )

        existing_link = await self.repository.get_product_link_by_serial(data.serial_number)
        if existing_link is not None and existing_link.id != link.id:
            raise AlreadyExistsError(
                f"Product with serial number {data.serial_number} is already linked"
            )

        link.change_serial_number(data.serial_number)
        await self.repository.update_product_link(link)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise AlreadyExistsError(
                f"Product with serial number {data.serial_number} is already linked"
            ) from exc

        return map_counterparty_product_to_response(link)

    async def unlink_product(self, counterparty_id: UUID, link_id: UUID) -> None:
        """
        Отвязка программного продукта от контрагента
        """

        # 1. Получение и проверка на существование контрагента
        counterparty = await self.repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Counterparty with ID {counterparty_id} not found")

        deleted = await self.repository.unlink_product(counterparty.id, link_id)
        if not deleted:
            raise NotFoundError(
                f"Product link with ID {link_id} not found for counterparty {counterparty_id}"
            )
        await self.session.commit()

    async def delete_contact_person(
            self, counterparty_id: UUID, phone: str, email: str | None = None
    ) -> CounterpartyResponse:
        """Удаление контактного лица контрагента"""

        # 1. Получение и проверка на существование контрагента
        counterparty = await self.repository.read(counterparty_id)
        if counterparty is None:
            raise NotFoundError(f"Counterparty with ID {counterparty_id} not found")

        # 2. Удаление контактного лица и обновление сущности
        counterparty.remove_contact_person(Phone(phone), email)
        await self.repository.update(counterparty)
        await self.session.commit()

        return map_counterparty_to_response(counterparty)
