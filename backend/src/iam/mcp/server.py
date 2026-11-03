from fastmcp import FastMCP

from .tools import TOOLS


def create_server() -> FastMCP:
    """MCP-компонент для работы с пользователями."""

    return FastMCP(
        name="users",
        tools=TOOLS,
        mask_error_details=True,
    )
