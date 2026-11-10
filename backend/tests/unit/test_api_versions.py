from fastapi import FastAPI

from src.tasks.router import router as task_router
from src.tasks.router import v2_router as task_v2_router
from src.tickets.router import router as ticket_router
from src.tickets.router import v2_router as ticket_v2_router


def _request_schema(operation: dict) -> dict:
    return operation["requestBody"]["content"]["application/json"]["schema"]


def _non_null_schema(schema: dict) -> dict:
    if "anyOf" not in schema:
        return schema
    return next(item for item in schema["anyOf"] if item.get("type") != "null")


def _query_parameters(operation: dict) -> set[str]:
    return {
        parameter["name"]
        for parameter in operation.get("parameters", [])
        if parameter["in"] == "query"
    }


def test_v1_and_v2_search_contracts_are_separated_in_openapi() -> None:
    app = FastAPI()
    app.include_router(ticket_router, prefix="/api/v1")
    app.include_router(ticket_v2_router, prefix="/api/v2")
    app.include_router(task_router, prefix="/api/v1")
    app.include_router(task_v2_router, prefix="/api/v2")

    openapi = app.openapi()
    paths = openapi["paths"]
    tickets_v1 = paths["/api/v1/tickets/search"]["post"]
    tickets_v2 = paths["/api/v2/tickets/search"]["post"]
    tasks_v1 = paths["/api/v1/tasks/kanban"]["post"]
    tasks_v2 = paths["/api/v2/tasks/kanban"]["post"]

    assert _non_null_schema(_request_schema(tickets_v1))["$ref"].endswith(
        "/LegacyTicketSearch"
    )
    assert _non_null_schema(_request_schema(tickets_v2))["$ref"].endswith("/Expression")
    assert not tickets_v2["requestBody"].get("required", False)
    assert "created_after" in _query_parameters(tickets_v1)
    assert "created_before" in _query_parameters(tickets_v1)
    assert "created_after" not in _query_parameters(tickets_v2)
    assert "created_before" not in _query_parameters(tickets_v2)

    assert "$ref" not in _request_schema(tasks_v1)
    assert _request_schema(tasks_v2)["$ref"].endswith("/KanbanSearchRequest")
    assert "priorities" in _query_parameters(tasks_v1)
    assert "overdue_only" in _query_parameters(tasks_v1)
    assert "priorities" not in _query_parameters(tasks_v2)
    assert "overdue_only" not in _query_parameters(tasks_v2)

    legacy_ticket_schema = openapi["components"]["schemas"]["LegacyTicketSearch"]
    assert "type" not in legacy_ticket_schema["properties"]["priorities"]
    assert "items" not in legacy_ticket_schema["properties"]["priorities"]

    assert {path for path in paths if path.startswith("/api/v2/")} == {
        "/api/v2/tickets/search",
        "/api/v2/tasks/kanban",
    }
