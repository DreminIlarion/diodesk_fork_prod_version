from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from ddf.infra.database.sqlalchemy import Base
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .settings import settings

engine = create_async_engine(url=settings.postgres.sqlalchemy_url, echo=True)
sessionmaker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    autoflush=False,
    expire_on_commit=False,
)


@asynccontextmanager
async def session_factory() -> AsyncGenerator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with session_factory() as session:
        yield session
