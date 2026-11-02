from fastmcp import FastMCP
from fastmcp.server.middleware import AuthMiddleware

from src.core.redis import redis_client
from src.iam.domain.repos import TokenStore
from src.iam.infra.token_store import RedisTokenStore

from .auth import JwtTokenVerifier, require_staff
from .middleware import DomainErrorMiddleware

INSTRUCTIONS = """\
You are connected to DioDesk. All operations are performed on behalf of the
authenticated user and must respect that user's permissions.

Before any operation that changes data, explain the intended change and obtain
the user's confirmation. If a tool returns an error, explain it without exposing
internal implementation details.
"""


def create_server(token_store: TokenStore | None = None) -> FastMCP:
    """Create the root DioDesk MCP server."""

    if token_store is None:
        token_store = RedisTokenStore(redis_client)

    return FastMCP(
        name="diodesk",
        instructions=INSTRUCTIONS,
        auth=JwtTokenVerifier(token_store),
        middleware=[AuthMiddleware(auth=require_staff), DomainErrorMiddleware()],
        mask_error_details=True,
    )


mcp = create_server()
