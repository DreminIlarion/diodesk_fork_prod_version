// pages/DashboardPage.tsx

import { useEffect, useMemo, useState, useCallback, type PropsWithChildren } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  FileText,
  Flame,
  FolderOpen,
  Loader2,
  Moon,
  Package,
  Plus,
  Search,
  Sparkles,
  Sun,
  Ticket,
  Timer,
  UserCheck,
} from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import {
  ticketsApi,
  counterpartiesApi,
  projectsApi,
  productsApi,
} from '../api/client';

import type {
  TicketListItem,
  Counterparty,
  Project,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Русификация                                                                */
/* -------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: {
    label: 'Новый',
    color: 'status-new',
  },
  pending_approval: {
    label: 'На согласовании',
    color: 'status-agreement',
  },
  open: {
    label: 'Открыт',
    color: 'status-open',
  },
  in_progress: {
    label: 'В работе',
    color: 'status-progress',
  },
  waiting: {
    label: 'Ожидает ответа',
    color: 'status-waiting',
  },
  resolved: {
    label: 'Решён',
    color: 'status-resolved',
  },
  closed: {
    label: 'Закрыт',
    color: 'status-closed',
  },
  reopened: {
    label: 'Переоткрыт',
    color: 'status-reopened',
  },
  rejected: {
    label: 'Отклонён',
    color: 'status-rejected',
  },
};

const PRIORITY_MAP: Record<
  string,
  {
    label: string;
    color: string;
    bar: string;
  }
> = {
  low: {
    label: 'Низкий',
    color: 'priority-low',
    bar: 'status-bar-resolved',
  },
  medium: {
    label: 'Средний',
    color: 'priority-medium',
    bar: 'status-bar-progress',
  },
  high: {
    label: 'Высокий',
    color: 'priority-high',
    bar: 'status-bar-waiting',
  },
  critical: {
    label: 'Критический',
    color: 'priority-critical',
    bar: 'status-bar-reopened',
  },
};

const getStatusLabel = (status: string) =>
  STATUS_MAP[status]?.label || status;

const getStatusColor = (status: string) =>
  STATUS_MAP[status]?.color || 'status-closed';

const getPriorityLabel = (priority: string) =>
  PRIORITY_MAP[priority]?.label || priority;

const getPriorityColor = (priority: string) =>
  PRIORITY_MAP[priority]?.color || 'priority-medium';

const getPriorityBar = (priority: string) =>
  PRIORITY_MAP[priority]?.bar || '';

function toShortName(fullName: string | null | undefined): string {
  if (!fullName) return '—';

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0];
  }

  const [lastName, firstName, middleName] = parts;

  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('');

  return initials ? `${lastName} ${initials}` : lastName;
}

/* -------------------------------------------------------------------------- */
/* Вспомогательные компоненты                                                 */
/* -------------------------------------------------------------------------- */

const Panel = ({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) => {
  return (
    <section
      className={[
        ' overflow-hidden rounded-2xl border border-[var(--border-color)] shadow-sm',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
};

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 6) {
    return {
      text: 'Доброй ночи',
      icon: Moon,
    };
  }

  if (hour < 12) {
    return {
      text: 'Доброе утро',
      icon: Sun,
    };
  }

  if (hour < 18) {
    return {
      text: 'Добрый день',
      icon: CloudSun,
    };
  }

  return {
    text: 'Добрый вечер',
    icon: Moon,
  };
};

/* -------------------------------------------------------------------------- */
/* График активности                                                           */
/* -------------------------------------------------------------------------- */

type ChartPoint = {
  label: string;
  value: number;
  isToday?: boolean;
};

const BarChart = ({ data }: { data: ChartPoint[] }) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div>
      <div className="flex h-48 items-end gap-2 border-b border-[var(--border-color)]">
        {data.map((item, index) => {
          const hasValue = item.value > 0;
          const height = hasValue
            ? Math.max((item.value / maxValue) * 100, 10)
            : 3;

          return (
            <div
              key={`${item.label}-${index}`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <span
                className={[
                  'h-5 text-xs font-semibold tabular-nums',
                  item.isToday
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-primary)]/45',
                ].join(' ')}
              >
                {hasValue ? item.value : ''}
              </span>

              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={[
                    'w-full max-w-10 rounded-t-md transition-all duration-500',
                    item.isToday
                      ? 'bg-[var(--accent)]'
                      : hasValue
                        ? 'bg-[var(--hover-2)]'
                        : 'bg-[var(--hover-1)]',
                  ].join(' ')}
                  style={{ height: `${height}%` }}
                />
              </div>

              <span
                className={[
                  'text-xs font-medium',
                  item.isToday
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-primary)]/40',
                ].join(' ')}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-[var(--text-primary)]/40">
        {total > 0
          ? `${total} заявок за последние 7 дней`
          : 'Нет активности за последние 7 дней'}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Основной компонент                                                          */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [counterparty, setCounterparty] =
    useState<Counterparty | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [productsCount, setProductsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const userRoles = user?.roles ?? [];

  const isCustomer =
    userRoles.includes('customer') ||
    userRoles.includes('customer_admin');

  const isSupport =
    userRoles.includes('admin') ||
    userRoles.includes('support_manager') ||
    userRoles.includes('support_agent');

  const greeting = useMemo(() => getGreeting(), []);
  const GreetingIcon = greeting.icon;

  const displayName =
    user?.full_name ||
    user?.username ||
    'коллега';

  /* ------------------------------------------------------------------------ */
  /* Загрузка данных                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const ticketsPromise: Promise<TicketListItem[]> =
          ticketsApi
            .getAll(1, 100)
            .then((response) => response.items ?? [])
            .catch(() => []);

        const projectsPromise: Promise<Project[]> = (
          isCustomer
            ? projectsApi.getMyProjects('all', 1, 5)
            : projectsApi.getAll(1, 5)
        )
          .then((response) => response.items ?? [])
          .catch(() => []);

        const counterpartyPromise: Promise<Counterparty | null> =
          isCustomer && user?.counterparty_id
            ? counterpartiesApi
                .getById(user.counterparty_id)
                .catch(() => null)
            : Promise.resolve(null);

        const counterpartiesPromise: Promise<Counterparty[]> = isSupport
          ? counterpartiesApi
              .getAll(1, 5)
              .then((response) => response.items ?? [])
              .catch(() => [])
          : Promise.resolve([]);

        const productsPromise: Promise<number> = productsApi
          .getProducts({
            page: 1,
            size: 1,
          })
          .then((response) => response.total_items ?? 0)
          .catch(() => 0);

        const [
          ticketsData,
          projectsData,
          counterpartyData,
          counterpartiesData,
          productsTotal,
        ] = await Promise.all([
          ticketsPromise,
          projectsPromise,
          counterpartyPromise,
          counterpartiesPromise,
          productsPromise,
        ]);

        if (cancelled) return;

        setTickets(ticketsData);
        setProjects(projectsData);
        setCounterparty(counterpartyData);
        setCounterparties(counterpartiesData);
        setProductsCount(productsTotal);
      } catch (error) {
        console.error('Dashboard load error:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [
    isCustomer,
    isSupport,
    user?.counterparty_id,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Статистика                                                                */
  /* ------------------------------------------------------------------------ */

  const stats = {
    total: tickets.length,

    new: tickets.filter(
      (ticket) => ticket.status === 'new',
    ).length,

    inProgress: tickets.filter((ticket) =>
      [
        'pending_approval',
        'open',
        'in_progress',
        'waiting',
      ].includes(ticket.status),
    ).length,

    critical: tickets.filter(
      (ticket) =>
        ticket.priority === 'critical' &&
        !['resolved', 'closed'].includes(ticket.status),
    ).length,

    resolved: tickets.filter((ticket) =>
      ['resolved', 'closed'].includes(ticket.status),
    ).length,

    waiting: tickets.filter(
      (ticket) => ticket.status === 'waiting',
    ).length,
  };

  const resolvePercent =
    stats.total > 0
      ? Math.round((stats.resolved / stats.total) * 100)
      : 0;

  /* ------------------------------------------------------------------------ */
  /* Активность за последние 7 дней                                           */
  /* ------------------------------------------------------------------------ */

  const ticketsLast7Days = useMemo<ChartPoint[]>(() => {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 6);

    return Array.from({ length: 7 }, (_, index) => {
      const dayStart = new Date(firstDay);
      dayStart.setDate(firstDay.getDate() + index);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);

      const value = tickets.filter((ticket) => {
        const createdAt = new Date(ticket.created_at).getTime();

        return (
          createdAt >= dayStart.getTime() &&
          createdAt < dayEnd.getTime()
        );
      }).length;

      const shortWeekday = dayStart
        .toLocaleDateString('ru-RU', {
          weekday: 'short',
        })
        .replace('.', '');

      const label =
        shortWeekday.charAt(0).toUpperCase() +
        shortWeekday.slice(1);

      return {
        label,
        value,
        isToday: index === 6,
      };
    });
  }, [tickets]);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleSearch = () => {
    const query = searchQuery.trim();

    if (!query) return;

    navigate(`/tickets?search=${encodeURIComponent(query)}`);
  };

  const displayedTickets = tickets.slice(0, 7);

  const goToTickets = useCallback(
  (opts?: { status?: string[]; priority?: string }) => {
    const params = new URLSearchParams();

    // multi: status=open&status=in_progress
    (opts?.status ?? []).forEach((s) => params.append('status', s));

    // single: priority=critical
    if (opts?.priority) params.set('priority', opts.priority);

    const qs = params.toString();
    navigate(qs ? `/tickets?${qs}` : '/tickets');
  },
  [navigate],
);

 const ACTIVE_STATUSES = [
  'pending_approval',
  'open',
  'in_progress',
  'waiting',
];

const RESOLVED_STATUSES = ['resolved', 'closed'];

const statCards = [
  {
    label: 'Всего заявок',
    value: stats.total,
    description: stats.new > 0 ? `${stats.new} новых` : 'Новых заявок нет',
    icon: Ticket,
    iconColor: 'text-[var(--info)]',
    iconBackground: 'bg-[var(--info)]/10',
    onClick: () => goToTickets(),
  },
  {
    label: 'Активные заявки',
    value: stats.inProgress,
    description: 'Требуют внимания',
    icon: Timer,
    iconColor: 'text-[var(--status-open-text)]',
    iconBackground: 'bg-[var(--status-open-bg)]',
    onClick: () => goToTickets({ status: ACTIVE_STATUSES }),
  },
  {
    label: 'Критические',
    value: stats.critical,
    description: stats.critical > 0 ? 'Нужно проверить в первую очередь' : 'Критичных заявок нет',
    icon: Flame,
    iconColor: 'text-[var(--accent)]',
    iconBackground: 'bg-[var(--accent-soft)]',
    onClick: () => goToTickets({ status: ACTIVE_STATUSES, priority: 'critical' }),
  },
  {
    label: 'Решено',
    value: stats.resolved,
    description: `${resolvePercent}% от загруженных заявок`,
    icon: CheckCircle2,
    iconColor: 'text-[var(--success)]',
    iconBackground: 'bg-[var(--success)]/10',
    onClick: () => goToTickets({ status: RESOLVED_STATUSES }),
  },
];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-9 w-9 animate-spin text-[var(--accent)]" />

        <p className="text-base text-[var(--text-primary)]/45">
          Загружаем данные…
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-8 pb-8 animate-in fade-in duration-500">
      {/* ------------------------------------------------------------------ */}
      {/* Верхний блок                                                        */}
      {/* ------------------------------------------------------------------ */}

      <header className=" rounded-2xl border border-[var(--border-color)] p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-lg bg-[var(--hover-1)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]/55">
              <GreetingIcon className="h-4 w-4" />
              {greeting.text}
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-[44px] lg:leading-[1.1]">
              Главная страница
            </h1>

            <p className="mt-4 text-base text-[var(--text-primary)]/50 lg:text-lg">
              {new Date().toLocaleDateString('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSearch();
              }}
              className="relative w-full sm:w-72 xl:w-80"
            >
              <button
                type="submit"
                aria-label="Найти заявку"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 transition-colors hover:text-[var(--accent)]"
              >
                <Search className="h-5 w-5" />
              </button>

              <input
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="Поиск заявок"
                className="h-12 w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] pl-12 pr-4 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-primary)]/35 focus:border-[var(--accent)]"
              />
            </form>

            <button
              type="button"
              onClick={() => navigate('/tickets/new')}
              className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-transform "
            >
              <Plus className="h-5 w-5" />
              <span>Создать заявку</span>
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Карточки статистики                                                 */}
      {/* ------------------------------------------------------------------ */}

      <section
        aria-label="Статистика"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
                <button
      key={card.label}
      type="button"
      onClick={card.onClick}
      className="rounded-2xl border border-[var(--border-color)] p-5 shadow-sm
                 transition-[border-color,transform] duration-200
                 hover:-translate-y-0.5 hover:border-[var(--border-hover)]
                 lg:p-6 text-left w-full
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
    >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]/50 lg:text-base">
                    {card.label}
                  </p>

                  <p className="mt-3 text-4xl font-bold leading-none tracking-tight text-[var(--text-primary)] tabular-nums">
                    {card.value}
                  </p>
                </div>

                <div
                  className={[
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    card.iconBackground,
                  ].join(' ')}
                >
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>

              <p className="mt-5 min-h-5 text-sm leading-5 text-[var(--text-primary)]/40">
                {card.description}
              </p>
            </button>
          );
        })}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Основной контент                                                    */}
      {/* ------------------------------------------------------------------ */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Последние заявки */}
        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <Ticket className="h-5 w-5 text-[var(--accent)]" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Последние заявки
                </h2>

                <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
                  {tickets.length > 0
                    ? 'Недавняя активность по обращениям'
                    : 'Здесь появятся ваши обращения'}
                </p>
              </div>
            </div>

            <Link
              to="/tickets"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] lg:text-base"
            >
              Все заявки
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {displayedTickets.length === 0 ? (
            <div className="px-6 py-16 text-center lg:py-20">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--hover-1)]">
                <FileText className="h-8 w-8 text-[var(--text-primary)]/20" />
              </div>

              <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
                Заявок пока нет
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-base leading-6 text-[var(--text-primary)]/45">
                Создайте первую заявку, чтобы начать работу с поддержкой.
              </p>

              <button
                type="button"
                onClick={() => navigate('/tickets/new')}
                className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold"
              >
                <Sparkles className="h-4 w-4" />
                Создать заявку
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {displayedTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/tickets/${ticket.number}`}
                  className="group relative flex gap-4 px-5 py-5 transition-colors hover:bg-[var(--hover-1)] lg:px-6"
                >
                  <div
                    className={[
                      'absolute inset-y-5 left-0 w-1 rounded-r-full opacity-70 transition-opacity group-hover:opacity-100',
                      getPriorityBar(ticket.priority),
                    ].join(' ')}
                  />

                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex items-start justify-between gap-4">
                      <p className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                        {ticket.title}
                      </p>

                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-sm text-[var(--text-primary)]/50">
                          {formatDate(ticket.created_at)}
                        </p>

                        <p className="mt-0.5 text-xs text-[var(--text-primary)]/30">
                          {formatTime(ticket.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-[var(--text-primary)]/45">
                        #{ticket.number}
                      </span>

                      <span
                        className={[
                          'rounded-md border px-2 py-1 text-xs font-medium',
                          getStatusColor(ticket.status),
                        ].join(' ')}
                      >
                        {getStatusLabel(ticket.status)}
                      </span>

                      <span
                        className={[
                          'rounded-md border px-2 py-1 text-xs font-medium',
                          getPriorityColor(ticket.priority),
                        ].join(' ')}
                      >
                        {getPriorityLabel(ticket.priority)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-primary)]/40">
                      {ticket.counterparty?.name && (
                        <span className="flex min-w-0 max-w-[180px] items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {ticket.counterparty.name}
                          </span>
                        </span>
                      )}

                      {ticket.project?.key && (
                        <span className="flex items-center gap-1.5 font-mono">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          {ticket.project.key}
                        </span>
                      )}

                      {ticket.assignee?.full_name && (
                        <span className="flex min-w-0 max-w-[160px] items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {toShortName(ticket.assignee.full_name)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--text-primary)]/20 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {/* Правая колонка */}
        <div className="space-y-6">
          {/* Активность */}
          <Panel className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Активность
                </h2>

                <p className="mt-1 text-sm text-[var(--text-primary)]/40">
                  Заявки за последние 7 дней
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hover-1)]">
                <BarChart3 className="h-5 w-5 text-[var(--text-primary)]/50" />
              </div>
            </div>

            <div className="mt-6">
              <BarChart data={ticketsLast7Days} />
            </div>
          </Panel>

          {/* Проекты */}
          <Panel>
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Проекты
                </h2>

                <p className="mt-1 text-sm text-[var(--text-primary)]/40">
                  Недавние проекты
                </p>
              </div>

              <Link
                to="/projects"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              >
                Все
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <FolderOpen className="mx-auto h-10 w-10 text-[var(--text-primary)]/15" />

                <p className="mt-3 text-base text-[var(--text-primary)]/45">
                  Проектов пока нет
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {projects.slice(0, 4).map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="group flex items-center gap-3 px-6 py-4 transition-colors hover:bg-[var(--hover-1)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-open-bg)]">
                      <FolderOpen className="h-5 w-5 text-[var(--status-open-text)]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                        {project.name}
                      </p>

                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-sm text-[var(--text-primary)]/40">
                          {project.key}
                        </span>

                        <span
                          className={[
                            'rounded border px-1.5 py-0.5 text-xs font-medium',
                            project.status === 'active'
                              ? 'status-resolved'
                              : 'status-closed',
                          ].join(' ')}
                        >
                          {project.status === 'active'
                            ? 'Активен'
                            : 'Архив'}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-primary)]/20 transition-colors group-hover:text-[var(--accent)]" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* Контрагенты для поддержки */}
          {isSupport && counterparties.length > 0 && (
            <Panel>
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    Контрагенты
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-primary)]/40">
                    Последние контрагенты
                  </p>
                </div>

                <Link
                  to="/counterparties"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                >
                  Все
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="divide-y divide-[var(--border-color)]">
                {counterparties.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    to={`/counterparties/${item.id}`}
                    className="group flex items-center gap-3 px-6 py-4 transition-colors hover:bg-[var(--hover-1)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-waiting-bg)]">
                      <Building2 className="h-5 w-5 text-[var(--status-waiting-text)]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                        {item.name}
                      </p>

                      {item.inn && (
                        <p className="mt-1 font-mono text-sm text-[var(--text-primary)]/40">
                          ИНН {item.inn}
                        </p>
                      )}
                    </div>

                    <span
                      className={[
                        'shrink-0 rounded-md border px-2 py-1 text-xs font-medium',
                        item.is_active
                          ? 'status-resolved'
                          : 'status-closed',
                      ].join(' ')}
                    >
                      {item.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {/* Компания клиента */}
          {isCustomer && counterparty && (
            <Panel className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
                  <Building2 className="h-6 w-6 text-white" />
                </div>

                <div className="min-w-0">
                  <p className="text-sm text-[var(--text-primary)]/40">
                    Ваша компания
                  </p>

                  <h2 className="mt-1 truncate text-lg font-bold text-[var(--text-primary)]">
                    {counterparty.name}
                  </h2>
                </div>
              </div>

              <div className="mt-6 space-y-3 border-t border-[var(--border-color)] pt-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[var(--text-primary)]/45">
                    Тип
                  </span>

                  <span className="text-right text-sm font-medium text-[var(--text-primary)]/75">
                    {counterparty.counterparty_type || 'Контрагент'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[var(--text-primary)]/45">
                    ИНН
                  </span>

                  <span className="rounded-md bg-[var(--hover-1)] px-2 py-1 font-mono text-sm text-[var(--text-primary)]/75">
                    {counterparty.inn || '—'}
                  </span>
                </div>
              </div>

              <Link
                to="/my-company"
                className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--hover-1)] px-4 text-base font-medium text-[var(--text-primary)]/70 transition-colors hover:text-[var(--text-primary)]"
              >
                Подробнее
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Panel>
          )}

          {/* Сводка для поддержки */}
          {isSupport && (
            <Panel className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    Справочники
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-primary)]/40">
                    Загруженные данные
                  </p>
                </div>

                <Package className="h-5 w-5 text-[var(--text-primary)]/40" />
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-[var(--hover-1)]">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-[var(--text-primary)]/45" />

                    <span className="text-sm text-[var(--text-primary)]/60">
                      Контрагенты в списке
                    </span>
                  </div>

                  <span className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {counterparties.length}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-[var(--hover-1)]">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-[var(--text-primary)]/45" />

                    <span className="text-sm text-[var(--text-primary)]/60">
                      Проекты в списке
                    </span>
                  </div>

                  <span className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {projects.length}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-[var(--hover-1)]">
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-[var(--text-primary)]/45" />

                    <span className="text-sm text-[var(--text-primary)]/60">
                      Продуктов в каталоге
                    </span>
                  </div>

                  <span className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                    {productsCount}
                  </span>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}