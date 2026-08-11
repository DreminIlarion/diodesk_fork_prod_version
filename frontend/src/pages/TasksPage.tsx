// pages/TasksPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, Calendar, Loader2, X, Check, Circle, Timer, Eye,
  ArrowUpRight, ChevronDown, Flag, AlertCircle, CheckCircle2, Ban, RotateCcw,
  RefreshCw, Archive, FolderOpen, Ticket, Zap, Star, User, ChevronRight,
  Layers, UserCheck, GitPullRequest, ThumbsUp, ThumbsDown, Pencil, Save,
  Milestone, ChevronLeft, List, LayoutGrid,
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

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const SP_SERIES = [1, 2, 3, 5, 8, 13, 21];

const PRI_LABEL: Record<TaskPriority, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический',
};
const PRI_LIST: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Низкий' }, { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' }, { value: 'critical', label: 'Критический' },
];

const ST_LABEL: Record<TaskStatus, string> = {
  backlog: 'В резерве', todo: 'К выполнению', in_progress: 'В работе',
  paused: 'На паузе', blocked: 'Приостановлено', to_review: 'На проверке',
  to_fix: 'На доработку', to_test: 'На тестировании',
  done: 'Выполнено', cancelled: 'Отменено',
};

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'], todo: ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'to_review', 'done', 'cancelled'],
  paused: ['in_progress', 'cancelled'], blocked: ['in_progress', 'cancelled'],
  to_review: ['in_progress', 'done', 'to_fix', 'to_test', 'cancelled'],
  to_fix: ['in_progress', 'to_review', 'cancelled'],
  to_test: ['in_progress', 'to_review', 'done', 'cancelled'],
  done: [], cancelled: [],
};

const EDIT_OK: Set<TaskStatus> = new Set(['backlog', 'todo']);
const ASSIGN_OK: Set<TaskStatus> = new Set([
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test',
]);
const COL_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'paused', 'blocked',
  'to_review', 'to_fix', 'to_test', 'done', 'cancelled',
];

const CM: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  tc: string; dot: string; brd: string; chip: string; empty: string;
}> = {
  backlog:     { icon: Circle,       tc: 'text-gray-400',    dot: 'bg-gray-400',    brd: 'border-gray-400/30',    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',       empty: 'Пусто' },
  todo:        { icon: AlertCircle,  tc: 'text-blue-500',    dot: 'bg-blue-500',    brd: 'border-blue-500/30',    chip: 'bg-blue-500/10 text-blue-500 border-blue-500/20',       empty: 'Пусто' },
  in_progress: { icon: Timer,        tc: 'text-amber-500',   dot: 'bg-amber-500',   brd: 'border-amber-500/30',   chip: 'bg-amber-500/10 text-amber-500 border-amber-500/20',   empty: 'Пусто' },
  paused:      { icon: Ban,          tc: 'text-gray-400',    dot: 'bg-gray-400',    brd: 'border-gray-400/30',    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',       empty: 'Пусто' },
  blocked:     { icon: Ban,          tc: 'text-red-500',     dot: 'bg-red-500',     brd: 'border-red-500/30',     chip: 'bg-red-500/10 text-red-500 border-red-500/20',           empty: 'Пусто' },
  to_review:   { icon: Eye,          tc: 'text-violet-500',  dot: 'bg-violet-500',  brd: 'border-violet-500/30',  chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
  to_fix:      { icon: AlertCircle,  tc: 'text-orange-500',  dot: 'bg-orange-500',  brd: 'border-orange-500/30',  chip: 'bg-orange-500/10 text-orange-500 border-orange-500/20', empty: 'Пусто' },
  to_test:     { icon: CheckCircle2, tc: 'text-cyan-500',    dot: 'bg-cyan-500',    brd: 'border-cyan-500/30',    chip: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',       empty: 'Пусто' },
  done:        { icon: CheckCircle2, tc: 'text-emerald-500', dot: 'bg-emerald-500', brd: 'border-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', empty: 'Пусто' },
  cancelled:   { icon: RotateCcw,    tc: 'text-gray-400',    dot: 'bg-gray-400',    brd: 'border-gray-400/30',    chip: 'bg-gray-400/10 text-gray-400 border-gray-400/20',       empty: 'Пусто' },
  review:      { icon: Eye,          tc: 'text-violet-500',  dot: 'bg-violet-500',  brd: 'border-violet-500/30',  chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
};

const PM: Record<TaskPriority, { c: string; bg: string; brd: string; dot: string; icon: React.ReactNode }> = {
  low:      { c: 'text-emerald-500', bg: 'bg-emerald-500/10', brd: 'border-emerald-500/20', dot: 'bg-emerald-500', icon: <Flag className="w-4 h-4" /> },
  medium:   { c: 'text-yellow-500',  bg: 'bg-yellow-500/10',  brd: 'border-yellow-500/20',  dot: 'bg-yellow-500',  icon: <Flag className="w-4 h-4" /> },
  high:     { c: 'text-orange-500',  bg: 'bg-orange-500/10',  brd: 'border-orange-500/20',  dot: 'bg-orange-500',  icon: <Flag className="w-4 h-4" /> },
  critical: { c: 'text-red-500',     bg: 'bg-red-500/10',     brd: 'border-red-500/20',     dot: 'bg-red-500',     icon: <Zap className="w-4 h-4" /> },
};

type CtxMode = 'my' | 'internal' | 'project' | 'assignee' | 'ticket';
type ViewMode = 'kanban' | 'list';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const ini = (n?: string | null) =>
  n ? n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
const overdue = (t: TaskKanbanItem) =>
  t.due_date && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();
const fmtDue = (d: string) => {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${-diff}д. назад`;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};
const apiErr = (e: any) =>
  e?.response?.data?.error?.public_message ?? e?.response?.data?.error?.message ??
  e?.response?.data?.detail?.[0]?.msg ?? e.message ?? 'Неизвестная ошибка';
const snapCols = (c: TaskKanbanColumn[]) =>
  c.map(x => ({ ...x, tasks: { ...x.tasks, items: [...x.tasks.items] } }));

function statusErr(err: any, task: TaskKanbanItem, to: TaskStatus) {
  const raw = apiErr(err), lw = raw.toLowerCase();
  if (to === 'in_progress' && (!task.assignee_id || lw.includes('assignee')))
    return { title: 'Нужен исполнитель', description: 'Назначьте исполнителя для перевода задачи в работу.' };
  if (lw.includes('transition') || lw.includes('cannot'))
    return { title: 'Переход недоступен', description: `Из «${ST_LABEL[task.status]}» нельзя в «${ST_LABEL[to]}».` };
  return { title: `Ошибка перевода в «${ST_LABEL[to]}»`, description: raw };
}

const INP = 'w-full px-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 transition-all';

/* ═══════════════════════════════════════════════════════════════
   DROPDOWN PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */
interface DDOpt {
  value: string; label: string; sublabel?: string;
  icon?: React.ReactNode; dotColor?: string;
}

function useDDPos(ref: React.RefObject<HTMLDivElement | null>, open: boolean, wide?: boolean) {
  const [s, setS] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 350;
    setS({
      position: 'fixed', left: Math.max(12, r.left),
      width: wide ? Math.max(r.width, 400) : r.width, zIndex: 9999,
      ...(up ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
    });
  }, [open, wide]);
  return s;
}

function SelectDD({ value, onChange, options, placeholder, icon: LI, searchable, disabled }: {
  value: string; onChange: (v: string) => void; options: DDOpt[];
  placeholder?: string; icon?: React.ComponentType<{ className?: string }>;
  searchable?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const tRef = useRef<HTMLDivElement>(null);
  const dRef = useRef<HTMLDivElement>(null);
  const iRef = useRef<HTMLInputElement>(null);
  const pos = useDDPos(tRef, open);
  const sel = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => {
    if (open && searchable) setTimeout(() => iRef.current?.focus(), 50);
    if (!open) setQ('');
  }, [open, searchable]);

  const fl = q
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()) || (o.sublabel || '').toLowerCase().includes(q.toLowerCase()))
    : options;

  const dd = open ? createPortal(
    <div ref={dRef} style={pos}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden">
      {searchable && (
        <div className="p-3 border-b border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
            <input ref={iRef} value={q} onChange={e => setQ(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-10 pr-3 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/40" />
          </div>
        </div>
      )}
      <div className="overflow-y-auto max-h-[280px] p-2">
        <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]/50'}`}>
          <span>—</span><span className="flex-1">Не выбрано</span>
          {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
        </div>
        {fl.length === 0 && q && (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-primary)]/40">Не найдено</div>
        )}
        {fl.map(o => (
          <div key={o.value} role="button" tabIndex={0}
            onClick={() => { onChange(o.value); setOpen(false); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'}`}>
            {o.dotColor && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${o.dotColor}`} />}
            {o.icon && <span className="shrink-0">{o.icon}</span>}
            <div className="flex-1 min-w-0">
              <span className="block truncate font-medium">{o.label}</span>
              {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate mt-0.5">{o.sublabel}</span>}
            </div>
            {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
          </div>
        ))}
      </div>
    </div>, document.body
  ) : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/50 ring-2 ring-[var(--accent)]/10' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${sel ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {sel ? sel.label : (placeholder || '—')}
        </span>
        {sel && value && (
          <span role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}
            className="p-1 rounded-md text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-4 h-4" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dd}
    </div>
  );
}

function AsyncDD({ value, onChange, loadFn, placeholder, icon: LI, disabled, wide }: {
  value: string; onChange: (v: string) => void;
  loadFn: (q: string, p: number) => Promise<{ items: DDOpt[]; hasNext: boolean }>;
  placeholder?: string; icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean; wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<DDOpt[]>([]);
  const [ld, setLd] = useState(false);
  const [ldMore, setLdMore] = useState(false);
  const [pg, setPg] = useState(1);
  const [more, setMore] = useState(false);
  const [selLbl, setSelLbl] = useState('');
  const tRef = useRef<HTMLDivElement>(null);
  const dRef = useRef<HTMLDivElement>(null);
  const iRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef<ReturnType<typeof setTimeout>>();
  const pos = useDDPos(tRef, open, wide);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const doLoad = useCallback(async (s: string, p: number, append = false) => {
    append ? setLdMore(true) : setLd(true);
    try {
      const r = await loadFn(s, p);
      setOpts(prev => append ? [...prev, ...r.items] : r.items);
      setMore(r.hasNext); setPg(p);
    } catch { } finally { setLd(false); setLdMore(false); }
  }, [loadFn]);

  useEffect(() => {
    if (!open) return;
    doLoad('', 1);
    setTimeout(() => iRef.current?.focus(), 50);
  }, [open, doLoad]);

  useEffect(() => {
    if (!open) { setQ(''); return; }
    if (dbRef.current) clearTimeout(dbRef.current);
    dbRef.current = setTimeout(() => doLoad(q, 1), 300);
    return () => { if (dbRef.current) clearTimeout(dbRef.current); };
  }, [q, open, doLoad]);

  useEffect(() => {
    if (!value) { setSelLbl(''); return; }
    const f = opts.find(o => o.value === value);
    if (f) { setSelLbl(f.label); return; }
    loadFn('', 1).then(r => {
      const x = r.items.find(o => o.value === value);
      setSelLbl(x ? x.label : '…');
    }).catch(() => setSelLbl('…'));
  }, [value, opts, loadFn]);

  const dd = open ? createPortal(
    <div ref={dRef} style={pos}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
          <input ref={iRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-10 pr-3 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/40" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[320px] p-2">
        <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]/50'}`}>
          <span>—</span><span className="flex-1">Не выбрано</span>
          {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
        </div>
        {ld && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>}
        {!ld && opts.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-primary)]/40">{q ? 'Не найдено' : 'Нет данных'}</div>
        )}
        {!ld && opts.map(o => (
          <div key={o.value} role="button" tabIndex={0}
            onClick={() => { onChange(o.value); setSelLbl(o.label); setOpen(false); }}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm cursor-pointer ${o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'}`}>
            {o.dotColor && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${o.dotColor}`} />}
            {o.icon && <span className="shrink-0">{o.icon}</span>}
            <div className="flex-1 min-w-0">
              <span className="block leading-snug font-medium"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {o.label}
              </span>
              {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate mt-1">{o.sublabel}</span>}
            </div>
            {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
          </div>
        ))}
        {!ld && more && (
          <div role="button" tabIndex={0}
            onClick={() => !ldMore && doLoad(q, pg + 1, true)}
            className="flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)] rounded-lg cursor-pointer font-medium">
            {ldMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />} Ещё
          </div>
        )}
      </div>
    </div>, document.body
  ) : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/50 ring-2 ring-[var(--accent)]/10' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${selLbl ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {selLbl || (placeholder || '—')}
        </span>
        {value && (
          <span role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(''); setSelLbl(''); setOpen(false); }}
            className="p-1 rounded-md text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-4 h-4" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dd}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════ */
function Ava({ name, url, sz = 'sm' }: { name?: string | null; url?: string | null; sz?: 'xs' | 'sm' | 'md' }) {
  const c = sz === 'xs' ? 'w-7 h-7 text-xs' : sz === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  if (url) return <img src={url} alt="" className={`${c} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${c} rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/70 flex items-center justify-center font-bold text-white shrink-0 select-none`}>
      {ini(name)}
    </div>
  );
}

function PriBadge({ p }: { p: TaskPriority }) {
  const m = PM[p];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${m.bg} ${m.c} ${m.brd}`}>
      {m.icon}{PRI_LABEL[p]}
    </span>
  );
}

function SpBadge({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
      <Star className="w-3.5 h-3.5" />{v}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════════════════════════ */
function ListView({ tasks, umap, onView }: {
  tasks: TaskKanbanItem[];
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onView: (t: TaskKanbanItem) => void;
}) {
  if (!tasks.length) return (
    <div className="flex flex-col items-center justify-center py-24 text-[var(--text-primary)]/30">
      <Layers className="w-12 h-12 mb-3" /><p className="text-base">Задач нет</p>
    </div>
  );
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-[var(--hover-1)] border-b border-[var(--border-color)]">
          <tr className="text-[var(--text-primary)]/50 text-sm">
            <th className="px-5 py-3.5 font-semibold">Задача</th>
            <th className="px-4 py-3.5 font-semibold">Статус</th>
            <th className="px-4 py-3.5 font-semibold">Приоритет</th>
            <th className="px-4 py-3.5 font-semibold">Исполнитель</th>
            <th className="px-4 py-3.5 font-semibold">Срок</th>
            <th className="px-4 py-3.5 font-semibold text-right">SP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {tasks.map(t => {
            const a = t.assignee_id ? umap.get(t.assignee_id) : null;
            const cm = CM[t.status]; const od = overdue(t);
            return (
              <tr key={t.id} onClick={() => onView(t)} className="hover:bg-[var(--hover-1)] cursor-pointer transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[var(--text-primary)]/40 text-sm shrink-0">#{t.number}</span>
                    <span className="text-[var(--text-primary)] font-medium truncate max-w-[400px] text-sm">{t.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cm.chip}`}>
                    <span className={`w-2 h-2 rounded-full ${cm.dot}`} />{ST_LABEL[t.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5"><PriBadge p={t.priority} /></td>
                <td className="px-4 py-3.5">
                  {a ? (
                    <div className="flex items-center gap-2">
                      <Ava name={a.full_name || a.username} url={a.avatar_url} sz="xs" />
                      <span className="text-[var(--text-primary)]/70 truncate max-w-[150px] text-sm">{(a.full_name || a.username || '').split(' ')[0]}</span>
                    </div>
                  ) : <span className="text-[var(--text-primary)]/30">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  {t.due_date && <span className={`text-sm ${od ? 'text-red-500 font-semibold' : 'text-[var(--text-primary)]/50'}`}>{fmtDue(t.due_date)}</span>}
                </td>
                <td className="px-4 py-3.5 text-right">
                  {t.story_points != null && <SpBadge v={t.story_points} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TASK CARD
   ═══════════════════════════════════════════════════════════════ */
function TCard({ task: t, umap, dragging, onDS, onDE, onView }: {
  task: TaskKanbanItem; umap: Map<string, SimpleUser | CounterpartyCustomer>;
  dragging: boolean; onDS: (id: string, f: TaskStatus) => void;
  onDE: () => void; onView: (t: TaskKanbanItem) => void;
}) {
  const od = overdue(t);
  const a = t.assignee_id ? umap.get(t.assignee_id) : null;
  return (
    <motion.div layout draggable
      onDragStart={e => { (e as any).dataTransfer.effectAllowed = 'move'; onDS(t.id, t.status); }}
      onDragEnd={onDE} onClick={() => onView(t)}
      className={`group bg-[var(--bg-card)] border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md hover:border-[var(--accent)]/30
        ${dragging ? 'opacity-40 rotate-2 scale-105 shadow-xl' : ''}
        ${od ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--border-color)]'}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="px-2 py-0.5 rounded-md text-xs font-mono bg-[var(--hover-2)] text-[var(--text-primary)]/60 shrink-0">#{t.number}</span>
        <PriBadge p={t.priority} />
        {t.story_points != null && <SpBadge v={t.story_points} />}
      </div>
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3 leading-snug line-clamp-2">{t.title}</h4>
      <div className="flex items-center justify-between gap-2">
        {a ? (
          <div className="flex items-center gap-2 min-w-0">
            <Ava name={a.full_name || a.username} url={a.avatar_url} sz="xs" />
            <span className="text-xs text-[var(--text-primary)]/60 truncate font-medium">{(a.full_name || a.username || '').split(' ')[0]}</span>
          </div>
        ) : <span className="text-xs text-[var(--text-primary)]/30">—</span>}
        <div className="flex items-center gap-2 shrink-0">
          {t.ticket_id && <Ticket className="w-4 h-4 text-[var(--text-primary)]/30" />}
          {t.due_date && (
            <span className={`text-xs font-semibold ${od ? 'text-red-500' : 'text-[var(--text-primary)]/40'}`}>{fmtDue(t.due_date)}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KANBAN COLUMN
   ═══════════════════════════════════════════════════════════════ */
function KCol({ col, umap, isDO, dragId, ldMore, onDS, onDE, onDO, onDL, onDrop, onAdd, onView, onMore }: {
  col: TaskKanbanColumn; umap: Map<string, SimpleUser | CounterpartyCustomer>;
  isDO: boolean; dragId: string | null; ldMore: boolean;
  onDS: (id: string, f: TaskStatus) => void; onDE: () => void;
  onDO: (e: React.DragEvent, s: TaskStatus) => void; onDL: () => void;
  onDrop: (e: React.DragEvent, s: TaskStatus) => void;
  onAdd: (s: TaskStatus) => void; onView: (t: TaskKanbanItem) => void;
  onMore: (s: TaskStatus) => void;
}) {
  const m = CM[col.status]; const I = m.icon;
  return (
    <div
      onDragOver={e => onDO(e, col.status)} onDragLeave={onDL}
      onDrop={e => onDrop(e, col.status)}
      className={`bg-[var(--hover-1)]/60 rounded-xl flex flex-col w-[300px] shrink-0 transition-all h-full
        ${isDO ? 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/10' : ''}`}>
      <div className="px-3.5 py-3 flex items-center justify-between border-b border-[var(--border-color)]/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <I className={`w-4 h-4 shrink-0 ${m.tc}`} />
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{ST_LABEL[col.status]}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--hover-3)] text-[var(--text-primary)]/50 shrink-0">
            {col.tasks.total_items}
          </span>
        </div>
        <button onClick={() => onAdd(col.status)}
          className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/30 hover:text-[var(--accent)] transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="p-2 flex-1 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {col.tasks.items.length === 0 && !isDO ? (
          <div className="h-28 flex items-center justify-center text-[var(--text-primary)]/25 border-2 border-dashed border-[var(--border-color)]/50 rounded-xl">
            <span className="text-sm">{m.empty}</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {col.tasks.items.map(t => (
              <TCard key={t.id} task={t} umap={umap} dragging={dragId === t.id} onDS={onDS} onDE={onDE} onView={onView} />
            ))}
          </AnimatePresence>
        )}
        {isDO && col.tasks.items.length === 0 && (
          <div className="h-24 flex items-center justify-center border-2 border-dashed border-[var(--accent)] rounded-xl bg-[var(--accent)]/10">
            <span className="text-sm font-semibold text-[var(--accent)]">Отпустите</span>
          </div>
        )}
        {col.tasks.has_next && (
          <button onClick={() => onMore(col.status)} disabled={ldMore}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)] font-medium disabled:opacity-40">
            {ldMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
            Ещё {col.tasks.total_items - col.tasks.items.length}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DRAG PANEL
   ═══════════════════════════════════════════════════════════════ */
function DragPanel({ task, onDrop }: {
  task: { id: string; from: TaskStatus; title: string; number: string } | null;
  onDrop: (e: React.DragEvent, to: TaskStatus) => void;
}) {
  const [hov, setHov] = useState<TaskStatus | null>(null);
  if (!task) return null;
  const al = TRANSITIONS[task.from];
  if (!al.length) return null;
  return createPortal(
    <motion.div
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed right-4 top-0 h-full z-[100] flex items-center pointer-events-none">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto" style={{ width: 240 }}>
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-1">Перетащить</p>
          <p className="text-sm font-bold text-[var(--text-primary)] truncate">#{task.number}</p>
        </div>
        <div className="p-2 space-y-1">
          {al.map(s => {
            const c = CM[s]; const I = c.icon; const h = hov === s;
            return (
              <div key={s}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHov(s); }}
                onDragLeave={() => setHov(null)}
                onDrop={e => { setHov(null); onDrop(e, s); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all
                  ${h ? `${c.brd} bg-[var(--accent)]/10 scale-[1.02] shadow-sm` : 'border-transparent hover:bg-[var(--hover-2)]'}`}>
                <I className={`w-4 h-4 ${c.tc}`} />
                <span className={`text-sm font-semibold truncate ${h ? c.tc : 'text-[var(--text-primary)]/70'}`}>{ST_LABEL[s]}</span>
                {h && <Check className={`w-4 h-4 ml-auto ${c.tc}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>, document.body
  );
}

/* ═══════════════════════════════════════════════════════════════
   ASSIGN MODAL
   ═══════════════════════════════════════════════════════════════ */
function AssignModal({ task, umap, loading, onClose, onOk }: {
  task: TaskKanbanItem; umap: Map<string, SimpleUser | CounterpartyCustomer>;
  loading: boolean; onClose: () => void; onOk: (id: string) => Promise<void>;
}) {
  const [aid, setAid] = useState('');
  const opts: DDOpt[] = Array.from(umap.values()).map(u => ({
    value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email,
  }));
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Назначьте исполнителя</h2>
          <p className="text-sm text-[var(--text-primary)]/50 mt-1">Обязательно для статуса «В работе»</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-[var(--hover-1)] p-4 border border-[var(--border-color)]">
            <span className="text-xs font-mono text-[var(--text-primary)]/50">{task.number}</span>
            <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">{task.title}</p>
          </div>
          <SelectDD value={aid} onChange={setAid} options={opts} placeholder="Выберите исполнителя" icon={UserCheck} searchable />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]/30">
          <button onClick={onClose} disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">
            Отмена
          </button>
          <button onClick={() => onOk(aid)} disabled={!aid || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Назначить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CREATE MODAL
   ═══════════════════════════════════════════════════════════════ */
function CreateModal({ initSt, context, umap, onClose, onOk }: {
  initSt: TaskStatus; context: TaskKanbanContext;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void; onOk: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [pri, setPri] = useState<TaskPriority>('medium');
  const [sp, setSp] = useState<number | null>(null);
  const [eh, setEh] = useState('');
  const [dd, setDd] = useState('');
  const [todo, setTodo] = useState(initSt === 'todo');
  const [aid, setAid] = useState('');
  const [tid, setTid] = useState('');
  const [pid, setPid] = useState(context.type === 'project' ? context.project_id : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (context.type === 'ticket') setTid(context.ticket_id); }, [context]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, saving]);
  useEffect(() => { setTid(''); }, [pid]);

  const ldProj = useCallback(async (q: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = q ? r.items.filter(x => x.name.toLowerCase().includes(q.toLowerCase()) || x.key.toLowerCase().includes(q.toLowerCase())) : r.items;
    return { items: f.map(x => ({ value: x.id, label: x.name, sublabel: x.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })), hasNext: r.items.length === 20 };
  }, []);
  const ldUsers = useCallback(async (q: string, p: number) => {
    let items: any[] = []; try { items = (await usersApi.getAllUsers(p, 20)).items; } catch { }
    const f = q ? items.filter(u => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) : items;
    return { items: f.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })), hasNext: items.length === 20 };
  }, []);
  const ldTickets = useCallback(async (q: string, p: number) => {
    const r = await ticketsApi.getAllWithFilters(p, 20, { project_id: pid || undefined });
    const f = q ? r.items.filter(t => t.title.toLowerCase().includes(q.toLowerCase()) || String(t.number).includes(q)) : r.items;
    return { items: f.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })), hasNext: r.items.length === 20 };
  }, [pid]);

  const submit = async () => {
    if (!title.trim()) return; setSaving(true);
    try {
      const t = await tasksApi.create({
        title: title.trim(), description: desc.trim() || null, priority: pri,
        project_id: pid || null, ticket_id: tid || null, story_points: sp,
        estimated_hours: eh ? parseFloat(eh) : null, due_date: dd || null,
        mark_as_todo: false, assignee_id: aid || null,
      } as TaskCreateInput);
      if (todo && aid) await tasksApi.changeStatus(t.id, 'todo');
      toast({ title: 'Задача создана', description: `${t.number} — ${t.title}` });
      onOk();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] shrink-0">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Новая задача</h2>
          <button onClick={() => !saving && onClose()} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Название *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно сделать?" autoFocus className={INP} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Описание</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Подробности…" rows={3} className={`${INP} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Проект</label>
              <AsyncDD value={pid} onChange={setPid} loadFn={ldProj} placeholder="Не выбран" icon={FolderOpen} />
            </div>
            {context.type !== 'ticket' && (
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Заявка</label>
                <AsyncDD value={tid} onChange={setTid} loadFn={ldTickets} placeholder="Без заявки" icon={Ticket} wide />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Приоритет</label>
            <div className="flex gap-2">
              {PRI_LIST.map(p => {
                const m = PM[p.value];
                return (
                  <button key={p.value} onClick={() => setPri(p.value)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all
                      ${pri === p.value ? `${m.bg} ${m.c} ${m.brd} scale-105` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}>
                    <span className={`w-2 h-2 rounded-full ${m.dot}`} />{p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Сложность (SP)</label>
              <div className="flex flex-wrap gap-2">
                {SP_SERIES.map(v => (
                  <button key={v} onClick={() => setSp(sp === v ? null : v)}
                    className={`w-10 h-10 rounded-xl text-sm font-bold border transition-all
                      ${sp === v ? 'bg-purple-500/20 text-purple-500 border-purple-500/40 scale-110' : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Оценка, ч.</label>
              <input type="number" min={0} step={0.5} value={eh} onChange={e => setEh(e.target.value)} placeholder="—" className={INP} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Срок</label>
              <input type="date" value={dd} onChange={e => setDd(e.target.value)} min={new Date().toISOString().split('T')[0]} className={INP} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">Исполнитель</label>
            <AsyncDD value={aid} onChange={setAid} loadFn={ldUsers} placeholder="Не назначен" icon={UserCheck} />
          </div>
          <button onClick={() => setTodo(v => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-sm font-semibold
              ${todo ? 'bg-blue-500/15 border-blue-500/40 text-blue-500' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 ${todo ? 'bg-blue-500 border-blue-600' : 'border-[var(--border-color)]'}`}>
              {todo && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            Сразу «{ST_LABEL.todo}»
          </button>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]/30 shrink-0">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Создать
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DETAIL MODAL — простое inline-редактирование
   ═══════════════════════════════════════════════════════════════ */
function DetailModal({ task: t, umap, onClose, onRefresh, onNeedAssign }: {
  task: TaskKanbanItem; umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void; onRefresh: () => Promise<void>;
  onNeedAssign: (t: TaskKanbanItem) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [showArchive, setShowArchive] = useState(false);
  const [showSt, setShowSt] = useState(false);
  const [busy, setBusy] = useState('');
  const canEdit = EDIT_OK.has(t.status);

  /* inline edit state — only one field at a time */
  const [ef, setEf] = useState<'title' | 'pri' | 'sp' | 'due' | null>(null);
  const [eTitle, setETitle] = useState(t.title);
  const [ePri, setEPri] = useState<TaskPriority>(t.priority);
  const [eSp, setESp] = useState(t.story_points?.toString() ?? '');
  const [eDd, setEDd] = useState(t.due_date ?? '');

  const [showAssign, setShowAssign] = useState(false);
  const [aId, setAId] = useState(t.assignee_id ?? '');
  const [showRR, setShowRR] = useState(false);
  const [rvId, setRvId] = useState('');

  const assignee = t.assignee_id ? umap.get(t.assignee_id) : null;
  const cm = CM[t.status]; const SI = cm.icon;
  const users = Array.from(umap.values());
  const isStaff = user?.roles?.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;
  const canReview = (t.status === 'to_review' || t.status === 'review') && isStaff;
  const canRR = t.status === 'in_progress';
  const canAssign = ASSIGN_OK.has(t.status) && users.length > 0;
  const allowed = TRANSITIONS[t.status];
  const uOpts: DDOpt[] = users.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (ef) setEf(null); else onClose(); } };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, ef]);

  const act = async (lbl: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(lbl);
    try { await fn(); if (msg) toast({ title: msg }); await onRefresh(); onClose(); }
    catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  /* save single field */
  const saveField = async (field: typeof ef) => {
    if (!field) return;
    setBusy(`e-${field}`);
    try {
      const p: TaskUpdateInput = {};
      if (field === 'title' && eTitle.trim() !== t.title) p.title = eTitle.trim();
      if (field === 'pri' && ePri !== t.priority) p.priority = ePri;
      if (field === 'sp' && eSp !== (t.story_points?.toString() ?? '')) p.story_points = eSp ? parseInt(eSp) : null;
      if (field === 'due' && eDd !== (t.due_date ?? '')) p.due_date = eDd || null;
      if (Object.keys(p).length) {
        await tasksApi.update(t.id, p);
        toast({ title: 'Сохранено' });
        await onRefresh();
      }
      setEf(null);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const cancelEdit = () => {
    setETitle(t.title); setEPri(t.priority);
    setESp(t.story_points?.toString() ?? ''); setEDd(t.due_date ?? '');
    setEf(null);
  };

  const chSt = async (s: TaskStatus) => {
    if (s === 'in_progress' && !t.assignee_id) { setShowSt(false); onNeedAssign(t); return; }
    setShowSt(false); setBusy('st');
    try { await tasksApi.changeStatus(t.id, s); toast({ title: `→ ${ST_LABEL[s]}` }); await onRefresh(); onClose(); }
    catch (e: any) { const m = statusErr(e, t, s); toast({ title: m.title, description: m.description, variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--border-color)] shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="font-mono text-sm text-[var(--text-primary)]/50">{t.number}</span>

              {/* Priority — click to edit */}
              {ef === 'pri' && canEdit ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TASK_PRIORITY_LIST.map(p => {
                    const m = PM[p];
                    return (
                      <button key={p} onClick={() => { setEPri(p); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all
                          ${ePri === p ? `${m.bg} ${m.c} ${m.brd} ring-2 ring-[var(--accent)]/20` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>
                        <span className={`w-2 h-2 rounded-full ${m.dot}`} />{PRI_LABEL[p]}
                      </button>
                    );
                  })}
                  <button onClick={() => saveField('pri')} disabled={busy.startsWith('e-')}
                    className="p-1 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="group/pri relative cursor-pointer" onClick={() => canEdit && setEf('pri')}>
                  <PriBadge p={t.priority} />
                  {canEdit && (
                    <Pencil className="absolute -right-1.5 -top-1.5 w-3.5 h-3.5 text-[var(--accent)] opacity-0 group-hover/pri:opacity-100 bg-[var(--bg-card)] rounded p-0.5" />
                  )}
                </div>
              )}

              {/* SP — click to edit */}
              {ef === 'sp' && canEdit ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={21} value={eSp} onChange={e => setESp(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveField('sp'); if (e.key === 'Escape') cancelEdit(); }}
                    className="w-16 px-2 py-1 rounded-lg text-sm font-medium bg-[var(--hover-2)] border border-purple-500/30 text-[var(--text-primary)] focus:outline-none"
                    placeholder="SP" autoFocus />
                  <button onClick={() => saveField('sp')} className="p-1 rounded-lg bg-emerald-500/15 text-emerald-500"><Check className="w-4 h-4" /></button>
                  <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40"><X className="w-4 h-4" /></button>
                </div>
              ) : t.story_points != null ? (
                <div className="group/sp relative cursor-pointer" onClick={() => canEdit && setEf('sp')}>
                  <SpBadge v={t.story_points} />
                  {canEdit && <Pencil className="absolute -right-1.5 -top-1.5 w-3.5 h-3.5 text-[var(--accent)] opacity-0 group-hover/sp:opacity-100 bg-[var(--bg-card)] rounded p-0.5" />}
                </div>
              ) : canEdit ? (
                <button onClick={() => setEf('sp')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)] hover:border-purple-500/30 hover:text-purple-500">
                  <Star className="w-3.5 h-3.5" /> SP
                </button>
              ) : null}
            </div>

            {/* Title — click to edit */}
            {ef === 'title' && canEdit ? (
              <div className="space-y-2">
                <input value={eTitle} onChange={e => setETitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && eTitle.trim()) saveField('title'); if (e.key === 'Escape') cancelEdit(); }}
                  className="w-full px-3 py-2 rounded-xl text-lg font-bold bg-[var(--hover-2)] border border-[var(--accent)]/30 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/10"
                  autoFocus />
                <div className="flex items-center gap-2">
                  <button onClick={() => saveField('title')} disabled={!eTitle.trim() || busy.startsWith('e-')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40">
                    {busy === 'e-title' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Сохранить
                  </button>
                  <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60">Отмена</button>
                </div>
              </div>
            ) : (
              <div className="group/title relative cursor-pointer" onClick={() => canEdit && setEf('title')}>
                <h2 className="text-lg font-bold text-[var(--text-primary)] leading-snug pr-8">{t.title}</h2>
                {canEdit && (
                  <Pencil className="absolute right-0 top-0 w-4 h-4 text-[var(--accent)] opacity-0 group-hover/title:opacity-100 transition-opacity" />
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {t.status === 'in_progress' && !t.assignee_id && (
            <div className="px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-sm text-amber-500 font-semibold">⚠ Нет исполнителя</div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--hover-1)] rounded-xl p-4 border border-[var(--border-color)]">
              <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-2 font-semibold">Статус</p>
              <div className="relative">
                <button onClick={() => allowed.length > 0 && setShowSt(v => !v)} disabled={busy !== '' || !allowed.length}
                  className={`flex items-center gap-2 text-sm font-semibold ${cm.tc} disabled:opacity-40`}>
                  {busy === 'st' ? <Loader2 className="w-4 h-4 animate-spin" /> : <SI className="w-4 h-4" />}
                  {ST_LABEL[t.status]}
                  {allowed.length > 0 && <ChevronDown className="w-4 h-4 opacity-50" />}
                </button>
                {showSt && <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSt(false)} />
                  <div className="absolute left-0 top-full mt-2 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-2">
                      {allowed.map(s => {
                        const sm = CM[s]; const SII = sm.icon;
                        return (
                          <button key={s} onClick={() => chSt(s)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] font-medium">
                            <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
                            <SII className={`w-4 h-4 ${sm.tc}`} />
                            <span className="flex-1 text-left">{ST_LABEL[s]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>}
              </div>
            </div>

            {/* Due — inline edit */}
            <div className="bg-[var(--hover-1)] rounded-xl p-4 border border-[var(--border-color)] group/due relative">
              <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-2 font-semibold">Срок</p>
              {ef === 'due' && canEdit ? (
                <div className="flex items-center gap-2">
                  <input type="date" value={eDd} onChange={e => setEDd(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-lg text-sm bg-[var(--hover-2)] border border-[var(--accent)]/30 text-[var(--text-primary)] focus:outline-none"
                    autoFocus />
                  <button onClick={() => saveField('due')} className="p-1 rounded-lg bg-emerald-500/15 text-emerald-500"><Check className="w-4 h-4" /></button>
                  <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40"><X className="w-4 h-4" /></button>
                </div>
              ) : t.due_date ? (
                <>
                  <span className={`flex items-center gap-2 text-sm font-semibold ${overdue(t) ? 'text-red-500' : 'text-[var(--text-primary)]/70'}`}>
                    <Calendar className="w-4 h-4" />{fmtDue(t.due_date)}
                  </span>
                  {canEdit && (
                    <button onClick={() => setEf('due')}
                      className="absolute right-3 top-3 p-1 rounded-lg opacity-0 group-hover/due:opacity-100 hover:bg-[var(--hover-3)] text-[var(--text-primary)]/40">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : canEdit ? (
                <button onClick={() => setEf('due')}
                  className="text-sm text-[var(--text-primary)]/30 hover:text-[var(--accent)] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> Указать срок
                </button>
              ) : <span className="text-sm text-[var(--text-primary)]/30">—</span>}
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-4 border border-[var(--border-color)]">
              <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-2 font-semibold">Исполнитель</p>
              {assignee ? (
                <div className="flex items-center gap-2">
                  <Ava name={assignee.full_name || assignee.username} url={assignee.avatar_url} />
                  <span className="text-sm text-[var(--text-primary)]/70 truncate font-medium">{assignee.full_name || assignee.username}</span>
                </div>
              ) : <span className="text-sm text-[var(--text-primary)]/30">—</span>}
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-4 border border-[var(--border-color)]">
              <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-2 font-semibold">Создана</p>
              <span className="text-sm text-[var(--text-primary)]/70 font-medium">
                {new Date(t.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Assign */}
          {canAssign && (
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
              <button onClick={() => setShowAssign(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] font-semibold">
                <span className="flex items-center gap-2"><UserCheck className="w-4 h-4" />{t.assignee_id ? 'Сменить исполнителя' : 'Назначить исполнителя'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAssign ? 'rotate-180' : ''}`} />
              </button>
              {showAssign && (
                <div className="px-4 py-4 border-t border-[var(--border-color)] space-y-3 bg-[var(--hover-1)]/50">
                  <SelectDD value={aId} onChange={setAId} options={uOpts} placeholder="Выберите" icon={UserCheck} searchable />
                  <button onClick={() => act('assign', () => tasksApi.assign(t.id, { assignee_id: aId }), 'Назначен')}
                    disabled={!aId || busy === 'assign'}
                    className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-40">
                    {busy === 'assign' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Назначить'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Review request */}
          {canRR && users.length > 0 && (
            <div className="rounded-xl border border-violet-500/30 overflow-hidden">
              <button onClick={() => setShowRR(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-violet-500/10 text-sm text-violet-500 font-bold hover:bg-violet-500/15">
                <span className="flex items-center gap-2"><GitPullRequest className="w-4 h-4" />Ревью</span>
                <ChevronDown className={`w-4 h-4 opacity-70 transition-transform ${showRR ? 'rotate-180' : ''}`} />
              </button>
              {showRR && (
                <div className="px-4 py-4 border-t border-violet-500/30 space-y-3 bg-violet-500/5">
                  <SelectDD value={rvId} onChange={setRvId} options={uOpts} placeholder="Ревьюер" searchable />
                  <button onClick={() => act('rr', () => tasksApi.requestReview(t.id, { reviewer_id: rvId }), 'Запрошено')}
                    disabled={!rvId || busy === 'rr'}
                    className="w-full py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-sm text-violet-500 font-bold disabled:opacity-40">
                    Отправить
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Review actions */}
          {canReview && (
            <div className="flex gap-3">
              <button onClick={() => act('rv', () => tasksApi.review(t.id, { decision: 'done' }), 'Принято')} disabled={busy === 'rv'}
                className="flex-1 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-sm text-emerald-500 font-bold disabled:opacity-50">
                <ThumbsUp className="w-4 h-4 inline mr-2" />Принять
              </button>
              <button onClick={() => act('rv', () => tasksApi.review(t.id, { decision: 'to_fix' }), 'Возвращено')} disabled={busy === 'rv'}
                className="flex-1 py-3 rounded-xl bg-red-500/15 border border-red-500/40 text-sm text-red-500 font-bold disabled:opacity-50">
                <ThumbsDown className="w-4 h-4 inline mr-2" />Вернуть
              </button>
            </div>
          )}

          {/* Links */}
          {t.ticket_id && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
              <Ticket className="w-4 h-4 text-[var(--text-primary)]/30" />
              <span className="flex-1 text-sm text-[var(--text-primary)]/50 font-medium">Заявка</span>
              <Link to={`/tickets/${t.ticket_id}`} onClick={onClose} className="text-sm text-[var(--accent)] flex items-center gap-1 font-semibold">Открыть<ArrowUpRight className="w-4 h-4" /></Link>
            </div>
          )}
          {t.project_id && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
              <FolderOpen className="w-4 h-4 text-[var(--text-primary)]/30" />
              <span className="flex-1 text-sm text-[var(--text-primary)]/50 font-medium">Проект</span>
              <Link to={`/projects/${t.project_id}`} onClick={onClose} className="text-sm text-[var(--accent)] flex items-center gap-1 font-semibold">Открыть<ArrowUpRight className="w-4 h-4" /></Link>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]/30 shrink-0">
          <button onClick={() => setShowArchive(true)} disabled={busy === 'arch'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] font-medium">
            <Archive className="w-4 h-4" />Архив
          </button>
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)]">
            Закрыть
          </button>
        </div>
      </div>

      {showArchive && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowArchive(false)} />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <Archive className="w-10 h-10 text-[var(--text-primary)]/30 mx-auto mb-3" />
              <p className="text-base font-bold text-[var(--text-primary)]">Архивировать?</p>
              <p className="text-sm text-[var(--text-primary)]/50 mt-2">«{t.title}»</p>
            </div>
            <div className="flex border-t border-[var(--border-color)]">
              <button onClick={() => setShowArchive(false)} className="flex-1 py-3 text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] font-medium">Отмена</button>
              <button onClick={() => { setShowArchive(false); act('arch', () => tasksApi.archive(t.id), 'Архивировано'); }}
                className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 border-l border-[var(--border-color)]">Да</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function TasksPage() {
  const [sp] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const up = sp.get('project_id'), ua = sp.get('assignee_id'), ut = sp.get('ticket_id');
  const staff = (user?.roles ?? []).some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r));

  const [mode, setMode] = useState<CtxMode>(() => {
    if (up) return 'project'; if (ua) return 'assignee'; if (ut) return 'ticket';
    return staff ? 'internal' : 'my';
  });
  const [selP, setSelP] = useState(up ?? '');
  const [selA, setSelA] = useState(ua ?? '');
  const [selT, setSelT] = useState(ut ?? '');
  const [umap, setUmap] = useState<Map<string, SimpleUser | CounterpartyCustomer>>(new Map());
  const [cols, setCols] = useState<TaskKanbanColumn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreCol, setMoreCol] = useState<TaskStatus | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: TaskStatus } | null>(null);
  const [dragO, setDragO] = useState<TaskStatus | null>(null);
  const [q, setQ] = useState('');
  const [fp, setFp] = useState<TaskPriority[]>([]);
  const [fo, setFo] = useState(false);
  const [sf, setSf] = useState(false);
  const [view, setView] = useState<TaskKanbanItem | null>(null);
  const [create, setCreate] = useState<TaskStatus | null>(null);
  const [assignTask, setAssignTask] = useState<TaskKanbanItem | null>(null);
  const [assignLd, setAssignLd] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  useEffect(() => { if (up) setMode('project'); else if (ua) setMode('assignee'); else if (ut) setMode('ticket'); }, [up, ua, ut]);

  const ctx = useCallback((): TaskKanbanContext => {
    if (mode === 'project' && selP) return { type: 'project', project_id: selP };
    if (mode === 'ticket' && selT) return { type: 'ticket', ticket_id: selT };
    if (mode === 'assignee' && selA) return { type: 'assignee', assignee_id: selA };
    if (mode === 'internal') return { type: 'internal' };
    return { type: 'my' };
  }, [mode, selP, selA, selT]);

  const loadU = useCallback(async () => {
    const m = new Map<string, SimpleUser | CounterpartyCustomer>();
    try { (await usersApi.getAllUsers(1, 100)).items.forEach(u => m.set(u.id, u)); } catch { }
    setUmap(m);
  }, []);

  /* ★ fetchBoard теперь зависит от fp и fo напрямую → фильтры работают */
  const fetchBoard = useCallback(async (silent = false) => {
    if ((mode === 'project' && !selP) || (mode === 'ticket' && !selT) || (mode === 'assignee' && !selA)) {
      setLoading(false); return;
    }
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const d = await tasksApi.getKanban(ctx(), {
        size: 20,
        priorities: fp.length ? fp : undefined,
        overdue_only: fo || undefined,
      });
      setCols(COL_ORDER.map(s => d.columns.find(c => c.status === s)).filter((c): c is TaskKanbanColumn => !!c));
      setTotal(d.total_tasks);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally { setLoading(false); setRefreshing(false); }
  }, [ctx, toast, mode, selP, selT, selA, fp, fo]);

  useEffect(() => { loadU(); }, [loadU]);
  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const more = useCallback(async (st: TaskStatus) => {
    const c = cols.find(x => x.status === st); if (!c?.tasks.has_next) return; setMoreCol(st);
    try {
      const d = await tasksApi.getKanban(ctx(), {
        page: c.tasks.page + 1, size: c.tasks.size,
        priorities: fp.length ? fp : undefined,
      });
      const nc = d.columns.find(x => x.status === st);
      if (nc) setCols(p => p.map(x => x.status === st ? { ...x, tasks: { ...nc.tasks, items: [...x.tasks.items, ...nc.tasks.items] } } : x));
    } catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setMoreCol(null); }
  }, [cols, ctx, toast, fp]);

  const moveTo = useCallback(async (id: string, from: TaskStatus, to: TaskStatus) => {
    const src = cols.find(c => c.status === from);
    const task = src?.tasks.items.find(x => x.id === id); if (!task) return;
    if (to === 'in_progress' && !task.assignee_id) { setAssignTask(task); return; }
    const snap = snapCols(cols); let moved: TaskKanbanItem | undefined;
    setCols(prev => {
      const n = prev.map(c => {
        if (c.status === from) {
          const items = c.tasks.items.filter(x => { if (x.id === id) { moved = x; return false; } return true; });
          return { ...c, tasks: { ...c.tasks, items, total_items: c.tasks.total_items - 1 } };
        }
        return c;
      });
      if (!moved) return prev;
      const u = { ...moved, status: to };
      return n.map(c => c.status === to ? { ...c, tasks: { ...c.tasks, items: [u, ...c.tasks.items], total_items: c.tasks.total_items + 1 } } : c);
    });
    try { await tasksApi.changeStatus(id, to); toast({ title: `→ ${ST_LABEL[to]}` }); }
    catch (e: any) { setCols(snap); const m = statusErr(e, task, to); toast({ title: m.title, description: m.description, variant: 'destructive' }); }
  }, [cols, toast]);

  const handleAssignProgress = useCallback(async (aid: string) => {
    if (!assignTask) return; setAssignLd(true);
    try {
      await tasksApi.assign(assignTask.id, { assignee_id: aid });
      await tasksApi.changeStatus(assignTask.id, 'in_progress');
      toast({ title: 'В работе' }); setAssignTask(null); await fetchBoard(true);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); await fetchBoard(true);
    } finally { setAssignLd(false); }
  }, [assignTask, fetchBoard, toast]);

  const onDS = useCallback((id: string, from: TaskStatus) => setDrag({ id, from }), []);
  const onDE = useCallback(() => { setDrag(null); setDragO(null); }, []);
  const onDO = useCallback((e: React.DragEvent, st: TaskStatus) => {
    e.preventDefault(); if (drag && !TRANSITIONS[drag.from].includes(st)) return;
    e.dataTransfer.dropEffect = 'move'; setDragO(st);
  }, [drag]);
  const onDL = useCallback(() => setDragO(null), []);
  const onDrop = useCallback(async (e: React.DragEvent, to: TaskStatus) => {
    e.preventDefault(); setDragO(null);
    if (!drag || drag.from === to) { setDrag(null); return; }
    if (!TRANSITIONS[drag.from].includes(to)) { toast({ title: 'Переход недоступен', variant: 'destructive' }); setDrag(null); return; }
    const { id, from } = drag; setDrag(null); await moveTo(id, from, to);
  }, [drag, moveTo, toast]);

  const disp = cols.map(c => !q ? c : {
    ...c, tasks: { ...c.tasks, items: c.tasks.items.filter(t => t.title.toLowerCase().includes(q.toLowerCase()) || t.number.toLowerCase().includes(q.toLowerCase())) },
  });
  const hf = fp.length > 0 || fo;
  const done = cols.find(c => c.status === 'done')?.tasks.total_items ?? 0;
  const ctxTabs = [
    { id: 'my' as CtxMode, label: 'Мои', icon: User },
    ...(staff ? [{ id: 'internal' as CtxMode, label: 'Все', icon: Layers }] : []),
    { id: 'project' as CtxMode, label: 'Проект', icon: FolderOpen },
    ...(staff ? [{ id: 'assignee' as CtxMode, label: 'Исполнитель', icon: UserCheck }] : []),
    ...(staff ? [{ id: 'ticket' as CtxMode, label: 'Заявка', icon: Ticket }] : []),
  ];

  /* ★ Заявки фильтруются по выбранному проекту */
  const ldTicketsAsync = useCallback(async (q: string, p: number) => {
    const r = await ticketsApi.getAllWithFilters(p, 20, { project_id: selP || undefined });
    const f = q ? r.items.filter(t => t.title.toLowerCase().includes(q.toLowerCase()) || String(t.number).includes(q)) : r.items;
    return { items: f.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })), hasNext: r.items.length === 20 };
  }, [selP]);
  const ldProjAsync = useCallback(async (q: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = q ? r.items.filter(x => x.name.toLowerCase().includes(q.toLowerCase()) || x.key.toLowerCase().includes(q.toLowerCase())) : r.items;
    return { items: f.map(x => ({ value: x.id, label: x.name, sublabel: x.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })), hasNext: r.items.length === 20 };
  }, []);
  const ldAssAsync = useCallback(async (q: string, p: number) => {
    let items: any[] = []; try { items = (await usersApi.getAllUsers(p, 20)).items; } catch { }
    const f = q ? items.filter(u => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) : items;
    return { items: f.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })), hasNext: items.length === 20 };
  }, []);

  const dragInfo = drag ? (() => {
    const t = cols.flatMap(c => c.tasks.items).find(x => x.id === drag.id);
    return t ? { id: drag.id, from: drag.from, title: t.title, number: t.number } : null;
  })() : null;

  return (
    <div className="flex flex-col animate-in fade-in duration-500" style={{ height: 'calc(100vh - 5rem)' }} onDragEnd={onDE}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Задачи</h1>
          {!loading && <span className="text-sm text-[var(--text-primary)]/40">{total - done} активных · {done} завершено</span>}
          {refreshing && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск…"
              className="w-52 pl-10 pr-9 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/30 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 transition-all" />
            {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>}
          </div>
          <div className="relative">
            <button onClick={() => setSf(v => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all
                ${hf ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]' : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-3)]'}`}>
              <Filter className="w-4 h-4" />Фильтры{hf && <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />}
            </button>
            {sf && <>
              <div className="fixed inset-0 z-10" onClick={() => setSf(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-64 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-2 font-semibold">Приоритет</p>
                  <div className="flex flex-wrap gap-2">
                    {PRI_LIST.map(p => {
                      const m = PM[p.value];
                      return (
                        <button key={p.value}
                          onClick={() => setFp(v => v.includes(p.value) ? v.filter(x => x !== p.value) : [...v, p.value])}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold border
                            ${fp.includes(p.value) ? `${m.bg} ${m.c} ${m.brd}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>
                          <span className={`w-2 h-2 rounded-full ${m.dot}`} />{p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button onClick={() => setFo(v => !v)}
                  className={`w-full flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-semibold ${fo ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/50'}`}>
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center ${fo ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'}`}>
                    {fo && <Check className="w-3 h-3 text-white" />}
                  </div>
                  Просроченные
                </button>
                {hf && (
                  <button onClick={() => { setFp([]); setFo(false); }}
                    className="w-full text-center text-sm text-[var(--accent)] pt-2 font-semibold">
                    Сбросить
                  </button>
                )}
              </div>
            </>}
          </div>
          <button onClick={() => fetchBoard(true)} disabled={refreshing || loading}
            className="p-2.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setCreate('backlog')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent)]/90 transition-all">
            <Plus className="w-4 h-4" />Задача
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)]">
            {ctxTabs.map(t => {
              const I = t.icon;
              return (
                <button key={t.id} onClick={() => setMode(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                    ${mode === t.id ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'}`}>
                  <I className="w-4 h-4" />{t.label}
                </button>
              );
            })}
          </div>
          {mode === 'project' && <div className="w-64"><AsyncDD value={selP} onChange={setSelP} loadFn={ldProjAsync} placeholder="Проект" icon={FolderOpen} /></div>}
          {mode === 'ticket' && <div className="w-80"><AsyncDD value={selT} onChange={setSelT} loadFn={ldTicketsAsync} placeholder="Заявка" icon={Ticket} wide /></div>}
          {mode === 'assignee' && <div className="w-64"><AsyncDD value={selA} onChange={setSelA} loadFn={ldAssAsync} placeholder="Исполнитель" icon={UserCheck} /></div>}
        </div>
        <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)]">
          <button onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${viewMode === 'kanban' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-primary)]/50'}`}>
            <LayoutGrid className="w-4 h-4" />Доска
          </button>
          <button onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-primary)]/50'}`}>
            <List className="w-4 h-4" />Список
          </button>
        </div>
      </div>

      {/* ── Content (no page scroll!) ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
        ) : viewMode === 'list' ? (
          <div className="h-full overflow-y-auto">
            <ListView tasks={disp.flatMap(c => c.tasks.items)} umap={umap} onView={setView} />
          </div>
        ) : !cols.length ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-primary)]/30">
            <FolderOpen className="w-12 h-12 mb-3" />
            <p className="text-base">
              {mode === 'project' && !selP ? 'Выберите проект'
                : mode === 'assignee' && !selA ? 'Выберите исполнителя'
                : mode === 'ticket' && !selT ? 'Выберите заявку'
                : 'Нет задач'}
            </p>
          </div>
        ) : (
          <div className="h-full overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
            <div className="flex gap-2 h-full">
              {disp.map(c => (
                <KCol key={c.status} col={c} umap={umap} isDO={dragO === c.status}
                  dragId={drag?.id ?? null} ldMore={moreCol === c.status}
                  onDS={onDS} onDE={onDE} onDO={onDO} onDL={onDL} onDrop={onDrop}
                  onAdd={setCreate} onView={setView} onMore={more} />
              ))}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>{dragInfo && <DragPanel task={dragInfo} onDrop={onDrop} />}</AnimatePresence>

      {view && <DetailModal task={view} umap={umap} onClose={() => setView(null)} onRefresh={() => fetchBoard(true)} onNeedAssign={t => { setView(null); setAssignTask(t); }} />}
      {create != null && <CreateModal initSt={create} context={ctx()} umap={umap} onClose={() => setCreate(null)} onOk={() => { setCreate(null); fetchBoard(true); }} />}
      {assignTask && <AssignModal task={assignTask} umap={umap} loading={assignLd} onClose={() => { if (!assignLd) setAssignTask(null); }} onOk={handleAssignProgress} />}
    </div>
  );
}