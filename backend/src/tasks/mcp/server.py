from fastmcp import FastMCP

from .tools import TOOLS

mcp = FastMCP(
    name="tasks",
    tools=TOOLS,
    mask_error_details=True,
)
