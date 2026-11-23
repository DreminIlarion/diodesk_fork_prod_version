from fastmcp.server.dependencies import get_access_token

from src.iam.domain.authz import Subject
from src.iam.domain.exceptions import UnauthorizedError
from src.iam.security import subject_from_claims


def get_current_subject() -> Subject:
    """Return the DioDesk user represented by the current MCP access token."""

    access_token = get_access_token()
    if access_token is None or not access_token.claims:
        raise UnauthorizedError("Bearer access token is required")

    try:
        return subject_from_claims(access_token.claims)
    except (KeyError, TypeError, ValueError) as error:
        raise UnauthorizedError("Invalid access token claims") from error
