from typing import Any, override

from fastmcp.exceptions import FastMCPError, ResourceError, ToolError
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext

from src.shared.domain.exceptions import AppError

DomainError = AppError | ValueError


def find_domain_error(error: BaseException) -> DomainError | None:
    """Find a domain error wrapped by FastMCP dependency or tool errors."""

    current: BaseException | None = error
    while current is not None:
        if isinstance(current, AppError | ValueError):
            return current
        current = current.__cause__
    return None


def describe(error: DomainError) -> str:
    if isinstance(error, AppError):
        return f"{error.error_code}: {error.message}"
    return f"VALIDATION_ERROR: {error}"


def _translate(error: Exception, error_type: type[FastMCPError]) -> FastMCPError | None:
    if isinstance(error, FastMCPError) and not isinstance(error, ToolError | ResourceError):
        return None

    domain_error = find_domain_error(error)
    return None if domain_error is None else error_type(describe(domain_error))


class DomainErrorMiddleware(Middleware):
    """Expose safe domain errors to an MCP client without leaking internals."""

    @override
    async def on_call_tool(self, context: MiddlewareContext, call_next: CallNext) -> Any:
        try:
            return await call_next(context)
        except Exception as error:
            if (translated := _translate(error, ToolError)) is None:
                raise
            raise translated from error

    @override
    async def on_read_resource(self, context: MiddlewareContext, call_next: CallNext) -> Any:
        try:
            return await call_next(context)
        except Exception as error:
            if (translated := _translate(error, ResourceError)) is None:
                raise
            raise translated from error
