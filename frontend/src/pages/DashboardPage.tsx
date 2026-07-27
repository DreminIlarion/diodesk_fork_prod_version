// pages/DashboardPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, Plus, ArrowRight,
  Building2, Loader2, FolderOpen, Package, Ticket, ChevronRight,
  Search, Sun, Moon, CloudSun,
  Flame, Timer, BarChart3, UserCheck,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, productsApi } from '../api/client';
import type { TicketListItem, Counterparty, Project } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   TOKENS — единая система
   5 размеров шрифта, 4 уровня прозрачности, 3 радиуса
   ═══════════════════════════════════════════════════════════════════ */

// Шрифты:  text-2xl (заголовок страницы)
//          text-lg  (заголовок секции)
//          text-sm  (основной текст)
//          text-xs  (мета, даты, лейблы)

// Прозрачность:  /100 (основной)  /60 (вторичный)  /35 (третичный)  /20 (disabled)

// Радиусы:  rounded-lg (бейджи)  rounded-xl (карточки, инпуты)  rounded-2xl (большие блоки)

/* ═══════════════════════════════════════════════════════════════════
   MAPS
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new:              { label: 'Новый',           color: 'status-new' },
  pending_approval: { label: 'На согласовании', color: 'status-agreement' },
  open:             { label: 'Открыт',          color: 'status-open' },
  in_progress:      { label: 'В работе',        color: 'status-progress' },
  waiting:          { label: 'Ожидает ответа',  color: 'status-waiting' },
  resolved:         { label: 'Решён',           color: 'status-resolved' },
  closed:           { label: 'Закрыт',          color: 'status-closed' },
  reopened:         { label: 'Переоткрыт',      color: 'status-reopened' },
  rejected:         { label: 'Отклонён',        color: 'status-rejected' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low:      { label: 'Низкий',      color: 'priority-low' },
  medium:   { label: 'Средний',     color: 'priority-medium' },
  high:     { label: 'Высокий',     color: 'priority-high' },
  critical: { label: 'Критический', color: 'priority-critical' },
};

const getStatusLabel  = (s: string) => STATUS_MAP[s]?.label  ?? s;
const getStatusColor  = (s: string) => STATUS_MAP[s]?.color  ?? 'status-closed';
const getPriorityLabel = (p: string) => PRIORITY_MAP[p]?.label ?? p;
const getPriorityColor = (p: string) => PRIORITY_MAP[p]?.color ?? 'priority-medium';

function toShortName(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [last, first, middle] = parts;
  const initials = [first, middle].filter(Boolean).map(p => `${p[0].toUpperCase()}.`).join('');
  return initials ? `${last} ${initials}` : last;
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6)  return { text: 'Доброй ночи', icon: Moon };
  if (h < 12) return { text: 'Доброе утро', icon: Sun };
  if (h < 18) return { text: 'Добрый день', icon: CloudSun };
  return { text: 'Добрый вечер', icon: Moon };
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/* ═══════════════════════════════════════════════════════════════════
   BAR CHART — чистый, без шума
   ═══════════════════════════════════════════════════════════════════ */

function WeekChart({ data }: { data: { label: string; value: number; isToday?: boolean }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end justify-between gap-1.5 h-28">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            {d.value > 0 && (
              <span className={`text-xs font-semibold tabular-nums ${
                d.isToday ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/60'
              }`}>
                {d.value}
              </span>
            )}
            <div className="w-full flex items-end justify-center flex-1">
              <div
                className={`w-full rounded-sm transition-all duration-300 ${
                  d.isToday
                    ? 'bg-[var(--accent)]'
                    : d.value > 0
                      ? 'bg-[var(--text-primary)]/10'
                      : 'bg-[var(--text-primary)]/5'
                }`}
                style={{ height: `${Math.max(pct, d.value > 0 ? 8 : 3)}%` }}
              />
            </div>
            <span className={`text-xs ${
              d.isToday ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]/35'
            }`}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STAT CARD — простой, без sparkline и gradient шума
   ═══════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub, icon: Icon, iconClass }: {
  label: string;
  value: number;
  sub: string;
  icon: any;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
          {value}
        </p>
        <p className="text-sm text-[var(--text-primary)]/60 mt-1">{label}</p>
        <p className="text-xs text-[var(--text-primary)]/35 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION HEADER — переиспользуемый
   ═══════════════════════════════════════════════════════════════════ */

function SectionHeader({ title, icon: Icon, count, linkTo, linkLabel = 'Все' }: {
  title: string;
  icon: any;
  count?: number;
  linkTo?: string;
  linkLabel?: string;
}) {
  return (
    <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--text-primary)]/35" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="px-1.5 py-0.5 rounded-md bg-[var(--hover-2)] text-xs
                           text-[var(--text-primary)]/35 tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {linkTo && (
        <Link to={linkTo}
          className="text-xs text-[var(--text-primary)]/35 hover:text-[var(--accent)]
                     font-medium transition-colors flex items-center gap-1">
          {linkLabel} <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [tickets,        setTickets]        = useState<TicketListItem[]>([]);
  const [counterparty,   setCounterparty]   = useState<Counterparty | null>(null);
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [productsCount,  setProductsCount]  = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [searchQuery,    setSearchQuery]    = useState('');

  const userRoles = user?.roles ?? [];
  const isCustomer = userRoles.includes('customer') || userRoles.includes('customer_admin');
  const isSupport  = userRoles.includes('admin') ||
                     userRoles.includes('support_manager') ||
                     userRoles.includes('support_agent');

  const greeting = useMemo(() => getGreeting(), []);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const ticketsRes = await ticketsApi.getAll(1, 100);
      setTickets(ticketsRes.items);

      if (isCustomer && user?.counterparty_id) {
        counterpartiesApi.getById(user.counterparty_id)
          .then(cp => setCounterparty(cp)).catch(() => {});
      }

      const projectsRes = isCustomer
        ? await projectsApi.getMyProjects('all', 1, 5).catch(() => ({ items: [] }))
        : await projectsApi.getAll(1, 5).catch(() => ({ items: [] }));
      setProjects(projectsRes.items ?? []);

      if (isSupport) {
        counterpartiesApi.getAll(1, 5)
          .then(res => setCounterparties(res.items ?? [])).catch(() => {});
      }

      productsApi.getProducts({ page: 1, size: 1 })
        .then(res => setProductsCount(res.total_items ?? 0)).catch(() => {});
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ── Computed ── */

  const stats = useMemo(() => ({
    total:      tickets.length,
    new:        tickets.filter(t => t.status === 'new').length,
    inProgress: tickets.filter(t => t.status === 'in_progress' || t.status === 'open').length,
    critical:   tickets.filter(t => t.priority === 'critical').length,
    resolved:   tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
    waiting:    tickets.filter(t => t.status === 'waiting').length,
  }), [tickets]);

  const resolvePct = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

  const weekData = useMemo(() => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7;
    const counts = Array(7).fill(0);
    tickets.forEach(t => {
      const d = new Date(t.created_at);
      const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) counts[(d.getDay() + 6) % 7]++;
    });
    return days.map((label, i) => ({ label, value: counts[i], isToday: i === todayDow }));
  }, [tickets]);

  /* ── Loading ── */

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6">

      {/* ── HEADER ── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]/35 font-medium">
            <greeting.icon className="w-4 h-4" />
            {greeting.text}
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {user?.full_name || user?.username || 'Главная'}
          </h1>
          <p className="text-xs text-[var(--text-primary)]/35">
            {new Date().toLocaleDateString('ru-RU', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
                               text-[var(--text-primary)]/20 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchQuery.trim())
                  navigate(`/tickets?search=${encodeURIComponent(searchQuery.trim())}`);
              }}
              placeholder="Поиск заявок…"
              className="pl-9 pr-4 py-2.5 w-56 rounded-xl bg-[var(--hover-2)]
                         border border-[var(--border-color)] text-sm text-[var(--text-primary)]
                         placeholder:text-[var(--text-primary)]/20
                         focus:outline-none focus:border-[var(--accent)]/30 transition-colors"
            />
          </div>
          <button
            onClick={() => navigate('/tickets/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-[var(--accent)] text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Создать заявку</span>
            <span className="sm:hidden">Создать</span>
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Всего заявок"
          value={stats.total}
          sub={`${stats.new} новых`}
          icon={Ticket}
          iconClass="bg-[var(--hover-2)] text-[var(--text-primary)]/60"
        />
        <StatCard
          label="В работе"
          value={stats.inProgress}
          sub="активных задач"
          icon={Timer}
          iconClass="bg-blue-500/8 text-blue-400"
        />
        <StatCard
          label="Критических"
          value={stats.critical}
          sub={stats.waiting > 0 ? `${stats.waiting} ждут ответа` : 'нет критичных'}
          icon={Flame}
          iconClass="bg-[var(--accent-soft)] text-[var(--accent)]"
        />
        <StatCard
          label="Решено"
          value={stats.resolved}
          sub={`${resolvePct}% выполнения`}
          icon={CheckCircle2}
          iconClass="bg-emerald-500/8 text-emerald-500"
        />
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* ── Левая колонка: заявки ── */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
            <SectionHeader
              title="Последние заявки"
              icon={Ticket}
              count={tickets.length}
              linkTo="/tickets"
            />

            {tickets.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-[var(--text-primary)]/10 mx-auto mb-3" />
                <p className="text-sm text-[var(--text-primary)]/60 font-medium mb-1">
                  Заявок пока нет
                </p>
                <p className="text-xs text-[var(--text-primary)]/35 mb-6">
                  Создайте первую заявку
                </p>
                <button
                  onClick={() => navigate('/tickets/new')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                             bg-[var(--accent)] text-white text-sm font-medium mx-auto"
                >
                  <Plus className="w-4 h-4" /> Создать
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {tickets.slice(0, 8).map(ticket => (
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.number}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--hover-1)]
                               transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Заголовок */}
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate
                                    group-hover:text-[var(--accent)] transition-colors">
                        {ticket.title}
                      </p>

                      {/* Бейджи */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-xs text-[var(--text-primary)]/35 font-mono">
                          #{ticket.number}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-lg text-xs font-medium border
                                         ${getStatusColor(ticket.status)}`}>
                          {getStatusLabel(ticket.status)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-lg text-xs font-medium border
                                         ${getPriorityColor(ticket.priority)}`}>
                          {getPriorityLabel(ticket.priority)}
                        </span>
                      </div>

                      {/* Мета */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs
                                      text-[var(--text-primary)]/35">
                        {ticket.counterparty?.name && (
                          <span className="flex items-center gap-1 truncate max-w-[120px]">
                            <Building2 className="w-3 h-3 flex-shrink-0" />
                            {ticket.counterparty.name}
                          </span>
                        )}
                        {ticket.project?.key && (
                          <span className="flex items-center gap-1 font-mono">
                            <FolderOpen className="w-3 h-3 flex-shrink-0" />
                            {ticket.project.key}
                          </span>
                        )}
                        {ticket.assignee?.full_name && (
                          <span className="flex items-center gap-1 truncate max-w-[100px]">
                            <UserCheck className="w-3 h-3 flex-shrink-0" />
                            {toShortName(ticket.assignee.full_name)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Дата + стрелка */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-[var(--text-primary)]/35 hidden sm:block">
                        {fmtDate(ticket.created_at)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20
                                               group-hover:text-[var(--accent)] transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Правая колонка ── */}
        <div className="space-y-6">

          {/* Активность */}
          <div className="rounded-xl border border-[var(--border-color)] p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Активность</p>
                <p className="text-xs text-[var(--text-primary)]/35">за 7 дней</p>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--hover-2)]">
                <BarChart3 className="w-4 h-4 text-[var(--text-primary)]/35" />
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                  {weekData.reduce((s, d) => s + d.value, 0)}
                </span>
              </div>
            </div>
            <WeekChart data={weekData} />
          </div>

          {/* Проекты */}
          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
            <SectionHeader title="Проекты" icon={FolderOpen} linkTo="/projects" />
            {projects.length === 0 ? (
              <div className="p-8 text-center">
                <FolderOpen className="w-8 h-8 text-[var(--text-primary)]/10 mx-auto mb-2" />
                <p className="text-xs text-[var(--text-primary)]/35">Нет проектов</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {projects.slice(0, 4).map(proj => (
                  <Link
                    key={proj.id}
                    to={`/projects/${proj.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover-1)]
                               transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--hover-2)] flex items-center
                                    justify-center flex-shrink-0">
                      <FolderOpen className="w-4 h-4 text-[var(--text-primary)]/35" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate
                                    group-hover:text-[var(--accent)] transition-colors">
                        {proj.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-[var(--text-primary)]/35">
                          {proj.key}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-lg font-medium border ${
                          proj.status === 'active' ? 'status-resolved' : 'status-closed'
                        }`}>
                          {proj.status === 'active' ? 'Активен' : 'Архив'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20
                                             group-hover:text-[var(--accent)] transition-colors
                                             flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Контрагенты (support) */}
          {isSupport && counterparties.length > 0 && (
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
              <SectionHeader
                title="Контрагенты"
                icon={Building2}
                linkTo="/counterparties"
              />
              <div className="divide-y divide-[var(--border-color)]">
                {counterparties.slice(0, 3).map(cp => (
                  <Link
                    key={cp.id}
                    to={`/counterparties/${cp.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover-1)]
                               transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--hover-2)] flex items-center
                                    justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[var(--text-primary)]/35" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate
                                    group-hover:text-[var(--accent)] transition-colors">
                        {cp.name}
                      </p>
                      {cp.inn && (
                        <span className="text-xs text-[var(--text-primary)]/35 font-mono">
                          ИНН {cp.inn}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-lg font-medium border
                                     flex-shrink-0 ${
                      cp.is_active ? 'status-resolved' : 'status-closed'
                    }`}>
                      {cp.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Контрагент клиента */}
          {isCustomer && counterparty && (
            <div className="rounded-xl border border-[var(--border-color)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center
                                justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {counterparty.name}
                  </p>
                  <p className="text-xs text-[var(--text-primary)]/35">
                    {counterparty.counterparty_type}
                  </p>
                </div>
              </div>
              {counterparty.inn && (
                <div className="flex items-center justify-between text-xs mb-3 py-2
                                border-t border-[var(--border-color)]">
                  <span className="text-[var(--text-primary)]/35">ИНН</span>
                  <span className="text-[var(--text-primary)]/60 font-mono">
                    {counterparty.inn}
                  </span>
                </div>
              )}
              <Link
                to="/my-company"
                className="flex items-center justify-center gap-2 w-full py-2.5
                           rounded-xl bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60
                           hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)]
                           font-medium transition-colors"
              >
                Подробнее <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Сводка (support) */}
          {isSupport && (
            <div className="rounded-xl border border-[var(--border-color)] p-4">
              <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/35
                            font-medium mb-3">
                Сводка
              </p>
              <div className="space-y-1">
                {[
                  { label: 'Контрагентов', value: counterparties.length, icon: Building2 },
                  { label: 'Проектов',     value: projects.length,       icon: FolderOpen },
                  { label: 'Продуктов',    value: productsCount,         icon: Package },
                ].map(row => (
                  <div key={row.label}
                    className="flex items-center justify-between py-2 px-2 rounded-lg">
                    <span className="flex items-center gap-2 text-xs text-[var(--text-primary)]/60">
                      <row.icon className="w-4 h-4 text-[var(--text-primary)]/35" />
                      {row.label}
                    </span>
                    <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}