"""Behavior hints exposed to MCP clients for DioDesk tools."""

from mcp_types import ToolAnnotations

READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    open_world_hint=False,
)
