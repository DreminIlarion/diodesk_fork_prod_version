from uuid import uuid4

from src.shared.domain.vo import Tag
from src.tasks.domain.entities import Task
from src.tasks.domain.vo import TaskNumber
from src.tasks.mappers import map_task_to_response
from src.tasks.mcp.presenters import to_task_card


def test_tagged_task_maps_to_api_response_and_mcp_card() -> None:
    task = Task.create(
        number=TaskNumber("TASK-001"),
        title="Tagged task",
        created_by=uuid4(),
        tags=[Tag(name="mcp-test")],
    )

    response = map_task_to_response(task)

    assert response.model_dump(mode="json")["tags"] == [
        {"name": "mcp-test", "color": "#3498db"}
    ]
    assert to_task_card(response).tags == ["mcp-test"]
