"""Behavior hints exposed to MCP clients for DioDesk tools."""

from mcp_types import ToolAnnotations

READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    open_world_hint=False,
)

CREATE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=False,
)

UPDATE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)
