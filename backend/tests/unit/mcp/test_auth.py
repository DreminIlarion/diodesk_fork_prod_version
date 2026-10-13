from uuid import uuid4

import pytest
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AccessToken
from fastmcp.utilities.authorization import AuthContext

from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import Email, UserRole
from src.iam.security import create_access_token, create_refresh_token, subject_from_claims
from src.mcp.auth import JwtTokenVerifier, require_staff
from src.mcp.middleware import DomainErrorMiddleware, describe, find_domain_error

pytestmark = pytest.mark.unit


class FakeTokenStore:
    def __init__(self, revoked: set[str] | None = None) -> None:
        self.revoked = revoked or set()

    async def is_revoked(self, jti) -> bool:
        return jti in self.revoked


def make_token(*roles: UserRole) -> str:
    return create_access_token(uuid4(), Email("agent@test.com"), set(roles))


def auth_context(token: AccessToken | None) -> AuthContext:
    return AuthContext(token=token, component=None)


class TestJwtTokenVerifier:
    async def test_accepts_valid_access_token(self):
        token = make_token(UserRole.DEVELOPER)

        access_token = await JwtTokenVerifier(FakeTokenStore()).verify_token(token)

        assert access_token is not None
        assert access_token.claims["roles"] == [UserRole.DEVELOPER]

    async def test_rejects_refresh_token(self):
        token = create_refresh_token(uuid4())

        assert await JwtTokenVerifier(FakeTokenStore()).verify_token(token) is None

    async def test_rejects_revoked_token(self):
        token = make_token(UserRole.DEVELOPER)
        verifier = JwtTokenVerifier(FakeTokenStore())
        jti = (await verifier.verify_token(token)).claims["jti"]

        assert await JwtTokenVerifier(FakeTokenStore({jti})).verify_token(token) is None

    async def test_rejects_garbage(self):
        assert await JwtTokenVerifier(FakeTokenStore()).verify_token("not-a-jwt") is None


class TestRequireStaff:
    async def test_allows_staff(self):
        token = await JwtTokenVerifier(FakeTokenStore()).verify_token(make_token(UserRole.ADMIN))

        assert require_staff(auth_context(token))

    async def test_denies_customer(self):
        token = await JwtTokenVerifier(FakeTokenStore()).verify_token(
            make_token(UserRole.CUSTOMER)
        )

        assert not require_staff(auth_context(token))

    def test_denies_anonymous(self):
        assert not require_staff(auth_context(None))


def test_subject_from_claims_restores_types():
    user_id = uuid4()
    claims = {"sub": str(user_id), "sub_type": "user", "roles": ["developer"], "email": "a@b.ru"}

    subject = subject_from_claims(claims)

    assert subject.id == user_id
    assert subject.roles == [UserRole.DEVELOPER]
    assert subject.counterparty_id is None


class TestDomainErrorMiddleware:
    def test_finds_domain_error_in_cause_chain(self):
        domain_error = PermissionDeniedError("Only assignee can do it")
        try:
            try:
                raise domain_error
            except PermissionDeniedError as error:
                raise RuntimeError("Failed to resolve dependency") from error
        except RuntimeError as wrapper:
            assert find_domain_error(wrapper) is domain_error

    def test_describes_domain_error_for_agent(self):
        message = describe(PermissionDeniedError("Only assignee can do it"))

        assert message == "PERMISSION_DENIED: Only assignee can do it"

    async def test_translates_wrapped_error(self):
        async def call_next(_):
            try:
                raise PermissionDeniedError("nope")
            except PermissionDeniedError as error:
                raise ToolError("Error calling tool 'x'") from error

        with pytest.raises(ToolError, match="PERMISSION_DENIED: nope"):
            await DomainErrorMiddleware().on_call_tool(None, call_next)

    async def test_keeps_internal_errors_masked(self):
        async def call_next(_):
            raise ToolError("Error calling tool 'x'") from KeyError("secret")

        with pytest.raises(ToolError, match="^Error calling tool 'x'$"):
            await DomainErrorMiddleware().on_call_tool(None, call_next)
