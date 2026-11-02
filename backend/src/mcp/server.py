from fastmcp import FastMCP
from fastmcp.server.middleware import AuthMiddleware

from src.core.redis import redis_client
from src.iam.domain.repos import TokenStore
from src.iam.infra.token_store import RedisTokenStore
from src.iam.mcp.server import create_server as create_users_server

from .auth import JwtTokenVerifier, require_staff
from .middleware import DomainErrorMiddleware

INSTRUCTIONS = """\
Ты помогаешь сотрудникам ДИО-Консалт работать с DioDesk: находить пользователей,
работать с задачами и заявками, а также распределять задачи между сотрудниками.
Все действия выполняются от имени текущего пользователя и только в рамках его прав.

Правила:
- Перед любым изменением данных покажи пользователю, что именно будет сделано,
  и дождись подтверждения.
- Называй задачи и заявки по человекочитаемым номерам, а не по внутренним UUID.
- Если в ответе присутствует поле url, оформляй номер задачи или заявки как
  Markdown-ссылку. После создания или изменения объекта ссылка обязательна.
- Перед сменой статуса учитывай допустимые переходы, полученные в карточке задачи.
- Оценивай задачи в story points по шкале 1, 2, 3, 5, 8, 13, 21.
  Крупные задачи предлагай декомпозировать.
- Не раскрывай пользователю внутренние технические детали и стек ошибок.
- Если операция запрещена правами или нарушает правила DioDesk, понятно объясни причину.
"""


def create_server(token_store: TokenStore | None = None) -> FastMCP:
    """Create the root DioDesk MCP server."""

    if token_store is None:
        token_store = RedisTokenStore(redis_client)

    server = FastMCP(
        name="diodesk",
        instructions=INSTRUCTIONS,
        auth=JwtTokenVerifier(token_store),
        middleware=[
            AuthMiddleware(auth=require_staff),
            DomainErrorMiddleware(),
        ],
        mask_error_details=True,
    )
    server.mount(create_users_server())

    return server


mcp = create_server()
