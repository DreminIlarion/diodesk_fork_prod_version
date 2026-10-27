// pages/ProjectStagesPage.tsx

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
  ArrowLeft, ArrowRight, ChevronRight, ChevronDown, MoreHorizontal,
  Plus, Search, Filter, X, Check, Save, Trash2, Pencil,
  Calendar, Clock, Timer, AlertTriangle, CheckCircle2,
  PlayCircle, PauseCircle, SkipForward, RotateCcw,
  Milestone, Flag, Target, ListChecks, FileText, Settings2,
  User, Users, UserPlus, UserCheck, FolderOpen, Hash,
  LayoutGrid, GanttChart, Map as MapIcon, BarChart3,
  Table as TableIcon, TrendingUp, Info, Layers,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Eye,
  Download, CalendarDays, CircleDot, Activity,
} from 'lucide-react';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { ActionButton } from '../components/ui/ActionButton';
import exportTimelineToExcel from '../components/utils/exportTimelineToExcel';
import { projectsApi, usersApi, tasksApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';

import type { Project, ProjectStageResponse, StageResponsible } from '../types';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

type StageStatus = 'planned' | 'active' | 'completed' | 'on_hold' | 'skipped';
type EffectiveStatus = StageStatus | 'overdue';
type ViewType = 'table' | 'overview' | 'roadmap' | 'timeline' | 'board' | 'analytics';
type TimelineScale = 'days' | 'weeks' | 'months';
type SortKey = 'order' | 'name' | 'status' | 'responsible' | 'dates' | 'duration';
type SortDir = 'asc' | 'desc';
type Screen = { type: 'list' } | { type: 'detail'; stageId: string } | { type: 'create' };

interface StagePayload {
  name: string;
  order: number;
  status: StageStatus;
  planned_start: string | null;
  planned_end: string | null;
  responsible_id: string | null;
  description: string | null;
  completion_criteria: string[];
  planned_duration_days: number | null;
}

interface StageForm {
  name: string;
  order: string;
  status: StageStatus;
  responsible_id: string;
  planned_start: string;
  planned_end: string;
  planned_duration_days: string;
  description: string;
  completion_criteria: string[];
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

type UsersMap = Record<string, StageResponsible>;

/* ═══════════════════════════════════════════════════════════════
   STATUS CONFIG
   ═══════════════════════════════════════════════════════════════ */

const STATUS: Record<EffectiveStatus, {
  label: string;
  icon: React.ElementType;
  dot: string;
  bg: string;
  text: string;
  border: string;
  bar: string;
}> = {
  planned: {
    label: 'Запланирован', icon: Clock, dot: 'bg-slate-400',
    bg: 'bg-slate-500/10', text: 'text-slate-400',
    border: 'border-slate-400/20', bar: 'bg-slate-500',
  },
  active: {
    label: 'В работе', icon: PlayCircle, dot: 'bg-blue-500',
    bg: 'bg-blue-500/10', text: 'text-blue-400',
    border: 'border-blue-400/20', bar: 'bg-blue-500',
  },
  completed: {
    label: 'Завершён', icon: CheckCircle2, dot: 'bg-emerald-500',
    bg: 'bg-emerald-500/10', text: 'text-emerald-500',
    border: 'border-emerald-500/20', bar: 'bg-emerald-500',
  },
  on_hold: {
    label: 'На паузе', icon: PauseCircle, dot: 'bg-amber-500',
    bg: 'bg-amber-500/10', text: 'text-amber-500',
    border: 'border-amber-500/20', bar: 'bg-amber-500',
  },
  skipped: {
    label: 'Пропущен', icon: SkipForward, dot: 'bg-neutral-500',
    bg: 'bg-neutral-500/10', text: 'text-neutral-400',
    border: 'border-neutral-400/20', bar: 'bg-neutral-500',
  },
  overdue: {
    label: 'Просрочен', icon: AlertTriangle, dot: 'bg-[var(--accent)]',
    bg: 'bg-[var(--accent-soft)]', text: 'text-[var(--accent)]',
    border: 'border-[var(--accent)]/25', bar: 'bg-[var(--accent)]',
  },
};

const VIEWS: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'table', label: 'Таблица', icon: TableIcon },
  { id: 'overview', label: 'Сводка', icon: Activity },
  { id: 'roadmap', label: 'Карта', icon: MapIcon },
  { id: 'timeline', label: 'Хронология', icon: GanttChart },
  { id: 'board', label: 'Доска', icon: LayoutGrid },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
];

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string | null) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};

const formatShort = (value?: string | null) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';
};

const formatDateTime = (value?: string | null) => {
  const date = parseDate(value);
  return date ? date.toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';
};

const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86400000);

const sortStages = (stages: ProjectStageResponse[]) =>
  [...stages].sort((a, b) =>
    a.execution_order - b.execution_order || a.name.localeCompare(b.name, 'ru'),
  );

const effectiveStatus = (stage: ProjectStageResponse): EffectiveStatus =>
  stage.is_overdue && stage.status !== 'completed' && stage.status !== 'skipped'
    ? 'overdue' : stage.status;

const actualEnd = (stage: ProjectStageResponse): Date | null => {
  if (stage.completed_at) return parseDate(stage.completed_at);
  if (stage.status === 'active' || stage.status === 'on_hold') return new Date();
  return null;
};

const isOverPlan = (stage: ProjectStageResponse) => {
  const planned = parseDate(stage.planned_end);
  const actual = actualEnd(stage);
  if (!planned || !actual) return false;
  return actual > planned;
};

const overrunDays = (stage: ProjectStageResponse) => {
  const planned = parseDate(stage.planned_end);
  const actual = actualEnd(stage);
  return planned && actual && actual > planned ? daysBetween(planned, actual) : 0;
};

const getInitials = (name?: string | null) => {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

const shortName = (name?: string | null) => {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts.slice(1).map(p => `${p[0]}.`).join('')}`;
};

const stagesOverlap = (a: ProjectStageResponse, b: ProjectStageResponse) => {
  const as = parseDate(a.planned_start), ae = parseDate(a.planned_end);
  const bs = parseDate(b.planned_start), be = parseDate(b.planned_end);
  return !!(as && ae && bs && be && as <= be && bs <= ae);
};

const emptyForm = (order: number): StageForm => ({
  name: '', order: String(order), status: 'planned', responsible_id: '',
  planned_start: '', planned_end: '', planned_duration_days: '',
  description: '', completion_criteria: [],
});

const stageToForm = (stage: ProjectStageResponse): StageForm => ({
  name: stage.name,
  order: String(stage.execution_order),
  status: stage.status,
  responsible_id: stage.responsible_id ?? '',
  planned_start: stage.planned_start ?? '',
  planned_end: stage.planned_end ?? '',
  planned_duration_days: stage.planned_duration_days != null ? String(stage.planned_duration_days) : '',
  description: stage.description ?? '',
  completion_criteria: [...stage.completion_criteria],
});

const formToPayload = (form: StageForm): StagePayload => ({
  name: form.name.trim(),
  order: Math.max(1, Number(form.order) || 1),
  status: form.status,
  responsible_id: form.responsible_id || null,
  planned_start: form.planned_start || null,
  planned_end: form.planned_end || null,
  planned_duration_days: form.planned_duration_days ? Math.max(1, Number(form.planned_duration_days)) : null,
  description: form.description.trim() || null,
  completion_criteria: form.completion_criteria.map(c => c.trim()).filter(Boolean),
});

/* ═══════════════════════════════════════════════════════════════
   SHARED UI
   ═══════════════════════════════════════════════════════════════ */

const inputCls = 'w-full px-4 py-3 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent-soft)] transition-all';
const labelCls = 'block mb-2 text-sm font-medium text-[var(--text-secondary)]';

function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };
  return (
    <div className={`${sizes[size]} rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-semibold shrink-0 select-none`}>
      {getInitials(name)}
    </div>
  );
}

function StatusBadge({ status, small = false }: { status: EffectiveStatus; small?: boolean }) {
  const cfg = STATUS[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border} ${small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
      <Icon className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {cfg.label}
    </span>
  );
}

function StageNumber({ order }: { order: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] font-mono text-xs font-semibold text-[var(--text-secondary)]">
      <Milestone className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      {String(order).padStart(2, '0')}
    </span>
  );
}

function AssigneeAvatars({ ids = [], users, max = 3 }: {
  ids?: string[]; users: UsersMap; max?: number;
}) {
  if (!ids.length) return <span className="text-xs text-[var(--text-muted)]">Не назначены</span>;
  return (
    <div className="flex items-center gap-2" title={ids.map(id => users[id]?.full_name ?? id).join(', ')}>
      <div className="flex -space-x-2">
        {ids.slice(0, max).map(id => (
          <div key={id} className="relative w-8 h-8 rounded-full border-2 border-[var(--bg-card)] bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white">
            {getInitials(users[id]?.full_name)}
          </div>
        ))}
        {ids.length > max && (
          <div className="relative w-8 h-8 rounded-full border-2 border-[var(--bg-card)] bg-[var(--hover-3)] flex items-center justify-center text-[10px] font-bold text-[var(--text-primary)]">
            +{ids.length - max}
          </div>
        )}
      </div>
      <span className="text-xs text-[var(--text-muted)]">{ids.length}</span>
    </div>
  );
}

function SectionCard({ title, description, icon: Icon, action, children, className = '' }: {
  title: string; description?: string; icon?: React.ElementType;
  action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-[var(--hover-2)] flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
            {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ElementType; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--hover-2)] flex items-center justify-center">
        <Icon className="w-7 h-7 text-[var(--text-disabled)]" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Loader2 className="w-9 h-9 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-[var(--text-muted)]">Загрузка этапов...</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOASTS
   ═══════════════════════════════════════════════════════════════ */

function Toasts({ items, onClose }: { items: Toast[]; onClose: (id: number) => void }) {
  return createPortal(
    <div className="fixed top-5 right-5 z-[500] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-40px)]">
      <AnimatePresence>
        {items.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
            className="pointer-events-auto flex items-center gap-3 min-w-[280px] max-w-[380px] px-4 py-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {item.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> :
              item.type === 'error' ? <AlertTriangle className="w-5 h-5 text-[var(--accent)] shrink-0" /> :
                <Info className="w-5 h-5 text-blue-400 shrink-0" />}
            <span className="flex-1 text-sm text-[var(--text-primary)]">{item.message}</span>
            <button onClick={() => onClose(item.id)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW NAVIGATION
   ═══════════════════════════════════════════════════════════════ */

function ViewNavigation({ view, onChange }: {
  view: ViewType; onChange: (view: ViewType) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-x-auto">
      {VIEWS.map(item => {
        const active = view === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id} onClick={() => onChange(item.id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${active ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)]'
              }`}
          >
            {active && <motion.div layoutId="stages-active-tab" className="absolute inset-0 rounded-lg bg-[var(--accent)]" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
            <Icon className="relative w-4 h-4" />
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ASSIGNEES MODAL
   ═══════════════════════════════════════════════════════════════ */

function AssigneesModal({ open, users, selectedIds, currentUserId, saving, onSave, onClose }: {
  open: boolean; users: UsersMap; selectedIds: string[]; currentUserId?: string;
  saving: boolean; onSave: (ids: string[]) => Promise<void>; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (open) { setSelected(selectedIds); setSearch(''); }
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, saving, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.values(users)
      .filter(u => !q || u.full_name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return a.full_name.localeCompare(b.full_name, 'ru');
      });
  }, [users, search, currentUserId]);

  const toggle = (id: string) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
  );

  const changed = selected.length !== selectedIds.length ||
    selected.some(id => !selectedIds.includes(id));

  const submit = async () => {
    if (saving || !changed) return;
    try { await onSave(selected); onClose(); } catch { /* Ошибка в родителе */ }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog" aria-modal="true" aria-label="Назначение исполнителей"
        className="relative w-full max-w-[560px] max-h-[85vh] flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Исполнители этапа</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Выберите сотрудников для выполнения</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени или email..." className={`${inputCls} pl-11`} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[var(--text-muted)]">Найдено: {filtered.length}</span>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
              Выбрано: {selected.length}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {!filtered.length ? (
            <EmptyState icon={Search} title="Сотрудники не найдены" description="Попробуйте изменить поисковый запрос" />
          ) : (
            <div className="space-y-1">
              {filtered.map(u => {
                const checked = selected.includes(u.id);
                return (
                  <button
                    key={u.id} onClick={() => toggle(u.id)} disabled={saving}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-colors disabled:opacity-50 ${checked ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)]' : 'border-transparent hover:bg-[var(--hover-2)]'
                      }`}
                  >
                    <Avatar name={u.full_name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{u.full_name}</p>
                        {u.id === currentUserId && <span className="px-2 py-0.5 rounded-md bg-[var(--hover-3)] text-xs text-[var(--text-secondary)]">Вы</span>}
                      </div>
                      {u.email && <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{u.email}</p>}
                    </div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${checked ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'
                      }`}>
                      {checked && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <span className="text-sm text-[var(--text-muted)]">{selected.length} выбрано</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-3)]">
              Отмена
            </button>
            <ActionButton onClick={submit} disabled={saving || !changed} className="px-5 py-2.5 text-sm font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Сохранение...' : 'Сохранить'}
            </ActionButton>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════
   DELETE CONFIRMATION
   ═══════════════════════════════════════════════════════════════ */

function DeleteStageModal({ stage, loading, onConfirm, onClose }: {
  stage: ProjectStageResponse; loading: boolean;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loading, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-[440px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="px-7 pt-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
            <Trash2 className="w-7 h-7 text-[var(--accent)]" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-[var(--text-primary)]">Удалить этап?</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Этап «<span className="font-semibold text-[var(--text-primary)]">{stage.name}</span>» будет удалён без возможности восстановления.
          </p>
        </div>
        <div className="flex gap-3 p-6 mt-3">
          <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm font-medium text-[var(--text-primary)] disabled:opacity-50">
            Отмена
          </button>
          <button onClick={() => void onConfirm()} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {loading ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABLE VIEW
   ═══════════════════════════════════════════════════════════════ */

function TableView({ stages, users, onOpen, onCreate }: {
  stages: ProjectStageResponse[]; users: UsersMap;
  onOpen: (stage: ProjectStageResponse) => void; onCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EffectiveStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = stages.filter(s => {
      if (statusFilter !== 'all' && effectiveStatus(s) !== statusFilter) return false;
      if (!q) return true;
      const responsible = s.responsible_id ? users[s.responsible_id]?.full_name ?? '' : '';
      const assignees = (s.assignee_ids ?? []).map(id => users[id]?.full_name ?? '').join(' ');
      return [s.name, s.description ?? '', responsible, assignees, String(s.execution_order)]
        .some(v => v.toLowerCase().includes(q));
    });

    result = [...result].sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      switch (sortKey) {
        case 'order': av = a.execution_order; bv = b.execution_order; break;
        case 'name': av = a.name; bv = b.name; break;
        case 'status': av = effectiveStatus(a); bv = effectiveStatus(b); break;
        case 'responsible':
          av = a.responsible_id ? users[a.responsible_id]?.full_name ?? '' : '';
          bv = b.responsible_id ? users[b.responsible_id]?.full_name ?? '' : '';
          break;
        case 'dates': av = a.planned_start ?? ''; bv = b.planned_start ?? ''; break;
        case 'duration': av = a.planned_duration_days ?? 0; bv = b.planned_duration_days ?? 0; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [stages, users, search, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey !== column ? <ArrowUpDown className="w-3.5 h-3.5 opacity-30" /> :
      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[var(--accent)]" /> :
        <ArrowDown className="w-3.5 h-3.5 text-[var(--accent)]" />;

  if (!stages.length) {
    return (
      <SectionCard title="Этапы проекта" description="Планирование и контроль выполнения" icon={Milestone}>
        <EmptyState
          icon={Milestone} title="Этапов пока нет"
          description="Создайте первый этап, чтобы начать планирование проекта."
          action={<ActionButton onClick={onCreate} className="px-5 py-3 text-sm"><Plus className="w-4 h-4" /> Создать этап</ActionButton>}
        />
      </SectionCard>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-[var(--border-color)]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, сотрудник, номер..." className={`${inputCls} pl-11`} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as EffectiveStatus | 'all')}>
          <SelectTrigger className="w-[190px] h-12 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 text-sm text-[var(--text-primary)]">
            <Filter className="w-4 h-4 mr-2 text-[var(--text-muted)]" />
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(Object.keys(STATUS) as EffectiveStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ActionButton onClick={onCreate} className="px-4 py-3 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Создать этап
        </ActionButton>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px]">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">
              {([
                ['order', '№'], ['name', 'Этап'], ['status', 'Статус'],
                ['dates', 'Плановые сроки'], ['responsible', 'Ответственный'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} className="px-5 py-4 text-left">
                  <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {label} <SortIcon column={key} />
                  </button>
                </th>
              ))}
              <th className="px-5 py-4 text-left text-xs font-semibold text-[var(--text-muted)]">Исполнители</th>
              <th className="px-5 py-4 text-left">
                <button onClick={() => toggleSort('duration')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                  Дни <SortIcon column="duration" />
                </button>
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={8}><EmptyState icon={Search} title="Ничего не найдено" description="Измените поисковый запрос или фильтр" /></td></tr>
            ) : filtered.map(stage => {
              const responsible = stage.responsible_id ? users[stage.responsible_id] : null;
              const eff = effectiveStatus(stage);
              return (
                <tr key={stage.id} onClick={() => onOpen(stage)}
                  className="group cursor-pointer border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--hover-2)] transition-colors">
                  <td className="px-5 py-4"><StageNumber order={stage.execution_order} /></td>
                  <td className="px-5 py-4 min-w-[220px]">
                    <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{stage.name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-1">{stage.description || 'Без описания'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={stage.status} small />
                      {eff === 'overdue' && <StatusBadge status="overdue" small />}
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                    {formatShort(stage.planned_start)} — {formatShort(stage.planned_end)}
                  </td>
                  <td className="px-5 py-4">
                    {responsible ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={responsible.full_name} size="sm" />
                        <span className="max-w-[150px] truncate text-sm text-[var(--text-secondary)]">{shortName(responsible.full_name)}</span>
                      </div>
                    ) : <span className="text-sm text-[var(--text-muted)]">Не назначен</span>}
                  </td>
                  <td className="px-5 py-4"><AssigneeAvatars ids={stage.assignee_ids} users={users} /></td>
                  <td className="px-5 py-4 text-sm text-[var(--text-secondary)] whitespace-nowrap">
                    {stage.planned_duration_days != null ? `${stage.planned_duration_days} дн.` : '—'}
                  </td>
                  <td className="px-4 py-4">
                    <ChevronRight className="w-4 h-4 text-[var(--text-disabled)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">
        <span>Показано {filtered.length} из {stages.length}</span>
        <span>Нажмите на этап для просмотра</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROADMAP — PARALLEL GROUPING
   ═══════════════════════════════════════════════════════════════ */

/**
 * Группировка по пересечению плановых сроков.
 *
 * Этапы с пересекающимися датами располагаются в одной колонке.
 * Статус не влияет на группировку.
 *
 * Этапы без дат располагаются последовательно.
 *
 * ВАЖНО: используем пересечение с ОБЩИМ интервалом группы,
 * а не только с первым этапом. Это предотвращает ложное
 * объединение цепочек пересечений.
 */

type RoadmapGroup = ProjectStageResponse[];

function buildRoadmapGroups(stages: ProjectStageResponse[]): RoadmapGroup[] {
  const ordered = sortStages(stages);
  const groups: RoadmapGroup[] = [];

  for (const stage of ordered) {
    const start = parseDate(stage.planned_start);
    const end = parseDate(stage.planned_end);

    if (!start || !end) {
      groups.push([stage]);
      continue;
    }

    let added = false;

    for (const group of groups) {
      if (group.some(s => !s.planned_start || !s.planned_end)) continue;

      const starts = group.map(s => parseDate(s.planned_start)!.getTime());
      const ends = group.map(s => parseDate(s.planned_end)!.getTime());

      const commonStart = Math.max(...starts);
      const commonEnd = Math.min(...ends);

      if (start.getTime() <= commonEnd && end.getTime() >= commonStart) {
        group.push(stage);
        added = true;
        break;
      }
    }

    if (!added) groups.push([stage]);
  }

  return groups;
}
/* ═══════════════════════════════════════════════════════════════
   ROADMAP VIEW (старая — колонки по порядку)
   ═══════════════════════════════════════════════════════════════ */

type GraphCol = ProjectStageResponse[];

function buildGraphColumns(stages: ProjectStageResponse[]): GraphCol[] {
  const ordered = sortStages(stages);
  const columns: GraphCol[] = [];
  const placed = new Set<string>();

  for (const stage of ordered) {
    if (placed.has(stage.id)) continue;

    if (stage.status === 'active' || stage.status === 'on_hold') {
      const siblings = ordered.filter(other =>
        !placed.has(other.id) &&
        other.id !== stage.id &&
        (other.status === 'active' || other.status === 'on_hold') &&
        stagesOverlap(stage, other),
      );

      if (siblings.length > 0) {
        const group = [stage, ...siblings];
        group.forEach(item => placed.add(item.id));
        columns.push(group);
        continue;
      }
    }

    placed.add(stage.id);
    columns.push([stage]);
  }

  return columns;
}

const NODE_R = 30;
const NODE_D = NODE_R * 2;
const CARD_W = 210;
const COL_W = CARD_W + 65;
const ROW_GAP = 285;
const TOP_PAD = 50;
const BOTTOM_PAD = 190;

interface NodePos {
  id: string;
  cx: number;
  cy: number;
  col: number;
  row: number;
  stage: ProjectStageResponse;
}

function RoadmapView({
  stages,
  users,
  onOpen,
}: {
  stages: ProjectStageResponse[];
  users: UsersMap;
  onOpen: (stage: ProjectStageResponse) => void;
}) {
  const columns = useMemo(() => buildGraphColumns(stages), [stages]);

  const { nodes, edges, svgW, svgH } = useMemo(() => {
    const columnCount = columns.length;
    const maxRows = Math.max(...columns.map(c => c.length), 1);
    const graphWidth = columnCount * COL_W;
    const leftPadding = COL_W / 2;

    const nodePositions: NodePos[] = [];

    columns.forEach((column, columnIndex) => {
      const centerX = leftPadding + columnIndex * COL_W;
      const columnHeight = (column.length - 1) * ROW_GAP;
      const totalHeight = (maxRows - 1) * ROW_GAP;
      const startY = TOP_PAD + NODE_R + (totalHeight - columnHeight) / 2;

      column.forEach((stage, rowIndex) => {
        nodePositions.push({
          id: stage.id,
          cx: centerX,
          cy: startY + rowIndex * ROW_GAP,
          col: columnIndex,
          row: rowIndex,
          stage,
        });
      });
    });

    const graphEdges: { from: NodePos; to: NodePos; done: boolean }[] = [];

    for (let ci = 0; ci < columnCount - 1; ci++) {
      const fromNodes = nodePositions.filter(n => n.col === ci);
      const toNodes = nodePositions.filter(n => n.col === ci + 1);

      for (const from of fromNodes) {
        for (const to of toNodes) {
          graphEdges.push({
            from,
            to,
            done: from.stage.status === 'completed',
          });
        }
      }
    }

    const width = graphWidth + 20;
    const height =
      TOP_PAD + (maxRows - 1) * ROW_GAP + NODE_D + BOTTOM_PAD;

    return {
      nodes: nodePositions,
      edges: graphEdges,
      svgW: Math.max(width, 600),
      svgH: Math.max(height, 400),
    };
  }, [columns]);

  if (!stages.length) {
    return (
      <SectionCard
        title="Карта проекта"
        description="Визуальная последовательность этапов"
        icon={MapIcon}
      >
        <EmptyState
          icon={MapIcon}
          title="Карта пока пустая"
          description="Создайте этапы проекта, чтобы увидеть их последовательность."
        />
      </SectionCard>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hover-2)]">
          <MapIcon className="h-5 w-5 text-[var(--text-secondary)]" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Карта проекта
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Последовательность выполнения этапов
          </p>
        </div>

        {columns.some(c => c.length > 1) && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400">
            <Layers className="h-4 w-4" />
            Параллельные этапы
          </span>
        )}
      </div>

      <div className="overflow-auto p-6" style={{ maxHeight: 780 }}>
        <div
          className="relative mx-auto"
          style={{ width: svgW, height: svgH, minWidth: svgW }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={svgW}
            height={svgH}
          >
            <defs>
              <marker
                id="stage-arrow-completed"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6" fill="#10b981" />
              </marker>
              <marker
                id="stage-arrow-pending"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L8,3 L0,6" fill="#64748b" />
              </marker>
            </defs>

            {edges.map((edge, index) => {
              const x1 = edge.from.cx + NODE_R + 4;
              const y1 = edge.from.cy;
              const x2 = edge.to.cx - NODE_R - 12;
              const y2 = edge.to.cy;

              const straight = Math.abs(y1 - y2) < 5;
              const middleX = (x1 + x2) / 2;

              const d = straight
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} C${middleX},${y1} ${middleX},${y2} ${x2},${y2}`;

              return (
                <motion.path
                  key={index}
                  d={d}
                  fill="none"
                  stroke={edge.done ? '#10b981' : '#64748b'}
                  strokeWidth={edge.done ? 2.5 : 1.5}
                  strokeDasharray={edge.done ? undefined : '6 4'}
                  markerEnd={
                    edge.done
                      ? 'url(#stage-arrow-completed)'
                      : 'url(#stage-arrow-pending)'
                  }
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: edge.done ? 0.7 : 0.35,
                  }}
                  transition={{ delay: 0.15 + index * 0.03, duration: 0.45 }}
                />
              );
            })}
          </svg>

          {nodes.map((node, nodeIndex) => {
            const stage = node.stage;
            const effective = effectiveStatus(stage);
            const config = STATUS[effective];
            const Icon = config.icon;

            const active = stage.status === 'active';
            const responsible = stage.responsible_id
              ? users[stage.responsible_id]
              : null;
            const overdue = isOverPlan(stage);
            const overdueDays = overrunDays(stage);
            const assigneeIds = stage.assignee_ids ?? [];

            return (
              <motion.div
                key={stage.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.08 + nodeIndex * 0.05,
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                className="absolute"
                style={{
                  left: node.cx - NODE_R,
                  top: node.cy - NODE_R,
                  zIndex: 10,
                }}
              >
                {active && (
                  <span
                    className="absolute animate-ping rounded-full bg-blue-500/15"
                    style={{ width: NODE_D, height: NODE_D }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onOpen(stage)}
                  className={`relative z-10 flex items-center justify-center rounded-full text-sm font-bold text-white transition-transform hover:scale-110 ${config.bar} ${active ? `ring-4 ${config.ring}` : ''
                    }`}
                  style={{
                    width: NODE_D,
                    height: NODE_D,
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  {String(stage.execution_order).padStart(2, '0')}

                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)]">
                    <Icon className={`h-3.5 w-3.5 ${config.text}`} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpen(stage)}
                  className={`absolute rounded-xl border bg-[var(--bg-card)] p-3.5 text-left transition-colors hover:bg-[var(--hover-2)] ${overdue
                    ? 'border-[var(--accent)]/30'
                    : 'border-[var(--border-color)]'
                    }`}
                  style={{
                    top: NODE_D + 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: CARD_W,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <h4 className="mb-2 line-clamp-2 text-sm font-bold leading-5 text-[var(--text-primary)]">
                    {stage.name}
                  </h4>

                  <p className={`text-xs font-semibold ${config.text}`}>
                    {config.label}
                  </p>

                  <div className="mt-3 flex items-start gap-2 text-xs text-[var(--text-muted)]">
                    <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p>
                        {formatShort(stage.planned_start)}
                        {' — '}
                        {formatShort(stage.planned_end)}
                      </p>
                      {overdue && (
                        <p className="mt-1 font-semibold text-[var(--accent)]">
                          Отклонение +{overdueDays} дн.
                        </p>
                      )}
                    </div>
                  </div>

                  {responsible && (
                    <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[9px] font-bold text-white">
                        {getInitials(responsible.full_name)}
                      </div>
                      <span className="truncate text-xs text-[var(--text-secondary)]">
                        {responsible.full_name}
                      </span>
                    </div>
                  )}


                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW — PROJECT SUMMARY
   ═══════════════════════════════════════════════════════════════ */

function OverviewView({ stages, users, onOpen, onCreate }: {
  stages: ProjectStageResponse[];
  users: UsersMap;
  onOpen: (stage: ProjectStageResponse) => void;
  onCreate: () => void;
}) {
  const total = stages.length;
  const completed = stages.filter(s => s.status === 'completed');
  const active = sortStages(stages.filter(s => s.status === 'active'));
  const paused = stages.filter(s => s.status === 'on_hold');
  const overdue = stages.filter(s => effectiveStatus(s) === 'overdue');
  const planned = sortStages(stages.filter(s => s.status === 'planned'));
  const progress = total ? Math.round(completed.length / total * 100) : 0;

  const nextStage = planned[0];

  const stats = [
    { label: 'Всего этапов', value: total, icon: Milestone, color: 'text-[var(--text-primary)]', bg: 'bg-[var(--hover-2)]' },
    { label: 'Завершено', value: completed.length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'В работе', value: active.length, icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Просрочено', value: overdue.length, icon: AlertTriangle, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-soft)]' },
  ];

  if (!total) {
    return (
      <SectionCard title="Сводка проекта" description="Текущее состояние выполнения этапов" icon={Activity}>
        <EmptyState icon={Milestone} title="Пока нечего показывать"
          description="Создайте первый этап, чтобы начать отслеживать ход проекта."
          action={<ActionButton onClick={onCreate} className="px-5 py-3 text-sm"><Plus className="w-4 h-4" /> Создать этап</ActionButton>}
        />
      </SectionCard>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">{item.label}</p>
                  <p className="mt-3 text-3xl font-bold text-[var(--text-primary)] tabular-nums">{item.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.bg}`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-6 items-start">

        {/* MAIN */}
        <div className="space-y-6">

          <SectionCard
            title="Сейчас в работе"
            description={active.length ? `${active.length} активных этапов` : 'Активных этапов нет'}
            icon={PlayCircle}
          >
            {!active.length ? (
              <EmptyState icon={Clock} title="Нет активных этапов" description="Запущенные этапы будут отображаться здесь." />
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {active.map(stage => {
                  const responsible = stage.responsible_id ? users[stage.responsible_id] : null;
                  const late = isOverPlan(stage);

                  return (
                    <button key={stage.id} onClick={() => onOpen(stage)}
                      className="group w-full text-left px-6 py-5 hover:bg-[var(--hover-2)] transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <StageNumber order={stage.execution_order} />
                            <StatusBadge status="active" small />
                            {late && <StatusBadge status="overdue" small />}
                          </div>
                          <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                            {stage.name}
                          </h3>
                          <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-2">
                            {stage.description || 'Описание не заполнено'}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--accent)]" />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 pt-4 border-t border-[var(--border-color)]">
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                          {formatShort(stage.planned_start)} — {formatShort(stage.planned_end)}
                        </div>

                        {responsible && (
                          <div className="flex items-center gap-2">
                            <Avatar name={responsible.full_name} size="xs" />
                            <span className="text-xs text-[var(--text-secondary)]">{shortName(responsible.full_name)}</span>
                          </div>
                        )}

                        <AssigneeAvatars ids={stage.assignee_ids} users={users} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ATTENTION */}
          {(overdue.length > 0 || paused.length > 0) && (
            <SectionCard title="Требуют внимания" description="Просроченные и приостановленные этапы" icon={AlertTriangle}>
              <div className="divide-y divide-[var(--border-color)]">
                {[...new Map([...overdue, ...paused].map(s => [s.id, s])).values()].map(stage => (
                  <button key={stage.id} onClick={() => onOpen(stage)}
                    className="group flex items-center gap-4 w-full px-6 py-4 text-left hover:bg-[var(--hover-2)] transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS[effectiveStatus(stage)].dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{stage.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {stage.status === 'on_hold' ? 'Выполнение приостановлено' :
                          `Плановое окончание: ${formatDate(stage.planned_end)}`}
                      </p>
                    </div>
                    <StatusBadge status={effectiveStatus(stage)} small />
                    <ChevronRight className="w-4 h-4 text-[var(--text-disabled)] group-hover:text-[var(--accent)] shrink-0" />
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ALL STAGES */}
          <SectionCard title="План выполнения" description="Последовательность этапов проекта" icon={ListChecks}>
            <div className="divide-y divide-[var(--border-color)]">
              {sortStages(stages).map(stage => {
                const cfg = STATUS[stage.status];
                const Icon = cfg.icon;

                return (
                  <button key={stage.id} onClick={() => onOpen(stage)}
                    className="group w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-[var(--hover-2)] transition-colors">
                    <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        <span className="text-[var(--text-muted)] mr-2">#{stage.execution_order}</span>
                        {stage.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {formatShort(stage.planned_start)} — {formatShort(stage.planned_end)}
                      </p>
                    </div>
                    <span className={`hidden sm:block text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-disabled)] group-hover:text-[var(--accent)] shrink-0" />
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-5 xl:sticky xl:top-5">

          <SectionCard title="Общий прогресс" icon={Target}>
            <div className="p-6">
              <div className="relative w-36 h-36 mx-auto">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--hover-3)" strokeWidth="9" />
                  <motion.circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - progress / 100) }}
                    transition={{ duration: 0.8 }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-[var(--text-primary)]">{progress}%</span>
                  <span className="text-xs text-[var(--text-muted)]">{completed.length} из {total}</span>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[var(--border-color)] space-y-3">
                {([
                  ['completed', completed.length],
                  ['active', active.length],
                  ['on_hold', paused.length],
                  ['planned', planned.length],
                ] as [StageStatus, number][]).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS[status].dot}`} />
                      {STATUS[status].label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {nextStage && (
            <SectionCard title="Следующий этап" icon={Flag}>
              <button onClick={() => onOpen(nextStage)}
                className="group w-full text-left p-5 hover:bg-[var(--hover-2)] transition-colors">
                <div className="flex items-center gap-2">
                  <StageNumber order={nextStage.execution_order} />
                  <StatusBadge status="planned" small />
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  {nextStage.name}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatShort(nextStage.planned_start)} — {formatShort(nextStage.planned_end)}
                </p>
                <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Исполнители</span>
                  <AssigneeAvatars ids={nextStage.assignee_ids} users={users} />
                </div>
              </button>
            </SectionCard>
          )}
        </aside>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TIMELINE / GANTT
   ═══════════════════════════════════════════════════════════════ */

function TimelineView({ stages, users, projectId, onOpen }: {
  stages: ProjectStageResponse[];
  users: UsersMap;
  projectId: string;
  onOpen: (stage: ProjectStageResponse) => void;
}) {
  const [scale, setScale] = useState<TimelineScale>('weeks');

  const ordered = useMemo(
    () => sortStages(stages.filter(s => s.planned_start && s.planned_end)),
    [stages],
  );

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (!ordered.length) {
      const today = new Date();
      return { minDate: today, maxDate: today, totalDays: 30 };
    }

    const dates: Date[] = [];

    ordered.forEach(s => {
      const start = parseDate(s.planned_start);
      const end = parseDate(s.planned_end);
      const actual = actualEnd(s);

      if (start) dates.push(start);
      if (end) dates.push(end);
      if (actual) dates.push(actual);
    });

    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));

    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 3);

    return {
      minDate: min,
      maxDate: max,
      totalDays: Math.max(1, daysBetween(min, max) + 1),
    };
  }, [ordered]);

  const dayWidth = scale === 'days' ? 42 : scale === 'weeks' ? 18 : 8;
  const width = totalDays * dayWidth;

  const ticks = useMemo(() => {
    const result: { date: Date; label: string; major: boolean }[] = [];
    const current = new Date(minDate);

    while (current <= maxDate) {
      if (scale === 'days') {
        result.push({
          date: new Date(current),
          label: String(current.getDate()).padStart(2, '0'),
          major: current.getDate() === 1,
        });
      } else if (scale === 'weeks') {
        if (current.getDay() === 1 || !result.length) {
          result.push({
            date: new Date(current),
            label: current.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
            major: current.getDate() <= 7,
          });
        }
      } else {
        if (current.getDate() === 1 || !result.length) {
          result.push({
            date: new Date(current),
            label: current.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
            major: true,
          });
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [minDate, maxDate, scale]);

  const today = new Date();
  const todayOffset = daysBetween(minDate, today) * dayWidth;
  const showToday = today >= minDate && today <= maxDate;

  if (!ordered.length) {
    return (
      <SectionCard title="Хронология" icon={GanttChart}>
        <EmptyState icon={CalendarDays} title="Нет этапов с датами" description="Укажите плановые сроки этапов, чтобы построить хронологию." />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Хронология"
      description="Плановые и фактические сроки выполнения"
      icon={GanttChart}
      action={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportTimelineToExcel(ordered, users, projectId)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Download className="w-4 h-4" /> Excel
          </button>

          <div className="flex p-1 rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)]">
            {(['days', 'weeks', 'months'] as TimelineScale[]).map(s => (
              <button key={s} onClick={() => setScale(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scale === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}>
                {{ days: 'Дни', weeks: 'Недели', months: 'Месяцы' }[s]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex overflow-hidden">

        {/* LEFT COLUMN */}
        <div className="w-[280px] shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="h-12 flex items-center px-4 border-b border-[var(--border-color)]">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Этап проекта</span>
          </div>

          {ordered.map(s => (
            <button key={s.id} onClick={() => onOpen(s)}
              className="group w-full h-[76px] flex items-center gap-3 px-4 text-left border-b border-[var(--border-color)] hover:bg-[var(--hover-2)] transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS[effectiveStatus(s)].dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">
                  {s.execution_order}. {s.name}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {formatShort(s.planned_start)} — {formatShort(s.planned_end)}
                </p>
                {isOverPlan(s) && (
                  <p className="text-xs text-[var(--accent)] mt-0.5">+{overrunDays(s)} дн.</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* TIMELINE */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="relative" style={{ width, minWidth: '100%' }}>

            {/* HEADER */}
            <div className="relative h-12 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
              {ticks.map((tick, index) => (
                <span key={index}
                  className={`absolute top-4 px-1 text-xs whitespace-nowrap ${tick.major ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                    }`}
                  style={{ left: daysBetween(minDate, tick.date) * dayWidth }}>
                  {tick.label}
                </span>
              ))}
            </div>

            <div className="relative">
              {/* GRID */}
              <div className="absolute inset-0 pointer-events-none">
                {ticks.map((tick, index) => (
                  <div key={index}
                    className={`absolute top-0 bottom-0 w-px ${tick.major ? 'bg-[var(--border-color)]' : 'bg-[var(--border-color)]/40'
                      }`}
                    style={{ left: daysBetween(minDate, tick.date) * dayWidth }}
                  />
                ))}
              </div>

              {/* TODAY */}
              {showToday && (
                <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: todayOffset }}>
                  <div className="w-0.5 h-full bg-[var(--accent)]" />
                  <span className="absolute top-0 left-1 px-2 py-1 rounded-md bg-[var(--accent)] text-[10px] font-semibold text-white">
                    Сегодня
                  </span>
                </div>
              )}

              {/* STAGE BARS */}
              {ordered.map((stage, index) => {
                const start = parseDate(stage.planned_start)!;
                const end = parseDate(stage.planned_end)!;
                const config = STATUS[effectiveStatus(stage)];

                const left = daysBetween(minDate, start) * dayWidth;
                const plannedWidth = Math.max(dayWidth, (daysBetween(start, end) + 1) * dayWidth);

                const actual = actualEnd(stage);
                const late = isOverPlan(stage);
                const extraWidth = late && actual ? Math.max(0, daysBetween(end, actual) * dayWidth) : 0;

                return (
                  <div key={stage.id} className="relative h-[76px] border-b border-[var(--border-color)]">

                    <motion.button
                      onClick={() => onOpen(stage)}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: plannedWidth, opacity: 1 }}
                      transition={{ delay: index * 0.04, duration: 0.35 }}
                      className={`absolute top-1/2 -translate-y-1/2 h-9 flex items-center px-3 text-xs font-semibold text-white overflow-hidden ${late ? 'rounded-l-lg' : 'rounded-lg'
                        } ${config.bar}`}
                      style={{ left, boxShadow: 'var(--shadow-sm)' }}
                      title={stage.name}
                    >
                      <span className="truncate">{stage.name}</span>
                    </motion.button>

                    {late && extraWidth > 0 && (
                      <motion.button
                        onClick={() => onOpen(stage)}
                        initial={{ width: 0 }}
                        animate={{ width: extraWidth }}
                        transition={{ delay: index * 0.04 + 0.15, duration: 0.3 }}
                        className="absolute top-1/2 -translate-y-1/2 h-9 rounded-r-lg bg-[var(--accent)] flex items-center px-2 text-xs font-semibold text-white overflow-hidden"
                        style={{ left: left + plannedWidth }}
                      >
                        {extraWidth > 45 && <span className="truncate">+{overrunDays(stage)} дн.</span>}
                      </motion.button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 px-5 py-3 border-t border-[var(--border-color)]">
        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-3 h-3 rounded bg-blue-500" /> Выполнение
        </span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-3 h-3 rounded bg-[var(--accent)]" /> Превышение срока
        </span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-0.5 h-3 bg-[var(--accent)]" /> Сегодня
        </span>
      </div>
    </SectionCard>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KANBAN BOARD
   ═══════════════════════════════════════════════════════════════ */

function BoardView({ stages, users, onOpen, onMove }: {
  stages: ProjectStageResponse[];
  users: UsersMap;
  onOpen: (stage: ProjectStageResponse) => void;
  onMove: (id: string, status: StageStatus) => Promise<void>;
}) {
  const columns: StageStatus[] = ['planned', 'active', 'on_hold', 'completed', 'skipped'];

  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<StageStatus | null>(null);
  const [moving, setMoving] = useState(false);

  const grouped = useMemo(() => {
    const result: Record<StageStatus, ProjectStageResponse[]> = {
      planned: [], active: [], on_hold: [], completed: [], skipped: [],
    };

    sortStages(stages).forEach(s => result[s.status].push(s));
    return result;
  }, [stages]);

  // Переходы, для которых есть соответствующие операции API.
  const allowedTransition = (from: StageStatus, to: StageStatus) => {
    if (from === 'planned') return to === 'active' || to === 'skipped';
    if (from === 'active') return to === 'on_hold' || to === 'completed';
    if (from === 'on_hold') return to === 'active' || to === 'skipped';
    return false;
  };

  const handleDrop = async (status: StageStatus) => {
    const id = dragId;
    setDragId(null);
    setOverColumn(null);

    if (!id || moving) return;

    const stage = stages.find(s => s.id === id);
    if (!stage || !allowedTransition(stage.status, status)) return;

    setMoving(true);
    try { await onMove(id, status); }
    catch { /* Ошибка отображается родителем */ }
    finally { setMoving(false); }
  };

  if (!stages.length) {
    return (
      <SectionCard title="Доска этапов" icon={LayoutGrid}>
        <EmptyState icon={LayoutGrid} title="Нет этапов" />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Info className="w-4 h-4 text-[var(--text-muted)]" />
        <p className="text-xs text-[var(--text-muted)]">
          Перетаскивайте карточки между доступными статусами.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {columns.map(column => {
          const cfg = STATUS[column];
          const Icon = cfg.icon;
          const items = grouped[column];
          const isOver = overColumn === column;

          const dragged = stages.find(s => s.id === dragId);
          const canDrop = dragged ? allowedTransition(dragged.status, column) : false;

          return (
            <div key={column}
              onDragOver={e => {
                if (!dragged || !canDrop || moving) return;
                e.preventDefault();
                setOverColumn(column);
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
              }}
              onDrop={e => { e.preventDefault(); void handleDrop(column); }}
              className={`min-h-[380px] rounded-2xl border flex flex-col overflow-hidden transition-colors ${isOver && canDrop ? 'border-[var(--accent)] bg-[var(--accent-soft)]' :
                'border-[var(--border-color)] bg-[var(--hover-1)]'
                }`}
            >
              {/* COLUMN HEADER */}
              <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${cfg.text}`} />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{cfg.label}</h3>
                </div>
                <span className="min-w-7 h-7 px-2 rounded-lg bg-[var(--hover-2)] flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)]">
                  {items.length}
                </span>
              </div>

              {/* CARDS */}
              <div className="p-3 space-y-3 flex-1">
                {!items.length && (
                  <div className={`h-28 rounded-xl border border-dashed flex flex-col items-center justify-center ${isOver && canDrop ? 'border-[var(--accent)]/40' : 'border-[var(--border-color)]'
                    }`}>
                    <Milestone className="w-6 h-6 text-[var(--text-disabled)]" />
                    <span className="mt-2 text-xs text-[var(--text-muted)]">
                      {isOver && canDrop ? 'Отпустите этап' : 'Пусто'}
                    </span>
                  </div>
                )}

                {items.map(stage => {
                  const responsible = stage.responsible_id ? users[stage.responsible_id] : null;
                  const late = effectiveStatus(stage) === 'overdue';

                  return (
                    <motion.div
                      key={stage.id}
                      layout
                      draggable={!moving && stage.status !== 'completed' && stage.status !== 'skipped'}
                      onDragStart={e => {
                        setDragId(stage.id);
                        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                      className={`rounded-xl border bg-[var(--bg-card)] p-4 transition-all ${late ? 'border-[var(--accent)]/30' : 'border-[var(--border-color)]'
                        } ${dragId === stage.id ? 'opacity-40' : ''} ${stage.status === 'completed' || stage.status === 'skipped'
                          ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <StageNumber order={stage.execution_order} />
                        {late && <AlertTriangle className="w-4 h-4 text-[var(--accent)]" />}
                      </div>

                      <button onClick={() => onOpen(stage)} className="w-full text-left group">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] leading-5">
                          {stage.name}
                        </h4>
                        <p className="mt-2 text-xs text-[var(--text-muted)] line-clamp-2 leading-5">
                          {stage.description || 'Без описания'}
                        </p>
                      </button>

                      <div className="mt-4 pt-3 border-t border-[var(--border-color)] space-y-3">
                        {responsible && (
                          <div className="flex items-center gap-2">
                            <Avatar name={responsible.full_name} size="xs" />
                            <span className="text-xs text-[var(--text-secondary)] truncate">
                              {shortName(responsible.full_name)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--text-muted)]">Исполнители</span>
                          <AssigneeAvatars ids={stage.assignee_ids} users={users} max={2} />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatShort(stage.planned_end)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════════════════════ */

function AnalyticsView({ stages, users, onOpen }: {
  stages: ProjectStageResponse[];
  users: UsersMap;
  onOpen: (stage: ProjectStageResponse) => void;
}) {
  const total = stages.length;
  const completed = stages.filter(s => s.status === 'completed').length;
  const active = stages.filter(s => s.status === 'active').length;
  const overdue = stages.filter(s => effectiveStatus(s) === 'overdue');
  const late = stages.filter(s => isOverPlan(s));

  const progress = total ? Math.round(completed / total * 100) : 0;

  const durations = stages
    .map(s => s.planned_duration_days)
    .filter((n): n is number => n != null && n > 0);

  const averageDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const totalOverrun = stages.reduce((sum, s) => sum + overrunDays(s), 0);

  const employeeStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; active: number; completed: number }>();

    stages.forEach(stage => {
      (stage.assignee_ids ?? []).forEach(id => {
        if (!map.has(id)) {
          map.set(id, {
            id,
            name: users[id]?.full_name ?? 'Неизвестный сотрудник',
            total: 0,
            active: 0,
            completed: 0,
          });
        }

        const entry = map.get(id)!;
        entry.total++;

        if (stage.status === 'active') entry.active++;
        if (stage.status === 'completed') entry.completed++;
      });
    });

    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [stages, users]);

  const statusDistribution = (['completed', 'active', 'on_hold', 'planned', 'skipped'] as StageStatus[])
    .map(status => ({
      status,
      count: stages.filter(s => s.status === status).length,
    }))
    .filter(item => item.count > 0);

  if (!total) {
    return (
      <SectionCard title="Аналитика" icon={BarChart3}>
        <EmptyState icon={BarChart3} title="Недостаточно данных" description="Аналитика появится после создания этапов." />
      </SectionCard>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* MAIN STATS */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Выполнено', value: `${progress}%`, desc: `${completed} из ${total} этапов`, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'В работе', value: active, desc: 'Активных этапов', icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Просрочено', value: overdue.length, desc: 'Требуют внимания', icon: AlertTriangle, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-soft)]' },
          { label: 'Средняя длительность', value: `${averageDuration} дн.`, desc: 'Плановая', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map(item => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">{item.label}</p>
                  <p className="mt-3 text-3xl font-bold text-[var(--text-primary)]">{item.value}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{item.desc}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* STATUS DISTRIBUTION */}
        <SectionCard title="Состояние этапов" description="Распределение по статусам" icon={Activity}>
          <div className="p-6 space-y-5">
            {statusDistribution.map(({ status, count }) => {
              const cfg = STATUS[status];
              const percent = Math.round(count / total * 100);

              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {count} <span className="text-[var(--text-muted)] font-normal">({percent}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[var(--hover-2)] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6 }}
                      className={`h-full rounded-full ${cfg.bar}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* TIMING */}
        <SectionCard title="Соблюдение сроков" description="Плановые показатели и отклонения" icon={Timer}>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <p className="text-xs text-[var(--text-muted)]">С превышением</p>
                <p className="mt-2 text-3xl font-bold text-[var(--accent)]">{late.length}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">этапов</p>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <p className="text-xs text-[var(--text-muted)]">Всего превышено</p>
                <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{totalOverrun}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">дней</p>
              </div>
            </div>

            <div className="mt-5 p-4 rounded-xl bg-[var(--hover-2)]">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                <p className="text-xs leading-6 text-[var(--text-muted)]">
                  Превышение рассчитывается по фактической дате завершения или текущей дате для выполняемых этапов относительно планового окончания.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* EMPLOYEE LOAD */}
      <SectionCard title="Загрузка исполнителей" description="Распределение этапов между сотрудниками" icon={Users}>
        {!employeeStats.length ? (
          <EmptyState icon={Users} title="Исполнители не назначены" description="Назначьте сотрудников на этапы, чтобы увидеть распределение нагрузки." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                  {['Сотрудник', 'Всего этапов', 'В работе', 'Завершено', 'Нагрузка'].map(label => (
                    <th key={label} className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-muted)]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeStats.map(employee => {
                  const maxLoad = Math.max(...employeeStats.map(e => e.total), 1);

                  return (
                    <tr key={employee.id} className="border-b last:border-0 border-[var(--border-color)] hover:bg-[var(--hover-2)]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={employee.name} size="sm" />
                          <span className="text-sm font-medium text-[var(--text-primary)]">{employee.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-[var(--text-primary)]">{employee.total}</td>
                      <td className="px-6 py-4 text-sm text-blue-400">{employee.active}</td>
                      <td className="px-6 py-4 text-sm text-emerald-500">{employee.completed}</td>
                      <td className="px-6 py-4 w-[200px]">
                        <div className="h-2 rounded-full bg-[var(--hover-3)] overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${employee.total / maxLoad * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* PROBLEM STAGES */}
      {late.length > 0 && (
        <SectionCard title="Этапы с отклонениями" description="Превышение плановых сроков" icon={AlertTriangle}>
          <div className="divide-y divide-[var(--border-color)]">
            {sortStages(late).map(stage => (
              <button key={stage.id} onClick={() => onOpen(stage)}
                className="group w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-[var(--hover-2)] transition-colors">
                <StageNumber order={stage.execution_order} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">
                    {stage.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Плановое окончание: {formatDate(stage.planned_end)}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                  +{overrunDays(stage)} дн.
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--text-disabled)] group-hover:text-[var(--accent)]" />
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STAGE FORM — CREATE / EDIT
   ═══════════════════════════════════════════════════════════════ */

function StageFormView({
  stage,
  nextOrder,
  users,
  saving,
  onSave,
  onCancel,
}: {
  stage?: ProjectStageResponse;
  nextOrder: number;
  users: UsersMap;
  saving: boolean;
  onSave: (payload: StagePayload) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = !!stage;
  const [form, setForm] = useState<StageForm>(() =>
    stage ? stageToForm(stage) : emptyForm(nextOrder),
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof StageForm>(key: K, value: StageForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const updateCriterion = (index: number, value: string) => {
    setForm(prev => ({
      ...prev,
      completion_criteria: prev.completion_criteria.map((item, i) => i === index ? value : item),
    }));
  };

  const addCriterion = () => {
    setForm(prev => ({
      ...prev,
      completion_criteria: [...prev.completion_criteria, ''],
    }));
  };

  const removeCriterion = (index: number) => {
    setForm(prev => ({
      ...prev,
      completion_criteria: prev.completion_criteria.filter((_, i) => i !== index),
    }));
  };

  const validate = () => {
    const next: Record<string, string> = {};

    if (!form.name.trim()) next.name = 'Укажите название этапа';

    if (!Number.isInteger(Number(form.order)) || Number(form.order) < 1) {
      next.order = 'Номер должен быть положительным целым числом';
    }

    if (form.planned_start && form.planned_end && form.planned_end < form.planned_start) {
      next.planned_end = 'Дата окончания не может быть раньше начала';
    }

    if (
      form.planned_duration_days &&
      (!Number.isInteger(Number(form.planned_duration_days)) || Number(form.planned_duration_days) < 1)
    ) {
      next.planned_duration_days = 'Введите положительное целое число';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (saving || !validate()) return;
    await onSave(formToPayload(form));
  };

  const userOptions = useMemo(
    () => Object.values(users).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    [users],
  );

  const completedFields = [
    !!form.name.trim(),
    !!form.planned_start && !!form.planned_end,
    !!form.description.trim(),
    form.completion_criteria.some(c => c.trim()),
  ];

  const completedCount = completedFields.filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onCancel}
            className="w-11 h-11 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover-2)] transition-colors"
            title="Назад">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {editing ? 'Редактирование этапа' : 'Новый этап'}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {editing ? stage.name : 'Планирование нового этапа проекта'}
            </p>
          </div>
        </div>

        <ActionButton onClick={submit} disabled={saving} className="px-5 py-3 text-sm font-semibold">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Сохранение...' : editing ? 'Сохранить изменения' : 'Создать этап'}
        </ActionButton>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">

        {/* MAIN */}
        <div className="space-y-6">

          {/* GENERAL */}
          <SectionCard title="Основная информация" description="Название, порядок и ответственный" icon={Milestone}>
            <div className="p-6 space-y-5">

              <div>
                <label className={labelCls}>Название этапа <span className="text-[var(--accent)]">*</span></label>
                <input
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="Например, разработка и тестирование"
                  className={`${inputCls} ${errors.name ? 'border-red-500' : ''}`}
                />
                {errors.name && <p className="mt-2 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Порядковый номер</label>
                  <input
                    type="number" min={1}
                    value={form.order}
                    onChange={e => update('order', e.target.value)}
                    className={inputCls}
                  />
                  {errors.order && <p className="mt-2 text-xs text-red-500">{errors.order}</p>}
                </div>

                <div>
                  <label className={labelCls}>Ответственный</label>
                  <Select
                    value={form.responsible_id || '__none__'}
                    onValueChange={value => update('responsible_id', value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger className={`${inputCls} h-[46px]`}>
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не назначен</SelectItem>
                      {userOptions.map(user => (
                        <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editing && (
                <div className="flex items-start gap-3 rounded-xl bg-[var(--hover-2)] p-4">
                  <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  <p className="text-xs leading-6 text-[var(--text-muted)]">
                    Статус этапа изменяется на странице просмотра. Это позволяет корректно фиксировать даты начала, приостановки и завершения.
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* PLANNING */}
          <SectionCard title="Планирование сроков" description="Плановые даты выполнения этапа" icon={CalendarDays}>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Плановое начало</label>
                  <input type="date" value={form.planned_start}
                    onChange={e => update('planned_start', e.target.value)} className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>Плановое окончание</label>
                  <input type="date" min={form.planned_start || undefined}
                    value={form.planned_end}
                    onChange={e => update('planned_end', e.target.value)} className={inputCls} />
                  {errors.planned_end && <p className="mt-2 text-xs text-red-500">{errors.planned_end}</p>}
                </div>
              </div>

              <div>
                <label className={labelCls}>Плановая длительность, дней</label>
                <input type="number" min={1} value={form.planned_duration_days}
                  onChange={e => update('planned_duration_days', e.target.value)}
                  placeholder="Не указана" className={inputCls} />
                {errors.planned_duration_days && (
                  <p className="mt-2 text-xs text-red-500">{errors.planned_duration_days}</p>
                )}
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Укажите длительность, если она отличается от календарного периода.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* DESCRIPTION */}
          <SectionCard title="Описание этапа" description="Цели, задачи и ожидаемые результаты" icon={FileText}>
            <div className="p-6">
              <textarea
                value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Опишите, что необходимо выполнить в рамках этого этапа..."
                rows={7}
                className={`${inputCls} resize-y min-h-[180px] leading-7`}
              />
            </div>
          </SectionCard>

          {/* CRITERIA */}
          <SectionCard
            title="Критерии приёмки"
            description="Условия, необходимые для завершения этапа"
            icon={ListChecks}
            action={
              <button onClick={addCriterion}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--hover-2)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Plus className="w-4 h-4" /> Добавить
              </button>
            }
          >
            <div className="p-6 space-y-3">
              {!form.completion_criteria.length ? (
                <div className="py-8 text-center rounded-xl border border-dashed border-[var(--border-color)]">
                  <Target className="w-7 h-7 mx-auto text-[var(--text-disabled)]" />
                  <p className="mt-3 text-sm text-[var(--text-muted)]">Критерии пока не добавлены</p>
                  <button onClick={addCriterion} className="mt-3 text-sm font-medium text-[var(--accent)]">
                    Добавить первый критерий
                  </button>
                </div>
              ) : (
                form.completion_criteria.map((criterion, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-[var(--hover-2)] flex items-center justify-center text-xs font-semibold text-[var(--text-muted)] shrink-0">
                      {index + 1}
                    </span>
                    <input
                      value={criterion}
                      onChange={e => updateCriterion(index, e.target.value)}
                      placeholder="Условие завершения этапа"
                      className={`${inputCls} flex-1`}
                    />
                    <button onClick={() => removeCriterion(index)}
                      className="p-2.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      title="Удалить критерий">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-5 xl:sticky xl:top-5">

          <SectionCard title={editing ? 'Редактирование' : 'Создание этапа'} icon={Settings2}>
            <div className="p-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[var(--text-secondary)]">Заполнение</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{completedCount}/4</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--hover-3)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${completedCount / 4 * 100}%` }} />
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Название', ready: completedFields[0] },
                  { label: 'Плановые сроки', ready: completedFields[1] },
                  { label: 'Описание', ready: completedFields[2] },
                  { label: 'Критерии приёмки', ready: completedFields[3] },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${item.ready ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--hover-2)] text-[var(--text-muted)]'
                      }`}>
                      {item.ready ? <Check className="w-3.5 h-3.5" /> : <CircleDot className="w-3.5 h-3.5" />}
                    </div>
                    <span className="flex-1 text-sm text-[var(--text-secondary)]">{item.label}</span>
                    <span className={`text-xs ${item.ready ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                      {item.ready ? 'Готово' : 'Не заполнено'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-5 border-t border-[var(--border-color)] space-y-3">
                <ActionButton onClick={submit} disabled={saving}
                  className="w-full px-5 py-3 text-sm font-semibold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Сохранение...' : editing ? 'Сохранить' : 'Создать этап'}
                </ActionButton>

                <button onClick={onCancel} disabled={saving}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]">
                  Отмена
                </button>
              </div>
            </div>
          </SectionCard>

          <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]">
            <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
            <p className="text-xs leading-6 text-[var(--text-muted)]">
              После создания этапа можно назначить нескольких исполнителей и управлять выполнением.
            </p>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STAGE DETAIL
   ═══════════════════════════════════════════════════════════════ */

const ST_LABEL: Record<TaskStatus, string> = {
  backlog: 'В резерве', todo: 'Готово к выполнению', in_progress: 'В работе',
  paused: 'На паузе', blocked: 'Приостановлено', to_review: 'На проверке',
  to_fix: 'На доработку', to_test: 'На тестировании', done: 'Выполнено',
  cancelled: 'Отменено',
};

type StageAction = 'start' | 'pause' | 'resume' | 'complete' | 'skip';

function StageDetail({
  stage,
  users,
  currentUserId,
  totalStages,
  busy,
  projectId,
  onBack,
  onEdit,
  onDelete,
  onAction,
  onSetAssignees,
}: {
  stage: ProjectStageResponse;
  users: UsersMap;
  currentUserId?: string;
  totalStages: number;
  busy: boolean;
  projectId: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAction: (action: StageAction) => Promise<void>;
  onSetAssignees: (ids: string[]) => Promise<void>;
}) {
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stageTasks, setStageTasks] = useState<any[]>([]);
  const [loadingStageTasks, setLoadingStageTasks] = useState(false);

  const responsible = stage.responsible_id ? users[stage.responsible_id] : null;
  const assigneeIds = stage.assignee_ids ?? [];
  const effective = effectiveStatus(stage);
  const statusConfig = STATUS[effective];

  const plannedStart = parseDate(stage.planned_start);
  const plannedEnd = parseDate(stage.planned_end);
  const actualStart = parseDate(stage.started_at);
  const actualFinish = actualEnd(stage);
  const plannedDays = plannedStart && plannedEnd ? daysBetween(plannedStart, plannedEnd) + 1 : null;
  const actualDays = actualStart && actualFinish ? Math.max(1, daysBetween(actualStart, actualFinish) + 1) : null;
  const late = isOverPlan(stage);
  const lateDays = overrunDays(stage);

  useEffect(() => {
    let cancelled = false;
    setLoadingStageTasks(true);
    tasksApi.getKanban(
      { type: 'project', project_id: projectId } as any,
      { size: 100, stage_ids: [stage.id] },
    )
      .then((res: any) => {
        if (cancelled) return;
        const all: any[] = [];
        (res.columns ?? []).forEach((col: any) => {
          (col.tasks?.items ?? []).forEach((task: any) => all.push(task));
        });
        setStageTasks(all);
      })
      .catch(() => { if (!cancelled) setStageTasks([]); })
      .finally(() => { if (!cancelled) setLoadingStageTasks(false); });
    return () => { cancelled = true; };
  }, [stage.id, projectId]);

  const saveAssignees = async (ids: string[]) => {
    setSavingAssignees(true);
    try { await onSetAssignees(ids); }
    finally { setSavingAssignees(false); }
  };

  // Какие действия доступны при текущем статусе — порядок = порядок показа
  const actions: { action: StageAction; label: string; icon: React.ElementType; primary: boolean }[] = [];
  if (stage.status === 'planned') actions.push({ action: 'start', label: 'Начать этап', icon: PlayCircle, primary: true });
  if (stage.status === 'on_hold') actions.push({ action: 'resume', label: 'Возобновить', icon: PlayCircle, primary: true });
  if (stage.status === 'active') {
    actions.push({ action: 'complete', label: 'Завершить этап', icon: CheckCircle2, primary: true });
    actions.push({ action: 'pause', label: 'Приостановить', icon: PauseCircle, primary: false });
  }
  if (stage.status === 'planned' || stage.status === 'on_hold') {
    actions.push({ action: 'skip', label: 'Пропустить', icon: SkipForward, primary: false });
  }
  const primaryAction = actions.find(a => a.primary);
  const secondaryActions = actions.filter(a => !a.primary);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* ═══ НАЗАД ═══ */}
      <button onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="w-4 h-4" /> Все этапы
      </button>

      {/* ═══════════════════════════════════════════════════════════
          ГЛАВНЫЙ БЛОК (HERO)
          Это первое, что видит пользователь: кто этот этап, какой у
          него статус, и что с ним нужно сделать прямо сейчас.
          Поэтому статус + главная кнопка действия — ЗДЕСЬ, а не в
          сайдбаре, куда надо было бы долистывать.
      ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">

        {/* --- верх: номер/статус-бейджи слева, тихие кнопки справа --- */}
        <div className="flex items-start justify-between gap-4 p-6 sm:p-8 pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <StageNumber order={stage.execution_order} />
              <StatusBadge status={stage.status} />
              {effective === 'overdue' && <StatusBadge status="overdue" />}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] break-words">
              {stage.name}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Этап {stage.execution_order} из {totalStages}
            </p>
          </div>

          {/* ghost-кнопки — намеренно неброские, чтобы не спорить с главным действием ниже */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onEdit} disabled={busy} title="Редактировать"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors">
              <Pencil className="w-4.5 h-4.5" />
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen(v => !v)} disabled={busy} title="Ещё"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors">
                <MoreHorizontal className="w-4.5 h-4.5" />
              </button>
              {menuOpen && (
                <>
                  <button className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-30 w-52 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5"
                    style={{ boxShadow: 'var(--shadow-lg)' }}>
                    <button onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--accent)] hover:bg-[var(--accent-soft)] text-left">
                      <Trash2 className="w-4 h-4" /> Удалить этап
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- низ: цветная полоса статуса + действие(я). Единственное
             место на странице, где используется цвет статуса —
             чтобы он не "размазывался" по всей странице и бросался
             в глаза именно там, где нужно принять решение. --- */}
        {(primaryAction || secondaryActions.length > 0) && (
          <div className={`flex flex-wrap items-center justify-between gap-4 px-6 sm:px-8 py-5 border-t ${statusConfig.border} ${statusConfig.bg}`}>
            <div className="flex items-center gap-3">
              <statusConfig.icon className={`w-5 h-5 ${statusConfig.text}`} />
              <span className={`text-sm font-semibold ${statusConfig.text}`}>{statusConfig.label}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {secondaryActions.map(a => (
                <button key={a.action} onClick={() => void onAction(a.action)} disabled={busy}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-50 transition-colors">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <a.icon className="w-4 h-4" />}
                  {a.label}
                </button>
              ))}
              {primaryAction && (
                <ActionButton onClick={() => void onAction(primaryAction.action)} disabled={busy}
                  className="px-5 py-2.5 text-sm font-semibold">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <primaryAction.icon className="w-4 h-4" />}
                  {primaryAction.label}
                </ActionButton>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ ОСНОВНАЯ СЕТКА: контент слева, компактный сайдбар справа ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">

        {/* ─────────────── ЛЕВАЯ КОЛОНКА: контент этапа ─────────────── */}
        <div className="space-y-6">

          {stage.description && (
            <SectionCard title="Описание этапа" icon={FileText}>
              <div className="p-6">
                <p className="text-sm sm:text-base leading-8 text-[var(--text-secondary)] whitespace-pre-wrap">
                  {stage.description}
                </p>
              </div>
            </SectionCard>
          )}

          {/* --- СРОКИ: раньше это были 2 коробки по 3 поля + баннер +
               2 отдельных прогресс-бара. Теперь — 2 компактные строки
               (план/факт) + один прогресс-бар, вся суть на одном экране
               без скролла внутри карточки. --- */}
          <SectionCard title="Сроки выполнения" icon={CalendarDays}>
            <div className="p-6 space-y-4">
              <TimelineRow
                dotClass="bg-blue-500"
                label="План"
                start={formatDate(stage.planned_start)}
                end={formatDate(stage.planned_end)}
                days={plannedDays}
              />
              <TimelineRow
                dotClass={late ? 'bg-[var(--accent)]' : 'bg-emerald-500'}
                label="Факт"
                start={formatDate(stage.started_at)}
                end={stage.completed_at ? formatDate(stage.completed_at) : stage.started_at ? 'Выполняется' : '—'}
                days={actualDays}
              />

              {plannedDays != null && actualDays != null && plannedDays > 0 && (
                <div className="pt-1">
                  <div className="h-2 rounded-full bg-[var(--hover-3)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${late ? 'bg-[var(--accent)]' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (actualDays / plannedDays) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {late && (
                <div className="flex items-center gap-2 text-xs text-[var(--accent)] font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Превышение плана на {lateDays} дн.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Критерии приёмки" icon={ListChecks}>
            {!stage.completion_criteria.length ? (
              <div className="p-6 text-sm text-[var(--text-muted)]">Критерии не указаны</div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {stage.completion_criteria.map((criterion, index) => (
                  <div key={index} className="flex items-start gap-3 px-6 py-3.5">
                    <Target className="w-4 h-4 mt-0.5 text-[var(--accent)] shrink-0" />
                    <p className="flex-1 text-sm leading-6 text-[var(--text-secondary)]">{criterion}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Задачи на этапе" description={`${stageTasks.length} задач`} icon={CheckCircle2}>
            {loadingStageTasks ? (
              <div className="p-6 flex items-center gap-3 text-sm text-[var(--text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем задачи...
              </div>
            ) : !stageTasks.length ? (
              <EmptyState icon={CheckCircle2} title="Задач нет"
                description="К этому этапу пока не привязано ни одной задачи." />
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {stageTasks.map((t: any) => (
                  <button key={t.id} type="button"
                    onClick={() => window.open(`/tasks?ticket_id=${t.ticket_id ?? ''}`, '_blank')}
                    className="group w-full flex items-center gap-3 px-6 py-3.5 text-left hover:bg-[var(--hover-2)] transition-colors">
                    <span className="font-mono text-xs text-[var(--text-muted)] shrink-0">#{t.number}</span>
                    <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">
                      {t.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--hover-2)] text-[11px] text-[var(--text-muted)] shrink-0">
                      {ST_LABEL[t.status as TaskStatus] ?? t.status}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--accent)]" />
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ─────────── ПРАВАЯ КОЛОНКА: люди + служебная инфа ───────────
             Было 4 карточки одного веса (управление / ответственный /
             исполнители / инфо). Управление ушло в шапку, ответственный
             и исполнители — это один смысловой блок "кто на этом этапе",
             объединяю их. Служебная инфа — внизу, мельче, без лишнего
             визуального веса, т.к. это не то, на что смотрят часто. ─── */}
        <aside className="space-y-5 xl:sticky xl:top-5">

          <SectionCard
            title="Люди"
            icon={Users}
            action={
              <button onClick={() => setAssigneesOpen(true)}
                className="p-2 rounded-lg bg-[var(--hover-2)] text-[var(--text-secondary)] hover:text-[var(--accent)]"
                title="Управление исполнителями">
                <UserPlus className="w-4 h-4" />
              </button>
            }
          >
            <div className="divide-y divide-[var(--border-color)]">

              {/* Ответственный */}
              <div className="p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-disabled)]">
                  Ответственный
                </p>
                {responsible ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={responsible.full_name} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{responsible.full_name}</p>
                      {responsible.email && (
                        <p className="text-xs text-[var(--text-muted)] truncate">{responsible.email}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">Не назначен</p>
                )}
              </div>

              {/* Исполнители */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-disabled)]">
                    Исполнители
                  </p>
                  <span className="text-[11px] text-[var(--text-muted)]">{assigneeIds.length}</span>
                </div>

                {!assigneeIds.length ? (
                  <button onClick={() => setAssigneesOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[var(--border-color)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] transition-colors">
                    <UserPlus className="w-4 h-4" /> Назначить
                  </button>
                ) : (
                  <div className="space-y-3">
                    {assigneeIds.map(id => {
                      const employee = users[id];
                      return (
                        <div key={id} className="flex items-center gap-2.5">
                          <Avatar name={employee?.full_name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {employee?.full_name ?? 'Пользователь'}
                            </p>
                          </div>
                          {id === currentUserId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--hover-2)] text-[var(--text-muted)]">Вы</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Служебная инфа — минимум визуального веса, т.к. читают редко */}
          <div className="rounded-2xl border border-[var(--border-color)] p-5 text-xs text-[var(--text-muted)] space-y-2.5">
            <div className="flex items-center gap-1.5 text-[var(--text-disabled)] mb-1">
              <Info className="w-3.5 h-3.5" />
              <span className="font-semibold uppercase tracking-wide text-[10px]">Информация</span>
            </div>
            <div className="flex justify-between"><span>Создан</span><span>{formatDateTime(stage.created_at)}</span></div>
            <div className="flex justify-between"><span>Обновлён</span><span>{formatDateTime(stage.updated_at)}</span></div>
            <div className="pt-2 border-t border-[var(--border-color)]">
              <span className="block mb-1">ID этапа</span>
              <span className="font-mono break-all">{stage.id}</span>
            </div>
          </div>
        </aside>
      </div>

      <AssigneesModal
        open={assigneesOpen}
        users={users}
        selectedIds={assigneeIds}
        currentUserId={currentUserId}
        saving={savingAssignees}
        onSave={saveAssignees}
        onClose={() => setAssigneesOpen(false)}
      />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Маленький локальный helper только для этого файла — одна строка
// "план/факт" в блоке сроков (см. комментарий выше по дизайну)
// ─────────────────────────────────────────────────────────────────
function TimelineRow({
  dotClass, label, start, end, days,
}: { dotClass: string; label: string; start: string; end: string; days: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className="w-10 text-xs font-medium text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{start}</span>
      <span className="text-[var(--text-disabled)]">→</span>
      <span className="text-sm text-[var(--text-primary)]">{end}</span>
      {days != null && (
        <span className="ml-auto text-xs text-[var(--text-muted)] shrink-0">{days} дн.</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROJECT STAGES PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function ProjectStagesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<ProjectStageResponse[]>([]);
  const [users, setUsers] = useState<UsersMap>({});

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewType>('table');
  const [screen, setScreen] = useState<Screen>({ type: 'list' });

  const [editing, setEditing] = useState(false);
  const [deletingStage, setDeletingStage] = useState<ProjectStageResponse | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const loadProject = useCallback(async () => {
    if (!projectId) return null;

    const data = await projectsApi.getById(projectId);
    setProject(data);
    setStages(sortStages(data.stages ?? []));
    return data;
  }, [projectId]);

  /* LOAD */
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await projectsApi.getById(projectId);
        if (!cancelled) {
          setProject(data);
          setStages(sortStages(data.stages ?? []));
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        if (!cancelled) push('Не удалось загрузить проект', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [projectId, push]);

  /* LOAD USERS */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result: UsersMap = {};
        let page = 1;
        let totalPages = 1;

        do {
          const response = await usersApi.getAllUsers(page, 100);
          if (cancelled) return;

          response.items.forEach(u => {
            result[u.id] = {
              id: u.id,
              full_name: u.full_name || u.email || 'Без имени',
              email: u.email,
            };
          });

          totalPages = response.total_pages;
          page++;
        } while (page <= totalPages && !cancelled);

        if (!cancelled) setUsers(result);
      } catch (error) {
        console.error('Failed to load users:', error);
        if (!cancelled) push('Не удалось загрузить сотрудников', 'error');
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [push]);

  const selectedStage = screen.type === 'detail'
    ? stages.find(s => s.id === screen.stageId) ?? null
    : null;

  const goList = () => {
    setScreen({ type: 'list' });
    setEditing(false);
  };

  const goDetail = (stage: ProjectStageResponse) => {
    setScreen({ type: 'detail', stageId: stage.id });
    setEditing(false);
  };

  const goCreate = () => {
    setEditing(false);
    setScreen({ type: 'create' });
  };

  /* CREATE */
  const createStage = async (payload: StagePayload) => {
    if (!projectId || busy) return;
    setBusy(true);

    try {
      const beforeIds = new Set(stages.map(s => s.id));

      const response = await projectsApi.createStage(projectId, {
        name: payload.name,
        description: payload.description ?? undefined,
        execution_order: payload.order,
        planned_start: payload.planned_start,
        planned_end: payload.planned_end,
        responsible_id: payload.responsible_id ?? undefined,
        completion_criteria: payload.completion_criteria,
      } as any);

      const updatedStages = sortStages(response.stages ?? []);
      setStages(updatedStages);

      const created = updatedStages.find(s => !beforeIds.has(s.id));

      if (created) goDetail(created);
      else goList();

      push('Этап успешно создан', 'success');
    } catch (error) {
      console.error('Create stage:', error);
      push('Не удалось создать этап', 'error');
      throw error;
    } finally {
      setBusy(false);
    }
  };

  /* UPDATE */
  const updateStage = async (payload: StagePayload) => {
    if (!projectId || !selectedStage || busy) return;
    setBusy(true);

    try {
      const stage = selectedStage;

      await projectsApi.updateStage(projectId, stage.id, {
        name: payload.name,
        description: payload.description,
        responsible_id: payload.responsible_id,
        completion_criteria: payload.completion_criteria,
        planned_start: payload.planned_start,
        planned_end: payload.planned_end,
      } as any);

      if (payload.order !== stage.execution_order) {
        const reordered = sortStages(stages).filter(s => s.id !== stage.id);
        const position = Math.max(0, Math.min(payload.order - 1, reordered.length));
        reordered.splice(position, 0, stage);

        await projectsApi.reorderStages(projectId, reordered.map(s => s.id));
      }

      await loadProject();
      setEditing(false);
      push('Этап обновлён', 'success');
    } catch (error) {
      console.error('Update stage:', error);

      try { await loadProject(); } catch { /* Ошибка уже обрабатывается */ }

      push('Не удалось сохранить изменения', 'error');
      throw error;
    } finally {
      setBusy(false);
    }
  };

  /* DELETE */
  const deleteStage = async () => {
    if (!projectId || !deletingStage || busy) return;
    setBusy(true);

    try {
      await projectsApi.deleteStage(projectId, deletingStage.id);
      await loadProject();

      setDeletingStage(null);
      goList();

      push('Этап удалён', 'success');
    } catch (error) {
      console.error('Delete stage:', error);
      push('Не удалось удалить этап', 'error');
    } finally {
      setBusy(false);
    }
  };

  /* STATUS ACTIONS */
  const changeStatus = async (
    stageId: string,
    action: 'start' | 'pause' | 'resume' | 'complete' | 'skip',
  ) => {
    if (!projectId || busy) return;

    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    const allowed =
      (action === 'start' && stage.status === 'planned') ||
      (action === 'pause' && stage.status === 'active') ||
      (action === 'resume' && stage.status === 'on_hold') ||
      (action === 'complete' && stage.status === 'active') ||
      (action === 'skip' && (stage.status === 'planned' || stage.status === 'on_hold'));

    if (!allowed) {
      push('Этот переход статуса недоступен', 'error');
      return;
    }

    setBusy(true);

    try {
      switch (action) {
        case 'start':
          await projectsApi.startStage(projectId, stageId);
          break;
        case 'pause':
          await projectsApi.pauseStage(projectId, stageId);
          break;
        case 'resume':
          await projectsApi.resumeStage(projectId, stageId);
          break;
        case 'complete':
          await projectsApi.completeStage(projectId, stageId);
          break;
        case 'skip':
          await projectsApi.skipStage(projectId, stageId);
          break;
      }

      await loadProject();

      const messages = {
        start: 'Этап запущен',
        pause: 'Этап приостановлен',
        resume: 'Этап возобновлён',
        complete: 'Этап завершён',
        skip: 'Этап пропущен',
      };

      push(messages[action], 'success');
    } catch (error) {
      console.error('Stage status action:', error);
      push('Не удалось изменить статус этапа', 'error');
      throw error;
    } finally {
      setBusy(false);
    }
  };

  /* KANBAN */
  const moveStage = async (stageId: string, status: StageStatus) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage || stage.status === status) return;

    if (status === 'active') {
      await changeStatus(stageId, stage.status === 'on_hold' ? 'resume' : 'start');
    } else if (status === 'on_hold') {
      await changeStatus(stageId, 'pause');
    } else if (status === 'completed') {
      await changeStatus(stageId, 'complete');
    } else if (status === 'skipped') {
      await changeStatus(stageId, 'skip');
    }
  };

  /* ASSIGNEES */
  const setAssignees = async (stageId: string, ids: string[]) => {
    if (!projectId) return;

    try {
      await projectsApi.setStageAssignees(projectId, stageId, [...new Set(ids)]);
      await loadProject();
      push('Исполнители обновлены', 'success');
    } catch (error) {
      console.error('Set assignees:', error);
      push('Не удалось сохранить исполнителей', 'error');
      throw error;
    }
  };

  /* LOADING */
  if (loading) return <LoadingState />;

  if (!projectId || !project) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <EmptyState
          icon={FolderOpen}
          title="Проект не найден"
          description="Не удалось получить данные проекта."
          action={
            <ActionButton onClick={() => navigate('/projects')} className="px-5 py-3 text-sm">
              <ArrowLeft className="w-4 h-4" /> К проектам
            </ActionButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1900px] mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)}
            title="Вернуться к проекту"
            className="w-11 h-11 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover-2)]">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
              <Link to="/projects" className="hover:text-[var(--accent)]">Проекты</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link to={`/projects/${projectId}`} className="hover:text-[var(--accent)]">{project.name}</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[var(--text-secondary)]">Этапы</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Этапы проекта
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {project.name} <span className="mx-1">·</span> {project.key}
            </p>
          </div>
        </div>

        {screen.type === 'list' && view !== 'table' && (
          <ActionButton onClick={goCreate} className="px-5 py-3 text-sm font-semibold">
            <Plus className="w-4 h-4" /> Создать этап
          </ActionButton>
        )}
      </div>

      {/* CONTENT */}
      <AnimatePresence mode="wait">
        {screen.type === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} className="space-y-5">

            <ViewNavigation view={view} onChange={setView} />

            {view === 'table' && (
              <TableView stages={stages} users={users} onOpen={goDetail} onCreate={goCreate} />
            )}

            {view === 'overview' && (
              <OverviewView stages={stages} users={users} onOpen={goDetail} onCreate={goCreate} />
            )}

            {view === 'roadmap' && (
              <RoadmapView stages={stages} users={users} onOpen={goDetail} />
            )}

            {view === 'timeline' && (
              <TimelineView stages={stages} users={users} projectId={projectId} onOpen={goDetail} />
            )}

            {view === 'board' && (
              <BoardView stages={stages} users={users} onOpen={goDetail} onMove={moveStage} />
            )}

            {view === 'analytics' && (
              <AnalyticsView stages={stages} users={users} onOpen={goDetail} />
            )}
          </motion.div>
        )}

        {screen.type === 'detail' && selectedStage && (
          <motion.div key={`detail-${selectedStage.id}`} initial={{ opacity: 0 }}
            animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {editing ? (
              <StageFormView
                stage={selectedStage}
                nextOrder={selectedStage.execution_order}
                users={users}
                saving={busy}
                onSave={updateStage}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <StageDetail
                stage={selectedStage}
                users={users}
                currentUserId={user?.id}
                totalStages={stages.length}
                busy={busy}
                projectId={projectId}
                onBack={goList}
                onEdit={() => setEditing(true)}
                onDelete={() => setDeletingStage(selectedStage)}
                onAction={action => changeStatus(selectedStage.id, action)}
                onSetAssignees={ids => setAssignees(selectedStage.id, ids)}
              />
            )}
          </motion.div>
        )}

        {screen.type === 'create' && (
          <StageFormView
            key="create"
            nextOrder={stages.length + 1}
            users={users}
            saving={busy}
            onSave={createStage}
            onCancel={goList}
          />
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION */}
      {deletingStage && (
        <DeleteStageModal
          stage={deletingStage}
          loading={busy}
          onConfirm={deleteStage}
          onClose={() => setDeletingStage(null)}
        />
      )}

      <Toasts
        items={toasts}
        onClose={id => setToasts(prev => prev.filter(t => t.id !== id))}
      />
    </div>
  );
}