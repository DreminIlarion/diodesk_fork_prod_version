from uuid import uuid4

import pytest
from ddf.application.dsl import Condition, Search
from ddf.infra.database.sqlalchemy.filters import compile_filter

from src.tasks.infra.models import TaskOrm
from src.tasks.infra.repos import (
    TASK_FILTER_WHITELIST,
    SqlTaskRepository,
    compile_task_search,
)

pytestmark = pytest.mark.unit


def test_repository_exposes_safe_task_fields():
    assert SqlTaskRepository.filter_whitelist == TASK_FILTER_WHITELIST

    assert "assigneeId" in TASK_FILTER_WHITELIST
    assert "status" in TASK_FILTER_WHITELIST
    assert "priority" in TASK_FILTER_WHITELIST
    assert "dueDate" in TASK_FILTER_WHITELIST

    assert "deletedAt" not in TASK_FILTER_WHITELIST
    assert "workingSince" not in TASK_FILTER_WHITELIST
    assert "passwordHash" not in TASK_FILTER_WHITELIST


def test_compiles_camel_case_uuid_field():
    project_id = uuid4()

    compiled = compile_filter(
        TaskOrm,
        Condition(
            field="projectId",
            op="$eq",
            value=project_id,
        ),
        TASK_FILTER_WHITELIST,
        compile_task_search,
    )

    assert "tasks.project_id" in str(compiled)


def test_rejects_unknown_task_field():
    with pytest.raises(ValueError, match="Unknown filter field"):
        compile_filter(
            TaskOrm,
            Condition(
                field="passwordHash",
                op="$eq",
                value="secret",
            ),
            TASK_FILTER_WHITELIST,
            compile_task_search,
        )


def test_compiles_text_search():
    compiled = compile_filter(
        TaskOrm,
        Search(query="printer"),
        TASK_FILTER_WHITELIST,
        compile_task_search,
    )
    sql = str(compiled)

    assert "tasks.number" in sql
    assert "tasks.title" in sql
    assert "tasks.description" in sql
