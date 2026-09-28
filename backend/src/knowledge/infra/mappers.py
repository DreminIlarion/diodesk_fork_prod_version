from typing import Any

from collections.abc import Mapping
from datetime import datetime
from uuid import UUID

from ..domain.entities import Article, ChatMessage, ChatSession
from ..domain.vo import (
    ArticleStatus,
    ArticleVisibility,
    ChatRole,
    SourceType,
)


class ArticleDocumentMapper:
    """Преобразование статьи в документ OpenSearch и обратно."""

    @staticmethod
    def from_entity(article: Article) -> dict[str, Any]:
        """
        Подготавливает содерживое `_source` документа OpenSearch.

        ID статьи передаётся репозиторием отдельно через параметр `_id`.
        """

        return {
            "title": article.title,
            "content": article.content,
            "source_type": article.source_type.value,
            "source_ref": article.source_ref,
            "external_id": article.external_id,
            "author_id": str(article.author_id),
            "published_by": _optional_uuid_to_string(
                article.published_by
            ),
            "published_at": _optional_datetime_to_string(
                article.published_at
            ),
            "status": article.status.value,
            "visibility": article.visibility.value,
            "version": article.version,
            "tags": list(article.tags),
            "product_id": _optional_uuid_to_string(
                article.product_id
            ),
            "project_id": _optional_uuid_to_string(
                article.project_id
            ),
            "counterparty_id": _optional_uuid_to_string(
                article.counterparty_id
            ),
            "attachment_ids": [
                str(attachment_id)
                for attachment_id in article.attachment_ids
            ],
            "metadata": dict(article.metadata),
            "created_at": article.created_at.isoformat(),
            "updated_at": article.updated_at.isoformat(),
            "deleted_at": _optional_datetime_to_string(
                article.deleted_at
            ),
        }

    @staticmethod
    def to_entity(
        document_id: str,
        source: Mapping[str, Any],
    ) -> Article:
        """Восстановить доменную статью из документа OpenSearch."""

        return Article(
            id=UUID(document_id),
            title=str(source["title"]),
            content=str(source["content"]),
            source_type=SourceType(str(source["source_type"])),
            source_ref=str(source["source_ref"]),
            external_id=_optional_string(
                source.get("external_id")
            ),
            author_id=UUID(str(source["author_id"])),
            published_by=_optional_uuid(
                source.get("published_by")
            ),
            published_at=_optional_datetime(
                source.get("published_at")
            ),
            status=ArticleStatus(str(source["status"])),
            visibility=ArticleVisibility(
                str(source["visibility"])
            ),
            version=int(source["version"]),
            tags=list(source.get("tags") or []),
            product_id=_optional_uuid(
                source.get("product_id")
            ),
            project_id=_optional_uuid(
                source.get("project_id")
            ),
            counterparty_id=_optional_uuid(
                source.get("counterparty_id")
            ),
            attachment_ids=[
                UUID(str(attachment_id))
                for attachment_id in (
                    source.get("attachment_ids") or []
                )
            ],
            metadata=dict(source.get("metadata") or {}),
            created_at=_datetime(source["created_at"]),
            updated_at=_datetime(source["updated_at"]),
            deleted_at=_optional_datetime(
                source.get("deleted_at")
            ),
        )


class ChatSessionDocumentMapper:
    """Преобразование ии-диалога в документ OpenSearch и обратно."""

    @staticmethod
    def from_entity(session: ChatSession) -> dict[str, Any]:
        return {
            "ticket_id": str(session.ticket_id),
            "created_by": str(session.created_by),
            "model_id": session.model_id,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "deleted_at": _optional_datetime_to_string(
                session.deleted_at
            ),
        }

    @staticmethod
    def to_entity(
        document_id: str,
        source: Mapping[str, Any],
    ) -> ChatSession:
        return ChatSession(
            id=UUID(document_id),
            ticket_id=UUID(str(source["ticket_id"])),
            created_by=UUID(str(source["created_by"])),
            model_id=str(source["model_id"]),
            created_at=_datetime(source["created_at"]),
            updated_at=_datetime(source["updated_at"]),
            deleted_at=_optional_datetime(
                source.get("deleted_at")
            ),
        )


class ChatMessageDocumentMapper:
    """Преобразование сообщения ии-диалога в документ OpenSearch и обратно"""

    @staticmethod
    def from_entity(message: ChatMessage) -> dict[str, Any]:
        return {
            "session_id": str(message.session_id),
            "role": message.role.value,
            "content": message.content,
            "requested_model_id": message.requested_model_id,
            "actual_model_id": message.actual_model_id,
            "confidence": message.confidence,
            "citation_article_ids": [
                str(article_id)
                for article_id in message.citation_article_ids
            ],
            "provider_request_id": message.provider_request_id,
            "created_at": message.created_at.isoformat(),
            "updated_at": message.updated_at.isoformat(),
            "deleted_at": _optional_datetime_to_string(
                message.deleted_at
            ),
        }

    @staticmethod
    def to_entity(
        document_id: str,
        source: Mapping[str, Any],
    ) -> ChatMessage:
        return ChatMessage(
            id=UUID(document_id),
            session_id=UUID(str(source["session_id"])),
            role=ChatRole(str(source["role"])),
            content=str(source["content"]),
            requested_model_id=_optional_string(
                source.get("requested_model_id")
            ),
            actual_model_id=_optional_string(
                source.get("actual_model_id")
            ),
            confidence=_optional_float(
                source.get("confidence")
            ),
            citation_article_ids=[
                UUID(str(article_id))
                for article_id in (
                    source.get("citation_article_ids") or []
                )
            ],
            provider_request_id=_optional_string(
                source.get("provider_request_id")
            ),
            created_at=_datetime(source["created_at"]),
            updated_at=_datetime(source["updated_at"]),
            deleted_at=_optional_datetime(
                source.get("deleted_at")
            ),
        )


def _optional_uuid_to_string(value: UUID | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _optional_datetime_to_string(
        value: datetime | None,
) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _optional_string(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _optional_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    return UUID(str(value))


def _datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _optional_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    return _datetime(value)


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    return float(value)
