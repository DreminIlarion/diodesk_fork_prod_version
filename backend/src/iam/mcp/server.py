from fastmcp import FastMCP

from .tools import TOOLS

mcp = FastMCP(
    name="users",
    tools=TOOLS,
    mask_error_details=True,
)
