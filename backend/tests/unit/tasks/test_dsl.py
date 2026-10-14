from datetime import date
from uuid import uuid4

import pytest
from ddf.application.dsl import Condition, Group
from pydantic import TypeAdapter

from src.shared.domain.vo import Priority
from src.tasks.domain.vo import TaskStatus
from src.tasks.dsl import (
    apply_kanban_context,
    legacy_kanban_filters_to_expression,
    unpack_kanban_request,
)
from src.tasks.infra.repos import (  # noqa: PLC2701
    TASK_FILTER_WHITELIST,
    _compile_task_expression,
)
from src.tasks.schemas import (
    InternalKanbanContext,
    KanbanRequest,
    KanbanSearchRequest,
    MyTasksKanbanContext,
    ProjectKanbanContext,
)


def test_kanban_request_accepts_legacy_context_body() -> None:
    project_id = uuid4()

    request = TypeAdapter(KanbanRequest).validate_python({
        "type": "project",
        "project_id": project_id,
    })

    assert isinstance(request, ProjectKanbanContext)
    assert request.project_id == project_id
    assert unpack_kanban_request(request) == (request, None)


def test_kanban_request_accepts_dsl_body() -> None:
    project_id = uuid4()
    body = {
        "context": {
            "type": "project",
            "project_id": project_id,
        },
        "query": {
            "field": "status",
            "op": "$eq",
            "value": TaskStatus.IN_PROGRESS.value,
        },
    }

    request = TypeAdapter(KanbanRequest).validate_python(body)
    context, query = unpack_kanban_request(request)

    assert isinstance(request, KanbanSearchRequest)
    assert isinstance(context, ProjectKanbanContext)
    assert isinstance(query, Condition)
    assert query.field == "status"


def test_legacy_query_parameters_are_converted_to_dsl() -> None:
    expression = legacy_kanban_filters_to_expression(
        priorities=[Priority.HIGH, Priority.CRITICAL],
        overdue_only=True,
        today=date(2026, 10, 14),
    )

    assert isinstance(expression, Group)
    assert expression.op == "$and"
    assert expression.filters == (
        Condition(
            field="priority",
            op="$in",
            value=[Priority.HIGH.value, Priority.CRITICAL.value],
        ),
        Group(
            op="$and",
            filters=(
                Condition(field="dueDate", op="$lt", value="2026-10-14"),
                Condition(
                    field="status",
                    op="$nin",
                    value=[TaskStatus.DONE.value, TaskStatus.CANCELLED.value],
                ),
            ),
        ),
    )


def test_project_context_is_combined_with_user_query() -> None:
    project_id = uuid4()
    user_id = uuid4()
    user_query = Condition(
        field="priority",
        op="$eq",
        value=Priority.HIGH.value,
    )

    expression = apply_kanban_context(
        ProjectKanbanContext(project_id=project_id),
        current_subject_id=user_id,
        query=user_query,
    )

    assert isinstance(expression, Group)
    assert expression.op == "$and"
    assert expression.filters == (
        Condition(field="projectId", op="$eq", value=project_id),
        user_query,
    )


def test_my_context_matches_each_user_role() -> None:
    user_id = uuid4()

    expression = apply_kanban_context(
        MyTasksKanbanContext(),
        current_subject_id=user_id,
    )

    assert isinstance(expression, Group)
    assert expression.op == "$or"
    assert {condition.field for condition in expression.filters} == {
        "createdBy",
        "assigneeId",
        "reviewerId",
    }
    assert all(condition.value == user_id for condition in expression.filters)


def test_internal_context_preserves_legacy_unfiltered_behavior() -> None:
    user_id = uuid4()
    user_query = Condition(field="title", op="$like", value="printer")

    expression = apply_kanban_context(
        InternalKanbanContext(),
        current_subject_id=user_id,
        query=user_query,
    )

    assert expression is user_query


@pytest.mark.parametrize(
    "field",
    ["password", "passwordHash", "workingSince", "deletedAt"],
)
def test_sensitive_and_internal_fields_are_not_available_in_dsl(field: str) -> None:
    assert field not in TASK_FILTER_WHITELIST

    with pytest.raises(ValueError, match="Unknown filter field"):
        _compile_task_expression(
            Condition(field=field, op="$eq", value="secret"),
        )


def test_camel_case_field_is_compiled_for_task_model() -> None:
    project_id = uuid4()

    compiled = _compile_task_expression(
        Condition(field="projectId", op="$eq", value=project_id),
    )

    assert "tasks.project_id" in str(compiled)


def test_tags_keep_match_any_semantics() -> None:
    compiled = str(
        _compile_task_expression(
            Condition(field="tags", op="$in", value=["backend", "urgent"]),
        ),
    )

    assert " OR " in compiled
    assert compiled.count("@>") == 2
