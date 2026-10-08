"""
Тестовые пользователи и демо-данные для разработки и демонстраций.

Демо-данные дают историю выполненных задач и текущую загрузку команды (на них
работает подбор исполнителей через MCP), клиентов и заявки в разных статусах:
часть заявок уже разобрана на пулы задач, часть ждёт планирования.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import session_factory
from src.crm.domain.entities import Counterparty
from src.crm.domain.vo import CounterpartyType, Inn, Kpp, Phone
from src.crm.infra.repos import SqlCounterpartyRepository
from src.iam.domain.entities import User
from src.iam.domain.vo import Email, FullName, PasswordHash, UserRole
from src.iam.infra.repos import SqlUserRepository
from src.iam.security import hash_password
from src.shared.domain.vo import Priority, Tag
from src.shared.schemas import Pagination
from src.shared.utils.time import current_datetime
from src.tasks.domain.dtos import TaskSearchFilters
from src.tasks.domain.entities import Task
from src.tasks.domain.vo import TaskNumber, TaskStatus
from src.tasks.infra.repos import SqlTaskRepository
from src.tickets.domain.entities import Ticket
from src.tickets.domain.vo import TicketNumber, TicketStatus, TicketType
from src.tickets.infra.repos import SqlTicketRepository

logger = logging.getLogger(__name__)

TEST_USER_PASSWORD = "test"


@dataclass(frozen=True)
class TestUser:
    key: str
    email: str
    full_name: str
    roles: frozenset[UserRole]


TEST_USERS = (
    TestUser(
        "manager", "andrey.medvedev@test.com", "Медведев Андрей Валерьевич",
        frozenset({UserRole.SUPPORT_MANAGER, UserRole.SUPPORT_AGENT}),
    ),
    TestUser(
        "lead", "andrey.kosov@test.com", "Косов Андрей Сергеевич",
        frozenset({UserRole.SUPPORT_MANAGER, UserRole.DEVELOPER}),
    ),
    TestUser("backend", "ivan.petrov@test.com", "Петров Иван Сергеевич",
             frozenset({UserRole.DEVELOPER})),
    TestUser("frontend", "anna.smirnova@test.com", "Смирнова Анна Олеговна",
             frozenset({UserRole.DEVELOPER})),
    TestUser("integrations", "oleg.kuznetsov@test.com", "Кузнецов Олег Петрович",
             frozenset({UserRole.DEVELOPER})),
    TestUser("support", "maria.volkova@test.com", "Волкова Мария Андреевна",
             frozenset({UserRole.SUPPORT_AGENT})),
    TestUser("support_senior", "elena.novikova@test.com", "Новикова Елена Игоревна",
             frozenset({UserRole.SUPPORT_AGENT})),
)


@dataclass(frozen=True)
class DemoTask:
    title: str
    tags: tuple[str, ...]
    status: TaskStatus
    assignee: str | None = None
    description: str | None = None
    priority: Priority = Priority.MEDIUM
    estimated_hours: Decimal | None = None
    actual_hours: Decimal | None = None
    due_in_days: int | None = None
    story_points: int | None = None


DONE, IN_PROGRESS, TODO, BACKLOG = (
    TaskStatus.DONE, TaskStatus.IN_PROGRESS, TaskStatus.TODO, TaskStatus.BACKLOG,
)

DEMO_TASKS = (
    # История: выполненные задачи формируют профиль опыта
    DemoTask("Оптимизировать запросы канбан-доски", ("python", "postgresql", "производительность"),
             DONE, "backend", "Убрать N+1 при загрузке задач и заявок", estimated_hours=Decimal(6),
             actual_hours=Decimal(7), story_points=5),
    DemoTask("Добавить фильтр задач по тегам в API", ("python", "fastapi", "api"), DONE, "backend",
             estimated_hours=Decimal(4), actual_hours=Decimal(3), story_points=3),
    DemoTask("Реализовать экспорт заявок в CSV", ("python", "fastapi", "отчёты"), DONE, "backend",
             estimated_hours=Decimal(5), actual_hours=Decimal(6), story_points=3),
    DemoTask("Настроить индексы для полнотекстового поиска заявок", ("postgresql", "поиск"), DONE,
             "backend", estimated_hours=Decimal(3), actual_hours=Decimal(4), story_points=2),
    DemoTask("Сверстать карточку задачи на канбан-доске", ("react", "typescript", "ui"), DONE,
             "frontend", estimated_hours=Decimal(6), actual_hours=Decimal(5), story_points=5),
    DemoTask("Добавить фильтры на странице заявок", ("react", "ui"), DONE, "frontend",
             estimated_hours=Decimal(4), actual_hours=Decimal(4), story_points=3),
    DemoTask("Исправить вёрстку уведомлений на мобильных", ("react", "css", "ui"), DONE, "frontend",
             estimated_hours=Decimal(2), actual_hours=Decimal(3), story_points=2),
    DemoTask("Настроить обмен заявками с 1С УФФ", ("1с", "интеграция", "обмен данными"), DONE,
             "integrations", estimated_hours=Decimal(12), actual_hours=Decimal(16), story_points=8),
    DemoTask("Выгрузка листов учёта рабочего времени в 1С", ("1с", "интеграция", "трудозатраты"),
             DONE, "integrations", estimated_hours=Decimal(8), actual_hours=Decimal(10),
             story_points=5),
    DemoTask("Обработка ошибок обмена с 1С", ("1с", "интеграция"), DONE, "integrations",
             estimated_hours=Decimal(5), actual_hours=Decimal(4), story_points=3),
    DemoTask("Консультация клиента по настройке ролей", ("консультация", "настройка"), DONE,
             "support", estimated_hours=Decimal(1), actual_hours=Decimal(1), story_points=1),
    DemoTask("Восстановить доступ пользователю контрагента", ("доступ", "консультация"), DONE,
             "support", estimated_hours=Decimal(1), actual_hours=Decimal("0.5"), story_points=1),

    # Текущая загрузка
    DemoTask("Добавить API статистики по задачам", ("python", "fastapi", "api"), IN_PROGRESS,
             "backend", estimated_hours=Decimal(8), due_in_days=3, story_points=5),
    DemoTask("Рефакторинг сервиса уведомлений", ("python", "rabbitmq"), TODO, "backend",
             estimated_hours=Decimal(6), story_points=5),
    DemoTask("Синхронизация справочника контрагентов с 1С", ("1с", "интеграция"), IN_PROGRESS,
             "integrations", estimated_hours=Decimal(16), due_in_days=-2, story_points=8,
             priority=Priority.HIGH),
    DemoTask("Тёмная тема для страницы проектов", ("react", "ui"), TODO, "frontend",
             estimated_hours=Decimal(4), story_points=3),

    # Свободные задачи
    DemoTask("Отчёт по просроченным заявкам", ("postgresql", "отчёты"), TODO,
             description="SQL-отчёт: просроченные заявки по контрагентам и исполнителям",
             priority=Priority.HIGH, estimated_hours=Decimal(5), story_points=3),
    DemoTask("Форма обратной связи на React", ("react", "ui", "typescript"), BACKLOG,
             story_points=3),
    DemoTask("Загрузка актов выполненных работ из 1С", ("1с", "интеграция"), TODO,
             priority=Priority.CRITICAL, due_in_days=2, story_points=5),
    DemoTask("Инструкция для клиентов по созданию заявок", ("консультация", "документация"),
             BACKLOG, priority=Priority.LOW, story_points=2),
)

@dataclass(frozen=True)
class DemoCounterparty:
    key: str
    name: str
    legal_name: str
    inn: str
    kpp: str
    phone: str
    email: str


DEMO_COUNTERPARTIES = (
    DemoCounterparty(
        "north_wind", "Северный ветер", "ООО «Северный ветер»", "6658012345", "665801001",
        "+73432001020", "it@north-wind.example",
    ),
    DemoCounterparty(
        "ural_logistic", "Урал Логистик", "АО «Урал Логистик»", "6671098765", "667101001",
        "+73432003040", "support@ural-logistic.example",
    ),
)

NEW, OPEN, TICKET_IN_PROGRESS, RESOLVED = (
    TicketStatus.NEW, TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED,
)


@dataclass(frozen=True)
class DemoTicket:
    title: str
    description: str
    ticket_type: TicketType
    priority: Priority
    status: TicketStatus
    tags: tuple[str, ...]
    counterparty: str | None = None
    assignee: str | None = None
    # Пул задач по заявке; без задач заявку можно спланировать через MCP
    tasks: tuple[DemoTask, ...] = ()


DEMO_TICKETS = (
    DemoTicket(
        "Автоматическое создание заявок из обращений на портале",
        """\
Клиенту нужно, чтобы обращения с корпоративного портала автоматически превращались в заявки.

Требования:
- приём обращений с портала через API (вебхук), проверка подписи запроса;
- создание заявки с привязкой к контрагенту по email отправителя;
- уведомление автора обращения о номере созданной заявки;
- выгрузка созданных заявок в 1С УФФ для учёта трудозатрат;
- страница настроек интеграции в веб-интерфейсе (URL, секрет, включение/отключение).
""",
        TicketType.CHANGE, Priority.HIGH, NEW, ("интеграция", "портал"),
        counterparty="north_wind",
    ),
    DemoTicket(
        "Не выгружаются акты выполненных работ в 1С УФФ",
        """\
С понедельника акты за сентябрь не попадают в 1С УФФ, бухгалтерия не может закрыть месяц.
В журнале обмена ошибка 500 на этапе отправки пакета. Нужно восстановить выгрузку
и догрузить пропущенные акты.
""",
        TicketType.INCIDENT, Priority.CRITICAL, TICKET_IN_PROGRESS, ("1с", "интеграция"),
        counterparty="ural_logistic", assignee="integrations",
        tasks=(
            DemoTask("Разобрать ошибки обмена в журнале 1С УФФ", ("1с", "интеграция"), DONE,
                     "integrations", estimated_hours=Decimal(2), actual_hours=Decimal(2),
                     story_points=2),
            DemoTask("Исправить формирование пакета актов", ("1с", "интеграция", "python"),
                     IN_PROGRESS, "integrations", estimated_hours=Decimal(6), due_in_days=1,
                     story_points=5, priority=Priority.CRITICAL),
            DemoTask("Догрузить пропущенные акты за сентябрь", ("1с", "обмен данными"), TODO,
                     estimated_hours=Decimal(3), due_in_days=2, story_points=3,
                     priority=Priority.HIGH),
        ),
    ),
    DemoTicket(
        "Медленно открывается канбан-доска заявок",
        """\
У операторов поддержки доска заявок открывается 10-15 секунд, с фильтром по контрагенту -
ещё дольше. Проблема появилась после роста числа заявок до нескольких тысяч.
""",
        TicketType.PROBLEM, Priority.HIGH, OPEN, ("производительность", "postgresql", "ui"),
        assignee="lead",
    ),
    DemoTicket(
        "Отчёт по трудозатратам сотрудников в Excel",
        """\
Руководителю нужен ежемесячный отчёт по трудозатратам: сотрудник, задача, заявка, часы
по оценке и фактические. Выгрузка в Excel из веб-интерфейса, фильтры по периоду и проекту.
""",
        TicketType.IMPROVEMENT, Priority.MEDIUM, OPEN, ("отчёты", "трудозатраты"),
        counterparty="north_wind",
    ),
    DemoTicket(
        "Не приходит письмо с приглашением в систему",
        """\
Новые сотрудники клиента не получают письмо со ссылкой-приглашением. В спаме письма нет,
повторная отправка не помогает. Затронуто три приглашения за последнюю неделю.
""",
        TicketType.INCIDENT, Priority.HIGH, TICKET_IN_PROGRESS, ("уведомления", "доступ"),
        counterparty="ural_logistic", assignee="support",
        tasks=(
            DemoTask("Проверить доставку писем в почтовом сервисе", ("уведомления", "почта"),
                     IN_PROGRESS, "support", estimated_hours=Decimal(1), story_points=1),
        ),
    ),
    DemoTicket(
        "Как настроить роли для сотрудников филиала",
        """\
Клиент открыл филиал и просит помочь настроить роли: руководитель филиала должен видеть
все заявки филиала, сотрудники - только свои.
""",
        TicketType.QUESTION, Priority.LOW, RESOLVED, ("консультация", "настройка"),
        counterparty="north_wind", assignee="support_senior",
    ),
)


async def _ensure_user(user_repo: SqlUserRepository, test_user: TestUser) -> User:
    email = Email(test_user.email)
    if (existing := await user_repo.get_by_email(email)) is not None:
        return existing

    user = User(
        email=email,
        full_name=FullName(test_user.full_name),
        password_hash=PasswordHash(hash_password(TEST_USER_PASSWORD)),
        roles=set(test_user.roles),
    )
    await user_repo.create(user)
    logger.info("Test user created: %s", test_user.email)
    return user


async def _ensure_users(session: AsyncSession) -> dict[str, User]:
    user_repo = SqlUserRepository(session)
    return {test_user.key: await _ensure_user(user_repo, test_user) for test_user in TEST_USERS}


async def _ensure_counterparties(session: AsyncSession) -> dict[str, Counterparty]:
    repo = SqlCounterpartyRepository(session)
    counterparties: dict[str, Counterparty] = {}

    for demo in DEMO_COUNTERPARTIES:
        inn = Inn(demo.inn)
        if (counterparty := await repo.get_by_inn(inn)) is None:
            counterparty = Counterparty(
                counterparty_type=CounterpartyType.LEGAL_ENTITY,
                name=demo.name,
                legal_name=demo.legal_name,
                inn=inn,
                kpp=Kpp(demo.kpp),
                phone=Phone(demo.phone),
                email=demo.email,
            )
            await repo.create(counterparty)
        counterparties[demo.key] = counterparty

    return counterparties


async def create_test_users() -> None:
    """Создание тестовых сотрудников (пароль у всех - `test`)."""

    async with session_factory() as session:
        await _ensure_users(session)
        await session.commit()


def _build_task(
        demo: DemoTask,
        number: TaskNumber,
        users: dict[str, User],
        author: User,
        ticket_id: UUID | None = None,
) -> Task:
    today = current_datetime().date()
    task = Task.create(
        number=number,
        title=demo.title,
        description=demo.description,
        created_by=author.id,
        priority=demo.priority,
        ticket_id=ticket_id,
        estimated_hours=demo.estimated_hours,
        story_points=demo.story_points,
        due_date=None if demo.due_in_days is None else today + timedelta(days=demo.due_in_days),
        tags=[Tag(name=tag) for tag in demo.tags],
    )

    if demo.assignee is not None:
        task.assign_to(users[demo.assignee].id, assigned_by=author.id)

    path = {
        BACKLOG: (),
        TODO: (TODO,),
        IN_PROGRESS: (TODO, IN_PROGRESS),
        DONE: (TODO, IN_PROGRESS, DONE),
    }[demo.status]
    for status in path:
        task.change_status(status, changed_by=author.id)

    if demo.actual_hours:
        task.add_actual_hours(demo.actual_hours)

    return task


def _advance_ticket(ticket: Ticket, demo: DemoTicket, users: dict[str, User], author: User) -> None:
    """Проводит заявку до нужного статуса теми же переходами workflow, что и в работе."""

    if demo.status is NEW:
        return

    ticket.submit_for_approval(author.id)
    ticket.approve(author.id)

    assignee = author if demo.assignee is None else users[demo.assignee]
    if demo.assignee is not None:
        ticket.assign(assignee.id, assigned_by=author.id)

    if demo.status in {TICKET_IN_PROGRESS, RESOLVED}:
        ticket.start_progress(assignee.id)
    if demo.status is RESOLVED:
        ticket.resolve(assignee.id)


async def _create_ticket(
        session: AsyncSession,
        demo: DemoTicket,
        users: dict[str, User],
        author: User,
        counterparties: dict[str, Counterparty],
) -> Ticket:
    """Заявка с пулом задач; номера - как при создании через сервис."""

    ticket_repo = SqlTicketRepository(session)
    counterparty = None if demo.counterparty is None else counterparties[demo.counterparty]
    counterparty_id = None if counterparty is None else counterparty.id

    ticket = Ticket.create(
        number=TicketNumber.create(
            await ticket_repo.get_total(counterparty_id=counterparty_id),
            counterparty_name=None if counterparty is None else counterparty.name,
        ),
        reporter_id=author.id,
        created_by=author.id,
        created_by_role=UserRole.SUPPORT_MANAGER,
        title=demo.title,
        description=demo.description,
        ticket_type=demo.ticket_type,
        priority=demo.priority,
        counterparty_id=counterparty_id,
        tags=[Tag(name=tag) for tag in demo.tags],
    )
    _advance_ticket(ticket, demo, users, author)
    await ticket_repo.create(ticket)
    # Сессия без autoflush: номер следующей заявки считается по уже записанным
    await session.flush()

    task_repo = SqlTaskRepository(session)
    for demo_task in demo.tasks:
        sequence = await task_repo.get_next_sequence(ticket_id=ticket.id)
        number = TaskNumber.create(sequence, ticket_number=ticket.number)
        await task_repo.create(_build_task(demo_task, number, users, author, ticket_id=ticket.id))

    return ticket


async def seed_demo_data() -> None:
    """
    Демо-данные: история выполненных задач, текущая загрузка, свободные задачи,
    клиенты и заявки с пулами задач. Повторный запуск ничего не дублирует.
    """

    async with session_factory() as session:
        users = await _ensure_users(session)
        author = users["manager"]

        task_repo = SqlTaskRepository(session)
        existing = await task_repo.search(
            TaskSearchFilters(created_by=author.id), Pagination(page=1, size=1),
        )
        if existing.total_items:
            logger.warning("Demo data already exists, skipping")
            return

        for demo in DEMO_TASKS:
            sequence = await task_repo.get_next_sequence()
            await task_repo.create(_build_task(demo, TaskNumber.create(sequence), users, author))

        counterparties = await _ensure_counterparties(session)
        tickets = [
            await _create_ticket(session, demo, users, author, counterparties)
            for demo in DEMO_TICKETS
        ]

        await session.commit()
        logger.info(
            "Demo data created: %s tasks, tickets: %s",
            len(DEMO_TASKS) + sum(len(demo.tasks) for demo in DEMO_TICKETS),
            ", ".join(str(ticket.number) for ticket in tickets),
        )

