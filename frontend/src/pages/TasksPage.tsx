// pages/TasksPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, Calendar, Loader2, X, Check, Circle, Timer, Eye,
  ChevronDown, Flag, AlertCircle, CheckCircle2, Ban, RotateCcw, RefreshCw,
  Archive, FolderOpen, Ticket, Zap, Star, User, ChevronRight, Layers, UserCheck,
  GitPullRequest, ThumbsUp, ThumbsDown, Pencil, Save, Milestone, ArrowUpRight,
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
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

type ContextMode = 'my' | 'internal' | 'project' | 'assignee' | 'ticket';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'В резерве', todo: 'Готово к выполнению', in_progress: 'В работе',
  paused: 'На паузе', blocked: 'Приостановлено', to_review: 'На проверке',
  to_fix: 'На доработку', to_test: 'На тестировании', done: 'Выполнено', cancelled: 'Отменено',
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Низкий' }, { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' }, { value: 'critical', label: 'Критический' },
];

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'], todo: ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'to_review', 'done', 'cancelled'], paused: ['in_progress', 'cancelled'],
  blocked: ['in_progress', 'cancelled'], to_review: ['in_progress', 'done', 'to_fix', 'to_test', 'cancelled'],
  to_fix: ['in_progress', 'to_review', 'cancelled'], to_test: ['in_progress', 'to_review', 'done', 'cancelled'],
  done: [], cancelled: [],
};

const COLUMN_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test', 'done', 'cancelled',
];

const COL: Record<TaskStatus, {
  icon: any; textColor: string; dot: string; border: string; chip: string; empty: string;
}> = {
  backlog: { icon: Circle, textColor: 'text-[var(--text-primary)]/60', dot: 'bg-[var(--text-muted)]', border: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 border-[var(--border-color)]', empty: 'Нет задач в резерве' },
  paused: { icon: Ban, textColor: 'text-[var(--text-primary)]/60', dot: 'bg-[var(--text-muted)]', border: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 border-[var(--border-color)]', empty: 'Нет задач на паузе' },
  to_review: { icon: Eye, textColor: 'text-violet-400', dot: 'bg-violet-400', border: 'border-violet-500/30', chip: 'bg-violet-500/15 text-violet-400 border-violet-500/30', empty: 'Нет задач на проверке' },
  to_fix: { icon: AlertCircle, textColor: 'text-orange-400', dot: 'bg-orange-400', border: 'border-orange-500/30', chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30', empty: 'Нет задач на доработке' },
  to_test: { icon: CheckCircle2, textColor: 'text-blue-400', dot: 'bg-blue-400', border: 'border-blue-500/30', chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30', empty: 'Нет задач на тестировании' },
  todo: { icon: AlertCircle, textColor: 'text-[var(--info)]', dot: 'bg-blue-500', border: 'border-blue-500/30', chip: 'bg-blue-500/15 text-[var(--info)] border-blue-500/30', empty: 'Нет задач к выполнению' },
  in_progress: { icon: Timer, textColor: 'text-[var(--warning)]', dot: 'bg-yellow-400', border: 'border-yellow-500/30', chip: 'bg-yellow-500/15 text-[var(--warning)] border-yellow-500/30', empty: 'Нет задач в работе' },
  blocked: { icon: Ban, textColor: 'text-[var(--accent)]', dot: 'bg-[var(--accent)]', border: 'border-[var(--accent)]/30', chip: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30', empty: 'Нет приостановленных' },
  done: { icon: CheckCircle2, textColor: 'text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-500/30', chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', empty: 'Нет выполненных задач' },
  cancelled: { icon: RotateCcw, textColor: 'text-[var(--text-primary)]/40', dot: 'bg-[var(--text-muted)]/60', border: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]', empty: 'Нет отменённых задач' },
};

const PRI: Record<TaskPriority, { color: string; bg: string; border: string; dot: string; icon: any }> = {
  'low': { color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/8', border: 'border-emerald-500/30', dot: 'bg-emerald-400', icon: <Flag className="w-4 h-4" /> },
  'medium': { color: 'text-[var(--warning)]', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', dot: 'bg-yellow-400', icon: <Flag className="w-4 h-4" /> },
  'high': { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', dot: 'bg-orange-400', icon: <Flag className="w-4 h-4" /> },
  'critical': { color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-soft)]', border: 'border-[var(--accent)]/15', dot: 'bg-[var(--accent)]', icon: <Zap className="w-4 h-4" /> },
};

const CTX_TABS = [
  { id: 'my' as const, label: 'Мои задачи', icon: User },
  { id: 'internal' as const, label: 'Все задачи', icon: Layers, staffOnly: true },
  { id: 'project' as const, label: 'Проект', icon: FolderOpen },
  { id: 'assignee' as const, label: 'Исполнитель', icon: UserCheck, staffOnly: true },
  { id: 'ticket' as const, label: 'Заявка', icon: Ticket, staffOnly: true },
];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const initials = (n?: string | null) => n ? n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
const isOverdue = (d?: string | null) => d ? new Date(d) < new Date() : false;
const fmtDue = (d: string) => {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${-diff}д. просрочено`;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};
const apiErr = (err: any) => err?.response?.data?.error?.public_message ?? err?.response?.data?.detail?.[0]?.msg ?? err.message ?? 'Ошибка';

/* ═══════════════════════════════════════════════════════════════════
   DROPDOWN COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

interface DropdownOption { value: string; label: string; sublabel?: string; icon?: any; dotColor?: string; }

function CustomSelect({ value, onChange, options, placeholder, icon: LeadIcon, searchable = false, disabled = false }: {
  value: string; onChange: (v: string) => void; options: DropdownOption[]; placeholder?: string; icon?: any; searchable?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => { if (open && searchable) setTimeout(() => inputRef.current?.focus(), 50); if (!open) setSearch(''); }, [open, searchable]);

  const selected = options.find(o => o.value === value);
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.sublabel?.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-base text-left transition-all select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LeadIcon && <LeadIcon className="w-4 h-4 text-[var(--text-primary)]/40 flex-shrink-0" />}
        <span className={`flex-1 truncate ${selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/25'}`}>
          {selected ? selected.label : (placeholder || '— Выберите —')}
        </span>
        {selected && value && <X className="w-3.5 h-3.5 text-[var(--text-primary)]/25 hover:text-[var(--text-primary)] cursor-pointer" onClick={() => { onChange(''); setOpen(false); }} />}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && createPortal(
        <div ref={dropdownRef} className="absolute z-[100] w-full mt-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25" />
                <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
                  className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-base text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/30" />
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-[220px] p-1">
            <div onClick={() => { onChange(''); setOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base cursor-pointer ${!value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
              <span className="text-[var(--text-primary)]/25">—</span><span className="flex-1">Не выбрано</span>{!value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </div>
            {filtered.map(opt => (
              <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base cursor-pointer ${opt.value === value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}`}>
                {opt.dotColor && <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />}
                {opt.icon && <span>{opt.icon}</span>}
                <div className="flex-1 min-w-0"><span className="block truncate">{opt.label}</span>{opt.sublabel && <span className="block text-xs text-[var(--text-primary)]/40">{opt.sublabel}</span>}</div>
                {opt.value === value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function AsyncSelect({ value, onChange, loadOptions, placeholder, icon: LeadIcon, disabled = false }: {
  value: string; onChange: (v: string) => void; loadOptions: (search: string, page: number) => Promise<{ items: DropdownOption[]; hasNext: boolean }>;
  placeholder?: string; icon?: any; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const doLoad = useCallback(async (q: string, p: number, append = false) => {
    setLoading(true);
    try {
      const res = await loadOptions(q, p);
      setOptions(prev => append ? [...prev, ...res.items] : res.items);
      setHasNext(res.hasNext);
      setPage(p);
    } catch { }
    finally { setLoading(false); }
  }, [loadOptions]);

  useEffect(() => { if (!open) return; doLoad('', 1); setTimeout(() => inputRef.current?.focus(), 50); }, [open, doLoad]);
  useEffect(() => {
    if (!open) { setSearch(''); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doLoad(search, 1), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open, doLoad]);

  useEffect(() => {
    if (!value) { setSelectedLabel(''); return; }
    const found = options.find(o => o.value === value);
    if (found) { setSelectedLabel(found.label); return; }
    loadOptions('', 1).then(res => { const f = res.items.find(o => o.value === value); setSelectedLabel(f ? f.label : value.slice(0, 8) + '...'); });
  }, [value, options, loadOptions]);

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-base text-left transition-all select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LeadIcon && <LeadIcon className="w-4 h-4 text-[var(--text-primary)]/40 flex-shrink-0" />}
        <span className={`flex-1 truncate ${selectedLabel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/25'}`}>
          {selectedLabel || (placeholder || '— Выберите —')}
        </span>
        {value && <X className="w-3.5 h-3.5 text-[var(--text-primary)]/25 hover:text-[var(--text-primary)] cursor-pointer" onClick={() => { onChange(''); setSelectedLabel(''); setOpen(false); }} />}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && createPortal(
        <div ref={dropdownRef} className="absolute z-[100] w-full mt-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
          <div className="p-2 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25" />
              <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..."
                className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-base text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/30" />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[250px] p-1">
            <div onClick={() => { onChange(''); setOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base cursor-pointer ${!value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
              <span className="text-[var(--text-primary)]/25">—</span><span className="flex-1">Не выбрано</span>{!value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </div>
            {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>}
            {!loading && options.length === 0 && <div className="px-3 py-4 text-center text-base text-[var(--text-primary)]/40">{search ? 'Ничего не найдено' : 'Нет данных'}</div>}
            {!loading && options.map(opt => (
              <div key={opt.value} onClick={() => { onChange(opt.value); setSelectedLabel(opt.label); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base cursor-pointer ${opt.value === value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}`}>
                {opt.dotColor && <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />}
                {opt.icon && <span>{opt.icon}</span>}
                <div className="flex-1 min-w-0"><span className="block truncate">{opt.label}</span>{opt.sublabel && <span className="block text-xs text-[var(--text-primary)]/40">{opt.sublabel}</span>}</div>
                {opt.value === value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
              </div>
            ))}
            {!loading && hasNext && (
              <div onClick={() => !loading && doLoad(search, page + 1, true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-base text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] cursor-pointer">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}Загрузить ещё
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function Ava({ name, url, size = 'sm' }: { name?: string | null; url?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const c = { xs: 'w-6 h-6 text-[13px]', sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-base' }[size];
  if (url) return <img src={url} alt="" className={`${c} rounded-full object-cover flex-shrink-0`} />;
  return <div className={`${c} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0`}>{initials(name)}</div>;
}

function PBadge({ p }: { p: TaskPriority }) {
  const m = PRI[p];
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border ${m.bg} ${m.color} ${m.border}`}>{m.icon}{p}</span>;
}

function SPBadge({ v }: { v: number }) {
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border bg-[var(--hover-3)] text-[var(--text-primary)]/50 border-[var(--border-color)]"><Star className="w-2.5 h-2.5" />Сложность {v}</span>;
}

/* ═══════════════════════════════════════════════════════════════════
   TASK CARD
   ═══════════════════════════════════════════════════════════════════ */

function TaskCard({ task, userMap, isDragging, onDragStart, onDragEnd, onView }: {
  task: TaskKanbanItem; userMap: Map<string, SimpleUser | CounterpartyCustomer>; isDragging: boolean;
  onDragStart: (id: string, from: TaskStatus) => void; onDragEnd: () => void; onView: (t: TaskKanbanItem) => void;
}) {
  const od = isOverdue(task.due_date);
  const a = task.assignee_id ? userMap.get(task.assignee_id) : null;
  const cm = COL[task.status];

  return (
    <motion.div layout draggable
      onDragStart={(e) => { (e as any).dataTransfer.effectAllowed = 'move'; onDragStart(task.id, task.status); }}
      onDragEnd={onDragEnd} onClick={() => onView(task)}
      className={`bg-[var(--bg-card)] border rounded-xl p-3.5 cursor-pointer transition-all hover:bg-[var(--hover-1)] ${isDragging ? 'opacity-50 rotate-2' : ''} ${od ? 'border-[var(--accent)]/30' : cm.border}`}
      style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="px-1.5 py-0.5 rounded text-[13px] font-mono bg-[var(--hover-2)] text-[var(--text-primary)]/70 border border-[var(--border-color)]">#{task.number}</span>
        {od && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[13px] font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30"><AlertTriangle className="w-2.5 h-2.5" />Просрочена</span>}
      </div>
      <h4 className="text-base font-semibold text-[var(--text-primary)] mb-2 leading-snug line-clamp-2">{task.title}</h4>
      <div className="flex items-center gap-1 flex-wrap mb-3 min-h-[1.25rem]"><PBadge p={task.priority} />{task.story_points != null && <SPBadge v={task.story_points} />}</div>
      <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border-color)]">
        {a ? (
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <Ava name={a.full_name || a.username} url={a.avatar_url} size="sm" />
            <span className="text-xs text-[var(--text-primary)]/70 truncate">{(a.full_name || a.username || '').split(' ')[0]}</span>
          </div>
        ) : task.assignee_id ? (
          <div className="inline-flex items-center gap-1.5"><div className="w-6 h-6 rounded-full bg-[var(--hover-3)] border border-[var(--border-color)] flex items-center justify-center"><User className="w-4 h-4 text-[var(--text-primary)]/25" /></div></div>
        ) : <span className="text-xs text-[var(--text-primary)]/40">—</span>}
        <div className="flex items-center gap-2">
          {task.project_id && <FolderOpen className="w-5 h-5 text-[var(--text-primary)]/40 flex-shrink-0" />}
          {task.ticket_id && <Ticket className="w-5 h-5 text-[var(--text-primary)]/40 flex-shrink-0" />}
          {task.due_date && <span className={`inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap ${od ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}><Calendar className="w-4 h-4" />{fmtDue(task.due_date)}</span>}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KANBAN COLUMN
   ═══════════════════════════════════════════════════════════════════ */

function KColumn({ column, userMap, isDragOver, draggedId, loadingMore, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onAdd, onView, onMore }: {
  column: TaskKanbanColumn; userMap: Map<string, SimpleUser | CounterpartyCustomer>; isDragOver: boolean; draggedId: string | null;
  loadingMore: boolean; onDragStart: (id: string, f: TaskStatus) => void; onDragEnd: () => void; onDragOver: (e: any, s: TaskStatus) => void;
  onDragLeave: () => void; onDrop: (e: any, s: TaskStatus) => void; onAdd: (s: TaskStatus) => void; onView: (t: TaskKanbanItem) => void; onMore: (s: TaskStatus) => void;
}) {
  const m = COL[column.status];
  const Icon = m.icon;
  const label = STATUS_LABELS[column.status];
  const isEmpty = column.tasks.items.length === 0;

  return (
    <div onDragOver={e => onDragOver(e, column.status)} onDragLeave={onDragLeave} onDrop={e => onDrop(e, column.status)}
      className={`bg-[var(--hover-2)] border-2 rounded-2xl flex flex-col min-h-[500px] flex-shrink-0 transition-all
        ${isEmpty ? 'w-[220px] min-w-[220px]' : 'w-[300px] min-w-[300px]'}
        ${isDragOver ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-transparent'}`}
      style={{ maxHeight: 'calc(100vh - 250px)' }}>
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-[var(--border-color)] flex-shrink-0">
        <div className="inline-flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${m.textColor}`} />
          <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{label}</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--hover-1)] text-[var(--text-primary)]/60 border border-[var(--border-color)] flex-shrink-0">{column.tasks.total_items}</span>
        </div>
        <button onClick={() => onAdd(column.status)} className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors flex-shrink-0"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-3 flex-1 space-y-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {isEmpty && !isDragOver ? (
          <div className="h-32 flex flex-col items-center justify-center text-[var(--text-primary)]/40 border-2 border-dashed border-[var(--border-color)] rounded-xl">
            <Milestone className="w-6 h-6 mb-1.5" /><span className="text-xs">{m.empty}</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">{column.tasks.items.map(t => (
            <TaskCard key={t.id} task={t} userMap={userMap} isDragging={draggedId === t.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onView={onView} />
          ))}</AnimatePresence>
        )}
        {isDragOver && isEmpty && <div className="h-24 flex items-center justify-center border-2 border-dashed border-[var(--accent)]/40 rounded-xl bg-[var(--accent-soft)]"><span className="text-xs text-[var(--accent)] font-medium">Отпустите здесь</span></div>}
        {column.tasks.has_next && (
          <button onClick={() => onMore(column.status)} disabled={loadingMore} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)] text-xs transition-all disabled:opacity-40">
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}Ещё ({column.tasks.total_items - column.tasks.items.length})
          </button>
        )}
      </div>
      <div className="px-3 pb-3 flex-shrink-0">
        <button onClick={() => onAdd(column.status)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)] hover:border-[var(--accent)]/30 text-xs transition-all">
          <Plus className="w-4 h-4" />Добавить задачу
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE MODAL
   ═══════════════════════════════════════════════════════════════════ */

function CreateModal({ initialStatus, context, userMap, onClose, onOk }: {
  initialStatus: TaskStatus; context: TaskKanbanContext; userMap: Map<string, SimpleUser | CounterpartyCustomer>; onClose: () => void; onOk: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const staff = user?.roles?.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;

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

  useEffect(() => { if (context.type === 'ticket') setTid(context.ticket_id || ''); }, [context]);

  const loadProjects = useCallback(async (search: string, page: number) => {
    const res = await projectsApi.getAll(page, 20);
    const filtered = search ? res.items.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase())) : res.items;
    return { items: filtered.map(p => ({ value: p.id, label: p.name, sublabel: p.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })), hasNext: res.items.length === 20 };
  }, []);

  const loadUsers = useCallback(async (search: string, page: number) => {
    const res = await usersApi.getAllUsers(page, 20);
    const filtered = search ? res.items.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) : res.items;
    return { items: filtered.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })), hasNext: res.items.length === 20 };
  }, []);

  const loadTickets = useCallback(async (search: string, page: number) => {
    const res = await ticketsApi.getAllWithFilters(page, 20, { project_id: pid || undefined });
    const filtered = search ? res.items.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || String(t.number).includes(search)) : res.items;
    return { items: filtered.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })), hasNext: res.items.length === 20 };
  }, [pid]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const t = await tasksApi.create({
        title: title.trim(), description: desc.trim() || null, priority: pri, project_id: pid || null, ticket_id: tid || null,
        story_points: sp ? parseInt(sp) : null, estimated_hours: eh ? parseFloat(eh) : null, due_date: dd || null,
        mark_as_todo: false, assignee_id: aid || null,
      });
      if (todo && aid) await tasksApi.changeStatus(t.id, 'todo');
      toast({ title: 'Задача создана', description: `${t.number} — ${t.title}` });
      onOk();
    } catch (err: any) {
      toast({ title: 'Ошибка', description: apiErr(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const INPUT_CLS = 'w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)]';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center"><Plus className="w-5 h-5 text-[var(--accent)]" /></div>
            <div><h2 className="text-lg font-bold text-[var(--text-primary)]">Новая задача</h2><p className="text-sm text-[var(--text-primary)]/40">«{STATUS_LABELS[initialStatus]}»</p></div>
          </div>
          <button onClick={() => !saving && onClose()} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Название <span className="text-[var(--accent)]">*</span></label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно сделать?" autoFocus className={INPUT_CLS} /></div>
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Описание</label><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Постановка задачи..." rows={4} className={`${INPUT_CLS} resize-none`} /></div>
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">Приоритет</label>
                <div className="grid grid-cols-2 gap-2">{PRIORITY_OPTIONS.map(p => { const pm = PRI[p.value]; return (
                  <button key={p.value} onClick={() => setPri(p.value)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${pri === p.value ? `${pm.bg} ${pm.color} ${pm.border}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}>
                    <span className={`w-2 h-2 rounded-full ${pm.dot}`} />{p.label}
                  </button>
                ); })}</div>
              </div>
            </div>
            <div className="space-y-5">
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Проект</label><AsyncSelect value={pid} onChange={setPid} loadOptions={loadProjects} placeholder="Не выбран" icon={FolderOpen} /></div>
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Срок выполнения</label><input type="date" value={dd} onChange={e => setDd(e.target.value)} min={new Date().toISOString().split('T')[0]} className={INPUT_CLS} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Сложность</label><input type="number" min={1} max={21} value={sp} onChange={e => setSp(e.target.value)} placeholder="1-21" className={INPUT_CLS} /></div>
                <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Оценка, ч.</label><input type="number" min={0} step={0.5} value={eh} onChange={e => setEh(e.target.value)} placeholder="—" className={INPUT_CLS} /></div>
              </div>
              <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Исполнитель</label><AsyncSelect value={aid} onChange={setAid} loadOptions={loadUsers} placeholder="Не назначен" icon={UserCheck} /></div>
              {context.type !== 'ticket' && <div><label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Заявка</label><AsyncSelect value={tid} onChange={setTid} loadOptions={loadTickets} placeholder="Без заявки" icon={Ticket} /></div>}
            </div>
          </div>
          <div className="mt-6 pt-5 border-t border-[var(--border-color)]">
            <button onClick={() => setTodo(v => !v)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-base ${todo ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${todo ? 'bg-blue-500 border-blue-600' : 'border-[var(--border-color)]'}`}>{todo && <Check className="w-4 h-4 text-white" />}</div>
              <span className="font-medium">Сразу готова к выполнению (перевести в «{STATUS_LABELS.todo}»)</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base disabled:opacity-50">Отмена</button>
          <button onClick={submit} disabled={!title.trim() || saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Создать задачу
          </button>
        </div>
      </div>
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

  const up = sp.get('project_id'), ua = sp.get('assignee_id'), ut = sp.get('ticket_id');
  const staff = user?.roles?.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;

  const [mode, setMode] = useState<ContextMode>(() => { if (up) return 'project'; if (ua) return 'assignee'; if (ut) return 'ticket'; return staff ? 'internal' : 'my'; });
  const [selPid, setSelPid] = useState(up ?? '');
  const [selAid, setSelAid] = useState(ua ?? '');
  const [selTid, setSelTid] = useState(ut ?? '');
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

  const fpRef = useRef(fp); const foRef = useRef(fo); fpRef.current = fp; foRef.current = fo;

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
    return { type: 'my' };
  }, [mode, selPid, selAid, selTid]);

  useEffect(() => {
    const load = async () => {
      const m = new Map();
      try { const r = await usersApi.getAllUsers(1, 100); r.items.forEach(u => m.set(u.id, u)); } catch { }
      setUmap(m);
    };
    load();
  }, []);

  const fetchBoard = useCallback(async (silent = false) => {
    if ((mode === 'project' && !selPid) || (mode === 'ticket' && !selTid) || (mode === 'assignee' && !selAid)) { setLoading(false); return; }
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const d = await tasksApi.getKanban(ctx(), { size: 20, priorities: fpRef.current.length ? fpRef.current : undefined, overdue_only: foRef.current || undefined });
      setCols(COLUMN_ORDER.map(s => d.columns.find(c => c.status === s)).filter((c): c is TaskKanbanColumn => !!c));
      setTotal(d.total_tasks);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [ctx, toast, mode, selPid, selTid, selAid]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);
  useEffect(() => { fetchBoard(true); }, [fp, fo, fetchBoard]);

  const more = useCallback(async (st: TaskStatus) => {
    const c = cols.find(x => x.status === st);
    if (!c?.tasks.has_next) return;
    setMoreCol(st);
    try {
      const d = await tasksApi.getKanban(ctx(), { page: c.tasks.page + 1, size: c.tasks.size, priorities: fpRef.current.length ? fpRef.current : undefined });
      const nc = d.columns.find(x => x.status === st);
      if (!nc) return;
      setCols(p => p.map(x => x.status === st ? { ...x, tasks: { ...nc.tasks, items: [...x.tasks.items, ...nc.tasks.items] } } : x));
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally { setMoreCol(null); }
  }, [cols, ctx, toast]);

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
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
      await fetchBoard(true);
    } finally {
      setAssignBeforeLoading(false);
    }
  }, [assignBeforeTask, fetchBoard, toast]);

  const onDrop = useCallback(async (e: any, to: TaskStatus) => {
    e.preventDefault(); setDragOver(null);
    if (!drag || drag.from === to) { setDrag(null); return; }
    const srcCol = cols.find(c => c.status === drag.from);
    const task = srcCol?.tasks.items.find(t => t.id === drag.id);
    if (!task) { setDrag(null); return; }
    if (!ALLOWED_TRANSITIONS[drag.from].includes(to)) {
      toast({ title: 'Переход недоступен', description: `Из «${STATUS_LABELS[drag.from]}» нельзя перейти в «${STATUS_LABELS[to]}».`, variant: 'destructive' });
      setDrag(null); return;
    }
    if (to === 'in_progress' && !task.assignee_id) { setDrag(null); setAssignBeforeTask(task); return; }
    const snapshot = cols.map(c => ({ ...c, tasks: { ...c.tasks, items: [...c.tasks.items] } }));
    const { id, from } = drag; setDrag(null);
    let movedTask: TaskKanbanItem | undefined;
    setCols(prev => {
      const next = prev.map(c => {
        if (c.status === from) {
          const items = c.tasks.items.filter(t => { if (t.id === id) { movedTask = t; return false; } return true; });
          return { ...c, tasks: { ...c.tasks, items, total_items: c.tasks.total_items - 1 } };
        }
        return c;
      });
      if (!movedTask) return prev;
      const updated = { ...movedTask, status: to };
      return next.map(c => c.status === to ? { ...c, tasks: { ...c.tasks, items: [updated, ...c.tasks.items], total_items: c.tasks.total_items + 1 } } : c);
    });
    try {
      await tasksApi.changeStatus(id, to);
      toast({ title: 'Статус обновлён', description: `Задача "${movedTask?.title || 'Без названия'}" переведена в «${STATUS_LABELS[to]}»` });
    } catch (e: any) {
      setCols(snapshot);
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    }
  }, [drag, cols, toast]);

  const disp = cols.map(c => {
    if (!q) return c;
    const s = q.toLowerCase();
    return { ...c, tasks: { ...c.tasks, items: c.tasks.items.filter(t => t.title.toLowerCase().includes(s) || t.number.toLowerCase().includes(s)) } };
  });

  const hf = fp.length > 0 || fo;
  const done = cols.find(c => c.status === 'done')?.tasks.total_items ?? 0;
  const tabs = CTX_TABS.filter(t => !t.staffOnly || staff);

  const loadProjectsAsync = useCallback(async (search: string, page: number) => {
    const res = await projectsApi.getAll(page, 20);
    const filtered = search ? res.items.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase())) : res.items;
    return { items: filtered.map(p => ({ value: p.id, label: p.name, sublabel: p.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })), hasNext: res.items.length === 20 };
  }, []);

  const loadTicketsAsync = useCallback(async (search: string, page: number) => {
    const res = await ticketsApi.getAllWithFilters(page, 20, { project_id: selPid || undefined });
    const filtered = search ? res.items.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || String(t.number).includes(search)) : res.items;
    return { items: filtered.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })), hasNext: res.items.length === 20 };
  }, [selPid]);

  const loadAssigneesAsync = useCallback(async (search: string, page: number) => {
    const res = await usersApi.getAllUsers(page, 20);
    const filtered = search ? res.items.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) : res.items;
    return { items: filtered.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })), hasNext: res.items.length === 20 };
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-500" onDragEnd={() => { setDrag(null); setDragOver(null); }}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Задачи сотрудников</h1>
            {!loading && <span className="px-2 py-0.5 rounded-lg bg-[var(--hover-3)] text-base font-medium text-[var(--text-primary)]/50 tabular-nums">{total}</span>}
            {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]/40" />}
          </div>
          {!loading && <p className="text-base text-[var(--text-primary)]/35 mt-0.5">{total - done} активных · {done} завершено{hf && <span className="text-[var(--accent)] ml-1.5">· фильтры</span>}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск..." className="w-44 pl-8 pr-7 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all" />
            {q && <X className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 hover:text-[var(--text-primary)] cursor-pointer" onClick={() => setQ('')} />}
          </div>
          <div className="relative">
            <button onClick={() => setSf(v => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-base font-medium transition-all ${hf ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/50'}`}>
              <Filter className="w-3.5 h-3.5" />Фильтры{hf && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
            </button>
            {sf && (<>
              <div className="fixed inset-0 z-10" onClick={() => setSf(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)]">
                <div className="p-2.5 space-y-2.5">
                  <div><p className="px-1 pb-1 text-[13px] uppercase tracking-widest text-[var(--text-primary)]/25">Приоритет</p>
                    <div className="flex flex-wrap gap-1 px-0.5">{PRIORITY_OPTIONS.map(p => { const pm = PRI[p.value]; return (
                      <button key={p.value} onClick={() => setFp(v => v.includes(p.value) ? v.filter(x => x !== p.value) : [...v, p.value])} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-base font-medium border transition-all ${fp.includes(p.value) ? `${pm.bg} ${pm.color} ${pm.border}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pm.dot}`} />{p.label}
                      </button>
                    ); })}</div>
                  </div>
                  <div className="border-t border-[var(--border-color)] pt-2 px-0.5">
                    <button onClick={() => setFo(v => !v)} className={fo ? 'w-full flex items-center gap-2 py-1.5 px-1 rounded-lg text-base transition-colors text-[var(--accent)]' : 'w-full flex items-center gap-2 py-1.5 px-1 rounded-lg text-base transition-colors text-[var(--text-primary)]/50'}>
  <div className={fo ? 'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 bg-[var(--accent)] border-[var(--accent)]' : 'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 border-[var(--border-color)]'}>
    {fo && <Check className="w-2 h-2 text-white" />}
  </div>
  Просроченные
</button>
                  </div>
                  {hf && <div className="border-t border-[var(--border-color)] pt-1.5"><button onClick={() => { setFp([]); setFo(false); }} className="w-full text-center text-base text-[var(--accent)] py-1">Сбросить</button></div>}
                </div>
              </div>
            </>)}
          </div>
          <button onClick={() => fetchBoard(true)} disabled={refreshing || loading} className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] transition-all disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setCreate('backlog')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-base font-medium transition-colors shadow-[var(--shadow-md)]">
            <Plus className="w-4 h-4" />Задача
          </button>
        </div>
      </div>

      {/* Context tabs */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-0.5 p-0.5 bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setMode(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-base font-medium transition-all whitespace-nowrap ${mode === t.id ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-3)]'}`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
        {mode === 'project' && <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" /><div className="min-w-[200px]"><AsyncSelect value={selPid} onChange={setSelPid} loadOptions={loadProjectsAsync} placeholder="Выберите проект" icon={FolderOpen} /></div></div>}
        {mode === 'ticket' && <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" /><div className="min-w-[200px]"><AsyncSelect value={selTid} onChange={setSelTid} loadOptions={loadTicketsAsync} placeholder="Выберите заявку" icon={Ticket} /></div></div>}
        {mode === 'assignee' && <div className="flex items-center gap-1.5"><ChevronRight className="w-4 h-4 text-[var(--text-primary)]/15" /><div className="min-w-[200px]"><AsyncSelect value={selAid} onChange={setSelAid} loadOptions={loadAssigneesAsync} placeholder="Выберите исполнителя" icon={UserCheck} /></div></div>}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="text-center"><Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-3" /><p className="text-[var(--text-primary)]/40 text-base">Загрузка...</p></div></div>
      ) : !cols.length ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-xs">
            <FolderOpen className="w-12 h-12 text-[var(--text-primary)]/10 mx-auto mb-3" />
            <p className="text-base font-semibold text-[var(--text-primary)]/60 mb-1">Нет данных</p>
            <p className="text-base text-[var(--text-primary)]/40 mb-4">{mode === 'project' && !selPid ? 'Выберите проект' : mode === 'assignee' && !selAid ? 'Выберите исполнителя' : mode === 'ticket' && !selTid ? 'Выберите заявку' : 'Задачи не найдены'}</p>
            <button onClick={() => fetchBoard()} className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium">Обновить</button>
          </div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent" style={{ minHeight: 'calc(100vh - 280px)' }}>
          <div className="flex gap-4">
            {disp.map(c => (
              <KColumn key={c.status} column={c} userMap={umap} isDragOver={dragOver === c.status} draggedId={drag?.id ?? null} loadingMore={moreCol === c.status}
                onDragStart={(id, from) => setDrag({ id, from })} onDragEnd={() => { setDrag(null); setDragOver(null); }}
                onDragOver={(e, st) => { e.preventDefault(); if (drag && !ALLOWED_TRANSITIONS[drag.from].includes(st)) return; e.dataTransfer.dropEffect = 'move'; setDragOver(st); }}
                onDragLeave={() => setDragOver(null)} onDrop={onDrop} onAdd={setCreate} onView={setView} onMore={more} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Modals */}
      {view && <DetailModal task={view} userMap={umap} onClose={() => setView(null)} onRefresh={() => fetchBoard(true)} onNeedAssign={t => { setView(null); setAssignBeforeTask(t); }} />}
      {create != null && <CreateModal initialStatus={create} context={ctx()} userMap={umap} onClose={() => setCreate(null)} onOk={() => { setCreate(null); fetchBoard(true); }} />}
      {assignBeforeTask && <AssignBeforeProgressModal task={assignBeforeTask} userMap={umap} loading={assignBeforeLoading} onClose={() => { if (!assignBeforeLoading) setAssignBeforeTask(null); }} onConfirm={handleAssignAndProgress} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DETAIL & ASSIGN MODALS
   ═══════════════════════════════════════════════════════════════════ */

function DetailModal({ task, userMap, onClose, onRefresh, onNeedAssign }: {
  task: TaskKanbanItem; userMap: Map<string, SimpleUser | CounterpartyCustomer>; onClose: () => void; onRefresh: () => Promise<void>; onNeedAssign: (task: TaskKanbanItem) => void;
}) {
  const { toast } = useToast();
  const [showStatus, setShowStatus] = useState(false);
  const [busy, setBusy] = useState('');
  const assignee = task.assignee_id ? userMap.get(task.assignee_id) : null;
  const cm = COL[task.status];
  const allowed = ALLOWED_TRANSITIONS[task.status];

  const act = async (label: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(label);
    try { await fn(); if (msg) toast({ title: msg }); await onRefresh(); onClose(); }
    catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  const handleStatusClick = (s: TaskStatus) => {
    if (s === 'in_progress' && !task.assignee_id) { setShowStatus(false); onNeedAssign(task); return; }
    setShowStatus(false);
    act('status', async () => { await tasksApi.changeStatus(task.id, s); toast({ title: 'Статус обновлён', description: `Задача переведена в «${STATUS_LABELS[s]}».` }); });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-[var(--text-primary)]/85 font-mono text-base bg-[var(--accent-soft)] border border-[var(--accent)]/15 px-2 py-0.5 rounded-lg">{task.number}</span>
              <PBadge p={task.priority} />
              {task.story_points != null && <SPBadge v={task.story_points} />}
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)] leading-snug">{task.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)] p-3">
              <p className="text-[13px] uppercase tracking-widest text-[var(--text-primary)]/40 mb-1.5">Статус</p>
              <div className="relative">
                <button onClick={() => allowed.length > 0 && setShowStatus(v => !v)} disabled={busy !== '' || !allowed.length} className={`flex items-center gap-1.5 text-base font-semibold ${cm.textColor} disabled:opacity-40`}>
                  {busy === 'status' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <cm.icon className="w-3.5 h-3.5" />}{STATUS_LABELS[task.status]}{allowed.length > 0 && <ChevronDown className="w-4 h-4 opacity-40" />}
                </button>
                {showStatus && (<>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatus(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-lg)]">
                    <div className="p-1"><p className="px-3 py-1.5 text-[13px] uppercase tracking-widest text-[var(--text-primary)]/25">Перевести в:</p>
                      {allowed.map(s => { const sm = COL[s]; return (
                        <button key={s} onClick={() => handleStatusClick(s)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-base text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]">
                          <div className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} /><sm.icon className={`w-3.5 h-3.5 ${sm.textColor}`} /><span className="flex-1 text-left">{STATUS_LABELS[s]}</span>
                          {s === 'in_progress' && !task.assignee_id && <span className="text-[13px] text-[var(--warning)] bg-[var(--warning)]/10 px-1.5 py-0.5 rounded">исполнитель</span>}
                        </button>
                      ); })}
                    </div>
                  </div>
                </>)}
              </div>
            </div>
            <div className="bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)] p-3">
              <p className="text-[13px] uppercase tracking-widest text-[var(--text-primary)]/40 mb-1.5">Срок</p>
              {task.due_date ? <span className={`flex items-center gap-1 text-base font-semibold ${isOverdue(task.due_date) ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/70'}`}><Calendar className="w-3.5 h-3.5" />{fmtDue(task.due_date)}</span> : <span className="text-base text-[var(--text-primary)]/25">—</span>}
            </div>
            <div className="bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)] p-3">
              <p className="text-[13px] uppercase tracking-widest text-[var(--text-primary)]/40 mb-1.5">Исполнитель</p>
              {assignee ? <div className="flex items-center gap-1.5"><Ava name={assignee.full_name || assignee.username} url={assignee.avatar_url} size="sm" /><span className="text-base text-[var(--text-primary)]/70 font-medium truncate">{assignee.full_name || assignee.username}</span></div> : <span className="text-base text-[var(--text-primary)]/25">—</span>}
            </div>
            <div className="bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)] p-3">
              <p className="text-[13px] uppercase tracking-widest text-[var(--text-primary)]/40 mb-1.5">Создана</p>
              <span className="text-base text-[var(--text-primary)]/70">{new Date(task.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
          {task.ticket_id && (
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]">
              <Ticket className="w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0" />
              <span className="flex-1 text-base text-[var(--text-primary)]/40">Заявка{(task as any).number && <span className="ml-1.5 text-[var(--text-primary)]/85 text-base">#{(task as any).number.slice(0, -4)}</span>}</span>
              <Link to={`/tickets/${(task as any).number.slice(0, -4) || task.ticket_id}`} onClick={onClose} className="flex items-center gap-1 text-base text-[var(--accent)] hover:text-[var(--accent-light)]">Открыть<ArrowUpRight className="w-4 h-4" /></Link>
            </div>
          )}
          {task.project_id && (
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]">
              <FolderOpen className="w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0" />
              <span className="flex-1 text-base text-[var(--text-primary)]/40">Проект</span>
              <Link to={`/projects/${task.project_id}`} onClick={onClose} className="flex items-center gap-1 text-base text-[var(--accent)]">Открыть<ArrowUpRight className="w-4 h-4" /></Link>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
          <button onClick={() => act('archive', async () => { await tasksApi.archive(task.id); toast({ title: 'Архивировано' }); })} disabled={busy === 'archive'} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 text-[var(--text-primary)] text-base font-medium disabled:opacity-50">
            {busy === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}Архив
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base">Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function AssignBeforeProgressModal({ task, userMap, loading, onClose, onConfirm }: {
  task: TaskKanbanItem; userMap: Map<string, SimpleUser | CounterpartyCustomer>; loading: boolean; onClose: () => void; onConfirm: (id: string) => Promise<void>;
}) {
  const [aid, setAid] = useState('');
  const users = Array.from(userMap.values());
  const opts: DropdownOption[] = users.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--warning)]/15 flex items-center justify-center"><UserCheck className="w-5 h-5 text-[var(--warning)]" /></div>
            <div><h2 className="text-base font-bold text-[var(--text-primary)]">Назначьте исполнителя</h2><p className="text-base text-[var(--text-primary)]/40">Обязательно для «В работе»</p></div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[var(--accent)] font-mono text-[13px] bg-[var(--accent-soft)] border border-[var(--accent)]/15 px-1.5 py-0.5 rounded-md">{task.number}</span>
              <PBadge p={task.priority} />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)] leading-snug">{task.title}</p>
          </div>
          <div><label className="block text-base font-medium text-[var(--text-primary)]/60 mb-2">Исполнитель <span className="text-[var(--accent)]">*</span></label><CustomSelect value={aid} onChange={setAid} options={opts} placeholder="Выберите" icon={UserCheck} searchable /></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading} className="px-4 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base disabled:opacity-50">Отмена</button>
          <button onClick={() => onConfirm(aid)} disabled={!aid || loading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Назначить
          </button>
        </div>
      </div>
    </div>
  );
}