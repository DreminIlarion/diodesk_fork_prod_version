from uuid import UUID

import pytest

from src.tickets.data_loaders import ReferenceLoader

# ============================= Доменные сервисы =============================


# ============================= In memory функции загрузчики =============================


@pytest.fixture
def users_fetcher(fake_user_repo):

    async def fetch_users(user_ids: list[UUID]):
        return await fake_user_repo.get_by_ids(user_ids)

    return fetch_users


@pytest.fixture
def counterparties_fetcher(fake_counterparty_repo):

    async def fetch_counterparties(counterparty_ids: list[UUID]):
        return await fake_counterparty_repo.get_by_ids(counterparty_ids)

    return fetch_counterparties


@pytest.fixture
def projects_fetcher(fake_project_repo):

    async def fetch_projects(project_ids: list[UUID]):
        return await fake_project_repo.get_by_ids(project_ids)

    return fetch_projects


# ============================= Data Loader с in memory реализацией =============================


@pytest.fixture
def ticket_data_loader(users_fetcher, counterparties_fetcher, projects_fetcher):
    return ReferenceLoader(
        users_loader=users_fetcher,
        counterparties_loader=counterparties_fetcher,
        projects_loader=projects_fetcher,
    )
