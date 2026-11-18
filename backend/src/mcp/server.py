from fastmcp import FastMCP
from fastmcp.server.middleware import AuthMiddleware

from src.core.redis import redis_client
from src.iam.infra.token_store import RedisTokenStore
from src.iam.mcp.server import mcp as users_mcp
from src.tasks.mcp.server import mcp as tasks_mcp

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

mcp = FastMCP(
    name="diodesk",
    instructions=INSTRUCTIONS,
    auth=JwtTokenVerifier(RedisTokenStore(redis_client)),
    middleware=[
        AuthMiddleware(auth=require_staff),
        DomainErrorMiddleware(),
    ],
    mask_error_details=True,
)

mcp.mount(users_mcp)
mcp.mount(tasks_mcp)
