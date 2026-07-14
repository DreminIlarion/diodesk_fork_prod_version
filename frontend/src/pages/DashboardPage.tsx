// pages/DashboardPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle2, Plus, ArrowRight,
  Building2, Loader2, FolderOpen, Package, Ticket, ChevronRight,
  Search, Sparkles, Sun, Moon, CloudSun,
  Flame, Timer, TrendingUp, TrendingDown,
  BarChart3, Users, UserCheck, User as UserIcon,
  TicketIcon,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, productsApi } from '../api/client';
import type { TicketListItem, Counterparty, Project } from '../types';
import GridBackground from '../components/ui/GridBackground';

/* ═══════════════════════════════════════════════════════════════════
   РУСИФИКАЦИЯ
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  'new': { label: 'Новый', color: 'status-new' },
  'agreement': { label: 'На согласовании', color: 'status-agreement' },
  'open': { label: 'Открыт', color: 'status-open' },
  'in_progress': { label: 'В работе', color: 'status-progress' },
  'waiting': { label: 'Ожидает ответа', color: 'status-waiting' },
  'resolved': { label: 'Решён', color: 'status-resolved' },
  'closed': { label: 'Закрыт', color: 'status-closed' },
  'reopened': { label: 'Переоткрыт', color: 'status-reopened' },
  'rejected': { label: 'Отклонён', color: 'status-rejected' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string; bar: string }> = {
  'low': { label: 'Низкий', color: 'priority-low', bar: 'status-bar-resolved' },
  'medium': { label: 'Средний', color: 'priority-medium', bar: 'status-bar-progress' },
  'high': { label: 'Высокий', color: 'priority-high', bar: 'status-bar-waiting' },
  'critical': { label: 'Критический', color: 'priority-critical', bar: 'status-bar-reopened' },
};

const getStatusLabel = (s: string) => STATUS_MAP[s]?.label || s;
const getStatusColor = (s: string) => STATUS_MAP[s]?.color || 'status-closed';
const getPriorityLabel = (p: string) => PRIORITY_MAP[p]?.label || p;
const getPriorityColor = (p: string) => PRIORITY_MAP[p]?.color || 'priority-medium';
const getPriorityBar = (p: string) => PRIORITY_MAP[p]?.bar || '';

function toShortName(fullName: string | null | undefined): string {
  if (!fullName) return '—';
  const parts = fullName.trim().split(/\s+/);
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
  if (h < 6) return { text: 'Доброй ночи', icon: Moon };
  if (h < 12) return { text: 'Доброе утро', icon: Sun };
  if (h < 18) return { text: 'Добрый день', icon: CloudSun };
  return { text: 'Добрый вечер', icon: Moon };
};

/* ═══════════════════════════════════════════════════════════════════
   SPARKLINE
   ═══════════════════════════════════════════════════════════════════ */

const Sparkline = ({ data, color = '#ef4444' }: { data: number[]; color?: string }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100, h = 32;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   BAR CHART — КОМПАКТНЫЙ
   ═══════════════════════════════════════════════════════════════════ */

const BarChart = ({ data }: { data: { label: string; value: number; isToday?: boolean }[] }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);
  const hasActivity = total > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-1.5 h-32">
        {data.map((d, i) => {
          const height = (d.value / max) * 100;
          const hasValue = d.value > 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              {hasValue && (
                <span className={`text-[12px] font-bold tabular-nums ${
                  d.isToday ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/60'
                }`}>{d.value}</span>
              )}
              <div className="relative w-full flex items-end justify-center flex-1" style={{ minHeight: '3px' }}>
                <div
                  className={`w-full rounded-t-sm transition-all duration-500 ${
                    d.isToday
                      ? 'bg-gradient-to-t from-[var(--accent)] to-[var(--accent-light)]'
                      : hasValue
                        ? 'bg-gradient-to-t from-[var(--hover-2)] to-[var(--hover-1)]'
                        : 'bg-[var(--hover-1)]/30'
                  }`}
                  style={{ height: `${Math.max(height, hasValue ? 6 : 3)}%` }}
                />
              </div>
              <span className={`text-[12px] font-medium ${
                d.isToday ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]/40'
              }`}>{d.label}</span>
            </div>
          );
        })}
      </div>
      {!hasActivity && (
        <div className="text-center py-4 text-[var(--text-primary)]/40 text-[14px]">
          Нет активности за 7 дней
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const userRoles = user?.roles ?? [];
  const isCustomer = userRoles.includes('customer') || userRoles.includes('customer_admin');
  const isSupport = userRoles.includes('admin') || 
                    userRoles.includes('support_manager') || 
                    userRoles.includes('support_agent');

  const greeting = useMemo(() => getGreeting(), []);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const ticketsRes = await ticketsApi.getAll(1, 100);
      setTickets(ticketsRes.items);

      if (isCustomer && user?.counterparty_id) {
        counterpartiesApi.getById(user.counterparty_id).then(cp => setCounterparty(cp)).catch(() => {});
      }

      const projectsRes = isCustomer
        ? await projectsApi.getMyProjects('all', 1, 5).catch(() => ({ items: [] }))
        : await projectsApi.getAll(1, 5).catch(() => ({ items: [] }));
      setProjects(projectsRes.items ?? []);

      if (isSupport) {
        counterpartiesApi.getAll(1, 5).then(res => setCounterparties(res.items ?? [])).catch(() => {});
      }

      productsApi.getProducts({ page: 1, size: 1 })
        .then(res => setProductsCount(res.total_items ?? 0)).catch(() => {});
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: tickets.length,
    new: tickets.filter(t => t.status === 'new').length,
    inProgress: tickets.filter(t => t.status === 'in_progress' || t.status === 'open').length,
    critical: tickets.filter(t => t.priority === 'critical').length,
    resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
    waiting: tickets.filter(t => t.status === 'waiting').length,
  };

  const resolvePct = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

  const ticketsLast7Days = useMemo(() => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7;
    const counts = Array(7).fill(0);
    tickets.forEach(t => {
      const d = new Date(t.created_at);
      const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) {
        const dow = (d.getDay() + 6) % 7;
        counts[dow]++;
      }
    });
    return days.map((label, i) => ({ label, value: counts[i], isToday: i === todayDow }));
  }, [tickets]);

  const buildSparkData = (final: number) => {
    if (final === 0) return [0, 0, 0, 0, 0, 0, 0];
    return Array.from({ length: 7 }, (_, i) => {
      const progress = (i + 1) / 7;
      const noise = Math.sin(i * 1.5) * (final * 0.15);
      return Math.max(0, Math.round(final * progress + noise));
    });
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      <p className="text-[var(--text-primary)]/40 text-[15px]">Загружаем данные…</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border-color)] p-6 lg:p-8">
        <GridBackground variant="dots" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[var(--text-primary)]/50 text-[15px] font-medium
                            px-3 py-1.5 rounded-full bg-[var(--hover-1)] border border-[var(--border-color)]">
              <greeting.icon className="w-4 h-4" />
              {greeting.text}
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] tracking-tight">
              {user?.full_name || user?.username || 'Главная страница'}
            </h1>
            <p className="text-[14px] lg:text-[15px] text-[var(--text-primary)]/40">
              {new Date().toLocaleDateString('ru-RU', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40
                                 group-focus-within:text-[var(--accent)] transition-colors" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    navigate(`/tickets?search=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
                placeholder="Поиск заявок…"
                className="pl-11 pr-4 py-3 w-64 lg:w-72 rounded-2xl bg-[var(--hover-1)] border border-[var(--border-color)]
                           text-[var(--text-primary)] text-[15px] placeholder:text-[var(--text-muted)]
                           focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--hover-1)] transition-all"
              />
            </div>
            <button onClick={() => navigate('/tickets/new')}
              className="btn-primary py-3 px-5 lg:px-6 text-[15px] font-semibold gap-2 group rounded-2xl">
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              <span className="hidden sm:inline">Создать заявку</span>
              <span className="sm:hidden">Заявка</span>
            </button>
          </div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {[
          {
            label: 'Всего заявок', value: stats.total, icon: TicketIcon,
            iconBg: 'bg-[var(--info)]/8', iconColor: 'text-[var(--info)]',
            color: '#3b4ef6', sub: `${stats.new} новых`,
            trend: stats.new > 0 ? { val: stats.new, up: true } : null,
          },
          {
            label: 'В работе', value: stats.inProgress, icon: Timer,
            iconBg: 'bg-[var(--info)]/8', iconColor: 'text-[var(--info)]',
            color: '#3b82f6', sub: 'активных задач',
            trend: stats.new > 0 ? { val: stats.new, up: true } : null,
          },
          {
            label: 'Критических', value: stats.critical, icon: Flame,
            iconBg: 'bg-[var(--accent-soft)]', iconColor: 'text-[var(--accent)]',
            color: '#ef4444', sub: stats.waiting > 0 ? `${stats.waiting} ждут ответа` : 'нет критичных',
            trend: stats.critical > 0 ? { val: stats.critical, up: false } : null,
          },
          {
            label: 'Решено', value: stats.resolved, icon: CheckCircle2,
            iconBg: 'bg-[var(--success)]/8', iconColor: 'text-[var(--success)]',
            color: '#10b926', sub: `${resolvePct}% выполнения`,
            trend: resolvePct > 50 ? { val: resolvePct, up: true } : null,
          },
        ].map((card, idx) => (
          <div key={card.label}
            className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)]
                       p-4 lg:p-5 hover:border-[var(--border-hover)] transition-all duration-300 group"
            style={{ animationDelay: `${idx * 80}ms` }}>
            <GridBackground variant="grid" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3 lg:mb-4">
                <div className={`w-10 h-10 lg:w-11 lg:h-11 rounded-xl ${card.iconBg} flex items-center justify-center ring-1 ring-[var(--border-color)]`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                {card.trend && (
                  <span className={`flex items-center gap-1 text-[12px] lg:text-[13px] font-semibold tabular-nums px-2 py-1 rounded-lg ${
                    card.trend.up ? 'text-[var(--success)] bg-[var(--success)]/8' : 'text-[var(--accent)] bg-[var(--accent-soft)]'
                  }`}>
                    {card.trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {card.trend.val}
                  </span>
                )}
              </div>
              <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] mb-1 tabular-nums leading-none">{card.value}</p>
              <p className="text-[14px] lg:text-[15px] text-[var(--text-primary)]/50 font-medium mb-1">{card.label}</p>
              <p className="text-[12px] lg:text-[13px] text-[var(--text-primary)]/40 mb-3">{card.sub}</p>
              <div className="h-7 -mx-1">
                <Sparkline data={buildSparkData(card.value)} color={card.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ОСНОВНОЙ КОНТЕНТ — 2 колонки */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* ЛЕВАЯ КОЛОНКА (2/3) — Тикеты */}
        <div className="lg:col-span-2">
          <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)]">
            <GridBackground variant="dots" />
            <div className="relative z-10">
              <div className="px-5 lg:px-6 py-4 lg:py-5 border-b border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-[16px] lg:text-[17px] font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center ring-1 ring-[var(--accent)]/10">
                    <Ticket className="w-4 h-4 text-[var(--accent)]" />
                  </div>
                  Последние заявки
                  {tickets.length > 0 && (
                    <span className="ml-1 px-2.5 py-0.5 rounded-full bg-[var(--hover-1)] text-[12px] lg:text-[13px] text-[var(--text-primary)]/50 tabular-nums">
                      {tickets.length}
                    </span>
                  )}
                </h2>
                <Link to="/tickets"
                  className="text-[var(--accent)] hover:text-[var(--accent)] flex items-center gap-1.5 text-[14px] lg:text-[15px] font-medium transition-colors group/link">
                  Все <ArrowRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" />
                </Link>
              </div>

              {tickets.length === 0 ? (
                <div className="p-12 lg:p-14 text-center">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center mx-auto mb-5">
                    <FileText className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--text-primary)]/15" />
                  </div>
                  <p className="text-[var(--text-primary)]/70 text-[16px] lg:text-[17px] font-semibold mb-2">Заявок пока нет</p>
                  <p className="text-[var(--text-primary)]/40 text-[14px] lg:text-[15px] mb-6 max-w-xs mx-auto">
                    Создайте первую заявку, чтобы начать работу
                  </p>
                  <button onClick={() => navigate('/tickets/new')}
                    className="btn-primary inline-flex items-center gap-2 px-5 lg:px-6 py-3 rounded-xl text-white text-[15px] font-medium transition-all shadow-lg">
                    <Sparkles className="w-4 h-4" /> Создать
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {tickets.slice(0, 8).map(ticket => (
                    <Link key={ticket.id} to={`/tickets/${ticket.number}`}
                      className="flex items-center gap-3 lg:gap-4 px-4 lg:px-6 py-3 lg:py-4 hover:bg-[var(--hover-1)] transition-all duration-200 group relative">
                      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${getPriorityBar(ticket.priority)} opacity-60 group-hover:opacity-100 transition-opacity`} />
                      <div className="flex-1 min-w-0 pl-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[14px] lg:text-[15px] font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                            {ticket.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[var(--text-primary)]/50 font-mono text-[12px] lg:text-[13px]">#{ticket.number}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[12px] lg:text-[13px] font-medium border ${getStatusColor(ticket.status)}`}>
                            {getStatusLabel(ticket.status)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[12px] lg:text-[13px] font-medium border ${getPriorityColor(ticket.priority)}`}>
                            {getPriorityLabel(ticket.priority)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 lg:gap-3 flex-wrap mt-1.5 text-[11px] lg:text-[12px] text-[var(--text-primary)]/40">
                          {ticket.counterparty?.name && (
                            <span className="flex items-center gap-1 truncate max-w-[120px] lg:max-w-[140px]">
                              <Building2 className="w-2.5 h-2.5 lg:w-3 lg:h-3 flex-shrink-0" />
                              <span className="truncate">{ticket.counterparty.name}</span>
                            </span>
                          )}
                          {ticket.project?.key && (
                            <span className="flex items-center gap-1 font-mono">
                              <FolderOpen className="w-2.5 h-2.5 lg:w-3 lg:h-3 flex-shrink-0" />
                              <span className="truncate">{ticket.project.key}</span>
                            </span>
                          )}
                          {ticket.assignee?.full_name && (
                            <span className="flex items-center gap-1 truncate max-w-[100px] lg:max-w-[120px]">
                              <UserCheck className="w-2.5 h-2.5 lg:w-3 lg:h-3 flex-shrink-0" />
                              <span className="truncate">{toShortName(ticket.assignee.full_name)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[12px] lg:text-[13px] text-[var(--text-primary)]/40">{fmtDate(ticket.created_at)}</p>
                          <p className="text-[11px] lg:text-[12px] text-[var(--text-primary)]/25">{fmtTime(ticket.created_at)}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[var(--text-primary)]/15 group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (1/3) — Активность + Проекты + Контрагенты */}
        <div className="space-y-5 lg:space-y-6">
          
          {/* Активность за неделю */}
          <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)] p-5 lg:p-6">
            <GridBackground variant="grid" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4 lg:mb-5">
                <div>
                  <h3 className="text-[15px] lg:text-[16px] font-bold text-[var(--text-primary)] mb-0.5">Активность</h3>
                  <p className="text-[13px] lg:text-[14px] text-[var(--text-primary)]/40">заявок за 7 дней</p>
                </div>
                <div className="flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg bg-[var(--hover-1)]">
                  <BarChart3 className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[var(--text-primary)]/40" />
                  <span className="text-[14px] lg:text-[15px] font-semibold text-[var(--text-primary)] tabular-nums">
                    {ticketsLast7Days.reduce((s, d) => s + d.value, 0)}
                  </span>
                </div>
              </div>
              <BarChart data={ticketsLast7Days} />
            </div>
          </div>

          {/* Проекты */}
          <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)]">
            <GridBackground variant="grid" />
            <div className="relative z-10">
              <div className="px-5 lg:px-6 py-4 lg:py-5 border-b border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-[15px] lg:text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-[var(--text-primary)]/40" />
                  Проекты
                </h2>
                <Link to="/projects" className="text-[13px] lg:text-[14px] text-[var(--accent)] hover:text-[var(--accent)] font-medium">
                  Все →
                </Link>
              </div>
              {projects.length === 0 ? (
                <div className="p-8 lg:p-10 text-center">
                  <FolderOpen className="w-10 h-10 lg:w-12 lg:h-12 text-[var(--text-primary)]/10 mx-auto mb-3" />
                  <p className="text-[var(--text-primary)]/40 text-[14px]">Нет проектов</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {projects.slice(0, 4).map(proj => (
                    <Link key={proj.id} to={`/projects/${proj.id}`}
                      className="flex items-center gap-3 lg:gap-4 px-5 lg:px-6 py-3 lg:py-4 hover:bg-[var(--hover-1)] transition-all group">
                      <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-[var(--status-open-bg)] flex items-center justify-center flex-shrink-0 ring-1 ring-[var(--status-open-border)]">
                        <FolderOpen className="w-4 h-4 lg:w-5 lg:h-5 text-[var(--status-open-text)]/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] lg:text-[15px] font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {proj.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] lg:text-[12px] text-[var(--text-primary)]/40">{proj.key}</span>
                          <span className={`text-[11px] lg:text-[12px] px-1.5 py-0.5 rounded font-medium border ${
                            proj.status === 'active' ? 'status-resolved' : 'status-closed'
                          }`}>
                            {proj.status === 'active' ? 'Активен' : 'Архив'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-[var(--text-primary)]/15 group-hover:text-[var(--accent)] transition-all" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Контрагенты (support) */}
          {isSupport && counterparties.length > 0 && (
            <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)]">
              <GridBackground variant="dots" />
              <div className="relative z-10">
                <div className="px-5 lg:px-6 py-4 lg:py-5 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h2 className="text-[15px] lg:text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--text-primary)]/40" />
                    Контрагенты
                  </h2>
                  <Link to="/counterparties" className="text-[13px] lg:text-[14px] text-[var(--accent)] hover:text-[var(--accent)] font-medium">
                    Все →
                  </Link>
                </div>
                <div className="divide-y divide-[var(--border-color)]">
                  {counterparties.slice(0, 3).map(cp => (
                    <Link key={cp.id} to={`/counterparties/${cp.id}`}
                      className="flex items-center gap-3 lg:gap-4 px-5 lg:px-6 py-3 lg:py-4 hover:bg-[var(--hover-1)] transition-all group">
                      <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-[var(--status-waiting-bg)] flex items-center justify-center flex-shrink-0 ring-1 ring-[var(--status-waiting-border)]">
                        <Building2 className="w-4 h-4 lg:w-5 lg:h-5 text-[var(--status-waiting-text)]/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] lg:text-[15px] font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {cp.name}
                        </p>
                        <p className="text-[11px] lg:text-[12px] text-[var(--text-primary)]/40 truncate">
                          {cp.inn && <span className="font-mono">ИНН {cp.inn}</span>}
                        </p>
                      </div>
                      <span className={`text-[11px] lg:text-[12px] px-2 py-0.5 rounded-lg font-medium flex-shrink-0 border ${
                        cp.is_active ? 'status-resolved' : 'status-closed'
                      }`}>
                        {cp.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Карточка контрагента (клиент) */}
          {isCustomer && counterparty && (
            <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)]">
              <div className="h-20 lg:h-24 bg-gradient-to-br from-[var(--accent)]/20 via-[var(--accent)]/10 to-transparent relative overflow-hidden">
                <GridBackground variant="grid" />
                <div className="absolute bottom-0 left-4 lg:left-5 translate-y-1/2 z-10">
                  <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)]
                                  flex items-center justify-center shadow-xl shadow-red-900/30 ring-4 ring-[var(--bg-primary)]">
                    <Building2 className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                  </div>
                </div>
              </div>
              <div className="px-4 lg:px-5 pt-8 lg:pt-10 pb-4 lg:pb-5">
                <p className="text-[15px] lg:text-[16px] font-bold text-[var(--text-primary)]">{counterparty.name}</p>
                <p className="text-[12px] lg:text-[13px] text-[var(--text-primary)]/40 mb-3">{counterparty.counterparty_type}</p>
                <div className="space-y-2 text-[13px] lg:text-[14px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-primary)]/40">ИНН</span>
                    <span className="text-[var(--text-primary)]/80 font-mono text-[12px] lg:text-[13px] bg-[var(--hover-1)] px-2 py-1 rounded-md">
                      {counterparty.inn}
                    </span>
                  </div>
                </div>
                <Link to="/my-company"
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 lg:py-3 rounded-xl
                             bg-[var(--hover-1)] hover:bg-[var(--hover-1)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)]
                             text-[14px] lg:text-[15px] font-medium transition-all">
                  Подробнее <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Сводка (support) */}
          {isSupport && (
            <div className="relative overflow-hidden glass-card rounded-2xl border border-[var(--border-color)] p-4 lg:p-5">
              <GridBackground variant="grid" />
              <div className="relative z-10">
                <p className="text-[13px] lg:text-[14px] uppercase tracking-[0.12em] text-[var(--text-primary)]/35 font-bold mb-3 lg:mb-4">
                  Сводка
                </p>
                <div className="space-y-0.5 lg:space-y-1">
                  {[
                    { label: 'Контрагентов', value: counterparties.length, icon: Building2,
                      color: 'text-[var(--status-waiting-text)]', bg: 'bg-[var(--status-waiting-bg)]', ring: 'ring-[var(--status-waiting-border)]' },
                    { label: 'Проектов', value: projects.length, icon: FolderOpen,
                      color: 'text-[var(--status-open-text)]', bg: 'bg-[var(--status-open-bg)]', ring: 'ring-[var(--status-open-border)]' },
                    { label: 'Продуктов', value: productsCount, icon: Package,
                      color: 'text-[var(--status-agreement-text)]', bg: 'bg-[var(--status-agreement-bg)]', ring: 'ring-[var(--status-agreement-border)]' },
                  ].map(row => (
                    <div key={row.label}
                      className="flex items-center justify-between py-2 lg:py-2.5 px-2 lg:px-3 rounded-lg hover:bg-[var(--hover-1)] transition-colors">
                      <span className="flex items-center gap-2 lg:gap-3 text-[13px] lg:text-[14px] text-[var(--text-primary)]/60">
                        <div className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg ${row.bg} flex items-center justify-center ring-1 ${row.ring}`}>
                          <row.icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 ${row.color}`} />
                        </div>
                        {row.label}
                      </span>
                      <span className="text-[15px] lg:text-[16px] font-bold text-[var(--text-primary)] tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}