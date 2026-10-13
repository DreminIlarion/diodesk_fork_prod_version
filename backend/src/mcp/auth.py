from fastmcp.server.auth import AccessToken, TokenVerifier
from fastmcp.utilities.authorization import AuthContext

from src.iam.domain.exceptions import UnauthorizedError
from src.iam.domain.repos import TokenStore
from src.iam.domain.rules import IsStaffRule
from src.iam.security import subject_from_claims, validate_token

ACCESS_TOKEN_TYPE = "access"


def require_staff(context: AuthContext) -> bool:
    """
    Проверка доступа к компонентам MCP: только для сотрудников.
    Недоступные компоненты скрываются из списков и не вызываются.
    """

    if context.token is None or not context.token.claims:
        return False

    subject = subject_from_claims(context.token.claims)
    return IsStaffRule(subject).check().allowed


class JwtTokenVerifier(TokenVerifier):
    """
    Проверяет access токены, выпущенные приложением (`POST /api/v1/auth/login`).

    MCP клиент (например, сервис чатов) передаёт токен пользователя в заголовке
    `Authorization: Bearer <token>`, поэтому агент действует строго от имени
    и в рамках прав этого пользователя.
    """

    def __init__(self, token_store: TokenStore) -> None:
        super().__init__()
        self._token_store = token_store

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            claims = validate_token(token)
        except UnauthorizedError:
            return None

        subject, jti = claims.get("sub"), claims.get("jti")
        if claims.get("type") != ACCESS_TOKEN_TYPE or not subject or not jti:
            return None

        if await self._token_store.is_revoked(jti):
            return None

        return AccessToken(
            token=token,
            client_id=subject,
            subject=subject,
            scopes=claims.get("scopes", []),
            expires_at=int(claims["exp"]),
            claims=claims,
        )
