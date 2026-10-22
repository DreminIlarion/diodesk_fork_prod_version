from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.products.domain.entities import SoftwareProduct
from src.products.domain.vo import ProductCategory, ProductStatus
from src.products.schemas import ProductCreate, ProductUpdate
from src.products.services import ProductService
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


@pytest.fixture
def product_service(mock_session, fake_product_repo):
    return ProductService(session=mock_session, repository=fake_product_repo)


class TestCreate:
    """
    Тестирование создание программного продукта
    """

    @pytest.fixture
    def valid_create_data(self):
        return ProductCreate(
            name="1C УНФ",
            vendor="1C",
            registration_number="REG-UNF-001",
            version="3.0.5",
            category=ProductCategory.ERP,
            status=ProductStatus.ACTIVE,
            attributes={"environment": "production", "license_type": "cloud"},
        )

    @pytest.fixture
    def invalid_attributes_create_datas(self):
        return [
            ProductCreate(
                name="1C ERP",
                vendor="1C",
                registration_number="REG-ERP-001",
                version="3.0.1",
                category=ProductCategory.ERP,
                status=ProductStatus.BETA,
                attributes={"db_path": "/opt/data", "license_type": "cloud"},
            ),
            ProductCreate(
                name="Web-сайт",
                vendor="ДИО-Консалт",
                registration_number="REG-WEB-001",
                category=ProductCategory.WEB,
                status=ProductStatus.ACTIVE,
                attributes={"environment": "local", "framework": "Wagtail"}
            )
        ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "created_by_role", [UserRole.SUPPORT_AGENT, UserRole.SUPPORT_MANAGER, UserRole.ADMIN]
    )
    async def test_create_and_commit_success(
            self,
            product_service,
            valid_create_data,
            created_by_role,
            mock_session,
            fake_product_repo,
    ):
        """
        Успешное создание записи в справочнике программных продуктов
        """

        created_by = uuid4()
        response = await product_service.create(
            data=valid_create_data, created_by=created_by, created_by_role=created_by_role,
        )

        mock_session.commit.assert_awaited_once()

        created_product = await fake_product_repo.read(response.id)

        assert created_product is not None
        assert created_product.id == response.id

        assert response.name == valid_create_data.name
        assert response.vendor == valid_create_data.vendor
        assert response.registration_number == valid_create_data.registration_number
        assert response.version == valid_create_data.version
        assert response.description == valid_create_data.description
        assert response.category == valid_create_data.category
        assert response.status == valid_create_data.status
        assert response.attributes == valid_create_data.attributes
        assert response.created_by == created_by
        assert response.created_at == response.created_at

    @pytest.mark.asyncio
    @pytest.mark.parametrize("created_by_role", [UserRole.CUSTOMER, UserRole.CUSTOMER_ADMIN])
    async def test_fails_with_permission_denied_for_non_support(
            self, product_service, valid_create_data, created_by_role
    ):
        """
        Программные продукты могут только записывать сотрудники поддержки
        """

        with pytest.raises(PermissionDeniedError, match="Only support staff can create products"):
            await product_service.create(
                data=valid_create_data, created_by=uuid4(), created_by_role=created_by_role,
            )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("initial_status", [ProductStatus.ARCHIVED, ProductStatus.DEPRECATED])
    async def test_fails_with_invalid_initial_status(
            self, product_service, valid_create_data, initial_status, mock_session
    ):
        """
        Продукт при создании не может быть в архиве или устаревшим
        """

        valid_create_data.status = initial_status

        with pytest.raises(ValueError, match="Initial status must be active or beta"):
            await product_service.create(
                data=valid_create_data,
                created_by=uuid4(),
                created_by_role=UserRole.SUPPORT_MANAGER,
            )

        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fails_on_attribute_validation_error(
            self, product_service, invalid_attributes_create_datas
    ):
        """
        Должна выбрасываться ошибка валидации при создании программного продукта
        с неверными аттрибутами.
        """

        for invalid_attributes_create_data in invalid_attributes_create_datas:
            with pytest.raises(
                    ValueError,
                    match=f"Invalid {invalid_attributes_create_data.category} attributes"
            ):
                await product_service.create(
                    data=invalid_attributes_create_data,
                    created_by=uuid4(),
                    created_by_role=UserRole.SUPPORT_MANAGER,
                )

    @pytest.mark.parametrize("registration_number", [None, "", "   "])
    def test_registration_number_is_required(self, registration_number):
        payload = {
            "name": "1C ERP",
            "vendor": "1C",
            "registration_number": registration_number,
            "category": ProductCategory.ERP,
            "status": ProductStatus.ACTIVE,
            "attributes": {"license_type": "cloud"},
        }

        with pytest.raises(ValidationError):
            ProductCreate(**payload)

    @pytest.mark.asyncio
    async def test_duplicate_registration_number_fails(
            self, product_service, valid_create_data
    ):
        await product_service.create(
            valid_create_data, uuid4(), UserRole.SUPPORT_MANAGER
        )

        with pytest.raises(AlreadyExistsError):
            await product_service.create(
                valid_create_data, uuid4(), UserRole.SUPPORT_MANAGER
            )


class TestUpdate:
    @pytest.mark.asyncio
    async def test_sets_registration_number_on_legacy_product(
            self, product_service, fake_product_repo
    ):
        product = SoftwareProduct(
            name="Legacy",
            vendor="Vendor",
            category=ProductCategory.OTHER,
            status=ProductStatus.ACTIVE,
        )
        await fake_product_repo.create(product)
        updated_by = uuid4()

        response = await product_service.update(
            product.id,
            ProductUpdate(registration_number="  LEGACY-001  "),
            updated_by,
        )

        assert response.registration_number == "LEGACY-001"
        assert response.updated_by == updated_by

    @pytest.mark.asyncio
    async def test_missing_product_fails(self, product_service):
        with pytest.raises(NotFoundError):
            await product_service.update(
                uuid4(), ProductUpdate(registration_number="REG-001"), uuid4()
            )
