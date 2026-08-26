from __future__ import annotations

from typing import Self

from collections.abc import Callable
from dataclasses import dataclass, field
from uuid import UUID

from .entities import Task
from .exceptions import NotAllowedStatusTransitionError
from .vo import TaskStatus

TransitionAction = Callable[[Task, UUID], None] | Callable[[Task], None]


@dataclass(frozen=True)
class StatusTransition:
    """
    Переход из одного статуса задачи в другой.
    """

    from_status: TaskStatus
    to_status: TaskStatus
    actions: tuple[TransitionAction, ...]


@dataclass
class TaskWorkflow:
    """
    Управляет состоянием и переходами между статусами задачи.
    """

    transitions: dict[
        tuple[TaskStatus, TaskStatus], tuple[TransitionAction, ...]
    ] = field(default_factory=dict)

    def allow(
            self,
            from_status: TaskStatus,
            to_status: TaskStatus,
            *actions: TransitionAction
    ) -> Self:
        transition = (from_status, to_status)
        if transition not in self.transitions:
            self.transitions[transition] = actions

        return self

    def resolve(self, old_status: TaskStatus, new_status: TaskStatus) -> StatusTransition:
        transition = (old_status, new_status)
        if transition not in self.transitions:
            raise NotAllowedStatusTransitionError(
                f"Not allowed status transition from {old_status} to {new_status}."
            )

        actions = self.transitions[transition]
        return StatusTransition(from_status=old_status, to_status=new_status, actions=actions)

task_workflow = (
    TaskWorkflow()
    # ===================
    # Переходы из backlog
    # ===================
    .allow(
        TaskStatus.BACKLOG, TaskStatus.TODO,
        Task.start_work
    )
    .allow(
        TaskStatus.BACKLOG, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из готовы к выполнению
    # ===============================
    .allow(
        TaskStatus.TODO, TaskStatus.BACKLOG,
        Task.unassign, Task.reset_reviewer,
    )
    .allow(
        TaskStatus.TODO, TaskStatus.IN_PROGRESS,
        Task.start_work,
    )
    .allow(
        TaskStatus.TODO, TaskStatus.PAUSED,
        Task.finish_work,
    )
    .allow(
        TaskStatus.TODO, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из в работе
    # ===============================
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.TO_REVIEW,
        Task.finish_work,
    )
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.PAUSED,
        Task.finish_work,
    )
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.DONE,
        Task.complete,
    )
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED,
        Task.finish_work, Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из паузы
    # ===============================
    .allow(
        TaskStatus.PAUSED, TaskStatus.IN_PROGRESS,
        Task.start_work,
    )
    .allow(
        TaskStatus.PAUSED, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из на ревью
    # ===============================
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.IN_PROGRESS,
        Task.start_work, Task.reset_reviewer,
    )
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.TO_FIX,
        Task.start_work, Task.reset_reviewer,
    )
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.TO_TEST,
        Task.reset_reviewer,
    )
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.DONE,
        Task.complete,
    )
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )

    # ===============================
    # Переходы из на доработку
    # ===============================
    .allow(
        TaskStatus.TO_FIX, TaskStatus.IN_PROGRESS,
        Task.start_work,
    )
    .allow(
        TaskStatus.TO_FIX, TaskStatus.TO_REVIEW,
        Task.finish_work,
    )
    .allow(
        TaskStatus.TO_FIX, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из на тестировании
    # ===============================
    .allow(
        TaskStatus.TO_TEST, TaskStatus.IN_PROGRESS,
        Task.start_work,
    )
    .allow(
        TaskStatus.TO_TEST, TaskStatus.TO_REVIEW,
        Task.start_work,
    )
    .allow(
        TaskStatus.TO_TEST, TaskStatus.DONE,
        Task.complete,
    )

    .allow(
        TaskStatus.TO_TEST, TaskStatus.CANCELLED,
        Task.unassign, Task.reset_reviewer,
    )
    # ===============================
    # Переходы из выполнено
    # ===============================
    .allow(
        TaskStatus.DONE, TaskStatus.IN_PROGRESS,
        Task.reopen, Task.start_work,
    )
    .allow(
        TaskStatus.DONE, TaskStatus.TO_FIX,
        Task.reopen, Task.start_work,
    )
    # ===============================
    # ОБРАТНЫЕ ПЕРЕХОДЫ (возврат назад)
    # ===============================
    # IN_PROGRESS → TODO (вернуть из работы в готов к выполнению)
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.TODO,
        Task.finish_work,
    )
    # IN_PROGRESS → TO_FIX (вернуть из работы в доработку)
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.TO_FIX,
        Task.finish_work,
    )
    # IN_PROGRESS → TO_TEST (вернуть из работы в тестирование)
    .allow(
        TaskStatus.IN_PROGRESS, TaskStatus.TO_TEST,
        Task.finish_work,
    )
    # PAUSED → TODO (вернуть из паузы в готов к выполнению)
    .allow(
        TaskStatus.PAUSED, TaskStatus.TODO,
        Task.finish_work,
    )
    # TO_REVIEW → TO_TEST (вернуть из ревью в тестирование)
    .allow(
        TaskStatus.TO_REVIEW, TaskStatus.TO_TEST,
        Task.start_work,
    )
    # TO_FIX → DONE (вернуть из доработки в выполнено)
    .allow(
        TaskStatus.TO_FIX, TaskStatus.DONE,
        Task.complete,
    )
    # TO_TEST → TO_FIX (вернуть из тестирования в доработку)
    .allow(
        TaskStatus.TO_TEST, TaskStatus.TO_FIX,
        Task.start_work,
    )
    # DONE → TO_REVIEW (вернуть из выполнено в ревью)
    .allow(
        TaskStatus.DONE, TaskStatus.TO_REVIEW,
        Task.reopen,
    )
    # DONE → TO_TEST (вернуть из выполнено в тестирование)
    .allow(
        TaskStatus.DONE, TaskStatus.TO_TEST,
        Task.reopen, Task.start_work,
    )
)