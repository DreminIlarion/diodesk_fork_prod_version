from typing import Annotated

from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition, Expression, Group, Search
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository as DdfSqlAlchemyRepository
from ddf.infra.database.sqlalchemy.filters import compile_filter
from fastapi import Depends, FastAPI, status
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.shared.domain.vo import Priority
from src.shared.schemas import Pagination
from src.tickets.dependencies import (
    get_dsl_ticket_search_expression,
    get_legacy_ticket_search_expression,
)
from src.tickets.domain.vo import TicketStatus, TicketType
from src.tickets.dsl import legacy_ticket_search_to_expression
from src.tickets.infra.models import TicketOrm
from src.tickets.infra.repos import SqlTicketRepository
from src.tickets.schemas import LegacyTicketSearch

app = FastAPI()


@app.post("/api/v1/tickets/search")
def search_tickets_v1(
    query: Annotated[Expression | None, Depends(get_legacy_ticket_search_expression)],
):
    return query


@app.post("/api/v2/tickets/search")
def search_tickets_v2(
    query: Annotated[Expression | None, Depends(get_dsl_ticket_search_expression)],
):
    return query


client = TestClient(app)


def test_ticket_repository_uses_ddf_sqlalchemy_repository() -> None:
    assert issubclass(SqlTicketRepository, DdfSqlAlchemyRepository)


async def test_ticket_repository_passes_query_to_ddf_find() -> None:
    session = AsyncMock()
    session.scalar.return_value = 0
    scalars = Mock()
    scalars.all.return_value = []
    session.scalars.return_value = scalars
    repository = SqlTicketRepository(session)

    page = await repository.paginate(
        Pagination(page=1, size=10),
        query=Condition(
            field="status",
            op="$eq",
            value=TicketStatus.OPEN.value,
        ),
    )

    assert page.items == []
    count_statement = session.scalar.await_args.args[0]
    assert "tickets.status" in str(count_statement)


def test_http_endpoint_accepts_legacy_body() -> None:
    response = client.post(
        "/api/v1/tickets/search",
        json={"statuses": [TicketStatus.OPEN.value]},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "field": "status",
        "op": "$in",
        "value": [TicketStatus.OPEN.value],
    }


def test_v1_http_endpoint_accepts_legacy_stage_ids() -> None:
    stage_id = uuid4()

    response = client.post(
        "/api/v1/tickets/search",
        json={"stage_ids": [str(stage_id)]},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "field": "stageId",
        "op": "$in",
        "value": [str(stage_id)],
    }


def test_v1_http_endpoint_rejects_dsl_body() -> None:
    response = client.post(
        "/api/v1/tickets/search",
        json={"field": "status", "op": "$eq", "value": TicketStatus.OPEN.value},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_v2_http_endpoint_accepts_dsl_body() -> None:
    body = {"field": "status", "op": "$eq", "value": TicketStatus.OPEN.value}

    response = client.post("/api/v2/tickets/search", json=body)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == body


def test_v2_http_endpoint_accepts_grouped_dsl_body() -> None:
    body = {
        "op": "$and",
        "filters": [
            {"field": "status", "op": "$eq", "value": TicketStatus.OPEN.value},
            {"field": "priority", "op": "$eq", "value": Priority.HIGH.value},
        ],
    }

    response = client.post("/api/v2/tickets/search", json=body)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == body


def test_v2_http_endpoint_accepts_empty_body() -> None:
    response = client.post("/api/v2/tickets/search")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() is None


def test_legacy_ticket_search_accepts_only_single_priority() -> None:
    request = LegacyTicketSearch.model_validate({
        "search_query": "printer",
        "statuses": [TicketStatus.OPEN],
        "priorities": Priority.HIGH,
        "type": TicketType.INCIDENT,
    })

    assert isinstance(request, LegacyTicketSearch)
    assert request.search_query == "printer"
    assert request.ticket_type == TicketType.INCIDENT

    with pytest.raises(ValidationError):
        LegacyTicketSearch.model_validate({"priorities": [Priority.HIGH]})


def test_legacy_ticket_search_is_converted_to_dsl() -> None:
    project_id = uuid4()
    stage_id = uuid4()
    assignee_id = uuid4()
    request = LegacyTicketSearch.model_validate({
        "search_query": "printer",
        "project_ids": [project_id],
        "stage_ids": [stage_id],
        "statuses": [TicketStatus.OPEN],
        "priorities": Priority.HIGH,
        "type": TicketType.INCIDENT,
        "actors": {"assignee_id": assignee_id},
    })

    expression = legacy_ticket_search_to_expression(request)

    assert isinstance(expression, Group)
    assert any(isinstance(item, Search) for item in expression.filters)
    conditions = {item.field: item for item in expression.filters if isinstance(item, Condition)}
    assert conditions["projectId"].value == [project_id]
    assert conditions["stageId"].value == [stage_id]
    assert conditions["status"].value == [TicketStatus.OPEN.value]
    assert conditions["priority"].value == [Priority.HIGH.value]
    assert conditions["ticketType"].value == TicketType.INCIDENT.value
    assert conditions["assigneeId"].value == assignee_id


def test_dates_are_combined_with_legacy_request() -> None:
    created_after = datetime(2026, 1, 1, tzinfo=UTC)
    request = LegacyTicketSearch(statuses=[TicketStatus.OPEN])

    expression = get_legacy_ticket_search_expression(
        request=request,
        created_after=created_after,
    )

    assert isinstance(expression, Group)
    assert expression.op == "$and"
    assert expression.filters == (
        Condition(field="status", op="$in", value=[TicketStatus.OPEN.value]),
        Condition(field="createdAt", op="$gte", value=created_after),
    )


@pytest.mark.parametrize("field", ["password", "passwordHash", "searchVector", "tags"])
def test_sensitive_and_internal_fields_are_not_available_in_dsl(field: str) -> None:
    expression = Condition(field=field, op="$eq", value="secret")

    with pytest.raises(ValueError, match="Unknown filter field"):
        compile_filter(
            TicketOrm,
            expression,
            SqlTicketRepository.filter_whitelist,
            SqlTicketRepository.search,
        )


def test_stage_id_is_available_in_dsl() -> None:
    stage_id = uuid4()

    compiled = compile_filter(
        TicketOrm,
        Condition(field="stageId", op="$eq", value=stage_id),
        SqlTicketRepository.filter_whitelist,
        SqlTicketRepository.search,
    )

    assert "tickets.stage_id" in str(compiled)
