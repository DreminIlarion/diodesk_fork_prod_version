// pages/TicketsPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, FileText, ChevronRight, ChevronLeft, Loader2,
  Clock, AlertTriangle, CheckCircle2, Calendar, XCircle,
  Building2, User, X, SlidersHorizontal, ChevronDown, Check,
  Sparkles, Flame, MessageSquare, HelpCircle, Edit3, FolderOpen,
  UserCheck, Ticket,
} from 'lucide-react';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import type { TicketListItem, Counterparty, Project, SimpleUser } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   СТАТУСЫ
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  'new': { label: 'Новый', color: 'status-new' },
  'pending_approval': { label: 'На согласовании', color: 'status-agreement' },
  'open': { label: 'Открыт', color: 'status-open' },
  'in_progress': { label: 'В работе', color: 'status-progress' },
  'waiting': { label: 'Ожидает ответа', color: 'status-waiting' },
  'resolved': { label: 'Решён', color: 'status-resolved' },
  'closed': { label: 'Закрыт', color: 'status-closed' },
  'reopened': { label: 'Переоткрыт', color: 'status-reopened' },
  'rejected': { label: 'Отклонён', color: 'status-rejected' },
  'cancelled': { label: 'Отменён', color: 'status-closed' },
};

const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([value, { label, color }]) => ({
  value, label, color,
}));

/* ═══════════════════════════════════════════════════════════════════
   ПРИОРИТЕТЫ
   ═══════════════════════════════════════════════════════════════════ */

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  'low': { label: 'Низкий', color: 'priority-low' },
  'medium': { label: 'Средний', color: 'priority-medium' },
  'high': { label: 'Высокий', color: 'priority-high' },
  'critical': { label: 'Критический', color: 'priority-critical' },
};

const PRIORITY_OPTIONS = Object.entries(PRIORITY_MAP).map(([value, { label, color }]) => ({
  value, label, color,
}));

/* ═══════════════════════════════════════════════════════════════════
   ТИПЫ ЗАЯВОК
   ═══════════════════════════════════════════════════════════════════ */

const TICKET_TYPES: { value: string; label: string; icon: ReactNode; color: string }[] = [
  { value: 'Инцидент', label: 'Инцидент', icon: <AlertTriangle size={14} />, color: 'type-incident' },
  { value: 'Запрос на услугу', label: 'Запрос на услугу', icon: <CheckCircle2 size={14} />, color: 'type-service' },
  { value: 'Консультация', label: 'Консультация', icon: <HelpCircle size={14} />, color: 'type-consultation' },
  { value: 'Жалоба', label: 'Жалоба', icon: <AlertTriangle size={14} />, color: 'type-complaint' },
  { value: 'Задача', label: 'Задача', icon: <CheckCircle2 size={14} />, color: 'type-task' },
  { value: 'Проблема', label: 'Проблема', icon: <AlertTriangle size={14} />, color: 'type-problem' },
  { value: 'Запрос на изменение', label: 'Запрос на изменение', icon: <Edit3 size={14} />, color: 'type-change' },
  { value: 'Улучшение', label: 'Улучшение', icon: <Sparkles size={14} />, color: 'type-improvement' },
  { value: 'Прочее', label: 'Прочее', icon: <MessageSquare size={14} />, color: 'type-other' },
];

/* ═══════════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════════ */

function toShortName(fullName: string | null | undefined): string {
  if (!fullName) return '—';
  if (fullName === 'ФИО не указано') return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [last, first, middle] = parts;
  const initials = [first, middle].filter(Boolean).map(p => `${p[0].toUpperCase()}.`).join('');
  return initials ? `${last} ${initials}` : last;
}

function formatDate(d: string): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - compareDate.getTime()) / 86400000);
  if (diffDays === 0)
    return `Сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Безопасно достаём items из любого ответа API */
function toItems<T>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res?.items)) return res.items as T[];
  return [];
}

/* ═══════════════════════════════════════════════════════════════════
   ИНТЕРФЕЙСЫ
   ═══════════════════════════════════════════════════════════════════ */

interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  color?: string;
}

interface FilterDropdownProps {
  label: string;
  icon?: ReactNode;
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  loading?: boolean;
  multiple?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   FILTER DROPDOWN — ИСПРАВЛЕННЫЙ
   Ключевое: убран w-max, добавлен max-w и right-0 fallback
   ═══════════════════════════════════════════════════════════════════ */

function FilterDropdown({
  label, icon, options, value, onChange,
  placeholder = 'Все', searchable = false, loading = false, multiple = false,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setQuery('');
  }, [open, searchable]);

  const selectedValues = multiple
    ? (Array.isArray(value) ? value : [])
    : [value as string].filter(Boolean);

  const selected = multiple
    ? options.filter(o => selectedValues.includes(o.value))
    : options.find(o => o.value === value);

  const filtered = query
    ? options.filter(o =>
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      o.sublabel?.toLowerCase().includes(query.toLowerCase()))
    : options;

  const hasValue = selectedValues.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5
          rounded-xl border text-base transition-all whitespace-nowrap cursor-pointer
          ${open
            ? 'bg-[var(--hover-2)] border-[var(--accent)]/40 text-[var(--text-primary)]'
            : hasValue
              ? 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/90'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
          }`}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {icon && (
            <span className={`flex-shrink-0 ${hasValue ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}>
              {icon}
            </span>
          )}
          {hasValue ? (
            <span className="flex items-center gap-2 truncate min-w-0">
              {multiple ? (
                (selected as DropdownOption[]).length === 1 ? (
                  <>
                    {(selected as DropdownOption[])[0].color && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `var(--${(selected as DropdownOption[])[0].color}-text)` }} />
                    )}
                    <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                  </>
                ) : (
                  <>
                    <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                    <span className="text-[var(--text-primary)]/40 flex-shrink-0">
                      +{(selected as DropdownOption[]).length - 1}
                    </span>
                  </>
                )
              ) : (
                <>
                  {(selected as DropdownOption)?.color && (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `var(--${(selected as DropdownOption).color}-text)` }} />
                  )}
                  <span className="truncate">{(selected as DropdownOption)?.label}</span>
                </>
              )}
            </span>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </span>

        {loading ? (
          <Loader2 size={18} className="text-[var(--text-primary)]/40 animate-spin flex-shrink-0" />
        ) : hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(multiple ? [] : ''); setOpen(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation(); onChange(multiple ? [] : ''); setOpen(false);
              }
            }}
            className="ml-1 p-0.5 rounded-md hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40
                       hover:text-[var(--text-primary)]/60 cursor-pointer transition-colors flex-shrink-0"
          >
            <X size={18} />
          </span>
        ) : (
          <ChevronDown
            size={18}
            className={`text-[var(--text-primary)]/40 transition-transform duration-200 flex-shrink-0
                        ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* ▼ DROPDOWN MENU — фиксированная ширина, не вылезает ▼ */}
      {open && (
        <div
          className="absolute z-[100] top-full mt-2 left-0 w-[280px]
                     bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl
                     overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)]
                             border border-[var(--border-color)] text-base text-[var(--text-primary)]
                             placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-hover)]"
                />
              </div>
            </div>
          )}
          <div className="py-1.5 max-h-[300px] overflow-y-auto">
            {!multiple && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                  ${!value
                    ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)]'
                  }`}
              >
                {!value
                  ? <Check size={18} className="text-[var(--accent)] flex-shrink-0" />
                  : <span className="w-4 flex-shrink-0" />}
                <span>{placeholder}</span>
              </button>
            )}
            <div className="h-px bg-[var(--hover-2)] mx-3 my-1" />
            {loading ? (
              <div className="px-4 py-6 text-center text-base text-[var(--text-muted)]">
                <Loader2 size={18} className="animate-spin mx-auto mb-2" /> Загрузка...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-base text-[var(--text-muted)]">
                Ничего не найдено
              </div>
            ) : filtered.map(option => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    if (multiple) {
                      const current = Array.isArray(value) ? value : [];
                      onChange(
                        current.includes(option.value)
                          ? current.filter(v => v !== option.value)
                          : [...current, option.value]
                      );
                    } else {
                      onChange(option.value);
                      setOpen(false);
                      setQuery('');
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                    ${isSelected
                      ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)]'
                    }`}
                >
                  {isSelected
                    ? <Check size={18} className="text-[var(--accent)] flex-shrink-0" />
                    : <span className="w-4 flex-shrink-0" />}
                  {option.color ? (
                    <span className={`px-2.5 py-1 rounded-lg text-base font-medium border ${option.color}`}>
                      {option.label}
                    </span>
                  ) : (
                    <div className="min-w-0 overflow-hidden">
                      <span className="block truncate">{option.label}</span>
                      {option.sublabel && (
                        <span className="block text-base text-[var(--text-muted)] truncate">
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: number; icon: ElementType; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] p-4 flex items-center gap-3
                    hover:border-[var(--border-hover)] hover:-translate-y-0.5 transition-all duration-200">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)] leading-none mb-0.5">{value}</p>
        <p className="text-base text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FILTER TAG
   ═══════════════════════════════════════════════════════════════════ */

function FilterTag({ label, icon, colorClass, onRemove }: {
  label: string; icon?: ReactNode; colorClass?: string; onRemove: () => void;
}) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-base border
      transition-all hover:opacity-80
      ${colorClass || 'bg-[var(--hover-2)] text-[var(--text-primary)]/80 border-[var(--border-color)]'}`}>
      {icon}
      <span className="truncate max-w-[180px]">{label}</span>
      <X size={12}
        className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TICKET ROW
   ═══════════════════════════════════════════════════════════════════ */

function TicketRow({ ticket, showAssignee, showReporter }: {
  ticket: TicketListItem;
  showAssignee: boolean;
  showReporter: boolean;
}) {
  const statusLabel = STATUS_MAP[ticket.status]?.label || ticket.status;
  const statusColor = STATUS_MAP[ticket.status]?.color || 'status-closed';
  const priorityLabel = PRIORITY_MAP[ticket.priority]?.label || ticket.priority;
  const priorityColor = PRIORITY_MAP[ticket.priority]?.color || 'priority-medium';

  return (
    <Link
      to={`/tickets/${ticket.number}`}
      className="grid items-start px-4 py-3.5 rounded-xl
                 hover:bg-[var(--hover-1)] active:bg-[var(--hover-2)]
                 transition-colors duration-100 group"
      style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 160px 120px 110px 20px' }}
    >
      <div className="min-w-0 pr-3">
        <span className="text-[17px] font-semibold text-[var(--text-primary)] block leading-snug
                         group-hover:text-[var(--accent-light)] transition-colors line-clamp-1">
          {ticket.title}
        </span>
        <span className="text-[15px] font-mono text-[var(--text-primary)]/65 mt-0.5 block">
          {ticket.number}
        </span>
      </div>

      <div className="min-w-0 pr-2 self-center">
        {ticket.counterparty?.name ? (
          <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/60 truncate">
            <Building2 size={18} className="shrink-0 text-[var(--text-primary)]/40" />
            <span className="truncate">{ticket.counterparty.name}</span>
          </span>
        ) : (
          <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
        )}
        {ticket.project?.key && (
          <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/35 mt-0.5 truncate">
            <FolderOpen size={18} className="shrink-0" />
            <span className="font-mono truncate">{ticket.project.key}</span>
          </span>
        )}
      </div>

      <div className="min-w-0 pr-2 self-center">
        {showAssignee && (
          (ticket.assignee?.full_name || ticket.assignee?.username) ? (
            <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/60 truncate">
              <UserCheck size={18} className="shrink-0 text-[var(--text-primary)]/40" />
              <span className="truncate">
                {toShortName(ticket.assignee.full_name || ticket.assignee.username)}
              </span>
            </span>
          ) : (
            <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
          )
        )}
        {showReporter && (
          (ticket.reporter?.full_name || ticket.reporter?.username) ? (
            <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/35 mt-0.5 truncate">
              <User size={18} className="shrink-0" />
              <span className="truncate">
                {toShortName(ticket.reporter.full_name || ticket.reporter.username)}
              </span>
            </span>
          ) : null
        )}
        {!showAssignee && !showReporter && (
          <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
        )}
      </div>

      <div className="self-center">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[16px] font-semibold
                         border whitespace-nowrap ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="self-center">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[16px] font-semibold
                         border whitespace-nowrap ${priorityColor}`}>
          {priorityLabel}
        </span>
      </div>

      <div className="self-center text-right">
        <span className="text-[15px] text-[var(--text-primary)]/45 whitespace-nowrap">
          {formatDate(ticket.created_at)}
        </span>
      </div>

      <div className="self-center flex justify-end">
        <ChevronRight size={18}
          className="text-[var(--text-primary)]/20 group-hover:text-[var(--accent-light)]
                     group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TABLE HEADER
   ═══════════════════════════════════════════════════════════════════ */

function TableHeader({ showAssigneeCol }: { showAssigneeCol: boolean }) {
  const cols: { label: ReactNode; align?: string }[] = [
    { label: <><span>Тема /</span><br /><span>Номер</span></> },
    { label: <><span>Контрагент /</span><br /><span>Проект</span></> },
    { label: showAssigneeCol ? <><span>Исполнитель /</span><br /><span>Автор</span></> : '' },
    { label: 'Статус' },
    { label: 'Приоритет' },
    { label: 'Дата', align: 'text-right' },
    { label: '' },
  ];
  return (
    <div
      className="hidden lg:grid px-4 py-2 text-[13px] uppercase tracking-widest
                 font-semibold text-[var(--text-primary)]/25 border-b border-[var(--border-color)]"
      style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 160px 120px 110px 20px' }}
    >
      {cols.map((c, i) => (
        <div key={i} className={c.align || ''}>{c.label}</div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════════ */

function EmptyState({ hasFilters, hasSearch, onCreateClick }: {
  hasFilters: boolean; hasSearch: boolean; onCreateClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] p-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center mx-auto mb-6">
        <FileText className="w-10 h-10 text-[var(--text-primary)]/20" />
      </div>
      <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Нет заявок</h3>
      <p className="text-base text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
        {hasSearch
          ? 'По вашему запросу ничего не найдено'
          : hasFilters
            ? 'Попробуйте изменить параметры фильтрации'
            : 'Создайте первую заявку, чтобы начать работу'}
      </p>
      {!hasFilters && !hasSearch && (
        <button onClick={onCreateClick} className="btn-primary py-4 px-8 text-base">
          <Plus size={18} /> Создать заявку
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ОСНОВНОЙ КОМПОНЕНТ
   ═══════════════════════════════════════════════════════════════════ */

export default function TicketsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();

  /* ── Роли ── */
  const roles = user?.roles ?? [];
  const isCustomer = roles.includes('customer');
  const isCustomerAdmin = roles.includes('customer_admin');
  const isClientUser = isCustomer || isCustomerAdmin;

  /*
    Видимость фильтров:
    ┌──────────────────┬──────────┬────────────────┬──────────────┐
    │ Фильтр           │ customer │ customer_admin │ остальные    │
    ├──────────────────┼──────────┼────────────────┼──────────────┤
    │ Контрагент       │ ❌       │ ❌             │ ✅           │
    │ Исполнитель      │ ❌       │ ❌             │ ✅           │
    │ Автор            │ ❌       │ ✅             │ ✅           │
    │ Проект           │ ✅ (свои)│ ✅ (свои)      │ ✅ (все)     │
    └──────────────────┴──────────┴────────────────┴──────────────┘
  */
  const showCounterpartyFilter = !isClientUser;
  const showAssigneeFilter = !isClientUser;
  const showReporterFilter = !isCustomer;  // customer_admin + остальные
  const showAssigneeCol = !isClientUser;
  const showReporterCol = !isCustomer;

  /* ── State ── */
  const initialSearch = searchParams.get('search') || '';

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [reporterFilter, setReporterFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showFilters, setShowFilters] = useState(false);

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  /* ── Debounce поиска ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Загрузка проектов для клиентов (getMyProjects) ── */
  useEffect(() => {
    if (!isClientUser) return;
    setLoadingProjects(true);
    projectsApi.getMyProjects()
      .then((res: any) => setProjects(toItems<Project>(res)))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [isClientUser]);

  /* ── Загрузка справочников при открытии фильтров ── */
  useEffect(() => {
    if (!showFilters) return;

    if (showCounterpartyFilter && counterparties.length === 0) {
      setLoadingCounterparties(true);
      counterpartiesApi.getAll(1, 100)
        .then(res => setCounterparties(toItems<Counterparty>(res)))
        .finally(() => setLoadingCounterparties(false));
    }

    // Проекты для не-клиентов (у клиентов уже загружены выше)
    if (!isClientUser && projects.length === 0) {
      setLoadingProjects(true);
      projectsApi.getAll(1, 100)
        .then(res => setProjects(toItems<Project>(res)))
        .finally(() => setLoadingProjects(false));
    }

    if ((showAssigneeFilter || showReporterFilter) && users.length === 0) {
      setLoadingUsers(true);
      usersApi.getAllUsers(1, 100)
        .then(res => setUsers(toItems<SimpleUser>(res)))
        .finally(() => setLoadingUsers(false));
    }
  }, [showFilters]);

  /* ── Сборка параметров фильтрации ──
     Для клиентов НЕ передаём project_ids принудительно.
     Бэкенд сам фильтрует по контрагенту текущего пользователя.
     Фронт передаёт project_ids ТОЛЬКО если пользователь явно выбрал проект в фильтре.
  */
  const buildFilters = useCallback(() => ({
    query: debouncedSearch || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    priority: priorityFilter || undefined,
    ticket_type: typeFilter || undefined,
    counterparty_id: showCounterpartyFilter && counterpartyFilter ? counterpartyFilter : undefined,
    project_ids: projectFilter.length > 0 ? projectFilter : undefined,
    assignee_id: showAssigneeFilter && assigneeFilter ? assigneeFilter : undefined,
    reporter_id: showReporterFilter && reporterFilter ? reporterFilter : undefined,
    created_after: dateFrom || undefined,
    created_before: dateTo || undefined,
  }), [
    debouncedSearch, statusFilter, priorityFilter, typeFilter,
    counterpartyFilter, projectFilter, assigneeFilter, reporterFilter,
    dateFrom, dateTo,
    showCounterpartyFilter, showAssigneeFilter, showReporterFilter,
  ]);

  /* ── Загрузка тикетов ── */
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const response = await ticketsApi.getAll(1, 9, buildFilters());
      setTickets(response.items);
      setTotalPages(response.total_pages);
      setTotalItems(response.total_items);
    } catch (e) {
      console.error('loadTickets error:', e);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  /* ── Пагинация ── */
  const handlePageChange = async (pageNum: number) => {
    setPage(pageNum);
    setLoading(true);
    try {
      const response = await ticketsApi.getAll(pageNum, 9, buildFilters());
      setTickets(response.items);
      setTotalPages(response.total_pages);
      setTotalItems(response.total_items);
    } catch (e) {
      console.error('handlePageChange error:', e);
    } finally {
      setLoading(false);
    }
  };

  /* ── Сброс фильтров ── */
  const resetFilters = () => {
    setStatusFilter([]);
    setPriorityFilter('');
    setTypeFilter('');
    setCounterpartyFilter('');
    setProjectFilter([]);
    setAssigneeFilter('');
    setReporterFilter('');
    setSearch('');
    setDebouncedSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  /* ── Счётчики ── */
  const hasFilters = !!(
    statusFilter.length || priorityFilter || typeFilter ||
    (showCounterpartyFilter && counterpartyFilter) ||
    projectFilter.length ||
    (showAssigneeFilter && assigneeFilter) ||
    (showReporterFilter && reporterFilter) ||
    dateFrom || dateTo
  );
  const hasActiveFilters = !!(hasFilters || debouncedSearch);

  const activeFiltersCount = [
    statusFilter.length > 0,
    !!priorityFilter,
    !!typeFilter,
    showCounterpartyFilter && !!counterpartyFilter,
    projectFilter.length > 0,
    showAssigneeFilter && !!assigneeFilter,
    showReporterFilter && !!reporterFilter,
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length;

  /* ── Helpers ── */
  const getStatusColor = (s: string) => STATUS_MAP[s]?.color || 'status-closed';
  const getPriorityColor = (p: string) => PRIORITY_MAP[p]?.color || 'priority-medium';
  const getTypeColor = (t: string) => TICKET_TYPES.find(x => x.value === t)?.color || 'type-other';
  const getStatusLabel = (s: string) => STATUS_MAP[s]?.label || s;
  const getPriorityLabel = (p: string) => PRIORITY_MAP[p]?.label || p;

  const counterpartyOptions: DropdownOption[] = counterparties.map(c => ({
    value: c.id,
    label: c.name || c.legal_name || c.inn || 'Без названия',
    sublabel: c.inn ? `ИНН: ${c.inn}` : undefined,
  }));

  const projectOptions: DropdownOption[] = projects.map(p => ({
    value: p.id,
    label: p.name,
    sublabel: p.key,
  }));

  const userOptions: DropdownOption[] = users.map(u => ({
    value: u.id,
    label: u.full_name || u.username || u.email || 'Без имени',
    sublabel: u.email,
  }));

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1.5">
            {isClientUser ? 'Мои заявки' : 'Заявки'}
          </h1>
          <p className="text-base text-[var(--text-primary)]/50">
            Управление обращениями
            {totalItems > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--hover-1)]
                               text-[var(--text-secondary)] text-base">
                {totalItems}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => navigate('/tickets/new')}
          className="btn-primary py-4 px-8 text-base font-semibold">
          <Plus size={18} /> Создать заявку
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Всего" value={totalItems}
          icon={Ticket} color="text-[var(--text-secondary)]" bg="bg-[var(--hover-1)]" />
        <StatCard label="Новых" value={tickets.filter(t => t.status === 'new').length}
          icon={Clock} color="text-[var(--status-new-text)]" bg="bg-[var(--status-new-bg)]" />
        <StatCard label="В работе" value={tickets.filter(t => t.status === 'in_progress' || t.status === 'open').length}
          icon={CheckCircle2} color="text-[var(--status-progress-text)]" bg="bg-[var(--status-progress-bg)]" />
        <StatCard label="Критических" value={tickets.filter(t => t.priority === 'critical').length}
          icon={AlertTriangle} color="text-[var(--priority-critical-text)]" bg="bg-[var(--priority-critical-bg)]" />
      </div>

      {/* ── Search + Filters toggle ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по теме, номеру..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 glass-card border border-[var(--border-color)] rounded-xl
                       text-[var(--text-primary)] text-base placeholder-[var(--text-muted)]
                       focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2
                       focus:ring-[var(--accent)]/10 transition-all"
          />
          {search && !loading && (
            <button type="button"
              onClick={() => { setSearch(''); setDebouncedSearch(''); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md
                         text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60
                         hover:bg-[var(--hover-2)] transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-base
            transition-all whitespace-nowrap cursor-pointer
            ${showFilters || activeFiltersCount > 0
              ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-primary)]'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
            }`}
        >
          <SlidersHorizontal size={18}
            className={showFilters || activeFiltersCount > 0
              ? 'text-[var(--accent)]'
              : 'text-[var(--text-primary)]/40'} />
          <span>Фильтры</span>
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[15px]
                             font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div className="rounded-xl border border-[var(--border-color)] p-3.5 space-y-3
                        animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--text-primary)]/40
                             uppercase tracking-widest">
              Фильтрация
            </span>
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="text-base text-[var(--accent)] hover:text-[var(--accent-light)]
                           flex items-center gap-1 transition-colors">
                <X size={18} /> Сбросить
              </button>
            )}
          </div>

          {/* Сетка фильтров — overflow-visible чтобы dropdown не обрезался,
              но контейнер не расширяется за пределы страницы */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 items-start">

            <FilterDropdown
              label="Статус"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={v => setStatusFilter(Array.isArray(v) ? v : [v])}
              placeholder="Все статусы"
              multiple
            />

            <FilterDropdown
              label="Приоритет"
              options={PRIORITY_OPTIONS}
              value={priorityFilter}
              onChange={v => setPriorityFilter(v as string)}
              placeholder="Все приоритеты"
            />

            <FilterDropdown
              label="Тип заявки"
              options={TICKET_TYPES.map(t => ({ value: t.value, label: t.label }))}
              value={typeFilter}
              onChange={v => setTypeFilter(v as string)}
              placeholder="Все типы"
            />

            {showCounterpartyFilter && (
              <FilterDropdown
                label="Контрагент"
                options={counterpartyOptions}
                value={counterpartyFilter}
                onChange={v => setCounterpartyFilter(v as string)}
                placeholder="Все контрагенты"
                searchable
                loading={loadingCounterparties}
              />
            )}

            <FilterDropdown
              label="Проект"
              options={projectOptions}
              value={projectFilter}
              onChange={v => setProjectFilter(Array.isArray(v) ? v : [v])}
              placeholder="Все проекты"
              searchable
              multiple
              loading={loadingProjects}
            />

            {showAssigneeFilter && (
              <FilterDropdown
                label="Исполнитель"
                options={userOptions}
                value={assigneeFilter}
                onChange={v => setAssigneeFilter(v as string)}
                placeholder="Все исполнители"
                searchable
                loading={loadingUsers}
              />
            )}

            {showReporterFilter && (
              <FilterDropdown
                label="Автор"
                options={userOptions}
                value={reporterFilter}
                onChange={v => setReporterFilter(v as string)}
                placeholder="Все авторы"
                searchable
                loading={loadingUsers}
              />
            )}

            {/* Дата — занимает 2 колонки на sm+ */}
            <div className="sm:col-span-2 xl:col-span-2">
              <label className="text-sm text-[var(--text-primary)]/50 mb-1.5 block font-medium">
                Дата создания
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[var(--border-color)]
                             bg-[var(--hover-1)] text-[var(--text-primary)] text-sm
                             focus:outline-none focus:border-[var(--accent)]/40"
                />
                <span className="text-[var(--text-muted)] text-sm shrink-0">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[var(--border-color)]
                             bg-[var(--hover-1)] text-[var(--text-primary)] text-sm
                             focus:outline-none focus:border-[var(--accent)]/40"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Filter Tags ── */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-base text-[var(--text-primary)]/40 flex items-center gap-1.5">
            <SlidersHorizontal size={18} /> Фильтры:
          </span>

          {debouncedSearch && (
            <FilterTag label={`«${debouncedSearch}»`} icon={<Search size={12} />}
              onRemove={() => { setSearch(''); setDebouncedSearch(''); }} />
          )}
          {statusFilter.map(s => (
            <FilterTag key={s} label={getStatusLabel(s)}
              colorClass={`${getStatusColor(s)} border`}
              onRemove={() => setStatusFilter(statusFilter.filter(f => f !== s))} />
          ))}
          {priorityFilter && (
            <FilterTag label={getPriorityLabel(priorityFilter)}
              colorClass={`${getPriorityColor(priorityFilter)} border`}
              onRemove={() => setPriorityFilter('')} />
          )}
          {typeFilter && (
            <FilterTag label={typeFilter}
              colorClass={`${getTypeColor(typeFilter)} border`}
              onRemove={() => setTypeFilter('')} />
          )}
          {showCounterpartyFilter && counterpartyFilter && (
            <FilterTag
              label={counterparties.find(c => c.id === counterpartyFilter)?.name || 'Контрагент'}
              onRemove={() => setCounterpartyFilter('')} />
          )}
          {projectFilter.map(p => (
            <FilterTag key={p}
              label={projects.find(proj => proj.id === p)?.name || 'Проект'}
              onRemove={() => setProjectFilter(projectFilter.filter(f => f !== p))} />
          ))}
          {showAssigneeFilter && assigneeFilter && (
            <FilterTag
              label={users.find(u => u.id === assigneeFilter)?.full_name || 'Исполнитель'}
              onRemove={() => setAssigneeFilter('')} />
          )}
          {showReporterFilter && reporterFilter && (
            <FilterTag
              label={users.find(u => u.id === reporterFilter)?.full_name || 'Автор'}
              onRemove={() => setReporterFilter('')} />
          )}
          {dateFrom && dateTo && (
            <FilterTag
              label={`${new Date(dateFrom).toLocaleDateString('ru-RU')} — ${new Date(dateTo).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />}
              onRemove={() => { setDateFrom(''); setDateTo(''); }} />
          )}
          {dateFrom && !dateTo && (
            <FilterTag label={`С ${new Date(dateFrom).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />} onRemove={() => setDateFrom('')} />
          )}
          {!dateFrom && dateTo && (
            <FilterTag label={`По ${new Date(dateTo).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />} onRemove={() => setDateTo('')} />
          )}
          <button onClick={resetFilters}
            className="text-base text-[var(--accent)]/60 hover:text-[var(--accent)]
                       transition-colors ml-1">
            Сбросить
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !initialLoad && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--hover-1)]
                          border border-[var(--border-color)]">
            <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
            <span className="text-base text-[var(--text-muted)]">Загрузка...</span>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {tickets.length === 0 && !loading ? (
        <EmptyState hasFilters={hasFilters} hasSearch={!!debouncedSearch}
          onCreateClick={() => navigate('/tickets/new')} />
      ) : tickets.length > 0 ? (
        <>
          {/* Desktop */}
          <div className="hidden lg:block rounded-xl border border-[var(--border-color)] overflow-hidden">
            <TableHeader showAssigneeCol={showAssigneeCol || showReporterCol} />
            <div className="divide-y divide-[var(--border-color)]/40 px-1 py-1">
              {tickets.map(ticket => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  showAssignee={showAssigneeCol}
                  showReporter={showReporterCol}
                />
              ))}
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden space-y-2">
            {tickets.map(ticket => {
              const closed = ticket.status === 'closed' || ticket.status === 'resolved';
              const typeInfo = TICKET_TYPES.find(t => t.value === ticket.type);
              const sLabel = STATUS_MAP[ticket.status]?.label || ticket.status;
              const pLabel = PRIORITY_MAP[ticket.priority]?.label || ticket.priority;

              return (
                <Link key={ticket.id} to={`/tickets/${ticket.number}`}
                  className="glass-card rounded-xl border border-[var(--border-color)] p-4 block
                             hover:bg-[var(--hover-1)] hover:border-[var(--border-hover)]
                             transition-all group">
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base font-mono text-[var(--accent-light)]
                                       bg-[var(--accent-soft)]/50 px-1.5 py-0.5 rounded-md
                                       border border-[var(--accent)]/10 whitespace-nowrap">
                        {ticket.number}
                      </span>
                      {!closed ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Активна
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                          <XCircle size={18} /> Закрыта
                        </span>
                      )}
                    </div>
                    <ChevronRight size={18}
                      className="text-[var(--text-muted)] group-hover:text-[var(--accent-light)]
                                 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>

                  <h3 className="text-[18px] font-semibold text-[var(--text-primary)] mb-3
                                 leading-snug group-hover:text-[var(--accent-light)]
                                 transition-colors line-clamp-2">
                    {ticket.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg
                                     text-[15px] font-medium border ${getTypeColor(ticket.type)}`}>
                      {typeInfo?.icon} {ticket.type}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg
                                     text-[15px] font-medium border ${getStatusColor(ticket.status)}`}>
                      {sLabel}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg
                                     text-[15px] font-medium border
                                     ${PRIORITY_MAP[ticket.priority]?.color || 'priority-medium'}`}>
                      {ticket.priority === 'critical' && <Flame size={18} />} {pLabel}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base
                                  text-[var(--text-muted)] border-t border-[var(--border-color)] pt-2.5">
                    <span className="flex items-center gap-1">
                      <Calendar size={18} />{formatDate(ticket.created_at)}
                    </span>
                    {ticket.counterparty?.name && (
                      <span className="flex items-center gap-1 truncate max-w-[150px]">
                        <Building2 size={18} />{ticket.counterparty.name}
                      </span>
                    )}
                    {ticket.project?.key && (
                      <span className="flex items-center gap-1 font-mono">
                        <FolderOpen size={18} />{ticket.project.key}
                      </span>
                    )}
                    {showAssigneeCol && ticket.assignee?.full_name && (
                      <span className="flex items-center gap-1 truncate max-w-[130px]">
                        <UserCheck size={18} />{toShortName(ticket.assignee.full_name)}
                      </span>
                    )}
                    {showReporterCol && ticket.reporter?.full_name && (
                      <span className="flex items-center gap-1 truncate max-w-[130px]">
                        <User size={18} />{toShortName(ticket.reporter.full_name)}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4
                            border-t border-[var(--border-color)]">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card
                           border border-[var(--border-color)] hover:bg-[var(--hover-2)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-[var(--text-primary)] text-base transition-colors">
                <ChevronLeft className="w-4 h-4" /> Назад
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  if (pageNum > totalPages) return null;
                  return (
                    <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 rounded-xl text-base font-medium transition-colors
                        ${pageNum === page
                          ? 'bg-[var(--accent)] text-white'
                          : 'glass-card text-[var(--text-primary)]/60 border border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                        }`}>
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card
                           border border-[var(--border-color)] hover:bg-[var(--hover-2)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           text-[var(--text-primary)] text-base transition-colors">
                Вперёд <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}