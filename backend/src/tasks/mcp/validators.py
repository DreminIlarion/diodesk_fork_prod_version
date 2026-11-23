from .schemas import TaskChanges


def validate_task_changes(task: TaskChanges) -> None:
    if all(
        value is None
        for value in (
            task.title,
            task.description,
            task.priority,
            task.story_points,
            task.estimated_hours,
            task.due_date,
        )
    ):
        raise ValueError("At least one task field must be provided")
