// pages/TasksPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, Calendar,
  Loader2, X, Check, Circle, Timer, Eye,
  ArrowUpRight, ChevronDown, Flag,
  AlertCircle, CheckCircle2, Ban, RotateCcw,
  RefreshCw, Archive, FolderOpen, Ticket, Zap,
  Star, User, ChevronRight, Layers, UserCheck,
  GitPullRequest, ThumbsUp, ThumbsDown, Pencil, Save,
  Milestone, AlertTriangle, ChevronLeft,
} from 'lucide-react';
import { tasksApi, projectsApi, ticketsApi, usersApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import type {
  TaskKanbanItem, TaskKanbanColumn, TaskStatus, TaskPriority,
  TaskCreateInput, TaskUpdateInput, TaskKanbanContext,
  SimpleUser, CounterpartyCustomer, Project,
} from '../types';
import { TASK_PRIORITY_LIST } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  'low': 'Низкий',
  'medium': 'Средний',
  'high': 'Высокий',
  'critical': 'Критический',
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критический' },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
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

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'to_review', 'done', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  to_review: ['in_progress', 'done', 'to_fix', 'to_test', 'cancelled'],
  to_fix: ['in_progress', 'to_review', 'cancelled'],
  to_test: ['in_progress', 'to_review', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

const ALLOWED_EDIT_STATUSES: Set<TaskStatus> = new Set(['backlog', 'todo']);
const ALLOWED_ASSIGN_STATUSES: Set<TaskStatus> = new Set([
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test',
]);

const COLUMN_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test', 'done', 'cancelled',
];

const COL: Record<TaskStatus, {
  icon: React.ComponentType<{ className?: string }>;
  textColor: string;
  dot: string;
  border: string;
  chip: string;
  empty: string;
}> = {
  backlog: {
    icon: Circle,
    textColor: 'text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-gray-400/20',
    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
    empty: 'Нет задач',
  },
  paused: {
    icon: Ban,
    textColor: 'text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-gray-400/20',
    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
    empty: 'Нет задач',
  },
  to_review: {
    icon: Eye,
    textColor: 'text-violet-400',
    dot: 'bg-violet-400',
    border: 'border-violet-400/20',
    chip: 'bg-violet-400/10 text-violet-400 border-violet-400/20',
    empty: 'Нет задач',
  },
  to_fix: {
    icon: AlertCircle,
    textColor: 'text-orange-400',
    dot: 'bg-orange-400',
    border: 'border-orange-400/20',
    chip: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
    empty: 'Нет задач',
  },
  to_test: {
    icon: CheckCircle2,
    textColor: 'text-cyan-400',
    dot: 'bg-cyan-400',
    border: 'border-cyan-400/20',
    chip: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
    empty: 'Нет задач',
  },
  todo: {
    icon: AlertCircle,
    textColor: 'text-blue-400',
    dot: 'bg-blue-400',
    border: 'border-blue-400/20',
    chip: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    empty: 'Нет задач',
  },
  in_progress: {
    icon: Timer,
    textColor: 'text-amber-400',
    dot: 'bg-amber-400',
    border: 'border-amber-400/20',
    chip: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    empty: 'Нет задач',
  },
  blocked: {
    icon: Ban,
    textColor: 'text-red-400',
    dot: 'bg-red-400',
    border: 'border-red-400/20',
    chip: 'bg-red-400/10 text-red-400 border-red-400/20',
    empty: 'Нет задач',
  },
  review: {
    icon: Eye,
    textColor: 'text-violet-400',
    dot: 'bg-violet-400',
    border: 'border-violet-400/20',
    chip: 'bg-violet-400/10 text-violet-400 border-violet-400/20',
    empty: 'Нет задач',
  },
  done: {
    icon: CheckCircle2,
    textColor: 'text-emerald-400',
    dot: 'bg-emerald-400',
    border: 'border-emerald-400/20',
    chip: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    empty: 'Нет задач',
  },
  cancelled: {
    icon: RotateCcw,
    textColor: 'text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-gray-400/20',
    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',
    empty: 'Нет задач',
  },
};

const PRI: Record<TaskPriority, {
  color: string;
  bg: string;
  border: string;
  dot: string;
  icon: React.ReactNode;
}> = {
  'low': {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    dot: 'bg-emerald-400',
    icon: <Flag className="w-3.5 h-3.5" />,
  },
  'medium': {
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/20',
    dot: 'bg-yellow-400',
    icon: <Flag className="w-3.5 h-3.5" />,
  },
  'high': {
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/20',
    dot: 'bg-orange-400',
    icon: <Flag className="w-3.5 h-3.5" />,
  },
  'critical': {
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    dot: 'bg-red-400',
    icon: <Zap className="w-3.5 h-3.5" />,
  },
};

type ContextMode = 'my' | 'internal' | 'project' | 'assignee' | 'ticket';

const CTX_TABS: {
  id: ContextMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  staffOnly?: boolean;
}[] = [
    { id: 'my', label: 'Мои задачи', icon: User },
    { id: 'internal', label: 'Все задачи', icon: Layers, staffOnly: true },
    { id: 'project', label: 'Проект', icon: FolderOpen },
    { id: 'assignee', label: 'Исполнитель', icon: UserCheck, staffOnly: true },
    { id: 'ticket', label: 'Заявка', icon: Ticket, staffOnly: true },
  ];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const initials = (n?: string | null) =>
  n ? n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';

const isTaskOverdue = (task: TaskKanbanItem) => {
  if (!task.due_date) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  return new Date(task.due_date) < new Date();
};

const fmtDue = (d: string) => {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${-diff}д. просрочено`;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const apiErr = (err: any) =>
  err?.response?.data?.error?.public_message ??
  err?.response?.data?.error?.message ??
  err?.response?.data?.detail?.[0]?.msg ??
  err.message ??
  'Неизвестная ошибка';

const cloneColumnsSnapshot = (columns: TaskKanbanColumn[]) =>
  columns.map(c => ({
    ...c,
    tasks: {
      ...c.tasks,
      items: [...c.tasks.items],
    },
  }));

function getStatusChangeError(
  err: any,
  task: TaskKanbanItem,
  to: TaskStatus
): { title: string; description: string } {
  const raw = apiErr(err);
  const lower = String(raw).toLowerCase();

  if (
    to === 'in_progress' &&
    (
      !task.assignee_id ||
      lower.includes('assignee') ||
      lower.includes('исполнител')
    )
  ) {
    return {
      title: 'Не удалось перевести задачу в работу',
      description: 'Чтобы начать работу, сначала назначьте исполнителя для этой задачи.',
    };
  }

  if (
    to === 'review' &&
    (
      lower.includes('review') ||
      lower.includes('reviewer') ||
      lower.includes('ревью') ||
      lower.includes('провер')
    )
  ) {
    return {
      title: 'Не удалось отправить задачу на проверку',
      description: 'Чтобы перевести задачу в статус «На проверке», выберите ревьюера и используйте действие «Запросить ревью» в карточке задачи.',
    };
  }

  if (
    to === 'done' &&
    (
      lower.includes('review') ||
      lower.includes('approve') ||
      lower.includes('ревью') ||
      lower.includes('провер')
    )
  ) {
    return {
      title: 'Не удалось завершить задачу',
      description: 'Сначала отправьте задачу на проверку и дождитесь подтверждения от ревьюера.',
    };
  }

  if (
    lower.includes('transition') ||
    lower.includes('status') ||
    lower.includes('переход') ||
    lower.includes('cannot') ||
    lower.includes('нельзя')
  ) {
    return {
      title: 'Недоступный переход статуса',
      description: `Из статуса «${STATUS_LABELS[task.status]}» задачу нельзя перевести в «${STATUS_LABELS[to]}». Выберите один из допустимых следующих статусов.`,
    };
  }

  if (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('доступ') ||
    lower.includes('прав')
  ) {
    return {
      title: 'Недостаточно прав',
      description: 'У вас нет прав для смены статуса этой задачи. Обратитесь к менеджеру проекта или поддержки.',
    };
  }

  return {
    title: `Не удалось перевести задачу в «${STATUS_LABELS[to]}»`,
    description: `Причина: ${raw}. Попробуйте обновить доску и повторить действие. Если ошибка повторится — откройте карточку задачи и проверьте обязательные поля.`,
  };
}

const INPUT_CLS =
  'w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl ' +
  'text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/30 ' +
  'focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all appearance-none';

/* ═══════════════════════════════════════════════════════════════════
   CUSTOM DROPDOWN
   ═══════════════════════════════════════════════════════════════════ */

interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  dotColor?: string;
}

function useDropdownPosition(
  triggerRef: React.RefObject<HTMLDivElement | null>,
  open: boolean
) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 300;

    setStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  return style;
}

function CustomSelect({
  value, onChange, options, placeholder, icon: LeadIcon, searchable = false, disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
  searchable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownStyle = useDropdownPosition(triggerRef, open);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setSearch('');
  }, [open, searchable]);

  const filtered = search
    ? options.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.sublabel || '').toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
    setOpen(false);
  };

  const dropdown = open ? createPortal(
    <div ref={dropdownRef} style={dropdownStyle}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
      {searchable && (
        <div className="p-2 border-b border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
              className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/30 focus:outline-none focus:border-[var(--accent)]/30 transition-all" />
          </div>
        </div>
      )}
      <div className="overflow-y-auto max-h-[220px] p-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
          <span className="text-[var(--text-primary)]/25">—</span>
          <span className="flex-1">Не выбрано</span>
          {!value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
        </div>
        {filtered.length === 0 && search && (
          <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">Ничего не найдено</div>
        )}
        {filtered.map(opt => {
          const isSelected = opt.value === value;
          return (
            <div key={opt.value} role="button" tabIndex={0} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${isSelected ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}`}>
              {opt.dotColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dotColor}`} />}
              {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
              <div className="flex-1 text-left min-w-0">
                <span className="block truncate">{opt.label}</span>
                {opt.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate">{opt.sublabel}</span>}
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(v => !v)}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(v => !v); } }}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left transition-all select-none
                   ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
                   ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LeadIcon && <LeadIcon className="w-4 h-4 text-[var(--text-primary)]/40 flex-shrink-0" />}
        <span className={`flex-1 truncate ${selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>
          {selected ? selected.label : (placeholder || '— Выберите —')}
        </span>
        {selected && value && (
          <span role="button" tabIndex={0} onClick={handleClear}
            className="p-0.5 rounded hover:bg-[var(--hover-2)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/60 flex-shrink-0 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dropdown}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ASYNC SELECT
   ═══════════════════════════════════════════════════════════════════ */

function AsyncSelect({
  value, onChange, loadOptions, renderSelected, placeholder, icon: LeadIcon, disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  loadOptions: (search: string, page: number) => Promise<{ items: DropdownOption[]; hasNext: boolean }>;
  renderSelected?: (v: string) => string;
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownStyle = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const doLoad = useCallback(async (q: string, p: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await loadOptions(q, p);
      setOptions(prev => append ? [...prev, ...res.items] : res.items);
      setHasNext(res.hasNext);
      setPage(p);
    } catch { }
    finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [loadOptions]);

  useEffect(() => {
    if (!open) return;
    doLoad('', 1);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, doLoad]);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doLoad(search, 1), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open, doLoad]);

  useEffect(() => {
    if (!value) { setSelectedLabel(''); return; }
    if (renderSelected) { setSelectedLabel(renderSelected(value)); return; }
    const found = options.find(o => o.value === value);
    if (found) { setSelectedLabel(found.label); return; }
    loadOptions('', 1).then(res => {
      const f = res.items.find(o => o.value === value);
      setSelectedLabel(f ? f.label : value.slice(0, 8) + '...');
    }).catch(() => setSelectedLabel(value.slice(0, 8) + '...'));
  }, [value, renderSelected, options, loadOptions]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
    setSelectedLabel('');
    setOpen(false);
  };

  const dropdown = open ? createPortal(
    <div ref={dropdownRef} style={dropdownStyle}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
      <div className="p-2 border-b border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/30 focus:outline-none focus:border-[var(--accent)]/30 transition-all" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[250px] p-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
          <span className="text-[var(--text-primary)]/25">—</span>
          <span className="flex-1">Не выбрано</span>
          {!value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
        </div>
        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>}
        {!loading && options.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">{search ? 'Ничего не найдено' : 'Нет данных'}</div>
        )}
        {!loading && options.map(opt => {
          const isSelected = opt.value === value;
          return (
            <div key={opt.value} role="button" tabIndex={0}
              onClick={() => { onChange(opt.value); setSelectedLabel(opt.label); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${isSelected ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}`}>
              {opt.dotColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dotColor}`} />}
              {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
              <div className="flex-1 text-left min-w-0">
                <span className="block truncate">{opt.label}</span>
                {opt.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate">{opt.sublabel}</span>}
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />}
            </div>
          );
        })}
        {!loading && hasNext && (
          <div role="button" tabIndex={0} onClick={() => !loadingMore && doLoad(search, page + 1, true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] cursor-pointer">
            {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Загрузить ещё
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(v => !v)}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(v => !v); } }}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left transition-all select-none
                   ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
                   ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LeadIcon && <LeadIcon className="w-4 h-4 text-[var(--text-primary)]/40 flex-shrink-0" />}
        <span className={`flex-1 truncate ${selectedLabel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>
          {selectedLabel || (placeholder || '— Выберите —')}
        </span>
        {value && (
          <span role="button" tabIndex={0} onClick={handleClear}
            className="p-0.5 rounded hover:bg-[var(--hover-2)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/60 flex-shrink-0 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dropdown}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function Ava({ name, url, size = 'sm' }: { name?: string | null; url?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const c = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm' }[size];
  if (url) return <img src={url} alt="" className={`${c} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${c} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}>
      {initials(name)}
    </div>
  );
}

function PBadge({ p }: { p: TaskPriority }) {
  const m = PRI[p];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${m.bg} ${m.color} ${m.border}`}>
      {m.icon}
      {PRIORITY_LABELS[p]}
    </span>
  );
}

function SPBadge({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border bg-purple-400/10 text-purple-400 border-purple-400/20 whitespace-nowrap">
      <Star className="w-2.5 h-2.5" />
      {v}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   QUICK STATUS PANEL
   ═══════════════════════════════════════════════════════════════════ */

function QuickStatusPanel({
  task,
  onDrop,
}: {
  task: { id: string; from: TaskStatus; title: string; number: string } | null;
  onDrop: (e: React.DragEvent, to: TaskStatus) => void;
}) {
  const [hoveredStatus, setHoveredStatus] = useState<TaskStatus | null>(null);

  if (!task) return null;

  const allowed = ALLOWED_TRANSITIONS[task.from];
  if (!allowed.length) return null;

  return createPortal(
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed right-3 top-0 h-full z-[100] flex items-center pointer-events-none"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden pointer-events-auto"
        style={{ width: '200px' }}
      >
        <div className="px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-0.5">
            Перетащить в
          </p>
          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
            #{task.number}
          </p>
        </div>

        <div className="p-1.5 space-y-0.5">
          {allowed.map(status => {
            const cm = COL[status];
            const Icon = cm.icon;
            const isHovered = hoveredStatus === status;

            return (
              <div
                key={status}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setHoveredStatus(status);
                }}
                onDragLeave={() => setHoveredStatus(null)}
                onDrop={e => {
                  setHoveredStatus(null);
                  onDrop(e, status);
                }}
                className={`
                  flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all
                  ${isHovered
                    ? `${cm.border} bg-[var(--accent)]/5`
                    : 'border-transparent hover:bg-[var(--hover-2)]'
                  }
                `}
              >
                <div className={`w-1 h-6 rounded-full flex-shrink-0 ${cm.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Icon className={`w-3 h-3 flex-shrink-0 ${cm.textColor}`} />
                    <span className={`text-xs font-medium truncate ${isHovered ? cm.textColor : 'text-[var(--text-primary)]/60'}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                </div>
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${cm.dot}`}
                    >
                      <Check className="w-2.5 h-2.5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TASK CARD
   ═══════════════════════════════════════════════════════════════════ */

function TaskCard({
  task,
  userMap,
  isDragging,
  onDragStart,
  onDragEnd,
  onView,
  onQuickMove,
}: {
  task: TaskKanbanItem;
  userMap: Map<string, SimpleUser | CounterpartyCustomer>;
  isDragging: boolean;
  onDragStart: (id: string, from: TaskStatus) => void;
  onDragEnd: () => void;
  onView: (t: TaskKanbanItem) => void;
  onQuickMove: (id: string, from: TaskStatus, to: TaskStatus) => void;
}) {
  const od = isTaskOverdue(task);
  const a = task.assignee_id ? userMap.get(task.assignee_id) : null;
  const cm = COL[task.status];
  const cardBorder = od ? 'border-red-400/30' : cm.border;

  return (
    <motion.div
      layout
      draggable
      onDragStart={e => {
        (e as unknown as React.DragEvent).dataTransfer.effectAllowed = 'move';
        onDragStart(task.id, task.status);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onView(task)}
      className={`
        group bg-[var(--bg-card)] border rounded-xl p-3 cursor-pointer
        transition-all hover:bg-[var(--hover-1)]
        ${isDragging ? 'opacity-50 rotate-2 scale-105' : ''}
        ${cardBorder}
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--hover-2)] text-[var(--text-primary)]/60 border border-[var(--border-color)] flex-shrink-0">
            #{task.number}
          </span>
        </div>
      </div>

      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2 leading-snug line-clamp-2">
        {task.title}
      </h4>

      <div className="flex items-center gap-1 flex-wrap mb-2.5">
        <PBadge p={task.priority} />
        {task.story_points != null && <SPBadge v={task.story_points} />}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
        {a ? (
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <Ava name={a.full_name || a.username} url={a.avatar_url} size="xs" />
            <span className="text-xs text-[var(--text-primary)]/60 truncate">
              {(a.full_name || a.username || '').split(' ')[0]}
            </span>
          </div>
        ) : (
          <span className="text-xs text-[var(--text-primary)]/30">—</span>
        )}

        <div className="flex items-center gap-1.5">
          {task.ticket_id && <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/30 flex-shrink-0" />}
          {task.due_date && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium whitespace-nowrap ${od ? 'text-red-400' : 'text-[var(--text-primary)]/30'}`}>
              <Calendar className="w-3 h-3" />
              {fmtDue(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KANBAN COLUMN
   ═══════════════════════════════════════════════════════════════════ */

function KColumn({
  column,
  userMap,
  isDragOver,
  draggedId,
  loadingMore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onAdd,
  onView,
  onMore,
  onQuickMove,
}: {
  column: TaskKanbanColumn;
  userMap: Map<string, SimpleUser | CounterpartyCustomer>;
  isDragOver: boolean;
  draggedId: string | null;
  loadingMore: boolean;
  onDragStart: (id: string, f: TaskStatus) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, s: TaskStatus) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, s: TaskStatus) => void;
  onAdd: (s: TaskStatus) => void;
  onView: (t: TaskKanbanItem) => void;
  onMore: (s: TaskStatus) => void;
  onQuickMove: (id: string, from: TaskStatus, to: TaskStatus) => void;
}) {
  const m = COL[column.status];
  const Icon = m.icon;
  const label = column.label || STATUS_LABELS[column.status];

  return (
    <div
      onDragOver={e => onDragOver(e, column.status)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, column.status)}
      className={`bg-[var(--hover-1)]/40 border rounded-xl flex flex-col min-w-[280px] w-[280px] flex-shrink-0 transition-all
                  ${isDragOver ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]' : 'border-[var(--border-color)]'}`}
      style={{ height: 'calc(100vh - 210px)' }}
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border-color)] flex-shrink-0">
        <div className="inline-flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${m.textColor}`} />
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{label}</h3>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50 border border-[var(--border-color)] flex-shrink-0">
            {column.tasks.total_items}
          </span>
        </div>
        <button
          onClick={() => onAdd(column.status)}
          className="p-1 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/30 hover:text-[var(--accent)] transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-2 flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {column.tasks.items.length === 0 && !isDragOver ? (
          <div className="h-24 flex flex-col items-center justify-center text-[var(--text-primary)]/25 border border-dashed border-[var(--border-color)] rounded-lg">
            <Milestone className="w-5 h-5 mb-1" />
            <span className="text-xs">{m.empty}</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {column.tasks.items.map(t => (
              <TaskCard
                key={t.id}
                task={t}
                userMap={userMap}
                isDragging={draggedId === t.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onView={onView}
                onQuickMove={onQuickMove}
              />
            ))}
          </AnimatePresence>
        )}

        {isDragOver && column.tasks.items.length === 0 && (
          <div className="h-20 flex items-center justify-center border border-dashed border-[var(--accent)]/40 rounded-lg bg-[var(--accent)]/5">
            <span className="text-xs text-[var(--accent)] font-medium">Отпустите</span>
          </div>
        )}

        {column.tasks.has_next && (
          <button
            onClick={() => onMore(column.status)}
            disabled={loadingMore}
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/50 hover:bg-[var(--hover-1)] text-xs transition-all disabled:opacity-40"
          >
            {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Ещё ({column.tasks.total_items - column.tasks.items.length})
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ASSIGN BEFORE PROGRESS MODAL
   ═══════════════════════════════════════════════════════════════════ */

function AssignBeforeProgressModal({
  task, userMap, loading, onClose, onConfirm,
}: {
  task: TaskKanbanItem;
  userMap: Map<string, SimpleUser | CounterpartyCustomer>;
  loading: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [aid, setAid] = useState('');
  const users = Array.from(userMap.values());
  const opts: DropdownOption[] = users.map(u => ({
    value: u.id,
    label: u.full_name || u.username || u.email,
    sublabel: u.email,
  }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Назначьте исполнителя</h2>
              <p className="text-xs text-[var(--text-primary)]/40">Обязательно для «В работе»</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3.5">
          <div className="rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-amber-400 font-mono text-[11px] bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                {task.number}
              </span>
              <PBadge p={task.priority} />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{task.title}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 mb-1.5">
              Исполнитель <span className="text-red-400">*</span>
            </label>
            <CustomSelect value={aid} onChange={setAid} options={opts} placeholder="Выберите" icon={UserCheck} searchable />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">
            Отмена
          </button>
          <button onClick={() => onConfirm(aid)} disabled={!aid || loading}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            Назначить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE MODAL (упрощённая)
   ═══════════════════════════════════════════════════════════════════ */

function CreateModal({
  initialStatus, context, userMap, onClose, onOk,
}: {
  initialStatus: TaskStatus;
  context: TaskKanbanContext;
  userMap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void;
  onOk: () => void;
}) {
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [pri, setPri] = useState<TaskPriority>('medium');
  const [sp, setSp] = useState('');
  const [eh, setEh] = useState('');
  const [dd, setDd] = useState('');
  const [todo, setTodo] = useState(initialStatus === 'todo');
  const [aid, setAid] = useState('');
  const [tid, setTid] = useState('');
  const [pid, setPid] = useState(context.type === 'project' ? context.project_id : '');
  const [saving, setSaving] = useState(false);

  const ctid = context.type === 'ticket' ? context.ticket_id : undefined;
  useEffect(() => { if (ctid) setTid(ctid); }, [ctid]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  useEffect(() => { setTid(''); }, [pid]);

  const loadProjects = useCallback(async (search: string, page: number) => {
    const res = await projectsApi.getAll(page, 20);
    const filtered = search
      ? res.items.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase()))
      : res.items;
    return {
      items: filtered.map(p => ({ value: p.id, label: p.name, sublabel: p.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })),
      hasNext: res.items.length === 20,
    };
  }, []);

  const loadUsers = useCallback(async (search: string, page: number) => {
    let items: (SimpleUser | CounterpartyCustomer)[] = [];
    try {
      items = (await usersApi.getAllUsers(page, 20)).items;
    } catch { }
    const filtered = search
      ? items.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
      : items;
    return {
      items: filtered.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })),
      hasNext: items.length === 20,
    };
  }, []);

  const loadTickets = useCallback(async (search: string, page: number) => {
    const res = await ticketsApi.getAllWithFilters(page, 20, { project_id: pid || undefined });
    const filtered = search
      ? res.items.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || String(t.number).includes(search))
      : res.items;
    return {
      items: filtered.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })),
      hasNext: res.items.length === 20,
    };
  }, [pid]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload: TaskCreateInput = {
        title: title.trim(),
        description: desc.trim() || null,
        priority: pri,
        project_id: pid || null,
        ticket_id: tid || null,
        story_points: sp ? parseInt(sp) : null,
        estimated_hours: eh ? parseFloat(eh) : null,
        due_date: dd || null,
        mark_as_todo: false,
        assignee_id: aid || null,
      };
      const t = await tasksApi.create(payload);

      if (todo && aid) {
        await tasksApi.changeStatus(t.id, 'todo');
      }

      toast({
        title: 'Задача создана',
        description: `${t.number} — ${t.title}`,
      });
      onOk();
    } catch (err: any) {
      toast({ title: 'Ошибка', description: apiErr(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Новая задача</h2>
              <p className="text-xs text-[var(--text-primary)]/40">«{STATUS_LABELS[initialStatus]}»</p>
            </div>
          </div>
          <button onClick={() => !saving && onClose()}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="grid lg:grid-cols-2 gap-5">

            {/* ЛЕВАЯ КОЛОНКА */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">
                  Название <span className="text-red-400">*</span>
                </label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Что нужно сделать?" autoFocus
                  className={INPUT_CLS} />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Описание</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="Постановка задачи..." rows={4}
                  className={`${INPUT_CLS} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-2">Приоритет</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRIORITY_OPTIONS.map(p => {
                    const pm = PRI[p.value];
                    return (
                      <button key={p.value} onClick={() => setPri(p.value)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border
                          ${pri === p.value
                            ? `${pm.bg} ${pm.color} ${pm.border}`
                            : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ПРАВАЯ КОЛОНКА */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Проект</label>
                <AsyncSelect value={pid} onChange={setPid} loadOptions={loadProjects}
                  placeholder="Не выбран" icon={FolderOpen} />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Срок выполнения</label>
                <input type="date" value={dd} onChange={e => setDd(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} className={INPUT_CLS} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Сложность</label>
                  <input type="number" min={1} max={21} value={sp} onChange={e => setSp(e.target.value)}
                    placeholder="1-21" className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Оценка, ч.</label>
                  <input type="number" min={0} step={0.5} value={eh} onChange={e => setEh(e.target.value)}
                    placeholder="—" className={INPUT_CLS} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Исполнитель</label>
                <AsyncSelect value={aid} onChange={setAid} loadOptions={loadUsers}
                  placeholder="Не назначен" icon={UserCheck} />
              </div>

              {context.type !== 'ticket' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)]/60 mb-1.5">Тикет</label>
                  <AsyncSelect value={tid} onChange={setTid} loadOptions={loadTickets}
                    placeholder="Без тикета" icon={Ticket} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border-color)]">
            <button onClick={() => setTodo(v => !v)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-sm
                ${todo
                  ? 'bg-blue-400/10 border-blue-400/30 text-blue-400'
                  : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)]'}`}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                ${todo ? 'bg-blue-400 border-blue-500' : 'border-[var(--border-color)]'}`}>
                {todo && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="font-medium">Сразу готова к выполнению (перевести в «{STATUS_LABELS.todo}»)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!title.trim() || saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DETAIL MODAL (сокращённая высота)
   ═══════════════════════════════════════════════════════════════════ */

function DetailModal({
  task, userMap, onClose, onRefresh, onNeedAssign,
}: {
  task: TaskKanbanItem;
  userMap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onNeedAssign: (task: TaskKanbanItem) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [busy, setBusy] = useState('');
  const canEdit = ALLOWED_EDIT_STATUSES.has(task.status);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPri, setEditPri] = useState<TaskPriority>(task.priority);
  const [editSp, setEditSp] = useState(task.story_points?.toString() ?? '');
  const [editDd, setEditDd] = useState(task.due_date ?? '');
  const [showAssign, setShowAssign] = useState(false);
  const [assignId, setAssignId] = useState(task.assignee_id ?? '');
  const [showReqReview, setShowReqReview] = useState(false);
  const [reviewerId, setReviewerId] = useState('');

  const assignee = task.assignee_id ? userMap.get(task.assignee_id) : null;
  const cm = COL[task.status];
  const StatusIcon = cm.icon;
  const users = Array.from(userMap.values());
  const isStaff = user?.roles?.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;
  const canReview = (task.status === 'to_review' || task.status === 'review') && isStaff;
  const canReqReview = task.status === 'in_progress';
  const canAssign = ALLOWED_ASSIGN_STATUSES.has(task.status) && users.length > 0;
  const allowed = ALLOWED_TRANSITIONS[task.status];
  const isBroken = task.status === 'in_progress' && !task.assignee_id;
  const userOpts: DropdownOption[] = users.map(u => ({
    value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email,
  }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const act = async (label: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(label);
    try {
      await fn();
      if (msg) toast({ title: msg });
      await onRefresh();
      onClose();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const saveEdit = () => act('edit', async () => {
    const p: TaskUpdateInput = {};
    if (editTitle.trim() !== task.title) p.title = editTitle.trim();
    if (editPri !== task.priority) p.priority = editPri;
    if (editSp !== (task.story_points?.toString() ?? '')) p.story_points = editSp ? parseInt(editSp) : null;
    if (editDd !== (task.due_date ?? '')) p.due_date = editDd || null;
    if (!Object.keys(p).length) return;
    await tasksApi.update(task.id, p);
  }, 'Задача обновлена');

  const changeStatusWithHelp = async (s: TaskStatus) => {
    setBusy('status');
    try {
      await tasksApi.changeStatus(task.id, s);
      toast({ title: 'Статус обновлён', description: `Задача переведена в «${STATUS_LABELS[s]}».` });
      await onRefresh();
      onClose();
    } catch (e: any) {
      const msg = getStatusChangeError(e, task, s);
      toast({ title: msg.title, description: msg.description, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const handleStatusClick = (s: TaskStatus) => {
    if (s === 'in_progress' && !task.assignee_id) {
      setShowStatus(false);
      onNeedAssign(task);
      return;
    }
    setShowStatus(false);
    changeStatusWithHelp(s);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[88vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-1 mb-1.5 flex-wrap">
              <span className="text-[var(--text-primary)] font-mono text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-2 py-0.5 rounded-lg">
                {task.number}
              </span>
              <PBadge p={task.priority} />
              {task.story_points != null && <SPBadge v={task.story_points} />}
              {canEdit && (
                <button onClick={() => setEditing(v => !v)}
                  className={`p-1 rounded-lg transition-colors ml-auto ${editing ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]/30'}`}>
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{task.title}</h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          {isBroken && (
            <div className="px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20">
              <p className="text-xs text-red-400 font-medium">⚠ Статус «В работе», но исполнитель не назначен.</p>
            </div>
          )}

          {editing && canEdit && (
            <div className="p-3 rounded-lg bg-[var(--hover-2)] border border-[var(--accent)]/20 space-y-2.5">
              <p className="text-xs uppercase tracking-widest text-[var(--accent)] font-bold flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Редактирование
              </p>
              <div>
                <label className="text-xs text-[var(--text-primary)]/40 mb-1 block">Название</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="text-xs text-[var(--text-primary)]/40 mb-1 block">Приоритет</label>
                <div className="flex flex-wrap gap-1">
                  {TASK_PRIORITY_LIST.map(p => {
                    const pm = PRI[p];
                    return (
                      <button key={p} onClick={() => setEditPri(p)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all
                          ${editPri === p ? `${pm.bg} ${pm.color} ${pm.border}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-[var(--text-primary)]/40 mb-1 block">Сложность</label>
                  <input type="number" min={1} max={21} value={editSp} onChange={e => setEditSp(e.target.value)} placeholder="1-21" className={INPUT_CLS} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-primary)]/40 mb-1 block">Срок</label>
                  <input type="date" value={editDd} onChange={e => setEditDd(e.target.value)} className={INPUT_CLS} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--hover-3)] text-[var(--text-primary)]/50 text-xs">Отмена</button>
                <button onClick={saveEdit} disabled={busy === 'edit' || !editTitle.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium disabled:opacity-40">
                  {busy === 'edit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Сохранить
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--hover-2)] rounded-lg border border-[var(--border-color)] p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-1">Статус</p>
              <div className="relative">
                <button onClick={() => allowed.length > 0 && setShowStatus(v => !v)} disabled={busy !== '' || !allowed.length}
                  className={`flex items-center gap-1 text-xs font-semibold ${cm.textColor} disabled:opacity-40`}>
                  {busy === 'status' ? <Loader2 className="w-3 h-3 animate-spin" /> : <StatusIcon className="w-3 h-3" />}
                  {STATUS_LABELS[task.status]}
                  {allowed.length > 0 && <ChevronDown className="w-3 h-3 opacity-40" />}
                </button>
                {showStatus && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowStatus(false)} />
                    <div className="absolute left-0 top-full mt-1 z-20 w-48 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden shadow-[var(--shadow-lg)]">
                      <div className="p-1">
                        {allowed.map(s => {
                          const sm = COL[s];
                          const SI = sm.icon;
                          return (
                            <button key={s} onClick={() => handleStatusClick(s)}
                              className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]">
                              <div className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                              <SI className={`w-3 h-3 ${sm.textColor}`} />
                              <span className="flex-1 text-left">{STATUS_LABELS[s]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-[var(--hover-2)] rounded-lg border border-[var(--border-color)] p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-1">Срок</p>
              {task.due_date
                ? <span className={`flex items-center gap-1 text-xs font-semibold ${isTaskOverdue(task) ? 'text-red-400' : 'text-[var(--text-primary)]/60'}`}>
                  <Calendar className="w-3 h-3" />
                  {fmtDue(task.due_date)}
                </span>
                : <span className="text-xs text-[var(--text-primary)]/25">—</span>}
            </div>

            <div className="bg-[var(--hover-2)] rounded-lg border border-[var(--border-color)] p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-1">Исполнитель</p>
              {assignee
                ? <div className="flex items-center gap-1.5">
                  <Ava name={assignee.full_name || assignee.username} url={assignee.avatar_url} size="xs" />
                  <span className="text-xs text-[var(--text-primary)]/60 font-medium truncate">
                    {(assignee.full_name || assignee.username || '').split(' ')[0]}
                  </span>
                </div>
                : <span className="text-xs text-[var(--text-primary)]/25">—</span>}
            </div>

            <div className="bg-[var(--hover-2)] rounded-lg border border-[var(--border-color)] p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-1">Создана</p>
              <span className="text-xs text-[var(--text-primary)]/60">
                {new Date(task.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {canAssign && (
            <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
              <button onClick={() => setShowAssign(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[var(--hover-2)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-3)] transition-all">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <UserCheck className="w-3.5 h-3.5" />
                  {task.assignee_id ? 'Сменить исполнителя' : 'Назначить исполнителя'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAssign ? 'rotate-180' : ''}`} />
              </button>
              {showAssign && (
                <div className="px-3 py-2.5 bg-[var(--hover-1)] border-t border-[var(--border-color)] space-y-2">
                  <CustomSelect value={assignId} onChange={setAssignId} options={userOpts} placeholder="Выберите" icon={UserCheck} searchable />
                  <button onClick={() => act('assign', () => tasksApi.assign(task.id, { assignee_id: assignId }), 'Исполнитель назначен')}
                    disabled={!assignId || busy === 'assign'}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-xs font-medium disabled:opacity-40 shadow-[var(--shadow-sm)]">
                    {busy === 'assign' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                    Назначить
                  </button>
                </div>
              )}
            </div>
          )}

          {canReqReview && users.length > 0 && (
            <div className="rounded-lg border border-violet-400/20 overflow-hidden">
              <button onClick={() => setShowReqReview(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-violet-400/5 hover:bg-violet-400/8">
                <span className="flex items-center gap-1.5 text-xs font-medium text-violet-400">
                  <GitPullRequest className="w-3.5 h-3.5" /> Запросить ревью
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-violet-400/40 transition-transform ${showReqReview ? 'rotate-180' : ''}`} />
              </button>
              {showReqReview && (
                <div className="px-3 py-2.5 bg-[var(--hover-1)] border-t border-violet-400/20 space-y-2">
                  <CustomSelect value={reviewerId} onChange={setReviewerId} options={userOpts} placeholder="Ревьюер" searchable />
                  <button onClick={() => act('reqReview', () => tasksApi.requestReview(task.id, { reviewer_id: reviewerId }), 'Ревью запрошено')}
                    disabled={!reviewerId || busy === 'reqReview'}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-400/20 border border-violet-400/30 text-violet-400 text-xs font-medium disabled:opacity-40">
                    {busy === 'reqReview' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                    Отправить
                  </button>
                </div>
              )}
            </div>
          )}

          {canReview && (
            <div className="p-3 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)]">
              <p className="text-xs font-medium text-[var(--text-primary)]/50 flex items-center gap-1.5 mb-2">
                <Eye className="w-3.5 h-3.5 text-violet-400" /> Ревью
              </p>
              <div className="flex gap-2">
                <button onClick={() => act('review', () => tasksApi.review(task.id, { decision: 'done' }), 'Принято')}
                  disabled={busy === 'review'}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 text-xs font-medium disabled:opacity-50">
                  {busy === 'review' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                  Принять
                </button>
                <button onClick={() => act('review', () => tasksApi.review(task.id, { decision: 'to_fix' }), 'На доработку')}
                  disabled={busy === 'review'}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-400/10 border border-red-400/30 text-red-400 text-xs font-medium disabled:opacity-50">
                  {busy === 'review' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                  Вернуть
                </button>
              </div>
            </div>
          )}

          {task.ticket_id && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)]">
              <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/25 flex-shrink-0" />
              <span className="flex-1 text-xs text-[var(--text-primary)]/40">Заявка</span>
              <Link to={`/tickets/${task.ticket_id}`} onClick={onClose}
                className="flex items-center gap-0.5 text-xs text-[var(--accent)]">
                Открыть <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {task.project_id && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)]">
              <FolderOpen className="w-3.5 h-3.5 text-[var(--text-primary)]/25 flex-shrink-0" />
              <span className="flex-1 text-xs text-[var(--text-primary)]/40">Проект</span>
              <Link to={`/projects/${task.project_id}`} onClick={onClose}
                className="flex items-center gap-0.5 text-xs text-[var(--accent)]">
                Открыть <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <button onClick={() => setShowArchiveConfirm(true)}
            disabled={busy === 'archive'}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 text-red-400 text-xs font-medium disabled:opacity-50">
            {busy === 'archive' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            Архив
          </button>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-xs">
            Закрыть
          </button>
        </div>
      </div>

      {showArchiveConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowArchiveConfirm(false)} />
          <div className="relative w-full max-w-xs bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="p-5 text-center">
              <Archive className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Архивировать задачу</h3>
              <p className="text-xs text-[var(--text-primary)]/40">Задача «{task.title}» будет перемещена в архив.</p>
            </div>
            <div className="flex border-t border-[var(--border-color)]">
              <button onClick={() => setShowArchiveConfirm(false)}
                className="flex-1 py-2.5 text-xs text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]">
                Отмена
              </button>
              <button onClick={() => { setShowArchiveConfirm(false); act('archive', () => tasksApi.archive(task.id), 'Архивировано'); }}
                className="flex-1 py-2.5 text-xs font-medium text-red-400 hover:bg-red-400/10 border-l border-[var(--border-color)]">
                {busy === 'archive' ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Архивировать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function TasksPage() {
  const [sp] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const up = sp.get('project_id');
  const ua = sp.get('assignee_id');
  const ut = sp.get('ticket_id');

  const userRole = user?.roles ?? '';
  const staff = userRole.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r));

  const [mode, setMode] = useState<ContextMode>(() => {
    if (up) return 'project';
    if (ua) return 'assignee';
    if (ut) return 'ticket';
    return staff ? 'internal' : 'my';
  });

  const [selPid, setSelPid] = useState(up ?? '');
  const [selAid, setSelAid] = useState(ua ?? '');
  const [selTid, setSelTid] = useState(ut ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [lpj, setLpj] = useState(false);
  const [umap, setUmap] = useState<Map<string, SimpleUser | CounterpartyCustomer>>(new Map());
  const [cols, setCols] = useState<TaskKanbanColumn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreCol, setMoreCol] = useState<TaskStatus | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: TaskStatus } | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [q, setQ] = useState('');
  const [fp, setFp] = useState<TaskPriority[]>([]);
  const [fo, setFo] = useState(false);
  const [sf, setSf] = useState(false);
  const [view, setView] = useState<TaskKanbanItem | null>(null);
  const [create, setCreate] = useState<TaskStatus | null>(null);
  const [assignBeforeTask, setAssignBeforeTask] = useState<TaskKanbanItem | null>(null);
  const [assignBeforeLoading, setAssignBeforeLoading] = useState(false);

  const fpRef = useRef(fp);
  const foRef = useRef(fo);
  fpRef.current = fp;
  foRef.current = fo;

  useEffect(() => {
    if (up) { setMode('project'); return; }
    if (ua) { setMode('assignee'); return; }
    if (ut) { setMode('ticket'); return; }
    setMode(prev => (prev === 'project' || prev === 'assignee' || prev === 'ticket') ? prev : (staff ? 'internal' : 'my'));
  }, [up, ua, ut, staff]);

  const ctx = useCallback((): TaskKanbanContext => {
    if (mode === 'project' && selPid) return { type: 'project', project_id: selPid };
    if (mode === 'ticket' && selTid) return { type: 'ticket', ticket_id: selTid };
    if (mode === 'assignee' && selAid) return { type: 'assignee', assignee_id: selAid };
    if (mode === 'internal') return { type: 'internal' };
    if (mode === 'my') return { type: 'my' };
    return { type: 'my' };
  }, [mode, selPid, selAid, selTid]);

  const loadU = useCallback(async () => {
    const m = new Map<string, SimpleUser | CounterpartyCustomer>();
    try {
      (await usersApi.getAllUsers(1, 100)).items.forEach(u => m.set(u.id, u));
    } catch { }
    setUmap(m);
  }, []);

  const loadP = useCallback(async () => {
    setLpj(true);
    try {
      setProjects((await projectsApi.getAll(1, 100)).items);
    } catch { setProjects([]); }
    finally { setLpj(false); }
  }, []);

  const fetchBoard = useCallback(async (silent = false) => {
    if ((mode === 'project' && !selPid) ||
      (mode === 'ticket' && !selTid) ||
      (mode === 'assignee' && !selAid)) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const d = await tasksApi.getKanban(ctx(), {
        size: 20,
        priorities: fpRef.current.length ? fpRef.current : undefined,
        overdue_only: foRef.current || undefined,
      });
      setCols(COLUMN_ORDER.map(s => d.columns.find(c => c.status === s)).filter((c): c is TaskKanbanColumn => !!c));
      setTotal(d.total_tasks);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ctx, toast]);

  useEffect(() => { loadU(); }, [loadU]);
  useEffect(() => { loadP(); }, [loadP]);
  useEffect(() => { fetchBoard(); }, [fetchBoard]);
  useEffect(() => { fetchBoard(true); }, [fp, fo, fetchBoard]);

  const more = useCallback(async (st: TaskStatus) => {
    const c = cols.find(x => x.status === st);
    if (!c?.tasks.has_next) return;
    setMoreCol(st);
    try {
      const d = await tasksApi.getKanban(ctx(), {
        page: c.tasks.page + 1, size: c.tasks.size,
        priorities: fpRef.current.length ? fpRef.current : undefined,
      });
      const nc = d.columns.find(x => x.status === st);
      if (!nc) return;
      setCols(p => p.map(x =>
        x.status === st
          ? { ...x, tasks: { ...nc.tasks, items: [...x.tasks.items, ...nc.tasks.items] } }
          : x
      ));
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally { setMoreCol(null); }
  }, [cols, ctx, toast]);

  const handleQuickMove = useCallback(async (
    id: string,
    from: TaskStatus,
    to: TaskStatus,
  ) => {
    const srcCol = cols.find(c => c.status === from);
    const task = srcCol?.tasks.items.find(t => t.id === id);
    if (!task) return;

    if (to === 'in_progress' && !task.assignee_id) {
      setAssignBeforeTask(task);
      return;
    }

    const snapshot = cloneColumnsSnapshot(cols);
    let movedTask: TaskKanbanItem | undefined;

    setCols(prev => {
      const next = prev.map(c => {
        if (c.status === from) {
          const items = c.tasks.items.filter(t => {
            if (t.id === id) { movedTask = t; return false; }
            return true;
          });
          return { ...c, tasks: { ...c.tasks, items, total_items: c.tasks.total_items - 1 } };
        }
        return c;
      });
      if (!movedTask) return prev;
      const updated = { ...movedTask, status: to };
      return next.map(c =>
        c.status === to
          ? { ...c, tasks: { ...c.tasks, items: [updated, ...c.tasks.items], total_items: c.tasks.total_items + 1 } }
          : c
      );
    });

    try {
      await tasksApi.changeStatus(id, to);
      toast({
        title: 'Статус обновлён',
        description: `Задача переведена в «${STATUS_LABELS[to]}»`,
      });
    } catch (e: any) {
      setCols(snapshot);
      const msg = getStatusChangeError(e, task, to);
      toast({ title: msg.title, description: msg.description, variant: 'destructive' });
    }
  }, [cols, toast]);

  const handleAssignAndProgress = useCallback(async (assigneeId: string) => {
    if (!assignBeforeTask) return;
    setAssignBeforeLoading(true);
    try {
      await tasksApi.assign(assignBeforeTask.id, { assignee_id: assigneeId });
      await tasksApi.changeStatus(assignBeforeTask.id, 'in_progress');
      toast({ title: 'Задача переведена в работу', description: 'Исполнитель назначен, статус обновлён.' });
      setAssignBeforeTask(null);
      await fetchBoard(true);
    } catch (e: any) {
      const msg = getStatusChangeError(e, assignBeforeTask, 'in_progress');
      toast({ title: msg.title, description: msg.description, variant: 'destructive' });
      await fetchBoard(true);
    } finally {
      setAssignBeforeLoading(false);
    }
  }, [assignBeforeTask, fetchBoard, toast]);

  const onDragStart = useCallback((id: string, from: TaskStatus) => {
    setDrag({ id, from });
  }, []);

  const onDragEnd = useCallback(() => {
    setDrag(null);
    setDragOver(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, st: TaskStatus) => {
    e.preventDefault();
    if (drag && !ALLOWED_TRANSITIONS[drag.from].includes(st)) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOver(st);
  }, [drag]);

  const onDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent, to: TaskStatus) => {
    e.preventDefault();
    setDragOver(null);
    if (!drag || drag.from === to) { setDrag(null); return; }
    const srcCol = cols.find(c => c.status === drag.from);
    const task = srcCol?.tasks.items.find(t => t.id === drag.id);
    if (!task) { setDrag(null); return; }
    if (!ALLOWED_TRANSITIONS[drag.from].includes(to)) {
      toast({
        title: 'Переход недоступен',
        description: `Из «${STATUS_LABELS[drag.from]}» нельзя перейти в «${STATUS_LABELS[to]}».`,
        variant: 'destructive',
      });
      setDrag(null);
      return;
    }
    if (to === 'in_progress' && !task.assignee_id) {
      setDrag(null);
      setAssignBeforeTask(task);
      return;
    }

    const snapshot = cloneColumnsSnapshot(cols);
    const { id, from } = drag;
    setDrag(null);

    let movedTask: TaskKanbanItem | undefined;

    setCols(prev => {
      const next = prev.map(c => {
        if (c.status === from) {
          const items = c.tasks.items.filter(t => {
            if (t.id === id) { movedTask = t; return false; }
            return true;
          });
          return { ...c, tasks: { ...c.tasks, items, total_items: c.tasks.total_items - 1 } };
        }
        return c;
      });
      if (!movedTask) return prev;
      const updated = { ...movedTask, status: to };
      return next.map(c =>
        c.status === to
          ? { ...c, tasks: { ...c.tasks, items: [updated, ...c.tasks.items], total_items: c.tasks.total_items + 1 } }
          : c
      );
    });

    try {
      await tasksApi.changeStatus(id, to);
      toast({
        title: 'Статус обновлён',
        description: `Задача "${movedTask?.title || 'Без названия'}" переведена в «${STATUS_LABELS[to]}»`,
      });
    } catch (e: any) {
      setCols(snapshot);
      const msg = getStatusChangeError(e, task, to);
      toast({ title: msg.title, description: msg.description, variant: 'destructive' });
    }
  }, [drag, cols, toast]);

  const disp = cols.map(c => {
    if (!q) return c;
    const s = q.toLowerCase();
    return {
      ...c,
      tasks: {
        ...c.tasks,
        items: c.tasks.items.filter(t =>
          t.title.toLowerCase().includes(s) || t.number.toLowerCase().includes(s)
        ),
      },
    };
  });

  const hf = fp.length > 0 || fo;
  const done = cols.find(c => c.status === 'done')?.tasks.total_items ?? 0;
  const tabs = CTX_TABS.filter(t => !t.staffOnly || staff);

  const loadTicketsAsync = useCallback(async (search: string, page: number) => {
    const res = await ticketsApi.getAllWithFilters(page, 20, { project_id: selPid || undefined });
    const filtered = search
      ? res.items.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || String(t.number).includes(search))
      : res.items;
    return {
      items: filtered.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })),
      hasNext: res.items.length === 20,
    };
  }, [selPid]);

  const loadProjectsAsync = useCallback(async (search: string, page: number) => {
    const res = staff
      ? await projectsApi.getAll(page, 20, 'active')
      : await projectsApi.getAll(page, 20);
    const items = search
      ? res.items.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase()))
      : res.items;
    return {
      items: items.map(p => ({
        value: p.id, label: p.name, sublabel: p.key,
        icon: <FolderOpen className="w-4 h-4 text-amber-400" />,
      })),
      hasNext: res.items.length === 20,
    };
  }, [staff]);

  const loadAssigneesAsync = useCallback(async (search: string, page: number) => {
    let items: (SimpleUser | CounterpartyCustomer)[] = [];
    try {
      items = (await usersApi.getAllUsers(page, 20)).items;
    } catch { }
    const filtered = search
      ? items.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
      : items;
    return {
      items: filtered.map(u => ({
        value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email,
      })),
      hasNext: items.length === 20,
    };
  }, []);

  const dragTaskInfo = drag
    ? (() => {
      const t = cols.flatMap(c => c.tasks.items).find(x => x.id === drag.id);
      return t ? { id: drag.id, from: drag.from, title: t.title, number: t.number } : null;
    })()
    : null;

  return (
    <div className="flex flex-col h-full" onDragEnd={onDragEnd}>
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Задачи</h1>
            {!loading && (
              <span className="px-2 py-0.5 rounded-lg bg-[var(--hover-3)] text-xs font-medium text-[var(--text-primary)]/40 tabular-nums">
                {total}
              </span>
            )}
            {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]/30" />}
          </div>
          {!loading && (
            <p className="text-xs text-[var(--text-primary)]/30 mt-0.5">
              {total - done} активных · {done} завершено
              {hf && <span className="text-[var(--accent)] ml-1.5">· фильтры</span>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск..."
              className="w-40 pl-8 pr-7 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all" />
            {q && (
              <button onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setSf(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-medium transition-all
                ${hf ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/40'}`}>
              <Filter className="w-3.5 h-3.5" /> Фильтры
              {hf && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
            </button>
            {sf && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSf(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)]">
                  <div className="p-2 space-y-2">
                    <div>
                      <p className="px-1 pb-1 text-[10px] uppercase tracking-widest text-[var(--text-primary)]/25">Приоритет</p>
                      <div className="flex flex-wrap gap-1 px-0.5">
                        {PRIORITY_OPTIONS.map(p => {
                          const pm = PRI[p.value];
                          return (
                            <button key={p.value} onClick={() => setFp(v => v.includes(p.value) ? v.filter(x => x !== p.value) : [...v, p.value])}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all
                                ${fp.includes(p.value) ? `${pm.bg} ${pm.color} ${pm.border}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/30 border-[var(--border-color)]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="border-t border-[var(--border-color)] pt-1.5 px-0.5">
                      <button onClick={() => setFo(v => !v)}
                        className={`w-full flex items-center gap-2 py-1.5 px-1 rounded-lg text-xs transition-colors ${fo ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${fo ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'}`}>
                          {fo && <Check className="w-2 h-2 text-white" />}
                        </div>
                        Просроченные
                      </button>
                    </div>
                    {hf && (
                      <div className="border-t border-[var(--border-color)] pt-1">
                        <button onClick={() => { setFp([]); setFo(false); }}
                          className="w-full text-center text-xs text-[var(--accent)] py-1">Сбросить</button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <button onClick={() => fetchBoard(true)} disabled={refreshing || loading}
            className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] transition-all disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button onClick={() => setCreate('backlog')}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium transition-colors shadow-[var(--shadow-md)]">
            <Plus className="w-4 h-4" /> Задача
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-1 p-1 bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)]">
          {tabs.map(t => {
            const TI = t.icon;
            return (
              <button key={t.id} onClick={() => setMode(t.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                  ${mode === t.id ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-3)]'}`}>
                <TI className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {mode === 'project' && (
          <div className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" />
            <div className="min-w-[180px]">
              <AsyncSelect value={selPid} onChange={setSelPid} loadOptions={loadProjectsAsync} placeholder="Выберите" icon={FolderOpen} />
            </div>
          </div>
        )}
        {mode === 'ticket' && (
          <div className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" />
            <div className="min-w-[180px]">
              <AsyncSelect value={selTid} onChange={setSelTid} loadOptions={loadTicketsAsync} placeholder="Выберите" icon={Ticket} />
            </div>
          </div>
        )}
        {mode === 'assignee' && (
          <div className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" />
            <div className="min-w-[180px]">
              <AsyncSelect value={selAid} onChange={setSelAid} loadOptions={loadAssigneesAsync} placeholder="Выберите" icon={UserCheck} />
            </div>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-7 h-7 text-[var(--accent)] animate-spin mx-auto mb-2" />
              <p className="text-[var(--text-primary)]/30 text-xs">Загрузка...</p>
            </div>
          </div>
        ) : !cols.length ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-xs">
              <FolderOpen className="w-10 h-10 text-[var(--text-primary)]/10 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[var(--text-primary)]/50 mb-1">Нет данных</p>
              <p className="text-xs text-[var(--text-primary)]/30 mb-3">
                {mode === 'project' && !selPid ? 'Выберите проект'
                  : mode === 'assignee' && !selAid ? 'Выберите исполнителя'
                    : mode === 'ticket' && !selTid ? 'Выберите заявку'
                      : 'Задачи не найдены'}
              </p>
              <button onClick={() => fetchBoard()}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-medium">
                Обновить
              </button>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent"
          >
            <div className="flex gap-3 h-full">
              {disp.map(c => (
                <KColumn
                  key={c.status}
                  column={c}
                  userMap={umap}
                  isDragOver={dragOver === c.status}
                  draggedId={drag?.id ?? null}
                  loadingMore={moreCol === c.status}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onAdd={setCreate}
                  onView={setView}
                  onMore={more}
                  onQuickMove={handleQuickMove}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick Status Panel (drag helper) */}
      <AnimatePresence>
        {dragTaskInfo && (
          <QuickStatusPanel
            task={dragTaskInfo}
            onDrop={onDrop}
          />
        )}
      </AnimatePresence>

      {/* Modals */}
      {view && (
        <DetailModal
          task={view} userMap={umap}
          onClose={() => setView(null)}
          onRefresh={() => fetchBoard(true)}
          onNeedAssign={t => { setView(null); setAssignBeforeTask(t); }}
        />
      )}

      {create != null && (
        <CreateModal
          initialStatus={create} context={ctx()} userMap={umap}
          onClose={() => setCreate(null)}
          onOk={() => { setCreate(null); fetchBoard(true); }}
        />
      )}

      {assignBeforeTask && (
        <AssignBeforeProgressModal
          task={assignBeforeTask} userMap={umap} loading={assignBeforeLoading}
          onClose={() => { if (!assignBeforeLoading) setAssignBeforeTask(null); }}
          onConfirm={handleAssignAndProgress}
        />
      )}
    </div>
  );
}