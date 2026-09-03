from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.iam.domain.authz import Subject, SubjectType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import UserRole
from src.projects.domain.entities import Project, ProjectMember
from src.projects.domain.vo import MemberRole, ProjectKey, ProjectStatus
from src.projects.schemas import ProjectCreate, ProjectUpdate
from src.projects.services import ProjectService
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


@pytest.fixture
def mock_session():
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
def project_service(
    mock_session,
    fake_project_repo,
    fake_membership_repo,
    event_publisher,
):
    return ProjectService(
        uow=mock_session,
        project_repo=fake_project_repo,
        member_repo=fake_membership_repo,
        event_publisher=event_publisher,
    )


@pytest.fixture
async def created_project(fake_project_repo, current_support_manager):
    project = Project.create(
        name="Test Project",
        key=ProjectKey("TEST"),
        created_by=current_support_manager.id,
        description="Initial description",
    )
    await fake_project_repo.create(project)
    return project


@pytest.fixture
def current_support_manager():
    return Subject(
        id=uuid4(),
        type=SubjectType.USER,
        roles=[UserRole.SUPPORT_MANAGER],
    )


@pytest.fixture
async def owner_membership(
        created_project, current_support_manager, fake_membership_repo
):
    membership = ProjectMember(
        project_id=created_project.id,
        user_id=current_support_manager.id,
        roles={MemberRole.OWNER},
        created_by=current_support_manager.id,
    )
    await fake_membership_repo.create(membership)
    return membership


class TestCheckKey:
    """
    Тесты для методы проверки ключа
    """

    @pytest.mark.asyncio
    async def test_check_key_available_when_key_not_exists(self, project_service):
        response = await project_service.check_key("NEWKEY")

        assert response.available is True
        assert response.suggestions == []

    @pytest.mark.asyncio
    async def test_check_key_not_available_when_key_exists(self, project_service, created_project):  # noqa: ARG002
        response = await project_service.check_key("TEST")

        assert response.available is False
        assert len(response.suggestions) > 0
        assert "TEST1" in response.suggestions or "TEST-1" in response.suggestions


class TestGenerateKeySuggestions:
    """
    Тестирование генерации вариантов уникальных ключей проекта
    """

    @pytest.mark.asyncio
    async def test_generate_suggestions_returns_unique_available_keys(
        self, project_service, created_project  # noqa: ARG002
    ):
        suggestions = await project_service.generate_key_suggestions("TEST", max_attempts=3)

        assert "TEST" not in suggestions
        assert "TEST1" in suggestions
        assert "TEST2" in suggestions

    @pytest.mark.asyncio
    async def test_generate_suggestions_fallback_when_empty_base(self, project_service):
        suggestions = await project_service.generate_key_suggestions("", max_attempts=2)

        assert suggestions[0] == "PROJ1"
        assert suggestions[1] == "PROJ2"

    @pytest.mark.asyncio
    async def test_generate_suggestions_respects_max_attempts(self, project_service):
        suggestions = await project_service.generate_key_suggestions("WEB", max_attempts=2)
        excepted_suggestions_count = 2

        assert len(suggestions) <= excepted_suggestions_count
        assert "WEB1" in suggestions
        assert "WEB2" in suggestions


class TestCreateProject:
    """
    Тестирование для метода создания проекта
    """

    async def test_create_success(
            self, project_service, mock_session, fake_project_repo, current_support_manager
    ):
        data = ProjectCreate(name="New Project", key="NEW")

        response = await project_service.create(data, current_support_manager)

        assert response.key == "NEW"
        assert response.name == "New Project"
        mock_session.commit.assert_awaited_once()

        # Проверка на успешное сохранение
        existing_project = await fake_project_repo.read(response.id)

        assert existing_project is not None
        assert existing_project.key.value == "NEW"

    async def test_create_with_key_conflict_retries_with_suffix(
        self, project_service, mock_session, created_project, current_support_manager  # noqa: ARG002
    ):
        # Создание проекта с занятым ключом
        data = ProjectCreate(name="Another Project", key="TEST")

        # Первый вызов Project.create должен пройти, но при flush возникнет ошибка уникальности
        with patch.object(
            project_service.project_repo,
            "create",
            side_effect=[
                IntegrityError("duplicate key", None, None),
                None,
            ],
        ):
            response = await project_service.create(data, current_support_manager, max_attempts=3)

        assert response.key == "TEST1"

        mock_session.rollback.assert_awaited_once()
        mock_session.commit.assert_awaited_once()

    async def test_create_fails_after_max_attempts(
        self, project_service, mock_session, created_project, current_support_manager  # noqa: ARG002
    ):
        data = ProjectCreate(name="Failing Project", key="TEST")

        with patch.object(
            project_service.project_repo,
            "create",
            side_effect=IntegrityError("duplicate", None, None),
        ):
            with pytest.raises(AlreadyExistsError) as exc:
                await project_service.create(data, current_support_manager, max_attempts=2)

            assert "2 attempts were not enough" in str(exc.value)
            assert exc.value.details["last_suggested_key"] == "TEST2"


class TestEditProject:

    async def test_edit_project_success(
            self,
            project_service,
            created_project,
            owner_membership,
            fake_project_repo,
            current_support_manager,
            mock_session,
    ):
        assert owner_membership.project_id == created_project.id

        response = await project_service.edit(
            project_id=created_project.id,
            data=ProjectUpdate(
                name="  Updated Project  ",
                description="  Updated description  ",
            ),
            current_subject=current_support_manager,
        )

        assert response.id == created_project.id
        assert response.name == "Updated Project"
        assert response.description == "Updated description"

        saved_project = await fake_project_repo.read(created_project.id)

        assert saved_project is not None
        assert saved_project.name == "Updated Project"
        assert saved_project.description == "Updated description"
        mock_session.commit.assert_awaited_once()

    async def test_edit_project_forbidden_for_non_member(
            self, project_service, created_project, mock_session
    ):
        non_member = Subject(
            id=uuid4(),
            type=SubjectType.USER,
            roles=[UserRole.SUPPORT_MANAGER],
        )

        with pytest.raises(PermissionDeniedError):
            await project_service.edit(
                project_id=created_project.id,
                data=ProjectUpdate(name="Forbidden update"),
                current_subject=non_member,
            )

        assert created_project.name == "Test Project"
        mock_session.commit.assert_not_awaited()

    async def test_edit_missing_project(
            self, project_service, current_support_manager, mock_session
    ):
        with pytest.raises(NotFoundError):
            await project_service.edit(
                project_id=uuid4(),
                data=ProjectUpdate(name="Updated Project"),
                current_subject=current_support_manager,
            )

        mock_session.commit.assert_not_awaited()

    async def test_edit_project_rejects_empty_name(
            self,
            project_service,
            created_project,
            owner_membership,
            current_support_manager,
            mock_session,
    ):
        assert owner_membership.project_id == created_project.id

        with pytest.raises(ValueError, match="Project name cannot be empty"):
            await project_service.edit(
                project_id=created_project.id,
                data=ProjectUpdate(name="   "),
                current_subject=current_support_manager,
            )

        mock_session.commit.assert_not_awaited()


class TestArchiveProject:

    async def test_archive_project_success(
            self,
            project_service,
            created_project,
            owner_membership,
            fake_project_repo,
            current_support_manager,
            mock_session,
    ):
        assert owner_membership.project_id == created_project.id

        response = await project_service.archive(
            project_id=created_project.id,
            current_subject=current_support_manager,
        )

        assert response.id == created_project.id
        assert response.status == ProjectStatus.ARCHIVED

        saved_project = await fake_project_repo.read(created_project.id)

        assert saved_project is not None
        assert saved_project.status == ProjectStatus.ARCHIVED
        assert saved_project.is_deleted is True
        mock_session.commit.assert_awaited_once()

    async def test_only_owner_can_archive_project(
            self,
            project_service,
            created_project,
            fake_membership_repo,
            mock_session,
    ):
        manager = Subject(
            id=uuid4(),
            type=SubjectType.USER,
            roles=[UserRole.SUPPORT_MANAGER],
        )
        membership = ProjectMember(
            project_id=created_project.id,
            user_id=manager.id,
            roles={MemberRole.MANAGER},
            created_by=created_project.created_by,
        )
        await fake_membership_repo.create(membership)

        with pytest.raises(PermissionDeniedError):
            await project_service.archive(
                project_id=created_project.id,
                current_subject=manager,
            )

        assert created_project.status == ProjectStatus.ACTIVE
        assert created_project.is_deleted is False
        mock_session.commit.assert_not_awaited()

    async def test_archive_missing_project(
            self, project_service, current_support_manager, mock_session
    ):
        with pytest.raises(NotFoundError):
            await project_service.archive(
                project_id=uuid4(),
                current_subject=current_support_manager,
            )

        mock_session.commit.assert_not_awaited()
