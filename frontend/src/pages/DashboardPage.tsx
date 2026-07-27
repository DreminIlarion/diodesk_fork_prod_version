// pages/DashboardPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Building2, CheckCircle2, ChevronRight, CloudSun, FileText,
  Flame, FolderOpen, Moon, Package, Plus, Search, Sun,
  Ticket as TicketIcon, Timer, TrendingDown, TrendingUp, UserCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, productsApi } from '../api/client';
import type { TicketListItem, Counterparty, Project } from '../types';
import GridBackground from '../components/ui/GridBackground';

/* ═══════════════════════════════════════════════════════════════════
   ДИЗАЙН-ТОКЕНЫ — единственный источник правды.
   Не пиши стили «на глаз», бери отсюда.

   Отступы:  4 · 8 · 16 · 24 · 32 · 48 · 64      (шкала 8pt)
   Радиусы:  карточка 16px (2xl) · элемент 12px (xl) · мелочь 8px (lg) · пилюля full
   Текст:    12 (meta) · 14 (secondary) · 16 (body) · 18 (title) · 30/36 (hero)
   Цвет:     ровно 3 уровня — 100% / 60% / 40%. Больше НЕЛЬЗЯ.
   Иконки:   16px в тексте · 20px в кнопках. Больше нигде.
   ═══════════════════════════════════════════════════════════════════ */

const T_MAIN = 'text-[var(--text-primary)]';
const T_SOFT = 'text-[var(--text-primary)]/60';
const T_MUTE = 'text-[var(--text-primary)]/40';

const CARD = 'rounded-2xl border border-[var(--border-color)]';
const CARD_HEAD =
  'flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-color)] px-6';
const ROW =
  'group flex items-center gap-4 px-6 py-4 transition-colors duration-150 hover:bg-[var(--hover-1)]';
const PILL = 'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium';

/* ═══════════════════════════════════════════════════════════════════
   СЛОВАРИ
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'status-new' },
  pending_approval: { label: 'На согласовании', color: 'status-agreement' },
  open: { label: 'Открыт', color: 'status-open' },
  in_progress: { label: 'В работе', color: 'status-progress' },
  waiting: { label: 'Ожидает ответа', color: 'status-waiting' },
  resolved: { label: 'Решён', color: 'status-resolved' },
  closed: { label: 'Закрыт', color: 'status-closed' },
  reopened: { label: 'Переоткрыт', color: 'status-reopened' },
  rejected: { label: 'Отклонён', color: 'status-rejected' },
};

const PRIORITY_MAP: Record<string, { label: string; bar: string }> = {
  low: { label: 'Низкий', bar: 'status-bar-resolved' },
  medium: { label: 'Средний', bar: 'status-bar-progress' },
  high: { label: 'Высокий', bar: 'status-bar-waiting' },
  critical: { label: 'Критический', bar: 'status-bar-reopened' },
};

const statusLabel = (s: string) => STATUS_MAP[s]?.label ?? s;
const statusColor = (s: string) => STATUS_MAP[s]?.color ?? 'status-closed';
const priorityLabel = (p: string) => PRIORITY_MAP[p]?.label ?? p;
const priorityBar = (p: string) => PRIORITY_MAP[p]?.bar ?? 'status-bar-progress';

/* ═══════════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════════ */

function toShortName(fullName?: string | null): string {
  if (!fullName) return '—';
  const [last, first, middle] = fullName.trim().split(/\s+/);
  const initials = [first, middle].filter(Boolean).map((p) => `${p[0].toUpperCase()}.`).join('');
  return initials ? `${last} ${initials}` : last;
}

/** Русское склонение: plural(3, 'заявка', 'заявки', 'заявок') */
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return { text: 'Доброй ночи', Icon: Moon };
  if (h < 12) return { text: 'Доброе утро', Icon: Sun };
  if (h < 18) return { text: 'Добрый день', Icon: CloudSun };
  return { text: 'Добрый вечер', Icon: Moon };
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/* ═══════════════════════════════════════════════════════════════════
   ПРИМИТИВЫ UI
   ═══════════════════════════════════════════════════════════════════ */

function Section({
  title, count, to, linkLabel = 'Все', children, className = '',
}: {
  title: string; count?: number; to?: string; linkLabel?: string;
  children: ReactNode; className?: string;
}) {
  return (
    <section className={`${CARD} flex flex-col overflow-hidden ${className}`}>
      <header className={CARD_HEAD}>
        <div className="flex items-center gap-2.5">
          <h2 className={`text-base font-semibold ${T_MAIN}`}>{title}</h2>
          {count !== undefined && count > 0 && (
            <span
              className={`rounded-full bg-[var(--hover-1)] px-2 py-0.5 text-xs font-medium tabular-nums ${T_MUTE}`}
            >
              {count}
            </span>
          )}
        </div>
        {to && (
          <Link
            to={to}
            className={`group inline-flex items-center gap-1.5 text-sm font-medium ${T_SOFT} transition-colors hover:text-[var(--accent)]`}
          >
            {linkLabel}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: typeof FileText; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--hover-1)]">
        <Icon className={`h-5 w-5 ${T_MUTE}`} />
      </div>
      <p className={`text-base font-medium ${T_MAIN}`}>{title}</p>
      {description && (
        <p className={`mt-2 max-w-[280px] text-sm leading-relaxed ${T_MUTE}`}>{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function StatCard({
  label, value, hint, icon: Icon, trend, highlight = false,
}: {
  label: string; value: number; hint: string; icon: typeof TicketIcon;
  trend?: { value: number; up: boolean; suffix?: string } | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${CARD} p-6 transition-colors duration-200 hover:border-[var(--border-hover,var(--accent))]`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`text-sm font-medium ${T_SOFT}`}>{label}</span>
        <Icon className={`h-4 w-4 shrink-0 ${highlight ? 'text-[var(--accent)]' : T_MUTE}`} />
      </div>

      <div className="mt-6 flex items-baseline gap-3">
        <span className={`text-4xl font-semibold leading-none tracking-tight tabular-nums ${T_MAIN}`}>
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${
              trend.up ? 'text-[var(--success)]' : 'text-[var(--accent)]'
            }`}
          >
            {trend.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {trend.value}
            {trend.suffix}
          </span>
        )}
      </div>

      <p className={`mt-2 text-sm ${T_MUTE}`}>{hint}</p>
    </div>
  );
}

function WeekChart({ data }: { data: { label: string; value: number; isToday: boolean }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className={`flex h-[132px] items-center justify-center text-sm ${T_MUTE}`}>
        Нет активности за неделю
      </div>
    );
  }

  return (
    <div className="flex h-[132px] items-end gap-2">
      {data.map((d) => (
        <div
          key={d.label}
          className="flex flex-1 flex-col items-center gap-2"
          title={`${d.label}: ${d.value}`}
        >
          <span
            className={`text-xs font-medium tabular-nums ${
              d.value > 0 ? (d.isToday ? 'text-[var(--accent)]' : T_MUTE) : 'text-transparent'
            }`}
          >
            {d.value || 0}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div
              className={`w-full rounded-md transition-[height] duration-500 ease-out ${
                d.isToday ? 'bg-[var(--accent)]' : 'bg-[var(--hover-2)]'
              }`}
              style={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
            />
          </div>
          <span
            className={`text-xs ${d.isToday ? 'font-semibold text-[var(--accent)]' : T_MUTE}`}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-[var(--hover-1)] ${className}`} />
);

/* ═══════════════════════════════════════════════════════════════════
   СТРАНИЦА
   ═══════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const roles = user?.roles ?? [];
  const isCustomer = roles.includes('customer') || roles.includes('customer_admin');
  const isSupport =
    roles.includes('admin') || roles.includes('support_manager') || roles.includes('support_agent');

  const greeting = useMemo(getGreeting, []);

  /* ── загрузка ─────────────────────────────────────── */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const ticketsRes = await ticketsApi.getAll(1, 100);
        if (alive) setTickets(ticketsRes.items);

        if (isCustomer && user?.counterparty_id) {
          counterpartiesApi
            .getById(user.counterparty_id)
            .then((cp) => alive && setCounterparty(cp))
            .catch(() => {});
        }

        const projectsRes = isCustomer
          ? await projectsApi.getMyProjects('all', 1, 5).catch(() => ({ items: [] }))
          : await projectsApi.getAll(1, 5).catch(() => ({ items: [] }));
        if (alive) setProjects(projectsRes.items ?? []);

        if (isSupport) {
          counterpartiesApi
            .getAll(1, 5)
            .then((res) => alive && setCounterparties(res.items ?? []))
            .catch(() => {});
        }

        productsApi
          .getProducts({ page: 1, size: 1 })
          .then((res) => alive && setProductsCount(res.total_items ?? 0))
          .catch(() => {});
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── хоткей "/" на поиск ──────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── производные данные ───────────────────────────── */
  const stats = useMemo(
    () => ({
      total: tickets.length,
      new: tickets.filter((t) => t.status === 'new').length,
      inProgress: tickets.filter((t) => t.status === 'in_progress' || t.status === 'open').length,
      critical: tickets.filter((t) => t.priority === 'critical').length,
      resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
      waiting: tickets.filter((t) => t.status === 'waiting').length,
    }),
    [tickets],
  );

  const resolvePct = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0;

  const weekData = useMemo(() => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7;
    const counts = Array<number>(7).fill(0);

    tickets.forEach((t) => {
      const d = new Date(t.created_at);
      const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
      if (diff >= 0 && diff < 7) counts[(d.getDay() + 6) % 7]++;
    });

    return days.map((label, i) => ({ label, value: counts[i], isToday: i === todayDow }));
  }, [tickets]);

  /* Контекстная строка вместо бессмысленной даты */
  const summaryLine = useMemo(() => {
    const parts: string[] = [];
    if (stats.new)
      parts.push(`${stats.new} ${plural(stats.new, 'новая заявка', 'новые заявки', 'новых заявок')}`);
    if (stats.inProgress) parts.push(`${stats.inProgress} в работе`);
    if (stats.critical)
      parts.push(
        `${stats.critical} ${plural(stats.critical, 'критическая', 'критические', 'критических')}`,
      );
    return parts.length ? parts.join(' · ') : 'Всё под контролем — открытых задач нет';
  }, [stats]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long',
      }),
    [],
  );

  const submitSearch = () => {
    if (query.trim()) navigate(`/tickets?search=${encodeURIComponent(query.trim())}`);
  };

  /* ── скелетон вместо спиннера ─────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[168px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[164px] rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-[520px] rounded-2xl lg:col-span-2" />
          <Skeleton className="h-[520px] rounded-2xl" />
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ── HERO: единственное место с декором ───────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border-color)] px-6 py-8 md:px-10 md:py-10">
        <GridBackground variant="dots" />

        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className={`flex items-center gap-2 text-sm font-medium ${T_MUTE}`}>
              <greeting.Icon className="h-4 w-4" />
              <span>{greeting.text}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="first-letter:uppercase">{todayLabel}</span>
            </div>

            <h1 className={`mt-3 truncate text-3xl font-semibold tracking-tight md:text-4xl ${T_MAIN}`}>
              {user?.full_name || user?.username || 'Главная'}
            </h1>

            <p className={`mt-3 text-base ${T_SOFT}`}>{summaryLine}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
                placeholder="Поиск заявок"
                className={`peer h-12 w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]
                            pl-11 pr-12 text-base ${T_MAIN} placeholder:text-[var(--text-primary)]/40
                            transition-colors duration-200
                            focus:border-[var(--accent)] focus:outline-none`}
              />
              <Search
                className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2
                            ${T_MUTE} transition-colors peer-focus:text-[var(--accent)]`}
              />
              <kbd
                className={`pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md
                            border border-[var(--border-color)] px-2 py-0.5 font-mono text-xs ${T_MUTE}
                            peer-focus:opacity-0 sm:block`}
              >
                /
              </kbd>
            </div>

            <button
              onClick={() => navigate('/tickets/new')}
              className="btn-primary group inline-flex h-12 items-center gap-2 rounded-xl px-5 text-base font-medium"
            >
              <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
              <span className="hidden sm:inline">Создать заявку</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── МЕТРИКИ ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCard
          label="Всего заявок"
          value={stats.total}
          hint={stats.new ? `${stats.new} новых за период` : 'новых нет'}
          icon={TicketIcon}
          trend={stats.new ? { value: stats.new, up: true } : null}
        />
        <StatCard
          label="В работе"
          value={stats.inProgress}
          hint={stats.waiting ? `${stats.waiting} ждут ответа` : 'все в процессе'}
          icon={Timer}
        />
        <StatCard
          label="Критических"
          value={stats.critical}
          hint={stats.critical ? 'требуют внимания' : 'критичных нет'}
          icon={Flame}
          highlight={stats.critical > 0}
          trend={stats.critical ? { value: stats.critical, up: false } : null}
        />
        <StatCard
          label="Решено"
          value={stats.resolved}
          hint={`${resolvePct}% от общего числа`}
          icon={CheckCircle2}
          trend={resolvePct > 0 ? { value: resolvePct, up: true, suffix: '%' } : null}
        />
      </div>

      {/* ── КОНТЕНТ ──────────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* ЛЕВО — заявки */}
        <Section title="Последние заявки" count={tickets.length} to="/tickets" className="lg:col-span-2">
          {tickets.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Заявок пока нет"
              description="Создайте первую заявку — она появится здесь вместе со статусом и исполнителем."
              action={
                <button
                  onClick={() => navigate('/tickets/new')}
                  className="btn-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-base font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Создать заявку
                </button>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {tickets.slice(0, 8).map((ticket) => (
                <Link key={ticket.id} to={`/tickets/${ticket.number}`} className={ROW}>
                  {/* приоритет — только цветной штрих, без второй пилюли */}
                  <span
                    title={`Приоритет: ${priorityLabel(ticket.priority)}`}
                    className={`h-10 w-1 shrink-0 rounded-full ${priorityBar(ticket.priority)}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className={`shrink-0 font-mono text-xs ${T_MUTE}`}>#{ticket.number}</span>
                      <span
                        className={`truncate text-base font-medium ${T_MAIN} transition-colors group-hover:text-[var(--accent)]`}
                      >
                        {ticket.title}
                      </span>
                    </div>

                    <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${T_MUTE}`}>
                      <span className={`${PILL} ${statusColor(ticket.status)}`}>
                        {statusLabel(ticket.status)}
                      </span>
                      {ticket.counterparty?.name && (
                        <span className="hidden max-w-[160px] items-center gap-1.5 sm:flex">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{ticket.counterparty.name}</span>
                        </span>
                      )}
                      {ticket.project?.key && (
                        <span className="hidden items-center gap-1.5 font-mono md:flex">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          {ticket.project.key}
                        </span>
                      )}
                      {ticket.assignee?.full_name && (
                        <span className="hidden items-center gap-1.5 md:flex">
                          <UserCheck className="h-3.5 w-3.5 shrink-0" />
                          {toShortName(ticket.assignee.full_name)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    <p className={`text-sm ${T_SOFT}`}>{fmtDate(ticket.created_at)}</p>
                    <p className={`mt-0.5 text-xs ${T_MUTE}`}>{fmtTime(ticket.created_at)}</p>
                  </div>

                  <ChevronRight
                    className={`h-4 w-4 shrink-0 ${T_MUTE} transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]`}
                  />
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* ПРАВО — сайдбар */}
        <div className="space-y-6">
          {/* Активность */}
          <Section title="Активность за неделю">
            <div className="p-6">
              <WeekChart data={weekData} />
            </div>
          </Section>

          {/* Проекты */}
          <Section title="Проекты" count={projects.length} to="/projects">
            {projects.length === 0 ? (
              <EmptyState icon={FolderOpen} title="Нет проектов" />
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {projects.slice(0, 4).map((proj) => (
                  <Link key={proj.id} to={`/projects/${proj.id}`} className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-base font-medium ${T_MAIN} transition-colors group-hover:text-[var(--accent)]`}
                      >
                        {proj.name}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className={`font-mono text-xs ${T_MUTE}`}>{proj.key}</span>
                        <span
                          className={`${PILL} ${proj.status === 'active' ? 'status-resolved' : 'status-closed'}`}
                        >
                          {proj.status === 'active' ? 'Активен' : 'Архив'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${T_MUTE} transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]`}
                    />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Контрагенты — только для саппорта */}
          {isSupport && counterparties.length > 0 && (
            <Section title="Контрагенты" count={counterparties.length} to="/counterparties">
              <div className="divide-y divide-[var(--border-color)]">
                {counterparties.slice(0, 3).map((cp) => (
                  <Link key={cp.id} to={`/counterparties/${cp.id}`} className={ROW}>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-base font-medium ${T_MAIN} transition-colors group-hover:text-[var(--accent)]`}
                      >
                        {cp.name}
                      </p>
                      {cp.inn && <p className={`mt-1 font-mono text-xs ${T_MUTE}`}>ИНН {cp.inn}</p>}
                    </div>
                    <span className={`${PILL} shrink-0 ${cp.is_active ? 'status-resolved' : 'status-closed'}`}>
                      {cp.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Моя компания — для клиента */}
          {isCustomer && counterparty && (
            <Section title="Моя компания" to="/my-company" linkLabel="Подробнее">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                    <Building2 className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-base font-medium ${T_MAIN}`}>{counterparty.name}</p>
                    <p className={`mt-1 text-sm ${T_MUTE}`}>{counterparty.counterparty_type}</p>
                  </div>
                </div>

                <dl className="mt-6 border-t border-[var(--border-color)] pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <dt className={T_MUTE}>ИНН</dt>
                    <dd className={`font-mono ${T_SOFT}`}>{counterparty.inn}</dd>
                  </div>
                </dl>
              </div>
            </Section>
          )}

          {/* Сводка — для саппорта */}
          {isSupport && (
            <Section title="Сводка">
              <div className="divide-y divide-[var(--border-color)]">
                {[
                  { label: 'Контрагентов', value: counterparties.length, icon: Building2 },
                  { label: 'Проектов', value: projects.length, icon: FolderOpen },
                  { label: 'Продуктов', value: productsCount, icon: Package },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-6 py-4">
                    <span className={`flex items-center gap-3 text-sm ${T_SOFT}`}>
                      <row.icon className={`h-4 w-4 ${T_MUTE}`} />
                      {row.label}
                    </span>
                    <span className={`text-base font-semibold tabular-nums ${T_MAIN}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}