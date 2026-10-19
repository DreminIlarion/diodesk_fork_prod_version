from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID, uuid4

from ddf.infra.database.sqlalchemy import Base as DdfBase
from sqlalchemy import func
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.infra.sqlalchemy_types import DslDateTime, DslUUID

from .settings import settings

engine = create_async_engine(url=settings.postgres.sqlalchemy_url, echo=True)
sessionmaker = async_sessionmaker(
    engine, class_=AsyncSession, autoflush=False, expire_on_commit=False
)


class Base(DdfBase):
    __abstract__ = True

    id: Mapped[UUID] = mapped_column(
        DslUUID(),
        primary_key=True,
        default=uuid4,
        server_default=func.gen_random_uuid()
    )
    created_at: Mapped[datetime] = mapped_column(
        DslDateTime(), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DslDateTime(), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DslDateTime(), nullable=True, default=None
    )


@asynccontextmanager
async def session_factory() -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    async with session_factory() as session:
        yield session
