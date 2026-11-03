from datetime import datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


class AttachmentOrm(EntityMixin, Base):
    __tablename__ = "attachments"

    original_filename: Mapped[str]
    mime_type: Mapped[str]
    size_bytes: Mapped[int]
    storage_key: Mapped[str] = mapped_column(unique=True)
    owner_type: Mapped[str]
    owner_id: Mapped[UUID]
    is_public: Mapped[bool]
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploaded_by: Mapped[UUID]
