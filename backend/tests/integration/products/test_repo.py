import pytest
from scripts.regsetup import description

from src.crm.domain.vo import CounterpartyType
from src.crm.infra.models import CounterpartyOrm, CounterpartyProductOrm
from src.products.domain.vo import ProductCategory, ProductStatus
from src.products.infra.models import SoftwareProductOrm
from src.products.infra.repo import SoftwareProductMapper, SqlProductRepository
from src.shared.schemas import Pagination


@pytest.fixture
def product_repo(session):
    return SqlProductRepository(session)


@pytest.fixture
async def seed_products(session):
    products = [
        SoftwareProductOrm(
            name="1C:УНФ",
            vendor="1C",
            description="""\
            1С:УНФ (Управление нашей фирмой) — это комплексная программа для автоматизации бизнеса,
            разработанная компанией 1С специально для малого и микро-бизнеса.
            """,
            category=ProductCategory.ERP,
            status=ProductStatus.ACTIVE,
            attributes={"environment": "production", "licence_type": "cloud"},
        ),
        SoftwareProductOrm(
            name="1С:Бухгалтерия",
            vendor="1C",
            description="Бухгалтерский учёт",
            category=ProductCategory.ERP,
            status=ProductStatus.ACTIVE,
            attributes={},
        ),
        SoftwareProductOrm(
            name="Битрикс24",
            vendor="1С-Битрикс",
            description="CRM портал",
            category=ProductCategory.WEB,
            status=ProductStatus.ACTIVE,
            attributes={},
        ),
        SoftwareProductOrm(
            name="МойСклад",
            vendor="МойСклад",
            category=ProductCategory.WEB,
            status=ProductStatus.DEPRECATED,
            attributes={},
        ),
        SoftwareProductOrm(
            name="1С:Бухгалтерия",
            vendor="1C",
            category=ProductCategory.ERP,
            status=ProductStatus.ACTIVE,
            description="""\
            «1С:Бухгалтерия» — это самая популярная в России и СНГ профессиональная программа
            для автоматизации бухгалтерского и налогового учета.
            """,
            attributes={},
        ),
    ]
    session.add_all(products)
    await session.commit()
    return products


@pytest.fixture
async def seed_counterparty_product_links(session, seed_products):
    head = CounterpartyOrm(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Головной контрагент",
        legal_name="ООО Головной контрагент",
        inn="1234567890",
        kpp="123456789",
        okpo="12345678",
        phone="+79990000001",
        email="head@example.com",
        address=None,
        avatar_url=None,
        contact_persons=[],
        is_active=True,
        parent_id=None,
    )
    other = CounterpartyOrm(
        counterparty_type=CounterpartyType.LEGAL_ENTITY,
        name="Другой контрагент",
        legal_name="ООО Другой контрагент",
        inn="1234567891",
        kpp="123456788",
        okpo="12345679",
        phone="+79990000002",
        email="other@example.com",
        address=None,
        avatar_url=None,
        contact_persons=[],
        is_active=True,
        parent_id=None,
    )

    session.add_all([head, other])
    await session.flush()

    branch = CounterpartyOrm(
        counterparty_type=CounterpartyType.BRANCH,
        name="Подразделение",
        legal_name="Подразделение головного контрагента",
        inn="1234567890",
        kpp="123456787",
        okpo="1234567890",
        phone="+79990000003",
        email="branch@example.com",
        address=None,
        avatar_url=None,
        contact_persons=[],
        is_active=False,
        parent_id=head.id,
    )

    session.add(branch)
    await session.flush()

    session.add_all([
        # Первый продукт связан и с головным, и с подразделением.
        CounterpartyProductOrm(
            counterparty_id=head.id,
            product_id=seed_products[0].id,
        ),
        CounterpartyProductOrm(
            counterparty_id=branch.id,
            product_id=seed_products[0].id,
        ),
        CounterpartyProductOrm(
            counterparty_id=branch.id,
            product_id=seed_products[2].id,
        ),
        CounterpartyProductOrm(
            counterparty_id=other.id,
            product_id=seed_products[1].id,
        ),
        CounterpartyProductOrm(
            counterparty_id=head.id,
            product_id=seed_products[3].id,
        ),
    ])
    await session.commit()

    return {
        "head": head,
        "branch": branch,
        "other": other,
        "head_product_ids": {
            seed_products[0].id,
            seed_products[2].id,
            seed_products[3].id,
        },
        "branch_product_ids": {
            seed_products[0].id,
            seed_products[2].id,
        },
        "without_counterparty_product_ids": {
            seed_products[4].id,
        },
    }


@pytest.mark.integration
class TestPaginate:
    """
    Тесты для пагинации справочника программных продуктов
    """
    @pytest.mark.asyncio
    async def test_include_filters_by_category_and_status_success(
            self, product_repo, seed_products
    ):
        """
        Успешное применение фильтров по статусу и категории
        """

        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10),
            category=ProductCategory.ERP,
            status=ProductStatus.ACTIVE,
        )

        excepted_orms = [
            product
            for product in seed_products
            if product.category == ProductCategory.ERP and product.status == ProductStatus.ACTIVE
        ]
        excepted_orms = sorted(excepted_orms, key=lambda x: x.created_at)
        excepted_items = [SoftwareProductMapper.to_entity(orm) for orm in excepted_orms]

        assert page.items == excepted_items

    @pytest.mark.asyncio
    async def test_fuzzy_search_orders_by_similarity(self, product_repo, seed_products):  # noqa: ARG002
        """
        Нечёткий поиск (по три-граммам) название, описание, вендор + сортировка по релевантности
        """

        search_query = "бухгалтер"
        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10), search=search_query
        )

        assert all(
            search_query in item.description.lower() for item in page.items
        )

    @pytest.mark.asyncio
    async def test_filter_by_head_includes_branch_products(
        self,
        product_repo,
        seed_counterparty_product_links,
    ):
        data = seed_counterparty_product_links

        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10),
            counterparty_id=data["head"].id,
        )

        assert page.total_items == len(data["head_product_ids"])
        assert {product.id for product in page.items} == data["head_product_ids"]

    @pytest.mark.asyncio
    async def test_filter_by_branch_does_not_include_head_products(
        self,
        product_repo,
        seed_counterparty_product_links,
    ):
        data = seed_counterparty_product_links

        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10),
            counterparty_id=data["branch"].id,
        )

        assert page.total_items == len(data["branch_product_ids"])
        assert {product.id for product in page.items} == data["branch_product_ids"]

    @pytest.mark.asyncio
    async def test_filter_products_without_counterparty(
        self,
        product_repo,
        seed_counterparty_product_links,
    ):
        data = seed_counterparty_product_links

        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10),
            without_counterparty=True,
        )

        assert page.total_items == 1
        assert {
            product.id for product in page.items
        } == data["without_counterparty_product_ids"]

    @pytest.mark.asyncio
    async def test_counterparty_filter_combined_with_category(
        self,
        product_repo,
        seed_counterparty_product_links,
    ):
        data = seed_counterparty_product_links

        page = await product_repo.paginate(
            pagination=Pagination(page=1, size=10),
            counterparty_id=data["head"].id,
            category=ProductCategory.ERP,
        )

        assert page.total_items == 1
        assert page.items[0].id in data["head_product_ids"]
        assert page.items[0].category == ProductCategory.ERP
