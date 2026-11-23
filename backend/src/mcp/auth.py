from uuid import UUID

from fastmcp.server.auth import AccessToken, TokenVerifier
from fastmcp.utilities.authorization import AuthContext

from src.iam.domain.exceptions import UnauthorizedError
from src.iam.domain.repos import TokenStore
from src.iam.domain.rules import IsStaffRule
from src.iam.security import subject_from_claims, validate_token

ACCESS_TOKEN_TYPE = "access"


def require_staff(context: AuthContext) -> bool:
    """Allow MCP components only for authenticated DioDesk employees."""

    if context.token is None or not context.token.claims:
        return False

    try:
        subject = subject_from_claims(context.token.claims)
    except (KeyError, TypeError, ValueError):
        return False
    return IsStaffRule(subject).check().allowed


class JwtTokenVerifier(TokenVerifier):
    """Validate DioDesk access tokens received in the Bearer header."""

    def __init__(self, token_store: TokenStore) -> None:
        super().__init__()
        self._token_store = token_store

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            claims = validate_token(token)
            subject = claims.get("sub")
            jti = claims.get("jti")
            expires_at = claims.get("exp")
            if (
                claims.get("type") != ACCESS_TOKEN_TYPE
                or not subject
                or not jti
                or expires_at is None
            ):
                return None

            if await self._token_store.is_revoked(UUID(jti)):
                return None
        except (UnauthorizedError, TypeError, ValueError):
            return None

        return AccessToken(
            token=token,
            client_id=subject,
            subject=subject,
            scopes=list(claims.get("scopes", [])),
            expires_at=int(expires_at),
            claims=claims,
        )
