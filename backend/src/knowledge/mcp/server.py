from fastmcp import FastMCP

from .tools import TOOLS


def create_server() -> FastMCP:
    """Создаёт MCP-сервер для работы с базой знаний."""

    return FastMCP(
        name="knowledge",
        tools=TOOLS,
        mask_error_details=True,
    )
