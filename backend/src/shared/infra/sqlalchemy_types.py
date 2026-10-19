from typing import Any, override

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, TypeDecorator, Uuid, not_, or_
from sqlalchemy.dialects.postgresql import JSONB


class DslUUID(TypeDecorator[UUID]):
    """UUID column accepting values coming from the JSON-based DDF DSL."""

    impl = Uuid
    cache_ok = True

    @override
    def process_bind_param(self, value: UUID | str | None, _dialect) -> UUID | None:
        if value is None or isinstance(value, UUID):
            return value

        return UUID(str(value))


class DslDate(TypeDecorator[date]):
    """Date column accepting ISO date strings from DDF conditions."""

    impl = Date
    cache_ok = True

    @override
    def process_bind_param(self, value: date | str | None, _dialect) -> date | None:
        if value is None or isinstance(value, date):
            return value

        return date.fromisoformat(str(value))


class DslDateTime(TypeDecorator[datetime]):
    """Datetime column accepting ISO-8601 strings from DDF conditions."""

    impl = DateTime
    cache_ok = True

    def __init__(self) -> None:
        super().__init__(timezone=True)

    @override
    def process_bind_param(
        self,
        value: datetime | str | None,
        _dialect,
    ) -> datetime | None:
        if value is None or isinstance(value, datetime):
            return value

        return datetime.fromisoformat(str(value))


class TagListJSONB(JSONB):
    """JSONB tag list with match-any semantics for DDF ``$in``/``$nin``."""

    cache_ok = True

    class Comparator(JSONB.Comparator):
        @staticmethod
        def _validate_tags(values: object) -> tuple[str, ...]:
            if not isinstance(values, (list, tuple)) or not values:
                raise ValueError("Tags filter expects a non-empty list.")

            if not all(isinstance(tag, str) for tag in values):
                raise ValueError("Every tag must be a string.")

            return tuple(values)

        def in_(self, other: Any) -> Any:
            tags = self._validate_tags(other)
            return or_(*(self.contains([{"name": tag}]) for tag in tags))

        def not_in(self, other: Any) -> Any:
            return not_(self.in_(other))

    comparator_factory = Comparator  # type: ignore[assignment]
