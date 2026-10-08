from fastmcp.prompts import prompt

from .references import TicketRef


@prompt(tags={"planning", "tickets"})
def plan_ticket_tasks(ticket: TicketRef) -> str:
    """Сформировать пул задач по заявке и подобрать исполнителей."""

    return f"""\
Помоги сформировать пул задач по заявке {ticket}.

1. Изучи заявку (get_ticket) и обсуждение (list_ticket_comments). Уже созданные по заявке
   задачи показаны в карточке - не дублируй их.
2. Предложи список задач: тема, постановка с критериями готовности, story points,
   оценка в часах, теги по навыкам. Отметь неясности, которые стоит уточнить у клиента.
3. После подтверждения создай задачи (create_tasks_from_ticket).
4. Для каждой задачи предложи исполнителя (suggest_assignees) с учётом загрузки команды;
   назначай (assign_task) только после подтверждения.
5. Предложи оставить в заявке внутренний комментарий с планом работ (add_ticket_comment).
"""


@prompt(tags={"tickets"})
def summarize_ticket(ticket: TicketRef) -> str:
    """Кратко изложить состояние заявки и следующие шаги."""

    return f"""\
Подготовь сводку по заявке {ticket}.

1. Изучи заявку (get_ticket) и обсуждение (list_ticket_comments).
2. Опиши: суть запроса, что уже сделано, прогресс по задачам (task_pool),
   блокеры и открытые вопросы к клиенту.
3. Предложи следующие шаги и ответственных.
4. Если пользователь попросит - сохрани сводку внутренним комментарием (add_ticket_comment).
"""


PROMPTS = (plan_ticket_tasks, summarize_ticket)
