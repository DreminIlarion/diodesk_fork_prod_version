from fastmcp import FastMCP
from fastmcp.server.middleware import AuthMiddleware

from src.core.redis import redis_client
from src.iam.infra.token_store import RedisTokenStore
from src.iam.mcp.server import create_server as create_users_server
from src.tasks.mcp.server import create_server as create_tasks_server
from src.tickets.mcp.server import create_server as create_tickets_server

from .auth import JwtTokenVerifier, require_staff
from .middleware import DomainErrorMiddleware

INSTRUCTIONS = """\
Ты помогаешь сотрудникам ДИО-Консалт работать с тикет-системой: заявками клиентов,
задачами команды и их распределением между сотрудниками. Все действия выполняются
от имени текущего пользователя и в рамках его прав.

Правила:
- Перед любым изменением (создание, назначение, смена статуса, комментарий) покажи
  пользователю, что именно будет сделано, и дождись подтверждения.
- Называй задачи и заявки по номерам (TASK-001, INT-26-00000012), а не по ID.
- Комментарии по умолчанию внутренние (internal). Публичный (public) комментарий увидит
  клиент - текст обязательно согласуй.
- Допустимые переходы статусов есть в карточке задачи (next_statuses) и в ресурсе
  tasks://workflow. На ревью задача отправляется через request_task_review.
- Оценивай задачи в story points по шкале 1, 2, 3, 5, 8, 13, 21; крупные задачи
  предлагай декомпозировать.
- Исполнителей подбирай через suggest_assignees и объясняй выбор: опыт и загрузка.
- Если инструмент вернул ошибку, объясни её пользователю простыми словами.
"""


def create_server() -> FastMCP:
    """Корневой MCP сервер: объединяет компоненты модулей и общую инфраструктуру."""

    server = FastMCP(
        name="diodesk",
        instructions=INSTRUCTIONS,
        auth=JwtTokenVerifier(RedisTokenStore(redis_client)),
        middleware=[AuthMiddleware(auth=require_staff), DomainErrorMiddleware()],
        mask_error_details=True,
    )

    for module_server in (
            create_users_server(),
            create_tasks_server(),
            create_tickets_server(),
    ):
        server.mount(module_server)

    return server


mcp = create_server()
