from typing import Any, Optional

from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base
from ...products.infra.models import SoftwareProductOrm
from ..domain.vo import CounterpartyType


class CounterpartyOrm(Base):
    __tablename__ = "counterparties"

    counterparty_type: Mapped[CounterpartyType] = mapped_column(Enum(CounterpartyType))
    name: Mapped[str]
    legal_name: Mapped[str]
    inn: Mapped[str]
    kpp: Mapped[str | None] = mapped_column(nullable=True)
    okpo: Mapped[str | None] = mapped_column(nullable=True)
    phone: Mapped[str]
    email: Mapped[str | None] = mapped_column(unique=True, nullable=True)
    address: Mapped[str | None] = mapped_column(nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(nullable=True)
    contact_persons: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    is_active: Mapped[bool]

    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("counterparties.id"), nullable=True, unique=False
    )

    head: Mapped[Optional["CounterpartyOrm"]] = relationship(
        remote_side="CounterpartyOrm.id", back_populates="branches",
    )
    branches: Mapped[list["CounterpartyOrm"]] = relationship(
        back_populates="head", cascade="all, delete-orphan"
    )

    products: Mapped[list["CounterpartyProductOrm"]] = relationship(
        back_populates="counterparty"
    )

    __table_args__ = (
        # B-Tree индекс для быстрого поиска по Инн (по префиксу или постфиксу)
        Index("ix_counterparties_inn_btree", "inn"),
        # Полнотекстовый поиск по наименованиям
        Index(
            "ix_counterparties_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_counterparties_legal_name_trgm",
            "legal_name",
            postgresql_using="gin",
            postgresql_ops={"legal_name": "gin_trgm_ops"},
        ),
    )


class CounterpartyProductOrm(Base):
    __tablename__ = "counterparty_products"

    counterparty_id: Mapped[UUID] = mapped_column(ForeignKey("counterparties.id"), unique=False)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("software_products.id"), unique=False)
    serial_number: Mapped[str | None] = mapped_column(nullable=True)

    counterparty: Mapped["CounterpartyOrm"] = relationship(back_populates="products")
    product: Mapped["SoftwareProductOrm"] = relationship()

    __table_args__ = (
        CheckConstraint(
            "serial_number IS NULL OR btrim(serial_number) <> ''",
            name="ck_counterparty_products_serial_number_not_blank",
        ),
        UniqueConstraint("serial_number", name="uq_counterparty_products_serial_number"),
        Index("ix_counterparty_products_counterparty_id", "counterparty_id"),
        Index("ix_counterparty_products_product_id", "product_id"),
    )
