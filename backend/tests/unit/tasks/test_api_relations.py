from collections.abc import AsyncIterator
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from src.iam.dependencies import get_current_subject
from src.iam.domain.authz import PermissionResult
from src.shared.domain.exceptions import AppError
from src.shared.schemas import Page, Pagination
from src.tasks.dependencies import get_task_board_service, get_task_service
from src.tasks.domain.repos import TaskBrief, TaskLinks, TaskView
from src.tasks.domain.vo import TaskStatus
from src.tasks.router import router, v2_router
from src.tasks.services.board import TaskBoardService

from .test_relations import NOW, make_task
from .test_service_relations import env as env  # noqa: PLC0414 - shared pytest fixture

pytestmark = pytest.mark.unit


@pytest.fixture
async def api(env: SimpleNamespace) -> AsyncIterator[SimpleNamespace]:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.include_router(v2_router, prefix="/api/v2")
    app.dependency_overrides[get_current_subject] = lambda: env.subject
    app.dependency_overrides[get_task_service] = lambda: env.service
    board_service = TaskBoardService(
        env.repo,
        env.ticket_repo,
        env.user_repo,
        env.project_repo,
    )
    app.dependency_overrides[get_task_board_service] = lambda: board_service
    for repo in (env.ticket_repo, env.user_repo, env.project_repo):
        repo.get_by_ids.return_value = []

    @app.exception_handler(AppError)
    def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.error_code})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(app=app, client=client, env=env)


async def test_get_task_exposes_links_and_preserves_existing_field_names(
    api: SimpleNamespace,
) -> None:
    parent, child, peer = make_task(), make_task(), make_task()
    task = make_task(parent_task_id=parent.id)
    api.env.tasks[task.id] = task
    api.env.links[task.id] = TaskLinks(subtasks={child.id}, related_tasks={peer.id})

    response = await api.client.get(f"/api/v1/tasks/{task.id}")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["parentTaskId"] == str(parent.id)
    assert body["subtasks"] == [str(child.id)]
    assert body["relatedTasks"] == [str(peer.id)]
    assert body["created_by"] == str(task.created_by)
    assert "createdBy" not in body
    assert "parent_task_id" not in body
    assert "related_tasks" not in body


async def test_create_subtask_accepts_parent_alias(api: SimpleNamespace) -> None:
    parent = make_task()
    api.env.tasks[parent.id] = parent

    response = await api.client.post(
        "/api/v1/tasks",
        json={"title": "Child task", "priority": "medium", "parentTaskId": str(parent.id)},
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["parentTaskId"] == str(parent.id)
    api.env.uow.commit.assert_awaited_once()


@pytest.mark.parametrize("suffix", ["", "/subtasks", "/related"])
@pytest.mark.parametrize("deleted", [False, True], ids=["missing", "archived"])
async def test_reads_reject_missing_and_archived_owner(
    api: SimpleNamespace,
    suffix: str,
    deleted: bool,
) -> None:
    task = make_task(deleted_at=NOW if deleted else None)
    if deleted:
        api.env.tasks[task.id] = task

    response = await api.client.get(f"/api/v1/tasks/{task.id}{suffix}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    api.env.repo.list_linked.assert_not_awaited()
    api.env.uow.commit.assert_not_awaited()


@pytest.mark.parametrize("kind", ["subtasks", "related"])
async def test_relation_lists_return_briefs_with_pagination(
    api: SimpleNamespace,
    kind: str,
) -> None:
    task, peer = make_task(), make_task()
    api.env.tasks[task.id] = task
    brief = TaskBrief(id=peer.id, number=peer.number.value, title=peer.title, status=peer.status)
    api.env.repo.list_linked.return_value = Page.create([brief], 3, 2, 1)

    response = await api.client.get(
        f"/api/v1/tasks/{task.id}/{kind}",
        params={"page": 2, "size": 1},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "page": 2,
        "size": 1,
        "total_items": 3,
        "total_pages": 3,
        "has_next": True,
        "has_prev": True,
        "items": [
            {
                "id": str(peer.id),
                "number": peer.number.value,
                "title": peer.title,
                "status": peer.status.value,
            }
        ],
    }
    api.env.repo.list_linked.assert_awaited_once_with(task.id, kind, Pagination(page=2, size=1))


@pytest.mark.parametrize("field", ["parentTaskId", "parent_task_id"])
@pytest.mark.parametrize("detach", [False, True], ids=["attach", "detach"])
async def test_update_parent_accepts_both_aliases_and_explicit_null(
    api: SimpleNamespace,
    field: str,
    detach: bool,
) -> None:
    parent = make_task()
    task = make_task(parent_task_id=parent.id if detach else None)
    api.env.tasks.update({task.id: task, parent.id: parent})
    parent_id = None if detach else parent.id

    response = await api.client.patch(
        f"/api/v1/tasks/{task.id}/parent",
        json={field: str(parent_id) if parent_id else None},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["parentTaskId"] == (str(parent_id) if parent_id else None)
    assert task.parent_task_id == parent_id
    api.env.uow.commit.assert_awaited_once()


@pytest.mark.parametrize("body", [{}, {"parentTaskId": "invalid"}])
async def test_update_parent_requires_a_valid_explicit_field(
    api: SimpleNamespace,
    body: dict,
) -> None:
    response = await api.client.patch(f"/api/v1/tasks/{uuid4()}/parent", json=body)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    api.env.repo.lock_graph.assert_not_awaited()


async def test_parent_cycle_is_a_conflict(api: SimpleNamespace) -> None:
    root = make_task()
    child = make_task(parent_task_id=root.id)
    api.env.tasks.update({root.id: root, child.id: child})
    api.env.subtrees[root.id] = {root.id, child.id}

    response = await api.client.patch(
        f"/api/v1/tasks/{root.id}/parent",
        json={"parentTaskId": str(child.id)},
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert root.parent_task_id is None
    api.env.uow.commit.assert_not_awaited()


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
async def test_related_mutations_return_no_body_and_use_authenticated_actor(
    api: SimpleNamespace,
    method: str,
) -> None:
    task, peer = make_task(), make_task()
    api.env.tasks.update({task.id: task, peer.id: peer})

    response = await api.client.request(
        method,
        f"/api/v1/tasks/{task.id}/related/{peer.id}",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert response.content == b""
    api.env.repo.set_related.assert_awaited_once_with(task.id, peer.id, linked=method == "PUT")
    events = api.env.recorder.record_all.await_args.args[0]
    assert {event.changed_by for event in events} == {api.env.subject.id}


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
async def test_related_mutations_enforce_permissions(api: SimpleNamespace, method: str) -> None:
    task, peer = make_task(), make_task()
    api.env.tasks.update({task.id: task, peer.id: peer})
    api.env.authz.can_edit_task.return_value = PermissionResult(False, "forbidden")

    response = await api.client.request(
        method,
        f"/api/v1/tasks/{task.id}/related/{peer.id}",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    api.env.repo.set_related.assert_not_awaited()
    api.env.uow.commit.assert_not_awaited()


@pytest.mark.parametrize("kind", ["subtasks", "related"])
@pytest.mark.parametrize("params", [{"page": 0}, {"size": 0}, {"size": 101}])
async def test_relation_lists_validate_pagination(
    api: SimpleNamespace,
    kind: str,
    params: dict,
) -> None:
    response = await api.client.get(f"/api/v1/tasks/{uuid4()}/{kind}", params=params)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    api.env.repo.list_linked.assert_not_awaited()


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("GET", "", None),
        ("GET", "/subtasks", None),
        ("GET", "/related", None),
        ("PATCH", "/parent", {"parentTaskId": None}),
        ("PUT", f"/related/{uuid4()}", None),
        ("DELETE", f"/related/{uuid4()}", None),
    ],
)
async def test_relation_endpoints_require_authentication(
    api: SimpleNamespace,
    method: str,
    suffix: str,
    body: dict | None,
) -> None:
    api.app.dependency_overrides.pop(get_current_subject)

    response = await api.client.request(method, f"/api/v1/tasks/{uuid4()}{suffix}", json=body)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    api.env.repo.read.assert_not_awaited()
    api.env.repo.lock_graph.assert_not_awaited()


def task_view(task) -> TaskView:
    return TaskView(
        id=task.id,
        created_at=task.created_at,
        updated_at=task.updated_at,
        number=task.number,
        title=task.title,
        status=task.status,
        priority=task.priority,
        parent_task_id=task.parent_task_id,
    )


@pytest.mark.parametrize("version", ["v1", "v2"])
async def test_kanban_returns_links_in_one_batch_and_keeps_children_as_cards(
    api: SimpleNamespace,
    version: str,
) -> None:
    root, peer, off_page_peer = make_task(), make_task(), make_task(status=TaskStatus.DONE)
    child = make_task(parent_task_id=root.id, status=TaskStatus.TODO)
    api.env.tasks.update({task.id: task for task in (root, peer, child, off_page_peer)})
    api.env.links[root.id] = TaskLinks(
        subtasks={child.id},
        related_tasks={peer.id, off_page_peer.id},
    )
    api.env.links[peer.id] = TaskLinks(related_tasks={root.id})
    backlog_total, todo_total = 5, 1
    api.env.repo.get_grouped_by_status.return_value = {
        TaskStatus.BACKLOG: Page.create([task_view(root), task_view(peer)], backlog_total, 1, 2),
        TaskStatus.TODO: Page.create([task_view(child)], todo_total, 1, 2),
    }
    context = {"type": "internal"}

    response = await api.client.post(
        f"/api/{version}/tasks/kanban",
        params={"size": 2},
        json=context if version == "v1" else {"context": context},
    )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["total_tasks"] == backlog_total + todo_total
    backlog, todo = body["columns"]
    assert backlog["tasks"]["total_items"] == backlog_total
    assert backlog["tasks"]["has_next"]
    root_card, peer_card = backlog["tasks"]["items"]
    assert root_card["subtasks"] == [str(child.id)]
    assert root_card["relatedTasks"] == [
        str(peer_id) for peer_id in sorted((peer.id, off_page_peer.id))
    ]
    assert peer_card["relatedTasks"] == [str(root.id)]
    assert todo["tasks"]["items"][0]["id"] == str(child.id)
    assert todo["tasks"]["items"][0]["parentTaskId"] == str(root.id)
    api.env.repo.get_links.assert_awaited_once_with([root.id, peer.id, child.id])


@pytest.mark.parametrize("version", ["v1", "v2"])
async def test_empty_kanban_keeps_empty_columns(api: SimpleNamespace, version: str) -> None:
    api.env.repo.get_grouped_by_status.return_value = {
        TaskStatus.BACKLOG: Page.create([], 0, 1, 10),
    }
    context = {"type": "internal"}

    response = await api.client.post(
        f"/api/{version}/tasks/kanban",
        json=context if version == "v1" else {"context": context},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["total_tasks"] == 0
    assert response.json()["columns"][0]["tasks"]["items"] == []
    api.env.repo.get_links.assert_awaited_once_with([])


def test_openapi_documents_parent_alias_and_briefs_without_new_v2_mutations(
    api: SimpleNamespace,
) -> None:
    schema = api.app.openapi()
    paths = schema["paths"]

    assert {path for path in paths if path.startswith("/api/v2/")} == {
        "/api/v2/tasks/kanban",
    }
    parent_schema = schema["components"]["schemas"]["TaskParentUpdate"]
    assert parent_schema["required"] == ["parentTaskId"]
    assert "parentTaskId" in parent_schema["properties"]
    brief_schema = schema["components"]["schemas"]["TaskBriefResponse"]
    assert set(brief_schema["properties"]) == {"id", "number", "title", "status"}
    for method in ("put", "delete"):
        response = paths["/api/v1/tasks/{task_id}/related/{related_task_id}"][method]
        assert "content" not in response["responses"]["204"]
