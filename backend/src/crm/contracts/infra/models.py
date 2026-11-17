from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


class ContractOrm(Base):
    __tablename__ = "contracts"

    counterparty_id: Mapped[UUID] = mapped_column(
        ForeignKey("counterparties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    date_start: Mapped[date] = mapped_column(nullable=False)
    date_end: Mapped[date | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    period: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sum: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)

    rates: Mapped[list["ContractRateOrm"]] = relationship(
        back_populates="contract",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint(
            "date_end IS NULL OR date_end >= date_start",
            name="ck_contracts_date_range",
        ),
        CheckConstraint("sum IS NULL OR sum >= 0", name="ck_contracts_sum_non_negative"),
        Index("ix_contracts_counterparty_id", "counterparty_id"),
        Index("ix_contracts_status", "status"),
    )


class ContractRateOrm(Base):
    __tablename__ = "contract_rates"

    contract_id: Mapped[UUID] = mapped_column(
        ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type_rate: Mapped[str] = mapped_column(String(64), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    unit_measurement_rate: Mapped[str] = mapped_column(String(32), nullable=False)
    hours_subscription: Mapped[int | None] = mapped_column(nullable=True)
    hours_its: Mapped[int | None] = mapped_column(nullable=True)

    contract: Mapped[ContractOrm] = relationship(back_populates="rates")

    __table_args__ = (
        CheckConstraint("rate >= 0", name="ck_contract_rates_rate_non_negative"),
        Index("ix_contract_rates_contract_id", "contract_id"),
    )