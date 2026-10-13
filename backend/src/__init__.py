# Модели всех модулей регистрируются в метаданных при импорте пакета:
# связи между модулями (например, tickets.project_id -> projects.id) разрешаются
# по метаданным, поэтому приложению, миграциям и CLI нужны все модели сразу
import src.activity_logs.infra.models
import src.comments.infra.models
import src.crm.infra.models
import src.iam.infra.models
import src.media.infra.models
import src.notifications.infra.models
import src.products.infra.models
import src.projects.infra.models
import src.tasks.infra.models
import src.tickets.infra.models
