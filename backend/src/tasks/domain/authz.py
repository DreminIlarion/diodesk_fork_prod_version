from uuid import UUID

from src.iam.domain.authz import AnyOf, PermissionResult, Subject
from src.iam.domain.entities import User
from src.iam.domain.rules import IsAdminRule, IsStaffRule
from src.iam.domain.vo import UserRole

from .entities import Task
from .rules import (
    IsTaskCreator,
    IsTaskReviewer,
    TaskAssigneeStatusRule,
    TaskEditingRule,
    TaskReviewerStatusRule,
)
from .vo import TaskStatus


class TaskAuthZService:

    async def can_create_task(
            self, subject: Subject, project_id: UUID | None = None
    ) -> PermissionResult:
        auth_policy = IsStaffRule(subject)
        return auth_policy.check()

    async def can_edit_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [IsAdminRule(subject), IsStaffRule(subject), TaskEditingRule(subject, task)]
        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_change_status(
            self, subject: Subject, task: Task, new_status: TaskStatus
    ) -> PermissionResult:
        rules = [
            IsAdminRule(subject),
            IsTaskCreator(subject, task),
            IsStaffRule(subject),
            AnyOf(
                TaskAssigneeStatusRule(subject, task, new_status),
                TaskReviewerStatusRule(subject, task, new_status),
            ),
        ]
        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_assign_task(
            self, subject: Subject, task: Task, assignee: User
    ) -> PermissionResult:
        rules = [
            IsAdminRule(subject),
            IsTaskCreator(subject, task),
            IsStaffRule(subject),
            IsStaffRule(assignee),
        ]
        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_request_review(
            self,
            subject: Subject,
            task: Task,
            reviewer: User,
    ) -> PermissionResult:

        allowed_reviewer_roles = {
            UserRole.ADMIN,
            UserRole.SUPPORT_AGENT,
            UserRole.SUPPORT_MANAGER,
            UserRole.DEVELOPER,
        }

        if not reviewer.is_active:
            return PermissionResult(False, "Reviewer is inactive")

        if not reviewer.has_any_role(allowed_reviewer_roles):
            return PermissionResult(
                False,
                "Reviewer must be a developer or support staff member",
            )

        if reviewer.id == task.assignee_id:
            return PermissionResult(
                False,
                "Reviewer cannot be the same as assignee",
            )

        requester_allowed = (
            subject.has_role(UserRole.ADMIN)
            or subject.has_role(UserRole.SUPPORT_MANAGER)
            or subject.has_role(UserRole.SUPPORT_AGENT)
            or subject.id == task.created_by
            or subject.id == task.assignee_id
        )

        if not requester_allowed:
            return PermissionResult(
                False,
                "Only the task assignee, creator, support manager or admin can request a review",
            )

        return PermissionResult(True)

    async def can_review_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [
            IsAdminRule(subject),
            IsTaskCreator(subject, task),
            IsTaskReviewer(subject, task),
        ]
        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_archive_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [IsAdminRule(subject), IsTaskCreator(subject, task), IsStaffRule(subject)]
        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_view_task(
            self, subject: Subject, project_id: UUID | None = None
    ) -> PermissionResult:
        auth_policy = IsStaffRule(subject)
        return auth_policy.check()