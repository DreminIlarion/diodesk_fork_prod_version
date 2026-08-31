from uuid import UUID

from src.iam.domain.authz import AllOf, AnyOf, PermissionResult, Subject
from src.iam.domain.entities import User
from src.iam.domain.rules import IsAdminRule, IsStaffRule
from src.iam.domain.vo import UserRole
from src.projects.domain.repos import ProjectMemberRepository
from src.projects.domain.rules import IsMemberExistsRule, IsProjectOwnerOrManagerRule

from .entities import Task
from .rules import (
    IsProjectStaffRule,
    IsTaskCreator,
    IsTaskReviewer,
    TaskAssigneeStatusRule,
    TaskEditingRule,
    TaskReviewerStatusRule,
)
from .vo import TaskStatus


class TaskAuthZService:
    def __init__(self, project_membership_repo: ProjectMemberRepository) -> None:
        self.project_membership_repo = project_membership_repo

    async def can_create_task(
            self, subject: Subject, project_id: UUID | None = None
    ) -> PermissionResult:
        rules = [IsStaffRule(subject)]

        if project_id is not None:
            project_membership = await self.project_membership_repo.find(project_id, subject.id)
            rules.append(IsProjectStaffRule(project_membership))

        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_edit_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [IsAdminRule(subject), IsStaffRule(subject), TaskEditingRule(subject, task)]

        if task.project_id is not None:
            project_member = await self.project_membership_repo.find(task.project_id, subject.id)
            rules.extend([
                AllOf(
                    IsMemberExistsRule(project_member),
                    IsProjectOwnerOrManagerRule(project_member)
                ),
            ])

        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_change_status(
            self, subject: Subject, task: Task, new_status: TaskStatus
    ) -> PermissionResult:
        rules = [IsAdminRule(subject), IsTaskCreator(subject, task)]

        if task.project_id is not None:
            project_member = await self.project_membership_repo.find(task.project_id, subject.id)
            rules.append(
                AnyOf(
                    AllOf(
                        IsMemberExistsRule(project_member),
                        IsProjectOwnerOrManagerRule(project_member),
                    ),
                    AllOf(
                        IsMemberExistsRule(project_member),
                        IsProjectStaffRule(project_member),
                    ),
                    TaskAssigneeStatusRule(subject, task, new_status),  # ← ДОБАВИl
                    TaskReviewerStatusRule(subject, task, new_status),   # ← ДОБАВИl    
                )
            )

            auth_policy = AnyOf(*rules)
            return auth_policy.check()

        rules.extend((
            IsStaffRule(subject),
            AnyOf(
                TaskAssigneeStatusRule(subject, task, new_status),
                TaskReviewerStatusRule(subject, task, new_status)
            )
        ))

        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_assign_task(
            self, subject: Subject, task: Task, assignee: User
    ) -> PermissionResult:
        rules = [IsAdminRule(subject), IsTaskCreator(subject, task), IsStaffRule(subject), IsStaffRule(assignee)]

        if task.project_id is not None:
            current_member = await self.project_membership_repo.find(task.project_id, subject.id)
            assignee_member = await self.project_membership_repo.find(task.project_id, assignee.id)

            member_rules = []
            for member in [current_member, assignee_member]:
                member_rules.extend((
                    IsMemberExistsRule(member),
                    IsProjectStaffRule(member),
                ))

            rules.append(AllOf(*member_rules))

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
            or subject.id == task.created_by
            or subject.id == task.assignee_id
        )

        if task.project_id is not None:
            current_member = await self.project_membership_repo.find(
                task.project_id,
                subject.id,
            )
            reviewer_member = await self.project_membership_repo.find(
                task.project_id,
                reviewer.id,
            )

            if not requester_allowed and current_member is not None:
                requester_allowed = IsProjectOwnerOrManagerRule(
                    current_member
                ).check().allowed

            reviewer_permission = AllOf(
                IsMemberExistsRule(reviewer_member),
                IsProjectStaffRule(reviewer_member),
            ).check()

            if not reviewer_permission.allowed:
                return reviewer_permission

        if not requester_allowed:
            return PermissionResult(
                False,
                "Only the task assignee, creator, support manager, "
                "project manager or admin can request a review",
            )

        return PermissionResult(True)

    async def can_review_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [IsAdminRule(subject), IsTaskCreator(subject, task)]

        if task.project_id is not None:
            project_member = await self.project_membership_repo.find(task.project_id, subject.id)
            rules.append(
                AllOf(
                    IsMemberExistsRule(project_member),
                    IsProjectOwnerOrManagerRule(project_member),
                )
            )

        rules.append(IsTaskReviewer(subject, task))

        auth_policy = AnyOf(*rules)
        return auth_policy.check()
    async def can_archive_task(self, subject: Subject, task: Task) -> PermissionResult:
        rules = [IsAdminRule(subject), IsTaskCreator(subject, task), IsStaffRule(subject)]

        if task.project_id is not None:
            project_member = await self.project_membership_repo.find(task.project_id, subject.id)
            rules.append(
                AllOf(
                    IsMemberExistsRule(project_member),
                    IsProjectOwnerOrManagerRule(project_member),
                )
            )

        auth_policy = AnyOf(*rules)
        return auth_policy.check()

    async def can_view_task(
            self, subject: Subject, project_id: UUID | None = None
    ) -> PermissionResult:
        if project_id is not None:
            project_member = await self.project_membership_repo.find(project_id, subject.id)
            auth_policy = AllOf(
                IsMemberExistsRule(project_member),
                IsProjectStaffRule(project_member),
            )
            return auth_policy.check()

        auth_policy = IsStaffRule(subject)
        return auth_policy.check()