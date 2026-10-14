from typing import Annotated

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition, Expression, Group, Search
from fastapi import Depends, FastAPI, status
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from src.shared.domain.vo import Priority
from src.tickets.dependencies import get_ticket_search_expression
from src.tickets.domain.vo import TicketStatus, TicketType
from src.tickets.dsl import legacy_ticket_search_to_expression
from src.tickets.infra.repos import _compile_ticket_expression  # noqa: PLC2701
from src.tickets.schemas import LegacyTicketSearch, TicketSearchRequest

app = FastAPI()


@app.post("/tickets/search")
def search_tickets(
    query: Annotated[Expression | None, Depends(get_ticket_search_expression)],
):
    return query


client = TestClient(app)


def test_http_endpoint_accepts_legacy_body() -> None:
    response = client.post(
        "/tickets/search",
        json={"statuses": [TicketStatus.OPEN.value]},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "field": "status",
        "op": "$in",
        "value": [TicketStatus.OPEN.value],
    }


def test_http_endpoint_accepts_dsl_body() -> None:
    body = {"field": "status", "op": "$eq", "value": TicketStatus.OPEN.value}

    response = client.post("/tickets/search", json=body)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == body


def test_ticket_search_request_accepts_legacy_body() -> None:
    request = TypeAdapter(TicketSearchRequest).validate_python({
        "search_query": "printer",
        "statuses": [TicketStatus.OPEN],
        "priorities": Priority.HIGH,
        "type": TicketType.INCIDENT,
    })

    assert isinstance(request, LegacyTicketSearch)
    assert request.search_query == "printer"
    assert request.ticket_type == TicketType.INCIDENT


def test_ticket_search_request_accepts_dsl_body() -> None:
    request = TypeAdapter(TicketSearchRequest).validate_python({
        "field": "status",
        "op": "$eq",
        "value": TicketStatus.OPEN.value,
    })

    assert isinstance(request, Condition)
    assert request.field == "status"


def test_legacy_ticket_search_is_converted_to_dsl() -> None:
    project_id = uuid4()
    assignee_id = uuid4()
    request = LegacyTicketSearch.model_validate({
        "search_query": "printer",
        "project_ids": [project_id],
        "statuses": [TicketStatus.OPEN],
        "priorities": [Priority.HIGH],
        "type": TicketType.INCIDENT,
        "actors": {"assignee_id": assignee_id},
    })

    expression = legacy_ticket_search_to_expression(request)

    assert isinstance(expression, Group)
    assert any(isinstance(item, Search) for item in expression.filters)
    conditions = {item.field: item for item in expression.filters if isinstance(item, Condition)}
    assert conditions["projectId"].value == [project_id]
    assert conditions["status"].value == [TicketStatus.OPEN.value]
    assert conditions["priority"].value == [Priority.HIGH.value]
    assert conditions["ticketType"].value == TicketType.INCIDENT.value
    assert conditions["assigneeId"].value == assignee_id


def test_dates_are_combined_with_dsl_request() -> None:
    created_after = datetime(2026, 1, 1, tzinfo=UTC)
    request = Condition(field="status", op="$eq", value=TicketStatus.OPEN.value)

    expression = get_ticket_search_expression(
        request=request,
        created_after=created_after,
    )

    assert isinstance(expression, Group)
    assert expression.op == "$and"
    assert expression.filters == (
        request,
        Condition(field="createdAt", op="$gte", value=created_after),
    )


@pytest.mark.parametrize("field", ["password", "passwordHash", "searchVector"])
def test_sensitive_and_internal_fields_are_not_available_in_dsl(field: str) -> None:
    expression = Condition(field=field, op="$eq", value="secret")

    with pytest.raises(ValueError, match="Unknown filter field"):
        _compile_ticket_expression(expression)


def test_tags_keep_legacy_match_any_semantics() -> None:
    expression = Condition(field="tags", op="$in", value=["hardware", "urgent"])

    compiled = str(_compile_ticket_expression(expression))

    assert " OR " in compiled
    expected_tag_conditions = 2
    assert compiled.count("@>") == expected_tag_conditions
