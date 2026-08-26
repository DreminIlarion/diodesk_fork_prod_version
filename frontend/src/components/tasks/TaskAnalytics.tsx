import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  PlayCircle,
} from 'lucide-react';

import { tasksApi } from '../../api/client';

import type {
  TaskKanbanContext,
  TaskKanbanItem,
  TaskPriority,
  TaskStatus,
} from '../../types';

type AnalyticsTask = TaskKanbanItem & {
  description?: string | null;

  estimated_hours?:
  | number
  | string
  | null;

  actual_hours?:
  | number
  | string
  | null;

  due_date?: string | null;

  started_at?: string | null;
  completed_at?: string | null;
  working_since?: string | null;
};

interface TaskAnalyticsProps {
  context: TaskKanbanContext;
  priorities?: TaskPriority[];
  overdueOnly?: boolean;
  onTaskOpen?: (
    task: AnalyticsTask,
  ) => void;
}

const STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'paused',
  'blocked',
  'to_review',
  'to_fix',
  'to_test',
  'done',
  'cancelled',
];

const STATUS_LABEL: Record<
  TaskStatus,
  string
> = {
  backlog: 'В резерве',
  todo: 'Готово к выполнению',
  in_progress: 'В работе',
  paused: 'На паузе',
  blocked: 'Приостановлено',
  to_review: 'На проверке',
  to_fix: 'На доработку',
  to_test: 'На тестировании',
  done: 'Выполнено',
  cancelled: 'Отменено',
};

const STATUS_COLOR: Record<
  TaskStatus,
  string
> = {
  backlog: 'bg-gray-400',
  todo: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  paused: 'bg-gray-400',
  blocked: 'bg-red-500',
  to_review: 'bg-violet-500',
  to_fix: 'bg-orange-500',
  to_test: 'bg-cyan-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-gray-500',
};

function toNumber(
  value: unknown,
): number {
  if (
    value == null ||
    value === ''
  ) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const parsed = Number(
    String(value)
      .trim()
      .replace(',', '.'),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatHours(value: number) {
  const sign =
    value > 0 ? '' : '';

  return `${sign}${value.toLocaleString(
    'ru-RU',
    {
      maximumFractionDigits: 2,
    },
  )} ч`;
}

function formatSignedHours(
  value: number,
) {
  const sign =
    value > 0 ? '+' : '';

  return `${sign}${value.toLocaleString(
    'ru-RU',
    {
      maximumFractionDigits: 2,
    },
  )} ч`;
}

function formatPercent(
  value: number,
) {
  const sign =
    value > 0 ? '+' : '';

  return `${sign}${value.toLocaleString(
    'ru-RU',
    {
      maximumFractionDigits: 1,
    },
  )}%`;
}

function getDueTimestamp(
  dueDate?: string | null,
): number | null {
  if (!dueDate) {
    return null;
  }

  /*
   * YYYY-MM-DD трактуем как
   * конец указанного локального дня.
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      dueDate,
    )
  ) {
    const [year, month, day] =
      dueDate
        .split('-')
        .map(Number);

    return new Date(
      year,
      month - 1,
      day,
      23,
      59,
      59,
      999,
    ).getTime();
  }

  const timestamp = new Date(
    dueDate,
  ).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null;
}

/*
 * Просроченная ПРЯМО СЕЙЧАС задача.
 *
 * Выполненные сюда специально
 * не входят.
 */
function isCurrentlyOverdue(
  task: AnalyticsTask,
): boolean {
  if (
    task.status === 'done' ||
    task.status === 'cancelled'
  ) {
    return false;
  }

  const dueAt =
    getDueTimestamp(
      task.due_date,
    );

  if (dueAt == null) {
    return false;
  }

  return Date.now() > dueAt;
}

/*
 * Была ли завершённая задача
 * закончена позже дедлайна.
 */
function wasCompletedLate(
  task: AnalyticsTask,
): boolean {
  const dueAt =
    getDueTimestamp(
      task.due_date,
    );

  if (
    dueAt == null ||
    !task.completed_at
  ) {
    return false;
  }

  const completedAt =
    new Date(
      task.completed_at,
    ).getTime();

  if (
    !Number.isFinite(
      completedAt,
    )
  ) {
    return false;
  }

  return completedAt > dueAt;
}

function getCycleTimeHours(
  task: AnalyticsTask,
): number | null {
  if (
    !task.started_at ||
    !task.completed_at
  ) {
    return null;
  }

  const started =
    new Date(
      task.started_at,
    ).getTime();

  const completed =
    new Date(
      task.completed_at,
    ).getTime();

  if (
    !Number.isFinite(started) ||
    !Number.isFinite(completed) ||
    completed < started
  ) {
    return null;
  }

  return (
    (completed - started) /
    3600000
  );
}

function formatDuration(
  hours: number,
) {
  if (!Number.isFinite(hours)) {
    return '—';
  }

  if (hours < 1) {
    const minutes = Math.round(
      hours * 60,
    );

    return `${minutes} мин`;
  }

  if (hours < 24) {
    return `${hours.toLocaleString(
      'ru-RU',
      {
        maximumFractionDigits: 1,
      },
    )} ч`;
  }

  const days = Math.floor(
    hours / 24,
  );

  const remainingHours =
    Math.round(hours % 24);

  if (!remainingHours) {
    return `${days} д`;
  }

  return `${days} д ${remainingHours} ч`;
}

function StatCard({
  title,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?:
  | 'default'
  | 'success'
  | 'danger'
  | 'warning';
}) {
  const iconClasses = {
    default:
      'bg-[var(--hover-2)] text-[var(--text-primary)]/45',

    success:
      'bg-emerald-500/10 text-emerald-500',

    danger:
      'bg-red-500/10 text-red-400',

    warning:
      'bg-amber-500/10 text-amber-500',
  };

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-[var(--text-primary)]/40">
            {title}
          </div>

          <div className="mt-2 text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            {value}
          </div>

          {sub != null && (
            <div className="mt-1 text-xs text-[var(--text-primary)]/40">
              {sub}
            </div>
          )}
        </div>

        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClasses[tone]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export function TaskAnalytics({
  context,
  priorities = [],
  overdueOnly = false,
  onTaskOpen,
}: TaskAnalyticsProps) {
  const [tasks, setTasks] =
    useState<AnalyticsTask[]>(
      [],
    );

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const priorityKey =
    priorities
      .slice()
      .sort()
      .join(',');

  const load = useCallback(
    async (
      silent = false,
    ) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const collected =
          new Map<
            string,
            AnalyticsTask
          >();

        let page = 1;
        const size = 100;
        let hasNext = true;

        while (hasNext) {
          const response: any =
            await tasksApi.getKanban(
              context,
              {
                page,
                size,

                priorities:
                  priorities.length
                    ? priorities
                    : undefined,

                overdue_only:
                  overdueOnly ||
                  undefined,
              },
            );

          const columns =
            response?.columns ??
            [];

          for (
            const column of
            columns
          ) {
            const items =
              column?.tasks
                ?.items ?? [];

            for (
              const task of items
            ) {
              collected.set(
                task.id,
                task,
              );
            }
          }

          hasNext =
            columns.some(
              (column: any) =>
                Boolean(
                  column
                    ?.tasks
                    ?.has_next,
                ),
            );

          page += 1;

          /*
           * Защита от
           * некорректной пагинации.
           */
          if (page > 100) {
            break;
          }
        }

        setTasks(
          Array.from(
            collected.values(),
          ),
        );
      } catch (e: any) {
        setError(
          e?.response?.data
            ?.error
            ?.public_message ??
          e?.response?.data
            ?.error
            ?.message ??
          e?.response?.data
            ?.detail ??
          e?.message ??
          'Не удалось загрузить аналитику',
        );
      } finally {
        setLoading(false);
        setRefreshing(
          false,
        );
      }
    },
    [
      context,
      priorityKey,
      overdueOnly,
    ],
  );

  useEffect(() => {
    load();
  }, [load]);

  const analytics =
    useMemo(() => {
      let planned = 0;
      let actual = 0;

      let done = 0;
      let overdue = 0;
      let completedLate = 0;
      let currentlyWorking = 0;

      const cycleTimes: number[] =
        [];

      const statusCounts =
        Object.fromEntries(
          STATUS_ORDER.map(
            (status) => [
              status,
              0,
            ],
          ),
        ) as Record<
          TaskStatus,
          number
        >;

      for (
        const task of tasks
      ) {
        planned += toNumber(
          task.estimated_hours,
        );

        actual += toNumber(
          task.actual_hours,
        );

        statusCounts[
          task.status
        ] =
          (statusCounts[
            task.status
          ] ?? 0) + 1;

        if (
          task.status === 'done'
        ) {
          done += 1;
        }

        if (
          isCurrentlyOverdue(
            task,
          )
        ) {
          overdue += 1;
        }

        if (
          wasCompletedLate(task)
        ) {
          completedLate += 1;
        }

        if (
          task.working_since
        ) {
          currentlyWorking += 1;
        }

        const cycle =
          getCycleTimeHours(
            task,
          );

        if (cycle != null) {
          cycleTimes.push(
            cycle,
          );
        }
      }

      const variance =
        actual - planned;

      const variancePercent =
        planned > 0
          ? (variance /
            planned) *
          100
          : 0;

      const completionPercent =
        tasks.length > 0
          ? (done /
            tasks.length) *
          100
          : 0;

      const averageCycleHours =
        cycleTimes.length > 0
          ? cycleTimes.reduce(
            (sum, value) =>
              sum + value,
            0,
          ) /
          cycleTimes.length
          : null;

      const tasksWithVariance =
        tasks
          .filter((task) => {
            const planned = toNumber(
              task.estimated_hours,
            );

            const actual = toNumber(
              task.actual_hours,
            );

            return (
              planned > 0 &&
              actual > planned
            );
          })
          .map((task) => {
            const planned = toNumber(
              task.estimated_hours,
            );

            const actual = toNumber(
              task.actual_hours,
            );

            const variance =
              actual - planned;

            const percent =
              (variance / planned) * 100;

            return {
              task,
              planned,
              actual,
              variance,
              percent,
            };
          })
          .sort(
            (a, b) =>
              b.variance - a.variance,
          );

      return {
        planned,
        actual,

        variance,
        variancePercent,

        done,
        overdue,
        completedLate,
        currentlyWorking,

        completionPercent,
        averageCycleHours,

        statusCounts,
        tasksWithVariance,
      };
    }, [tasks]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--text-primary)]/40">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />

          <span className="text-sm">
            Считаем аналитику...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-400" />

          <div className="mt-3 font-semibold text-[var(--text-primary)]">
            Не удалось загрузить
            аналитику
          </div>

          <div className="mt-1 text-sm text-[var(--text-primary)]/50">
            {String(error)}
          </div>

          <button
            type="button"
            onClick={() =>
              load()
            }
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)]/70 hover:bg-[var(--hover-3)]"
          >
            <RefreshCw className="w-4 h-4" />
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const variancePositive =
    analytics.variance > 0;

  const varianceNegative =
    analytics.variance < 0;

  return (
    <div className="h-full overflow-y-auto pr-1 pb-8 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
      <div className="max-w-[1500px] mx-auto space-y-5">
        {/* HEADER */}

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Аналитика задач
            </h2>

            <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
              Показатели для
              выбранного контекста и
              фильтров
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              load(true)
            }
            disabled={
              refreshing
            }
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] disabled:opacity-40 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing
                ? 'animate-spin'
                : ''
                }`}
            />

            Обновить
          </button>
        </div>

        {/* FIRST METRICS */}

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            title="Всего задач"
            value={tasks.length}
            sub="В выбранном контексте"
            icon={
              <Target className="w-4 h-4" />
            }
          />

          <StatCard
            title="Выполнено"
            value={analytics.done}
            sub={`${analytics.completionPercent.toLocaleString(
              'ru-RU',
              {
                maximumFractionDigits: 1,
              },
            )}% от всех задач`}
            icon={
              <CheckCircle2 className="w-4 h-4" />
            }
            tone="success"
          />

          <StatCard
            title="Просрочено сейчас"
            value={
              analytics.overdue
            }
            sub={
              analytics.overdue >
                0
                ? 'Активные задачи за пределами срока'
                : 'Текущих просрочек нет'
            }
            icon={
              <AlertTriangle className="w-4 h-4" />
            }
            tone={
              analytics.overdue >
                0
                ? 'danger'
                : 'default'
            }
          />

          <StatCard
            title="Отклонение трудозатрат"
            value={formatSignedHours(
              analytics.variance,
            )}
            sub={
              analytics.planned >
                0
                ? formatPercent(
                  analytics.variancePercent,
                )
                : 'Нет плановых часов'
            }
            icon={
              variancePositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : varianceNegative ? (
                <TrendingDown className="w-4 h-4" />
              ) : (
                <Clock3 className="w-4 h-4" />
              )
            }
            tone={
              variancePositive
                ? 'danger'
                : varianceNegative
                  ? 'success'
                  : 'default'
            }
          />
        </div>

        {/* TIME METRICS */}

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <StatCard
            title="Завершено с опозданием"
            value={
              analytics.completedLate
            }
            sub="Завершены позже установленного срока"
            icon={
              <Clock3 className="w-4 h-4" />
            }
            tone={
              analytics.completedLate >
                0
                ? 'warning'
                : 'default'
            }
          />

          <StatCard
            title="Среднее время выполнения"
            value={
              analytics.averageCycleHours !=
                null
                ? formatDuration(
                  analytics.averageCycleHours,
                )
                : '—'
            }
            sub="От начала работы до завершения"
            icon={
              <Timer className="w-4 h-4" />
            }
          />

          <StatCard
            title="Работают сейчас"
            value={
              analytics.currentlyWorking
            }
            sub="Есть активная рабочая сессия"
            icon={
              <PlayCircle className="w-4 h-4" />
            }
            tone={
              analytics.currentlyWorking >
                0
                ? 'success'
                : 'default'
            }
          />
        </div>

        {/* PLAN / FACT */}

        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Трудозатраты
            </h3>

            <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
              Сравнение плановых и
              фактических часов
            </p>
          </div>

          <div className="grid md:grid-cols-3">
            <div className="p-5 md:border-r border-[var(--border-color)]">
              <div className="text-sm text-[var(--text-primary)]/45">
                План
              </div>

              <div className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
                {formatHours(
                  analytics.planned,
                )}
              </div>
            </div>

            <div className="p-5 border-t md:border-t-0 md:border-r border-[var(--border-color)]">
              <div className="text-sm text-[var(--text-primary)]/45">
                Факт
              </div>

              <div className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
                {formatHours(
                  analytics.actual,
                )}
              </div>
            </div>

            <div className="p-5 border-t md:border-t-0 border-[var(--border-color)]">
              <div className="text-sm text-[var(--text-primary)]/45">
                Разница
              </div>

              <div
                className={`mt-2 text-3xl font-bold ${variancePositive
                  ? 'text-red-400'
                  : varianceNegative
                    ? 'text-emerald-500'
                    : 'text-[var(--text-primary)]'
                  }`}
              >
                {formatSignedHours(
                  analytics.variance,
                )}
              </div>

              {analytics.planned >
                0 && (
                  <div
                    className={`mt-1 text-sm font-medium ${variancePositive
                      ? 'text-red-400/70'
                      : varianceNegative
                        ? 'text-emerald-500/70'
                        : 'text-[var(--text-primary)]/40'
                      }`}
                  >
                    {formatPercent(
                      analytics.variancePercent,
                    )}{' '}
                    от плана
                  </div>
                )}
            </div>
          </div>

          {analytics.planned >
            0 && (
              <div className="px-5 pb-5">
                <div className="h-2 rounded-full bg-[var(--hover-2)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${analytics.actual >
                      analytics.planned
                      ? 'bg-red-400'
                      : 'bg-emerald-500'
                      }`}
                    style={{
                      width: `${Math.min(
                        (analytics.actual /
                          analytics.planned) *
                        100,
                        100,
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 flex justify-between gap-3 text-[11px] text-[var(--text-primary)]/35">
                  <span>
                    Факт:{' '}
                    {formatHours(
                      analytics.actual,
                    )}
                  </span>

                  <span>
                    План:{' '}
                    {formatHours(
                      analytics.planned,
                    )}
                  </span>
                </div>
              </div>
            )}
        </section>

        <div className="grid xl:grid-cols-[0.8fr_1.2fr] gap-5">
          {/* STATUSES */}

          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                По статусам
              </h3>
            </div>

            <div className="p-5 space-y-4">
              {STATUS_ORDER.map(
                (status) => {
                  const count =
                    analytics
                      .statusCounts[
                    status
                    ];

                  if (!count) {
                    return null;
                  }

                  const percentage =
                    tasks.length > 0
                      ? (count /
                        tasks.length) *
                      100
                      : 0;

                  return (
                    <div
                      key={
                        status
                      }
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[status]}`}
                          />

                          <span className="text-sm text-[var(--text-primary)]/70 truncate">
                            {
                              STATUS_LABEL[
                              status
                              ]
                            }
                          </span>
                        </div>

                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {count}
                        </span>
                      </div>

                      <div className="h-1.5 bg-[var(--hover-2)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${STATUS_COLOR[status]}`}
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )}

              {tasks.length ===
                0 && (
                  <div className="py-10 text-center text-sm text-[var(--text-primary)]/35">
                    Нет задач
                  </div>
                )}
            </div>
          </section>

          {/* TASK VARIANCES */}

          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Превышение трудозатрат
              </h3>

              <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                Задачи, на которые ушло больше времени, чем планировалось
              </p>
            </div>

            {analytics
              .tasksWithVariance
              .length > 0 ? (
              <div className="divide-y divide-[var(--border-color)]">
                {analytics
                  .tasksWithVariance
                  .slice(0, 10)
                  .map(
                    (item) => {
                      const over =
                        item.variance >
                        0;

                      return (
                        <button
                          type="button"
                          key={
                            item
                              .task
                              .id
                          }
                          onClick={() =>
                            onTaskOpen?.(
                              item.task,
                            )
                          }
                          className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors ${onTaskOpen
                            ? 'hover:bg-[var(--hover-1)] cursor-pointer'
                            : 'cursor-default'
                            }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-[var(--text-primary)]/35 shrink-0">
                                #
                                {
                                  item
                                    .task
                                    .number
                                }
                              </span>

                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {
                                  item
                                    .task
                                    .title
                                }
                              </span>
                            </div>

                            <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--text-primary)]/40">
                              <span>
                                План{' '}
                                {formatHours(
                                  item.planned,
                                )}
                              </span>

                              <span>
                                Факт{' '}
                                {formatHours(
                                  item.actual,
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-sm font-semibold ${over
                                ? 'text-red-400'
                                : item.variance <
                                  0
                                  ? 'text-emerald-500'
                                  : 'text-[var(--text-primary)]/60'
                                }`}
                            >
                              {formatSignedHours(
                                item.variance,
                              )}
                            </div>

                            <div className="mt-0.5 text-[11px] text-[var(--text-primary)]/35">
                              {formatPercent(
                                item.percent,
                              )}
                            </div>
                          </div>

                          {onTaskOpen && (
                            <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 shrink-0" />
                          )}
                        </button>
                      );
                    },
                  )}
              </div>
            ) : (
              <div className="py-14 text-center">
                <Clock3 className="w-7 h-7 mx-auto text-[var(--text-primary)]/20" />

               <div className="mt-2 text-sm text-[var(--text-primary)]/35">
  Нет задач с превышением плановых трудозатрат
</div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default TaskAnalytics;