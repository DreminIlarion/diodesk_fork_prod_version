import json
from uuid import UUID, uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from src.iam.domain.vo import Email, UserRole
from src.iam.security import create_access_token
from src.mcp.server import create_server

pytestmark = pytest.mark.unit

INITIALIZE_REQUEST = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test-client", "version": "1.0"},
    },
}
MCP_HEADERS = {"Accept": "application/json, text/event-stream"}
TOOLS_LIST_REQUEST = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {},
}
EXPECTED_TOOLS = {
    "assign_task",
    "change_task_status",
    "create_task",
    "get_current_user",
    "get_task",
    "search_tasks",
    "search_users",
    "update_task",
}


class FakeTokenStore:
    async def is_revoked(self, jti: UUID) -> bool:  # noqa: ARG002
        return False


def test_mcp_endpoint_requires_bearer_token():
    app = create_server(FakeTokenStore()).http_app(path="/", stateless_http=True)

    with TestClient(app) as client:
        response = client.post("/", json=INITIALIZE_REQUEST, headers=MCP_HEADERS)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers["www-authenticate"] == "Bearer"


def test_mcp_endpoint_accepts_staff_access_token():
    app = create_server(FakeTokenStore()).http_app(path="/", stateless_http=True)
    token = create_access_token(
        uuid4(),
        Email("agent@test.com"),
        {UserRole.DEVELOPER},
    )
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}

    with TestClient(app) as client:
        response = client.post("/", json=INITIALIZE_REQUEST, headers=headers)

    assert response.status_code == status.HTTP_200_OK


def test_mcp_endpoint_lists_mounted_tools_for_staff_access_token():
    app = create_server(FakeTokenStore()).http_app(path="/", stateless_http=True)
    token = create_access_token(
        uuid4(),
        Email("agent@test.com"),
        {UserRole.DEVELOPER},
    )
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}

    with TestClient(app) as client:
        response = client.post("/", json=TOOLS_LIST_REQUEST, headers=headers)

    assert response.status_code == status.HTTP_200_OK
    event_data = next(
        line.removeprefix("data: ")
        for line in response.text.splitlines()
        if line.startswith("data: ")
    )
    tools = json.loads(event_data)["result"]["tools"]
    assert {tool["name"] for tool in tools} == EXPECTED_TOOLS
