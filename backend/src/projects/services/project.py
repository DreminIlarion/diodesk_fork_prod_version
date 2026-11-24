from uuid import UUID

from sqlalchemy.exc import IntegrityError

from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.shared.domain.events import EventPublisher
from src.shared.domain.exceptions import (
    AlreadyExistsError,
    InvariantViolationError,
    NotFoundError,
)
from src.shared.domain.repos import UnitOfWork, finalize, get_or_raise_404
from src.shared.schemas import Page

from ..infra.repos import SqlProjectStageAssigneeRepository

from ..domain.authz import ProjectAuthZService
from ..domain.entities import Project
from ..domain.repos import ProjectMemberRepository, ProjectRepository, UserRepository
from ..domain.services import generate_key_suggestions
from ..domain.vo import MemberRole, ProjectKey, ProjectStatus
from ..mappers import (
    map_project_stage_to_response,
    map_project_to_detailed_response,
    map_project_to_response,
)
from ..schemas import (
    KeyCheckResult,
    ProjectCreate,
    ProjectDetailedResponse,
    ProjectResponse,
    ProjectStageAssigneesUpdate,
    ProjectStageCreate,
    ProjectStagePlan,
    ProjectStageResponse,
    ProjectStageUpdate,
    ProjectUpdate,
)


class ProjectService:
    def __init__(
            self,
            uow: UnitOfWork,
            project_repo: ProjectRepository,
            member_repo: ProjectMemberRepository,
            stage_assignee_repo: SqlProjectStageAssigneeRepository,
            event_publisher: EventPublisher,
            user_repo: UserRepository,
    ) -> None:
        self.uow = uow
        self.project_repo = project_repo
        self.member_repo = member_repo
        self.stage_assignee_repo = stage_assignee_repo
        self.authz_service = ProjectAuthZService(member_repo)
        self.event_publisher = event_publisher
        self.user_repo = user_repo

    async def generate_key_suggestions(
            self, original_key: str, max_attempts: int = 5, min_key_length: int = 3
    ) -> list[str]:
        candidates = generate_key_suggestions(
            original_key, max_attempts=max_attempts, min_key_length=min_key_length
        )
        existing = await self.project_repo.get_existing_keys(candidates)
        return [key for key in candidates if key not in existing][:max_attempts]

    async def check_key(self, key: str) -> KeyCheckResult:
        key = ProjectKey(key)
        project = await self.project_repo.get_by_key(key)
        if project is None:
            return KeyCheckResult(available=True)

        suggestions = await self.generate_key_suggestions(key.value)
        return KeyCheckResult(available=False, suggestions=suggestions)

    async def create(
            self, data: ProjectCreate, current_subject: Subject, max_attempts: int = 5,
    ) -> ProjectDetailedResponse:
        permission = self.authz_service.can_create_project(current_subject)
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        original_key, key_candidate = data.key, data.key
        for attempt in range(1, max_attempts + 1):
            try:
                project = Project.create(
                    name=data.name,
                    key=ProjectKey(key_candidate),
                    description=data.description,
                    counterparty_id=data.counterparty_id,
                    created_by=current_subject.id,
                )
                await self.project_repo.create(project)
                await self.uow.flush()

            except IntegrityError:
                await self.uow.rollback()
                key_candidate = f"{original_key}{attempt}"

            else:
                owner = project.create_member(
                    user_id=current_subject.id,
                    roles=[MemberRole.OWNER],
                    created_by=current_subject.id,
                )
                await self.member_repo.create(owner)
                await finalize(self.uow, project, event_publisher=self.event_publisher)

                members = [owner]
                return map_project_to_detailed_response(
                    project, members=Page.create(
                        members, total_items=len(members), page=1, size=1,
                    )
                )

        raise AlreadyExistsError(
            f"Project with key - {key_candidate} already exists. "
            f"{max_attempts} attempts were not enough to resolve the uniqueness of the key. "
            f"Try again with a different key.",
            details={"last_suggested_key": key_candidate},
        )

    async def edit(
            self,
            project_id: UUID,
            data: ProjectUpdate,
            current_subject: Subject,
    ) -> ProjectResponse:
        project = await get_or_raise_404(
            self.project_repo.read,
            project_id,
            Project,
        )

        permission = await self.authz_service.can_manage_project(
            subject=current_subject,
            project_id=project.id,
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        # created_by может менять только admin/support_manager
        if data.created_by is not None and data.created_by != project.created_by:
            if UserRole.ADMIN not in current_subject.roles and \
                    UserRole.SUPPORT_MANAGER not in current_subject.roles:
                raise PermissionDeniedError(
                    "Only admin or support_manager can change created_by"
                )
            new_creator = await self.user_repo.read(data.created_by)
            if new_creator is None:
                raise NotFoundError(f"User with ID {data.created_by} not found")
            project.change_created_by(data.created_by)

        # owner_id — проверка user + добавление в project_members
        if data.owner_id is not None and data.owner_id != project.owner_id:
            new_owner = await self.user_repo.read(data.owner_id)
            if new_owner is None:
                raise NotFoundError(f"User with ID {data.owner_id} not found")
            if not new_owner.is_active:
                raise InvariantViolationError(
                    "Cannot assign inactive user as project owner"
                )
            project.change_owner(data.owner_id)

            existing_member = await self.member_repo.find(project.id, data.owner_id)
            if existing_member is None:
                new_member = project.create_member(
                    user_id=data.owner_id,
                    roles=[MemberRole.OWNER],
                    created_by=current_subject.id,
                )
                await self.member_repo.create(new_member)

        project.edit(
            name=data.name,
            description=data.description,
        )

        await self.project_repo.update(project)
        await finalize(
            self.uow,
            project,
            event_publisher=self.event_publisher,
        )

        return map_project_to_response(project)

    async def archive(self, project_id: UUID, current_subject: Subject) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_archive_project(
            subject=current_subject, project_id=project_id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.archive(archived_by=current_subject.id)
        await self.project_repo.update(project)
        await finalize(self.uow, project, event_publisher=self.event_publisher)

        return map_project_to_response(project)

    async def change_status(
            self, project_id: UUID, new_status: ProjectStatus, current_subject: Subject,
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        project.change_status(new_status)
        await self.project_repo.update(project)
        await finalize(self.uow, project, event_publisher=self.event_publisher)

        return map_project_to_response(project)

    async def add_stage(
            self, project_id: UUID, data: ProjectStageCreate, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.add_stage(
            name=data.name,
            description=data.description,
            execution_order=data.execution_order,
            planned_start=data.planned_start,
            planned_end=data.planned_end,
        )
        await self.project_repo.update(project)
        await finalize(self.uow, project, event_publisher=self.event_publisher)

        return map_project_to_response(project)

    async def reorder_stages(
            self, project_id: UUID, new_order: list[list[UUID]], current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.reorder_stages(new_order)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def start_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.start_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def complete_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.complete_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def skip_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.skip_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def pause_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.pause_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def resume_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.resume_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def remove_stage(
            self, project_id: UUID, stage_id: UUID, current_subject: Subject
    ) -> ProjectResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        project.remove_stage(stage_id)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_to_response(project)

    async def edit_stage(
            self,
            project_id: UUID,
            stage_id: UUID,
            data: ProjectStageUpdate,
            current_subject: Subject,
    ) -> ProjectStageResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        stage = project.find_stage(stage_id)
        if stage is None:
            raise NotFoundError(f"Project stage with ID {stage_id} does not exists in project")

        edit_kwargs = dict(
            name=data.name,
            description=data.description,
            completion_criteria=data.completion_criteria,
            planned_start=data.planned_start,
            planned_end=data.planned_end,
        )

        if "responsible_id" in data.model_fields_set:
            edit_kwargs["responsible_id"] = data.responsible_id

        stage.edit(**edit_kwargs)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_stage_to_response(stage)

    async def schedule_stage(
            self,
            project_id: UUID,
            stage_id: UUID,
            data: ProjectStagePlan,
            current_subject: Subject,
    ) -> ProjectStageResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        stage = project.find_stage(stage_id)
        if stage is None:
            raise NotFoundError(f"Project stage with ID {stage_id} does not exists in project")

        stage.establish_planned_schedule(start=data.planned_start, end=data.planned_end)
        await self.project_repo.update(project)
        await self.uow.commit()

        return map_project_stage_to_response(stage)

    async def set_stage_assignees(
            self,
            project_id: UUID,
            stage_id: UUID,
            data: ProjectStageAssigneesUpdate,
            current_subject: Subject,
    ) -> ProjectStageResponse:
        project = await get_or_raise_404(self.project_repo.read, project_id, Project)

        permission = await self.authz_service.can_manage_project(
            subject=current_subject, project_id=project.id
        )
        if not permission.allowed:
            raise PermissionDeniedError(permission.reason)

        stage = project.find_stage(stage_id)
        if stage is None:
            raise NotFoundError(
                f"Project stage with ID {stage_id} does not exist in project"
            )

        await self.stage_assignee_repo.replace(
            stage_id=stage_id,
            user_ids=list(data.user_ids),
            created_by=current_subject.id,
        )
        await self.uow.commit()

        project = await get_or_raise_404(self.project_repo.read, project_id, Project)
        stage = project.find_stage(stage_id)

        return map_project_stage_to_response(stage)