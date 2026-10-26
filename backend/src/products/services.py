from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..iam.domain.exceptions import PermissionDeniedError
from ..iam.domain.vo import UserRole
from ..shared.domain.exceptions import AlreadyExistsError, NotFoundError
from .domain.entities import SoftwareProduct
from .domain.repo import ProductRepository
from .domain.vo import ProductStatus
from .mappers import map_product_to_response
from .schemas import ProductCreate, ProductResponse, ProductUpdate, validate_product_attributes


class ProductService:
    def __init__(self, session: AsyncSession, repository: ProductRepository) -> None:
        self.session = session
        self.repository = repository

    async def create(
            self, data: ProductCreate, created_by: UUID, created_by_role: UserRole | None
    ) -> ProductResponse:
        """Создание программного продукта"""

        # 1. Проверка прав и валидация
        allowed_roles = {
            UserRole.ADMIN,
            UserRole.SUPPORT_AGENT,
            UserRole.SUPPORT_MANAGER,
        }
        if created_by_role not in allowed_roles:
            raise PermissionDeniedError("Only support staff can create products")

        if data.status not in {ProductStatus.ACTIVE, ProductStatus.BETA}:
            raise ValueError("Initial status must be active or beta")

        validate_product_attributes(data.category, data.attributes)

        existing_product = await self.repository.get_by_registration_number(
            data.registration_number
        )
        if existing_product is not None:
            raise AlreadyExistsError(
                f"Product with registration number {data.registration_number} already exists"
            )

        # 2. Создание и сохранение продукта
        product = SoftwareProduct(
            name=data.name,
            vendor=data.vendor,
            registration_number=data.registration_number,
            version=data.version,
            description=data.description,
            category=data.category,
            status=data.status,
            attributes=data.attributes,
            created_by=created_by,
        )
        await self.repository.create(product)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise AlreadyExistsError(
                f"Product with registration number {data.registration_number} already exists"
            ) from exc

        return map_product_to_response(product)

    async def update(
            self, product_id: UUID, data: ProductUpdate, updated_by: UUID
    ) -> ProductResponse:
        product = await self.repository.read(product_id)
        if product is None:
            raise NotFoundError(f"Product with ID {product_id} not found")

        existing_product = await self.repository.get_by_registration_number(
            data.registration_number
        )
        if existing_product is not None and existing_product.id != product.id:
            raise AlreadyExistsError(
                f"Product with registration number {data.registration_number} already exists"
            )

        product.change_registration_number(data.registration_number, changed_by=updated_by)
        await self.repository.update(product)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise AlreadyExistsError(
                f"Product with registration number {data.registration_number} already exists"
            ) from exc

        return map_product_to_response(product)
