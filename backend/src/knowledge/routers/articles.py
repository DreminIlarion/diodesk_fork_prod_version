from typing import Annotated

from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import CurrentSubjectDep
from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole

from ..dependencies import ArticleServiceDep
from ..domain.vo import ArticleSource
from ..schemas import (
    ArticleCreateRequest,
    ArticleEditRequest,
    ArticleResponse,
)

KNOWLEDGE_WRITE_SCOPE = "knowledge:write"

router = APIRouter(prefix="/articles")


def require_knowledge_write(
    subject: CurrentSubjectDep,
) -> Subject:
    """Разрешает управление статьями сотрудникам и внутренним сервисам."""

    is_staff = subject.has_any_role(UserRole.staff_roles())
    is_internal_service = subject.has_scope(
        KNOWLEDGE_WRITE_SCOPE
    )

    if not is_staff and not is_internal_service:
        raise PermissionDeniedError(
            "Knowledge base management is not allowed"
        )

    return subject


KnowledgeWriterDep = Annotated[
    Subject,
    Depends(require_knowledge_write),
]


@router.post(
    path="",
    status_code=status.HTTP_201_CREATED,
    response_model=ArticleResponse,
    summary="Создать статью базы знаний",
)
async def create_article(
    data: ArticleCreateRequest,
    subject: KnowledgeWriterDep,
    service: ArticleServiceDep,
) -> ArticleResponse:
    article = await service.create(
        title=data.title,
        content=data.content,
        source=ArticleSource(
            kind=data.source.kind,
            ref=data.source.ref,
        ),
        author_id=subject.id,
        visibility=data.visibility,
        external_id=data.external_id,
        tags=data.tags,
        product_id=data.product_id,
        project_id=data.project_id,
        counterparty_id=data.counterparty_id,
        metadata=data.metadata,
    )

    return ArticleResponse.model_validate(article)


@router.get(
    path="/{article_id}",
    status_code=status.HTTP_200_OK,
    response_model=ArticleResponse,
    summary="Получить статью базы знаний",
)
async def get_article(
    article_id: UUID,
    _subject: KnowledgeWriterDep,
    service: ArticleServiceDep,
) -> ArticleResponse:
    article = await service.get(article_id)

    return ArticleResponse.model_validate(article)


@router.patch(
    path="/{article_id}",
    status_code=status.HTTP_200_OK,
    response_model=ArticleResponse,
    summary="Создать новую редакцию статьи",
)
async def edit_article(
    article_id: UUID,
    data: ArticleEditRequest,
    subject: KnowledgeWriterDep,
    service: ArticleServiceDep,
) -> ArticleResponse:
    article = await service.revise(
        article_id,
        title=data.title,
        content=data.content,
        edited_by=subject.id,
        tags=data.tags,
    )

    return ArticleResponse.model_validate(article)


@router.post(
    path="/{article_id}/publish",
    status_code=status.HTTP_200_OK,
    response_model=ArticleResponse,
    summary="Опубликовать статью базы знаний",
)
async def publish_article(
    article_id: UUID,
    subject: KnowledgeWriterDep,
    service: ArticleServiceDep,
) -> ArticleResponse:
    article = await service.publish(
        article_id,
        published_by=subject.id,
    )

    return ArticleResponse.model_validate(article)


@router.post(
    path="/{article_id}/archive",
    status_code=status.HTTP_200_OK,
    response_model=ArticleResponse,
    summary="Архивировать статью базы знаний",
)
async def archive_article(
    article_id: UUID,
    subject: KnowledgeWriterDep,
    service: ArticleServiceDep,
) -> ArticleResponse:
    article = await service.archive(
        article_id,
        archived_by=subject.id,
    )

    return ArticleResponse.model_validate(article)
