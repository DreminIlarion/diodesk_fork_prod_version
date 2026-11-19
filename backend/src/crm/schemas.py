from typing import Annotated, Any

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

from src.products.schemas import ProductResponse

from .domain.vo import CounterpartyType

NonEmptySerialNumber = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1)
]


class CounterpartyProductCreate(BaseModel):
    product_id: UUID = Field(..., description="ID продукта из справочника")
    serial_number: NonEmptySerialNumber = Field(..., description="Серийный номер продукта")


class CounterpartyProductUpdate(BaseModel):
    serial_number: NonEmptySerialNumber = Field(..., description="Новый серийный номер продукта")


class CounterpartyProductResponse(BaseModel):
    id: UUID = Field(..., description="ID экземпляра продукта у контрагента")
    counterparty_id: UUID
    product_id: UUID
    serial_number: str | None
    created_at: datetime
    updated_at: datetime
    product: ProductResponse


class ContactPersonIn(BaseModel):
    """Добавление контактного лица контрагента"""

    first_name: str | None = Field(None, description="Имя")
    last_name: str | None = Field(None, description="Фамилия")

    middle_name: str | None = Field(None, description="Отчество")
    phone: str | None = Field(
        None, description="Номер телефона", examples=["88005553535", "+78005553535"]
    )
    email: EmailStr | None = Field(None, description="Адрес электронной почты")
    position: str | None = Field(None, description="Должность", examples=["Главный бухгалтер"])
    extension: str | None = Field(None, description="Добавочный номер", examples=["1234"])
    messengers: dict[str, str] | None = Field(
        default_factory=dict,
        description="Контакты в мессенджерах",
        examples=[{"telegram": "exampleUser05", "vk": "1254752"}]
    )

    @field_validator(
        "first_name",
        "last_name",
        "middle_name",
        "phone",
        "email",
        "position",
        "extension",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("messengers", mode="before")
    @classmethod
    def normalize_messangers(cls, value: Any) -> Any:
        return {} if value is None else value


class ContactPersonOut(BaseModel):
    """Созданное контактное лицо"""

    id: UUID = Field(..., description="Уникальный идентификатор контактного лица")

    user_id: UUID | None = None
    full_name: str | None = Field(None, description="ФИО лица", examples=["Иванов Иван Иванович"])
    phone: str | None = Field(
        None, description="Номер телефона", examples=["88005553535", "+78005553535"]
    )
    email: EmailStr | None = Field(None, description="Адрес электронной почты")
    position: str | None = Field(None, description="Должность", examples=["Главный бухгалтер"])
    extension: str | None = Field(None, description="Добавочный номер", examples=["1234"])
    messengers: dict[str, str] = Field(
        default_factory=dict,
        description="Контакты в мессенджерах",
        examples=[{"telegram": "exampleUser05", "vk": "1254752"}],
    )


class CounterpartyBase(BaseModel):
    """Базовая API схема контрагента"""

    name: str = Field(..., max_length=255, description="Наименование")
    legal_name: str = Field(..., max_length=255, description="Юридическое наименование")
    kpp: str | None = Field(None, max_length=11, description="КПП — только для юрлиц и обособленных подразделений")
    okpo: str | None = Field(
        None,
        max_length=10,
        description="ОКПО — Общероссийский классификатор предприятий и организаций",
    )
    phone: str | None = Field(
        None, description="Номер телефона", examples=["88005553535", "+78005553535"]
    )
    email: EmailStr | None = Field(None, description="Адрес электронной почты")
    address: str | None = Field(None, description="Фактический адрес компании")


class CounterpartyCreate(CounterpartyBase):
    """Создание контрагента (создаётся основной контрагент (master), без вложенности)"""

    counterparty_type: CounterpartyType = Field(..., description="Тип контрагента")
    inn: str = Field(..., max_length=12, description="ИНН контрагента")
    contact_persons: list[ContactPersonIn] = Field(
        default_factory=list, description="Контактные лица контрагента"
    )


class BranchAdd(CounterpartyBase):
    """Добавление обособленного подразделения
    (контактное лицо можно добавить через обновление контрагента).
    """


class CounterpartyEdit(BaseModel):
    """
    Редактирование информации о контрагенте
    """

    name: str | None = Field(None, max_length=255, description="Наименование")
    legal_name: str | None = Field(None, max_length=255, description="Юридическое наименование")
    okpo: str | None = Field(
        None,
        max_length=10,
        description="ОКПО — Общероссийский классификатор предприятий и организаций",
    )
    phone: str | None = Field(
        None, description="Номер телефона", examples=["88005553535", "+78005553535"]
    )
    email: EmailStr | None = Field(None, description="Адрес электронной почты")
    address: str | None = Field(None, description="Фактический адрес компании")


class CounterpartyResponse(CounterpartyBase):
    """API ответ для получения контрагента"""

    id: UUID = Field(..., description="ID созданного контрагента")
    created_at: datetime = Field(..., description="Дата создания")
    updated_at: datetime = Field(..., description="Дата обновления")
    counterparty_type: CounterpartyType = Field(..., description="Тип контрагента")
    inn: str = Field(..., description="ИНН контрагента")
    avatar_url: str | None = Field(None, description="URL адрес аватарки")
    contact_persons: list[ContactPersonOut] = Field(
        default_factory=list, description="Контактные лица"
    )
    parent_id: UUID | None = Field(None, description="ID головного контрагента")
    is_active: bool = Field(True, description="Доступен ли контрагент в системе")
    is_head: bool = Field(True, description="Является ли контрагент головным")
    is_branch: bool = Field(False, description="Является ли дочерним объектом")


class CounterpartyReference(BaseModel):
    """Ссылка на контрагента."""

    id: UUID = Field(description="Идентификатор контрагента")
    name: str = Field(description="Наименование", examples=["Шмяндекс"])
    email: EmailStr = Field(
        description="Официальная почта контрагента", examples=["shmyandex@mail.ru"]
    )
