from typing import Annotated

from fastmcp.prompts import prompt
from pydantic import Field

from .references import TaskRef


@prompt(tags={"planning"})
def plan_task_assignment(task: TaskRef) -> str:
    """Подобрать исполнителя для задачи с обоснованием выбора."""

    return f"""\
Помоги назначить исполнителя на задачу {task}.

1. Получи карточку задачи (get_task). Если у задачи нет оценки или тегов, предложи их -
   от этого зависит точность подбора.
2. Получи кандидатов (suggest_assignees) и при необходимости уточни опыт лидеров
   (get_user_expertise).
3. Сравни 2-3 лучших кандидатов: опыт по теме, текущая загрузка, просрочки, срок задачи.
4. Предложи исполнителя и запасной вариант с кратким обоснованием.
5. Назначь (assign_task) только после подтверждения пользователя.
"""


@prompt(tags={"planning"})
def plan_task_decomposition(task: TaskRef) -> str:
    """Разбить крупную задачу на подзадачи."""

    return f"""\
Помоги декомпозировать задачу {task}.

1. Изучи задачу (get_task) и обсуждение (list_task_comments).
2. Предложи 3-8 подзадач: каждая - законченный проверяемый результат на 1-8 story points,
   с критериями готовности в описании и тегами по навыкам.
3. Укажи зависимости и порядок выполнения, если они есть.
4. После подтверждения пользователя создай подзадачи (decompose_task) и предложи
   исполнителей для них (suggest_assignees).
"""


@prompt(tags={"planning"})
def daily_digest(
        focus: Annotated[
            str | None, Field(description="На чём сделать акцент (необязательно)")
        ] = None,
) -> str:
    """Сводка на день для текущего пользователя."""

    focus_line = f"\nОсобое внимание: {focus}.\n" if focus else ""
    return f"""\
Подготовь мне сводку на день.
{focus_line}
1. Мои открытые задачи (search_tasks: assignee="me", статусы кроме done и cancelled):
   что в работе, что просрочено, что с ближайшим сроком.
2. Задачи, которые ждут моего ревью (search_tasks: reviewer="me", status to_review).
3. Если задач мало - предложи, что взять в работу (suggest_tasks_for_user).
Ответ - короткий список с номерами задач и рекомендацией, с чего начать.
"""


@prompt(tags={"planning"})
def review_team_workload() -> str:
    """Проанализировать загрузку команды и предложить перераспределение."""

    return """\
Проанализируй загрузку команды.

1. Получи загрузку (get_team_workload).
2. Найди перегруженных (много часов, просрочки) и свободных сотрудников.
3. Для задач перегруженных сотрудников, которые ещё не в работе (backlog/todo),
   предложи перераспределение (suggest_assignees), учитывая опыт.
4. Ничего не переназначай без подтверждения пользователя.
"""


PROMPTS = (plan_task_assignment, plan_task_decomposition, daily_digest, review_team_workload)
