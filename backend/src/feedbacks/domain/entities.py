from dataclasses import dataclass
from uuid import UUID
from typing import Self

from src.shared.domain.entities import AggregateRoot
from src.shared.utils.time import current_datetime

from .events import FeedbackCreated
from .vo import FeedbackRating


@dataclass(kw_only=True)
class Feedback(AggregateRoot):
    """
    Отзыв клиента о качестве обслуживания по закрутому тикету.
    """
    
    ticket_id: UUID
    author_id: UUID
    rating: FeedbackRating
    comment: str | None = None

    def __post_init__(self) -> None:
        if self.comment is not None and not self.comment.strip():
            self.comment = None  # ← исправлено

    @classmethod
    def create(
        cls, 
        *, 
        ticket_id: UUID, 
        author_id: UUID, 
        rating: int, 
        comment: str | None = None
    ) -> Self:
        comment = None if (comment is None or not comment.strip()) else comment.strip()  # ← исправлено

        feedback = cls(
            ticket_id=ticket_id,
            author_id=author_id,
            rating=FeedbackRating(rating),
            comment=comment,
        )

        feedback.register_event(
            FeedbackCreated(
                feedback_id=feedback.id,
                ticket_id=ticket_id,
                author_id=author_id,
                rating=feedback.rating.value,
                comment=feedback.comment,
            )
        )

        return feedback
    
    def edit(
        self,
        *,
        rating: int | None = None,
        comment: str | None = None,
    ) -> None:
        is_edited = False

        if rating is not None:
            new_rating = FeedbackRating(rating)
            if new_rating != self.rating:
                self.rating = new_rating
                is_edited = True

        if comment is not None:
            new_comment = comment.strip() if comment.strip() else None  # ← исправлено
            if new_comment != self.comment:
                self.comment = new_comment
                is_edited = True

        if is_edited:
            self.updated_at = current_datetime()

    def archive(self) -> None:
        if self.is_deleted:
            return
        self.deleted_at = current_datetime()
        self.updated_at = current_datetime()