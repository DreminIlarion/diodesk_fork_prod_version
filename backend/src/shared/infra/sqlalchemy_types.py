from typing import Any, TypeVar, override

from datetime import date, datetime
from enum import Enum as PythonEnum
from uuid import UUID

from sqlalchemy import Date, DateTime, TypeDecorator, Uuid, not_, or_
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB

EnumT = TypeVar("EnumT", bound=PythonEnum)


class DslEnum(TypeDecorator[EnumT]):
    """Enum column accepting member values coming from the JSON-based DDF DSL."""

    impl = SqlEnum
    cache_ok = True

    def __init__(self, enum_type: type[EnumT], **kwargs: Any) -> None:
        self.enum_type = enum_type
        super().__init__(enum_type, **kwargs)

    @override
    def process_bind_param(
        self,
        value: EnumT | str | None,
        _dialect: Any,
    ) -> EnumT | None:
        if value is None or isinstance(value, self.enum_type):
            return value

        try:
            return self.enum_type(value)
        except ValueError:
            try:
                return self.enum_type[str(value)]
            except KeyError as error:
                raise ValueError(
                    f"Unknown {self.enum_type.__name__} value: {value!r}"
                ) from error


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
