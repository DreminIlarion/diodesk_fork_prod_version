from typing import Annotated

from fastapi import Depends

from src.core.settings import settings
from src.shared.dependencies import SessionDep

from .domain.ports import AttachmentRepository, Storage
from .infra.repo import SqlAttachmentRepository
from .infra.s3 import S3Storage
from .services import AttachmentService


def get_storage() -> Storage:
    return S3Storage(
        access_key=settings.s3.access_key,
        secret_key=settings.s3.secret_key,
        endpoint_url=settings.s3.endpoint_url,
        bucket_name=settings.s3.bucket_name,
    )


def get_attachment_repo(session: SessionDep) -> SqlAttachmentRepository:
    return SqlAttachmentRepository(session)


def get_attachment_service(
    session: SessionDep,
    storage: Storage = Depends(get_storage),
    repository: AttachmentRepository = Depends(get_attachment_repo),
) -> AttachmentService:
    return AttachmentService(session=session, storage=storage, repository=repository)


AttachmentRepoDep = Annotated[AttachmentRepository, Depends(get_attachment_repo)]
AttachmentServiceDep = Annotated[AttachmentService, Depends(get_attachment_service)]
