from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ContractRateIn(BaseModel):
    type_rate: str = Field(..., description="Вид ставки (фиксированная, до/после превышения)")
    rate: Decimal = Field(..., ge=0, description="Ставка")
    unit_measurement_rate: str = Field(..., description="Единица измерения (часы, дни)")
    hours_subscription: int | None = Field(None, ge=0, description="Часы абонентского обслуживания")
    hours_its: int | None = Field(None, ge=0, description="Часы ИТС")


class ContractRateOut(ContractRateIn):
    id: UUID
    created_at: datetime
    updated_at: datetime


class ContractCreate(BaseModel):
    counterparty_id: UUID = Field(..., description="ID контрагента")
    name: str = Field(..., max_length=512, description="Наименование договора")
    date_start: date = Field(..., description="Дата начала")
    date_end: date | None = Field(None, description="Дата окончания")
    status: str = Field(..., max_length=128, description="Статус договора")
    type: str = Field(..., max_length=64, description="Вид договора (ИТС, СП, С, В, ВН)")
    period: str | None = Field(None, max_length=64, description="Период оплаты")
    sum: Decimal | None = Field(None, ge=0, description="Сумма по договору")
    rates: list[ContractRateIn] = Field(default_factory=list, description="Ставки")


class ContractUpdate(BaseModel):
    name: str | None = Field(None, max_length=512)
    date_start: date | None = None
    date_end: date | None = None
    status: str | None = Field(None, max_length=128)
    type: str | None = Field(None, max_length=64)
    period: str | None = Field(None, max_length=64)
    sum: Decimal | None = Field(None, ge=0)
    rates: list[ContractRateIn] | None = None


class ContractResponse(BaseModel):
    id: UUID
    counterparty_id: UUID
    name: str
    date_start: date
    date_end: date | None
    status: str
    type: str
    period: str | None
    sum: Decimal | None
    rates: list[ContractRateOut]
    created_at: datetime
    updated_at: datetime