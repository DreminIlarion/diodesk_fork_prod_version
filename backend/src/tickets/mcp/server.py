from fastmcp import FastMCP

from .prompts import PROMPTS
from .resources import RESOURCES
from .tools import TOOLS


def create_server() -> FastMCP:
    """MCP сервер для работы с заявками."""

    server = FastMCP(name="tickets", tools=TOOLS, mask_error_details=True)

    for resource in RESOURCES:
        server.add_resource(resource)

    for prompt in PROMPTS:
        server.add_prompt(prompt)

    return server
