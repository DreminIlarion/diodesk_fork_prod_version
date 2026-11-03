from fastmcp import FastMCP

from .tools import TOOLS


def create_server() -> FastMCP:
    """MCP-компонент для работы с задачами."""

    return FastMCP(
        name="tasks",
        tools=TOOLS,
        mask_error_details=True,
    )
