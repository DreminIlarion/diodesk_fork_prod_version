from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from uuid import UUID

from src.shared.domain.entities import Entity
from src.shared.domain.exceptions import InvariantViolationError
from src.shared.utils.time import current_datetime


@dataclass(kw_only=True)
class ContractRate(Entity):
    """Ставка по договору."""

    contract_id: UUID
    type_rate: str
    rate: Decimal
    unit_measurement_rate: str
    hours_subscription: int | None = None
    hours_its: int | None = None

    def __post_init__(self) -> None:
        if not self.type_rate.strip():
            raise ValueError("Contract rate type cannot be empty")
        if not self.unit_measurement_rate.strip():
            raise ValueError("Contract rate unit cannot be empty")
        if self.rate < 0:
            raise ValueError("Contract rate must be non-negative")
        if self.hours_subscription is not None and self.hours_subscription < 0:
            raise ValueError("hours_subscription must be non-negative")
        if self.hours_its is not None and self.hours_its < 0:
            raise ValueError("hours_its must be non-negative")


@dataclass(kw_only=True)
class Contract(Entity):
    """Договор с контрагентом."""

    counterparty_id: UUID
    name: str
    date_start: date
    date_end: date | None = None
    status: str
    type: str
    period: str | None = None
    sum: Decimal | None = None
    rates: list[ContractRate] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise InvariantViolationError("Contract name cannot be empty")
        if not self.status.strip():
            raise InvariantViolationError("Contract status cannot be empty")
        if not self.type.strip():
            raise InvariantViolationError("Contract type cannot be empty")
        if self.date_end is not None and self.date_end < self.date_start:
            raise InvariantViolationError(
                "Contract end date cannot be earlier than start date"
            )
        if self.sum is not None and self.sum < 0:
            raise InvariantViolationError("Contract sum must be non-negative")

        self.name = self.name.strip()
        self.status = self.status.strip()
        self.type = self.type.strip()
        if self.period is not None:
            self.period = self.period.strip() or None

    def update(
            self,
            *,
            name: str | None = None,
            date_start: date | None = None,
            date_end: date | None = None,
            status: str | None = None,
            type: str | None = None,
            period: str | None = None,
            sum: Decimal | None = None,
            rates: list[ContractRate] | None = None,
    ) -> None:
        changed = False

        if name is not None and name.strip() and name.strip() != self.name:
            self.name = name.strip()
            changed = True
        if date_start is not None and date_start != self.date_start:
            self.date_start = date_start
            changed = True
        if date_end is not None and date_end != self.date_end:
            self.date_end = date_end
            changed = True
        if status is not None and status.strip() and status.strip() != self.status:
            self.status = status.strip()
            changed = True
        if type is not None and type.strip() and type.strip() != self.type:
            self.type = type.strip()
            changed = True
        if period is not None and period.strip() != (self.period or ""):
            self.period = period.strip() or None
            changed = True
        if sum is not None and sum != self.sum:
            self.sum = sum
            changed = True
        if rates is not None:
            self.rates = rates
            changed = True

        if self.date_end is not None and self.date_end < self.date_start:
            raise InvariantViolationError(
                "Contract end date cannot be earlier than start date"
            )
        if self.sum is not None and self.sum < 0:
            raise InvariantViolationError("Contract sum must be non-negative")

        if changed:
            self.updated_at = current_datetime()