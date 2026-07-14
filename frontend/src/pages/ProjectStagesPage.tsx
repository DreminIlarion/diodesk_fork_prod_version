// ProjectStagesPage.tsx
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, CheckCircle2, PlayCircle, AlertTriangle, X,
  LayoutGrid, GanttChart, Map as MapIcon, BarChart3, Info, Target,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter,
  Table as TableIcon, Milestone, Flag, PauseCircle, SkipForward,
  PenSquare, Save, ChevronRight, Plus, Trash2, ArrowLeft, Eye,
  User, FileText, ListChecks, Settings2, Layers, TrendingUp,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import exportTimelineToExcel from '../components/utils/exportTimelineToExcel';
import { projectsApi } from '../api/client';
import type { Project, ProjectStageResponse, StageResponsible } from '../types';

/* ════════════════════════════════════════════════════════════════
   ТИПЫ
   ════════════════════════════════════════════════════════════════ */

export type ProjectStageStatus = 'planned' | 'active' | 'completed' | 'on_hold' | 'skipped';

// Обновлённый интерфейс под API (execution_order вместо order)
export interface ProjectStageResponse {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  name: string;
  execution_order: number;
  status: ProjectStageStatus;
  planned_start: string | null;
  planned_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  responsible_id: string | null;
  description: string | null;
  completion_criteria: string[];
  is_overdue: boolean;
  planned_duration_days: number | null;
}

export interface StageResponsible {
  id: string;
  full_name: string;
  role?: string;
  email?: string;
}

export interface StageUpsertPayload {
  name: string;
  order: number;
  status: ProjectStageStatus;
  planned_start: string | null;
  planned_end: string | null;
  responsible_id: string | null;
  description: string | null;
  completion_criteria: string[];
  planned_duration_days: number | null;
}

export type EffectiveStatus = ProjectStageStatus | 'overdue';

type ViewType = 'table' | 'overview' | 'roadmap' | 'timeline' | 'board' | 'analytics';
type TimelineScale = 'days' | 'weeks' | 'months';
type SortKey = 'order' | 'name' | 'status' | 'responsible' | 'dates' | 'duration';
type SortDir = 'asc' | 'desc';
type SectionScreen = { type: 'list' } | { type: 'detail'; stageId: string; editing: boolean } | { type: 'create' };
type StageForm = {
  name: string;
  order: string;
  status: ProjectStageStatus;
  responsible_id: string;
  planned_start: string;
  planned_end: string;
  planned_duration_days: string;
  description: string;
  completion_criteria: string;
};

/* ════════════════════════════════════════════════════════════════
   МОКИ (для ответственных — пока нет API)
   ════════════════════════════════════════════════════════════════ */

const MOCK_RESPONSIBLES: Record<string, StageResponsible> = {
  u2: { id: 'u2', full_name: 'Мария Сидорова', role: 'Бизнес-аналитик', email: 'sidorova@company.ru' },
  u3: { id: 'u3', full_name: 'Анна Морозова', role: 'UX-дизайнер', email: 'morozova@company.ru' },
  u4: { id: 'u4', full_name: 'Иван Кузнецов', role: 'Тимлид фронтенда', email: 'kuznetsov@company.ru' },
  u5: { id: 'u5', full_name: 'Ольга Новикова', role: 'QA Lead', email: 'novikova@company.ru' },
  u6: { id: 'u6', full_name: 'Дмитрий Орлов', role: 'DevOps-инженер', email: 'orlov@company.ru' },
  u7: { id: 'u7', full_name: 'Алексей Петров', role: 'Тимлид бэкенда', email: 'petrov@company.ru' },
  u8: { id: 'u8', full_name: 'Елена Волкова', role: 'Security Engineer', email: 'volkova@company.ru' },
};

const TODAY = new Date();

/* ════════════════════════════════════════════════════════════════
   СТАТУСЫ
   ════════════════════════════════════════════════════════════════ */

const STATUS_CFG: Record<EffectiveStatus, { label: string; dot: string; chip: string; bar: string; ring: string; border: string; icon: any; text: string; }> = {
  planned: { label: 'Запланирован', dot: 'bg-slate-400', chip: 'bg-slate-500/10 text-slate-300 border-slate-400/20', bar: 'bg-slate-500', ring: 'ring-slate-400/25', border: 'border-slate-400/25', icon: Clock, text: 'text-slate-300' },
  active: { label: 'В работе', dot: 'bg-blue-500', chip: 'bg-blue-500/12 text-blue-300 border-blue-400/25', bar: 'bg-blue-500', ring: 'ring-blue-500/25', border: 'border-blue-400/25', icon: PlayCircle, text: 'text-blue-300' },
  completed: { label: 'Завершён', dot: 'bg-emerald-500', chip: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/25', bar: 'bg-emerald-500', ring: 'ring-emerald-500/25', border: 'border-emerald-400/25', icon: CheckCircle2, text: 'text-emerald-300' },
  on_hold: { label: 'На паузе', dot: 'bg-amber-500', chip: 'bg-amber-500/12 text-amber-300 border-amber-400/25', bar: 'bg-amber-500', ring: 'ring-amber-500/25', border: 'border-amber-400/25', icon: PauseCircle, text: 'text-amber-300' },
  skipped: { label: 'Пропущен', dot: 'bg-neutral-500', chip: 'bg-neutral-500/10 text-neutral-400 border-neutral-400/20', bar: 'bg-neutral-500', ring: 'ring-neutral-400/20', border: 'border-neutral-400/20', icon: SkipForward, text: 'text-neutral-400' },
  overdue: { label: 'Просрочен', dot: 'bg-[var(--accent)]', chip: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/25', bar: 'bg-[var(--accent)]', ring: 'ring-[var(--accent)]/25', border: 'border-[var(--accent)]/25', icon: AlertTriangle, text: 'text-[var(--accent)]' },
};

/* ════════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ════════════════════════════════════════════════════════════════ */

const parseDate = (s: string | null): Date | null => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')) : null;
const fmtDate = (s: string | null) => { if (!s) return '—'; const d = parseDate(s); return d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; };
const fmtShort = (s: string | null) => { if (!s) return '—'; const d = parseDate(s); return d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'; };
const fmtDT = (s: string | null) => { if (!s) return '—'; return new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const fmtToday = () => fmtShort(new Date().toISOString());
const daysB = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

// ✅ Исправлено: execution_order вместо order
const effStatus = (s: ProjectStageResponse): EffectiveStatus => s.is_overdue && s.status !== 'completed' && s.status !== 'skipped' ? 'overdue' : s.status;
const sortOrd = (l: ProjectStageResponse[]) => [...l].sort((a, b) => a.execution_order - b.execution_order || a.name.localeCompare(b.name, 'ru'));
const normOrd = (l: ProjectStageResponse[]) => sortOrd(l).map((s, i) => ({ ...s, execution_order: i + 1 }));

function getInitials(name?: string) { return !name ? '?' : name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

function stagesOverlap(a: ProjectStageResponse, b: ProjectStageResponse): boolean {
  const as = parseDate(a.planned_start), ae = parseDate(a.planned_end);
  const bs = parseDate(b.planned_start), be = parseDate(b.planned_end);
  if (!as || !ae || !bs || !be) return false;
  return as <= be && bs <= ae;
}

const isRunning = (s: ProjectStageResponse) => s.status === 'active' || s.status === 'on_hold';

function getActualEnd(s: ProjectStageResponse): Date | null {
  if (s.completed_at) return parseDate(s.completed_at);
  if (s.status === 'active' || s.status === 'on_hold') return TODAY;
  return null;
}

function isFactOverPlan(s: ProjectStageResponse): boolean {
  const pe = parseDate(s.planned_end), ae = getActualEnd(s);
  if (!pe || !ae) return false; return ae > pe;
}

function overrunDays(s: ProjectStageResponse): number {
  const pe = parseDate(s.planned_end), ae = getActualEnd(s);
  if (!pe || !ae || ae <= pe) return 0; return daysB(pe, ae);
}

function resolveDates(prev: ProjectStageResponse, status: ProjectStageStatus) {
  const now = new Date().toISOString(); let sa = prev.started_at, ca = prev.completed_at;
  if (status === 'planned') { sa = null; ca = null; } if (status === 'active') { sa = sa ?? now; ca = null; }
  if (status === 'completed') { sa = sa ?? now; ca = ca ?? now; } if (status === 'on_hold') { ca = null; } if (status === 'skipped') { ca = null; }
  return { started_at: sa, completed_at: ca };
}

const emptyForm = (order: number): StageForm => ({ name: '', order: String(order), status: 'planned', responsible_id: '', planned_start: '', planned_end: '', planned_duration_days: '', description: '', completion_criteria: '' });

// ✅ Исправлено: execution_order вместо order
const stageToForm = (s: ProjectStageResponse): StageForm => ({
  name: s.name,
  order: String(s.execution_order),
  status: s.status,
  responsible_id: s.responsible_id ?? '',
  planned_start: s.planned_start ?? '',
  planned_end: s.planned_end ?? '',
  planned_duration_days: s.planned_duration_days != null ? String(s.planned_duration_days) : '',
  description: s.description ?? '',
  completion_criteria: s.completion_criteria.join('\n')
});

const formToPayload = (f: StageForm): StageUpsertPayload => ({
  name: f.name.trim(),
  order: Math.max(1, Number(f.order) || 1),
  status: f.status,
  planned_start: f.planned_start || null,
  planned_end: f.planned_end || null,
  responsible_id: f.responsible_id || null,
  description: f.description.trim() || null,
  completion_criteria: f.completion_criteria.split('\n').map(v => v.trim()).filter(Boolean),
  planned_duration_days: f.planned_duration_days ? Math.max(1, Number(f.planned_duration_days)) : null
});

function applyPayload(stage: ProjectStageResponse, p: StageUpsertPayload): ProjectStageResponse {
  const d = resolveDates(stage, p.status);
  return { ...stage, ...p, ...d, updated_at: new Date().toISOString() };
}

/* ════════════════════════════════════════════════════════════════
   МАЛЕНЬКИЕ КОМПОНЕНТЫ
   ════════════════════════════════════════════════════════════════ */

function Ava({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' }) {
  const c = { sm: 'w-9 h-9 text-[13px]', md: 'w-11 h-11 text-[14px]' }[size];
  return <div className={`${c} rounded-full bg-[var(--accent)] flex items-center justify-center font-semibold text-white flex-shrink-0 select-none`}>{getInitials(name)}</div>;
}

function Badge({ order }: { order: number }) {
  return <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold px-2.5 py-1 text-[13px]"><Milestone className="w-3.5 h-3.5" />#{String(order).padStart(2, '0')}</span>;
}

function Chip({ status }: { status: EffectiveStatus }) {
  const c = STATUS_CFG[status];
  const I = c.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] font-medium ${c.chip}`}><I className="w-3.5 h-3.5" />{c.label}</span>;
}

const Skeleton = ({ className = '' }: { className?: string }) => <div className={`bg-[var(--hover-2)] animate-pulse rounded-2xl ${className}`} />;

function PageSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-[600px] w-full" /></div>;
}

interface Toast { id: number; title: string; type?: 'success' | 'error' | 'info' }

function Toasts({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return createPortal(
    <div className="fixed top-6 right-6 z-[200] flex flex-col gap-3">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            className={`min-w-[320px] rounded-2xl border bg-[var(--bg-card)] px-5 py-4 flex items-center gap-3 ${
              t.type === 'error' ? 'border-[var(--accent)]/25' :
              t.type === 'success' ? 'border-emerald-400/25' : 'border-[var(--border-color)]'
            }`}
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
            {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-[var(--accent)] flex-shrink-0" />}
            {(!t.type || t.type === 'info') && <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />}
            <span className="text-[14px] text-[var(--text-primary)] flex-1">{t.title}</span>
            <button onClick={() => onClose(t.id)} className="text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

/* ════════════════════════════════════════════════════════════════
   VIEW TABS
   ════════════════════════════════════════════════════════════════ */

const VIEWS: { id: ViewType; label: string; icon: any }[] = [
  { id: 'table', label: 'Таблица', icon: TableIcon },
  { id: 'overview', label: 'Обзор', icon: Info },
  { id: 'roadmap', label: 'Карта', icon: MapIcon },
  { id: 'timeline', label: 'Хронология', icon: GanttChart },
  { id: 'board', label: 'Доска', icon: LayoutGrid },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 }
];

function ViewTabs({ view, onChange }: { view: ViewType; onChange: (v: ViewType) => void }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-2)] p-1.5 inline-flex gap-1 overflow-x-auto">
      {VIEWS.map(t => {
        const a = view === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium whitespace-nowrap transition-colors ${
              a ? 'text-white' : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/80'
            }`}
          >
            {a && (
              <motion.div
                layoutId="stab"
                className="absolute inset-0 rounded-xl bg-[var(--accent)]"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <t.icon className="w-4 h-4 relative" />
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TABLE
   ════════════════════════════════════════════════════════════════ */

function TableView({ stages, responsibles, onSelect, onCreate }: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (s: ProjectStageResponse) => void;
  onCreate: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<EffectiveStatus | 'all'>('all');

  const filtered = useMemo(() => {
    let l = [...stages];
    const q = search.toLowerCase().replace('#', '').trim();
    if (q) {
      l = l.filter(s => {
        const rn = s.responsible_id ? responsibles[s.responsible_id]?.full_name ?? '' : '';
        return s.name.toLowerCase().includes(q) || rn.toLowerCase().includes(q) ||
          String(s.execution_order).includes(q) || (s.description ?? '').toLowerCase().includes(q);
      });
    }
    if (statusF !== 'all') l = l.filter(s => effStatus(s) === statusF);
    l.sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      switch (sortKey) {
        case 'order': av = a.execution_order; bv = b.execution_order; break;
        case 'name': av = a.name; bv = b.name; break;
        case 'status': av = effStatus(a); bv = effStatus(b); break;
        case 'responsible':
          av = a.responsible_id ? responsibles[a.responsible_id]?.full_name ?? '' : '';
          bv = b.responsible_id ? responsibles[b.responsible_id]?.full_name ?? '' : '';
          break;
        case 'dates': av = a.planned_start ?? ''; bv = b.planned_start ?? ''; break;
        case 'duration': av = a.planned_duration_days ?? 0; bv = b.planned_duration_days ?? 0; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return l;
  }, [stages, responsibles, search, statusF, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const SI = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="w-4 h-4 text-[var(--text-primary)]/20" /> :
      sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
        <Milestone className="w-14 h-14 mx-auto text-[var(--text-primary)]/15 mb-4" />
        <h3 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Этапов пока нет</h3>
        <p className="text-[15px] text-[var(--text-primary)]/50 mb-6 max-w-md mx-auto">Создайте первый этап проекта.</p>
        <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-white">
          <Plus className="w-4 h-4" /> Создать этап
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
      <div className="border-b border-[var(--border-color)] bg-[var(--hover-1)] px-5 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] pl-11 pr-4 py-3 text-[14px] text-[var(--text-primary)] placeholder-white/20 outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 pointer-events-none" />
          <Select value={statusF} onValueChange={e => setStatusF(e as any)}>
            <SelectTrigger className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] pl-11 pr-10 py-3 text-[14px] text-[var(--text-primary)] outline-none">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="planned">Запланирован</SelectItem>
              <SelectItem value="active">В работе</SelectItem>
              <SelectItem value="on_hold">На паузе</SelectItem>
              <SelectItem value="completed">Завершён</SelectItem>
              <SelectItem value="skipped">Пропущен</SelectItem>
              <SelectItem value="overdue">Просрочен</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[14px] font-semibold text-white">
          <Plus className="w-4 h-4" /> Создать
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px]">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">
              {([['order', 'Этап'], ['name', 'Название'], ['status', 'Статус'], ['dates', 'Плановые сроки'], ['responsible', 'Ответственный'], ['duration', 'Дни']] as [SortKey, string][]).map(([k, l]) => (
                <th key={k} className="px-5 py-4 text-left">
                  <button onClick={() => toggle(k)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] transition-colors">
                    {l} <SI k={k} />
                  </button>
                </th>
              ))}
              <th className="px-5 py-4 text-left"><span className="text-[13px] font-semibold text-[var(--text-primary)]/45">Исполнение</span></th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center">
                  <Search className="w-10 h-10 mx-auto text-[var(--text-primary)]/15 mb-3" />
                  <p className="text-[15px] text-[var(--text-primary)]/40">Ничего не найдено</p>
                </td>
              </tr>
            ) : filtered.map(stage => {
              const eff = effStatus(stage);
              const resp = stage.responsible_id ? responsibles[stage.responsible_id] : null;
              const ov = overrunDays(stage);
              const fo = isFactOverPlan(stage);
              return (
                <tr
                  key={stage.id}
                  onClick={() => onSelect(stage)}
                  className={`group cursor-pointer border-b border-[var(--border-color)] hover:bg-[var(--hover-1)] transition-colors ${eff === 'overdue' ? 'bg-[var(--accent-soft)]/20' : ''}`}
                >
                  <td className="px-5 py-5"><Badge order={stage.execution_order} /></td>
                  <td className="px-5 py-5 min-w-[220px]">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">{stage.name}</p>
                    <p className="mt-1 text-[14px] text-[var(--text-primary)]/50 line-clamp-1">{stage.description || 'Без описания'}</p>
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex flex-wrap gap-2">
                      <Chip status={stage.status} />
                      {eff === 'overdue' && <Chip status="overdue" />}
                    </div>
                  </td>
                  <td className="px-5 py-5 whitespace-nowrap text-[14px] text-[var(--text-primary)]/65">
                    {fmtShort(stage.planned_start)} — {fmtShort(stage.planned_end)}
                  </td>
                  <td className="px-5 py-5">
                    {resp ? (
                      <div className="inline-flex items-center gap-2.5">
                        <Ava name={resp.full_name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-[14px] text-[var(--text-primary)]/80 truncate">{resp.full_name}</p>
                        </div>
                      </div>
                    ) : <span className="text-[14px] text-[var(--text-primary)]/40">—</span>}
                  </td>
                  <td className="px-5 py-5 text-[14px] font-medium text-[var(--text-primary)]/65">
                    {stage.planned_duration_days != null ? `${stage.planned_duration_days} дн.` : '—'}
                  </td>
                  <td className="px-5 py-5">
                    {stage.started_at ? (
                      <div className="space-y-1">
                        <p className="text-[13px] text-[var(--text-primary)]/50 whitespace-nowrap">
                          {fmtShort(stage.started_at.slice(0, 10))} — {stage.completed_at ? fmtShort(stage.completed_at.slice(0, 10)) : fmtToday()}
                        </p>
                        {fo && (
                          <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--accent)]">
                            <AlertTriangle className="w-3 h-3" /> +{ov} дн.
                          </span>
                        )}
                      </div>
                    ) : <span className="text-[14px] text-[var(--text-primary)]/30">—</span>}
                  </td>
                  <td className="px-4 py-5">
                    <ChevronRight className="w-5 h-5 text-[var(--text-primary)]/20 group-hover:text-[var(--text-primary)]/50 transition-colors" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   OVERVIEW
   ════════════════════════════════════════════════════════════════ */

function OverviewView({ stages, responsibles, onSelect }: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (s: ProjectStageResponse) => void;
}) {
  const activeStages = useMemo(() => stages.filter(s => s.status === 'active'), [stages]);
  const onHoldStages = useMemo(() => stages.filter(s => s.status === 'on_hold'), [stages]);
  const overdueStages = useMemo(() => stages.filter(s => s.is_overdue && s.status !== 'completed' && s.status !== 'skipped'), [stages]);
  const total = stages.length;
  const done = stages.filter(s => s.status === 'completed').length;
  const pct = total ? Math.round(done / total * 100) : 0;

  const parallelGroups = useMemo(() => {
    const groups: ProjectStageResponse[][] = [];
    const used = new Set<string>();
    const active = sortOrd(activeStages);
    for (const s of active) {
      if (used.has(s.id)) continue;
      const group = [s];
      used.add(s.id);
      for (const other of active) {
        if (used.has(other.id)) continue;
        if (stagesOverlap(s, other)) {
          group.push(other);
          used.add(other.id);
        }
      }
      groups.push(group);
    }
    return groups;
  }, [activeStages]);

  const overrunCompleted = useMemo(() => stages.filter(s => s.status === 'completed' && isFactOverPlan(s)), [stages]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/12 border border-blue-400/20 flex items-center justify-center">
              <PlayCircle className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-[var(--text-primary)]">Текущие этапы</h3>
              <p className="text-[13px] text-[var(--text-primary)]/45">{activeStages.length ? `${activeStages.length} в работе` : 'Нет активных этапов'}</p>
            </div>
          </div>
          {!activeStages.length ? (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] p-6 text-center">
              <Clock className="w-8 h-8 mx-auto text-[var(--text-primary)]/20 mb-2" />
              <p className="text-[14px] text-[var(--text-primary)]/40">Нет этапов в работе</p>
            </div>
          ) : (
            <div className="space-y-4">
              {parallelGroups.map((group, gi) => (
                <div key={gi}>
                  {group.length > 1 && (
                    <div className="flex items-center gap-2 mb-2.5 px-1">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[13px] font-medium text-blue-300/70">Параллельное выполнение</span>
                      <div className="flex-1 h-px bg-blue-400/15" />
                    </div>
                  )}
                  <div className={group.length > 1 ? 'grid md:grid-cols-2 gap-3 pl-2 border-l-2 border-blue-400/20' : ''}>
                    {group.map(cur => {
                      const resp = cur.responsible_id ? responsibles[cur.responsible_id] : null;
                      const fo = isFactOverPlan(cur);
                      const ov = overrunDays(cur);
                      const fs = cur.started_at ? parseDate(cur.started_at) : null;
                      const fd = fs ? daysB(fs, TODAY) : 0;
                      return (
                        <button
                          key={cur.id}
                          onClick={() => onSelect(cur)}
                          className={`w-full text-left rounded-2xl border bg-[var(--hover-2)] p-5 hover:bg-[var(--hover-1)] transition-colors ${fo ? 'border-[var(--accent)]/30' : 'border-[var(--border-color)]'}`}
                        >
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <Badge order={cur.execution_order} />
                            <Chip status={cur.status} />
                            {fo && (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2 py-0.5 text-[14px] font-semibold text-[var(--accent)]">
                                <AlertTriangle className="w-3 h-3" /> +{ov} дн.
                              </span>
                            )}
                          </div>
                          <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">{cur.name}</h2>
                          <p className="text-[14px] text-[var(--text-primary)]/50 line-clamp-2 mb-3">{cur.description || 'Без описания'}</p>
                          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--border-color)]">
                            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)]/35 uppercase tracking-wider mb-1">Плановые сроки</p>
                              <p className="text-[13px] text-[var(--text-primary)]/70">{fmtShort(cur.planned_start)} — {fmtShort(cur.planned_end)}</p>
                            </div>
                            <div className={`rounded-lg border p-2.5 ${fo ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)]/30' : 'border-[var(--border-color)] bg-[var(--bg-card)]'}`}>
                              <p className={`text-[13px] font-semibold uppercase tracking-wider mb-1 ${fo ? 'text-[var(--accent)]/90' : 'text-[var(--text-primary)]/35'}`}>Фактически</p>
                              <p className={`text-[13px] ${fo ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-primary)]/70'}`}>
                                {fmtShort(cur.started_at?.slice(0, 10) ?? null)} — {fmtToday()}
                              </p>
                              <p className={`text-[14px] mt-0.5 ${fo ? 'text-[var(--accent)]/70' : 'text-[var(--text-primary)]/40'}`}>{fd} дн.</p>
                            </div>
                          </div>
                          {resp && (
                            <div className="flex items-center gap-2 mt-3">
                              <Ava name={resp.full_name} size="sm" />
                              <div className="min-w-0">
                                <p className="text-[13px] text-[var(--text-primary)]/60 truncate">{resp.full_name}</p>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {(onHoldStages.length > 0 || overdueStages.length > 0) && (
          <div className="grid md:grid-cols-2 gap-5">
            {overdueStages.length > 0 && (
              <div className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]/10 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="text-[16px] font-bold text-[var(--accent)]">Отставание от графика</h3>
                </div>
                <div className="space-y-2">
                  {overdueStages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onSelect(s)}
                      className="w-full text-left rounded-xl border border-[var(--accent)]/15 bg-[var(--bg-card)] p-3.5 hover:bg-[var(--hover-1)] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge order={s.execution_order} />
                      </div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{s.name}</p>
                      <p className="text-[13px] text-[var(--accent)]/70 mt-1">
                        Срок до {fmtShort(s.planned_end)} · +{overrunDays(s)} дн.
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {onHoldStages.length > 0 && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <PauseCircle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-[16px] font-bold text-amber-300">Приостановлены</h3>
                </div>
                <div className="space-y-2">
                  {onHoldStages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onSelect(s)}
                      className="w-full text-left rounded-xl border border-amber-400/15 bg-[var(--bg-card)] p-3.5 hover:bg-[var(--hover-1)] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge order={s.execution_order} />
                      </div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{s.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {overrunCompleted.length > 0 && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[var(--text-primary)]/45" />
              <h3 className="text-[16px] font-bold text-[var(--text-primary)]">Завершены с отклонением</h3>
            </div>
            <div className="space-y-2">
              {overrunCompleted.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className="w-full text-left rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] p-3.5 hover:bg-[var(--hover-1)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge order={s.execution_order} />
                      <span className="text-[14px] font-semibold text-[var(--text-primary)]">{s.name}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--accent)]">
                      <AlertTriangle className="w-3.5 h-3.5" /> +{overrunDays(s)} дн.
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
          <h3 className="text-[18px] font-bold text-[var(--text-primary)] mb-5">Прогресс</h3>
          <div className="flex justify-center mb-5">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
                <circle cx="50" cy="50" r="42" stroke="var(--hover-3)" strokeWidth="10" fill="none" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="var(--accent)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct / 100) }}
                  transition={{ duration: 1 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[28px] font-bold text-[var(--text-primary)]">{pct}%</span>
                <span className="text-[14px] text-[var(--text-primary)]/40">{done}/{total}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              { l: 'Завершено', v: done, c: 'bg-emerald-500' },
              { l: 'В работе', v: activeStages.length, c: 'bg-blue-500' },
              { l: 'Приостановлено', v: onHoldStages.length, c: 'bg-amber-500' },
              { l: 'Запланировано', v: stages.filter(s => s.status === 'planned').length, c: 'bg-slate-400' },
              { l: 'С отклонением', v: overdueStages.length, c: 'bg-[var(--accent)]' }
            ].filter(r => r.v > 0).map(r => (
              <div key={r.l} className="flex items-center justify-between text-[14px]">
                <span className="inline-flex items-center gap-2 text-[var(--text-primary)]/65">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.c}`} /> {r.l}
                </span>
                <span className="font-semibold text-[var(--text-primary)]">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
        {(() => {
          const next = sortOrd(stages.filter(s => s.status === 'planned'))[0];
          if (!next) return null;
          return (
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Flag className="w-4 h-4 text-[var(--text-primary)]/40" /> Далее
              </h3>
              <button
                onClick={() => onSelect(next)}
                className="w-full text-left rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] p-3.5 hover:bg-[var(--hover-1)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Badge order={next.execution_order} />
                  <Chip status="planned" />
                </div>
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">{next.name}</p>
                <p className="text-[13px] text-[var(--text-primary)]/45 mt-1">
                  {fmtShort(next.planned_start)} — {fmtShort(next.planned_end)}
                </p>
              </button>
            </div>
          );
        })()}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ROADMAP
   ════════════════════════════════════════════════════════════════ */

type GraphCol = ProjectStageResponse[];

function buildGraphColumns(stages: ProjectStageResponse[]): GraphCol[] {
  const ord = sortOrd(stages);
  const cols: GraphCol[] = [];
  const placed = new Set<string>();
  for (const s of ord) {
    if (placed.has(s.id)) continue;
    if (isRunning(s)) {
      const siblings = ord.filter(
        o => !placed.has(o.id) && o.id !== s.id && isRunning(o) && stagesOverlap(s, o)
      );
      if (siblings.length > 0) {
        const group = [s, ...siblings];
        group.forEach(g => placed.add(g.id));
        cols.push(group);
        continue;
      }
    }
    placed.add(s.id);
    cols.push([s]);
  }
  return cols;
}

const NODE_R = 30;
const NODE_D = NODE_R * 2;
const CARD_W = 190;
const COL_W = CARD_W + 60;
const ROW_GAP = 260;
const TOP_PAD = 50;
const BOTTOM_PAD = 160;

interface NodePos {
  id: string;
  cx: number;
  cy: number;
  col: number;
  row: number;
  stage: ProjectStageResponse;
}

function RoadmapView({ stages, responsibles, onSelect }: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (s: ProjectStageResponse) => void;
}) {
  const columns = useMemo(() => buildGraphColumns(stages), [stages]);

  const { nodes, edges, svgW, svgH } = useMemo(() => {
    const colCount = columns.length;
    const maxRows = Math.max(...columns.map(c => c.length), 1);
    const graphW = colCount * COL_W;
    const leftPad = COL_W / 2;
    const ns: NodePos[] = [];

    columns.forEach((col, ci) => {
      const colCx = leftPad + ci * COL_W;
      const colH = (col.length - 1) * ROW_GAP;
      const totalH = (maxRows - 1) * ROW_GAP;
      const startY = TOP_PAD + NODE_R + (totalH - colH) / 2;
      col.forEach((s, ri) => {
        ns.push({ id: s.id, cx: colCx, cy: startY + ri * ROW_GAP, col: ci, row: ri, stage: s });
      });
    });

    const es: { from: NodePos; to: NodePos; done: boolean }[] = [];
    for (let ci = 0; ci < colCount - 1; ci++) {
      const fromN = ns.filter(n => n.col === ci);
      const toN = ns.filter(n => n.col === ci + 1);
      for (const f of fromN) {
        for (const t of toN) {
          es.push({ from: f, to: t, done: f.stage.status === 'completed' });
        }
      }
    }

    const w = graphW + 20;
    const h = TOP_PAD + (maxRows - 1) * ROW_GAP + NODE_D + BOTTOM_PAD;

    return { nodes: ns, edges: es, svgW: Math.max(w, 600), svgH: Math.max(h, 380) };
  }, [columns]);

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
        <MapIcon className="w-12 h-12 mx-auto text-[var(--text-primary)]/15 mb-3" />
        <p className="text-[15px] text-[var(--text-primary)]/45">Нет этапов</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center gap-3 flex-wrap">
        <MapIcon className="w-5 h-5 text-[var(--text-primary)]/45" />
        <h3 className="text-[18px] font-bold text-[var(--text-primary)]">Карта проекта</h3>
        {columns.some(c => c.length > 1) && (
          <span className="text-[13px] text-[var(--text-primary)]/70 ml-2 inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Параллельные этапы в работе
          </span>
        )}
      </div>
      <div className="overflow-x-auto overflow-y-auto p-6" style={{ maxHeight: 750 }}>
        <div className="relative mx-auto" style={{ width: svgW, height: svgH, minWidth: svgW }}>
          <svg className="absolute inset-0 pointer-events-none" width={svgW} height={svgH}>
            <defs>
              <marker id="arr-ok" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#10b981" />
              </marker>
              <marker id="arr-wait" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#475569" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const x1 = e.from.cx + NODE_R + 4;
              const y1 = e.from.cy;
              const x2 = e.to.cx - NODE_R - 12;
              const y2 = e.to.cy;
              const straight = Math.abs(y1 - y2) < 5;
              const mx = (x1 + x2) / 2;
              const d = straight ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
              return (
                <motion.path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={e.done ? '#10b981' : '#475569'}
                  strokeWidth={e.done ? 2.5 : 1.5}
                  strokeDasharray={e.done ? undefined : '6 4'}
                  markerEnd={e.done ? 'url(#arr-ok)' : 'url(#arr-wait)'}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: e.done ? 0.65 : 0.3 }}
                  transition={{ delay: 0.15 + i * 0.03, duration: 0.45 }}
                />
              );
            })}
          </svg>
          {nodes.map((n, ni) => {
            const s = n.stage;
            const st = effStatus(s);
            const m = STATUS_CFG[st];
            const I = m.icon;
            const cur = s.status === 'active';
            const resp = s.responsible_id ? responsibles[s.responsible_id] : null;
            const fo = isFactOverPlan(s);
            const ov = overrunDays(s);
            return (
              <motion.div
                key={s.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08 + ni * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute"
                style={{ left: n.cx - NODE_R, top: n.cy - NODE_R, zIndex: 10 }}
              >
                {cur && (
                  <span className="absolute rounded-full bg-blue-500/15 animate-ping" style={{ width: NODE_D, height: NODE_D }} />
                )}
                <button
                  onClick={() => onSelect(s)}
                  className={`relative z-10 rounded-full flex items-center justify-center text-white font-bold text-[15px] ${m.bar} ${cur ? `ring-4 ${m.ring}` : ''} hover:scale-110 transition-transform`}
                  style={{ width: NODE_D, height: NODE_D, boxShadow: 'var(--shadow-md)' }}
                >
                  {String(s.execution_order).padStart(2, '0')}
                  <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center">
                    <I className={`w-3.5 h-3.5 ${m.text}`} />
                  </span>
                </button>
                <button
                  onClick={() => onSelect(s)}
                  className={`absolute rounded-xl border bg-[var(--bg-card)] p-3 hover:bg-[var(--hover-1)] transition-colors text-left ${fo ? 'border-[var(--accent)]/25' : 'border-[var(--border-color)]'}`}
                  style={{ top: NODE_D + 12, left: '50%', transform: 'translateX(-50%)', width: CARD_W, boxShadow: 'var(--shadow-sm)' }}
                >
                  <h4 className="text-[13px] font-bold text-[var(--text-primary)] leading-5 line-clamp-2 mb-1.5">{s.name}</h4>
                  <p className={`text-[14px] font-medium ${m.text}`}>{m.label}</p>
                  <div className="flex items-center gap-1.5 mt-2 text-[13px] text-[var(--text-primary)]/40">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    {(() => {
                      const actualEnd = getActualEnd(s);
                      const isOver = fo;
                      if (isOver && actualEnd) {
                        return (
                          <div className="space-y-1">
                            <div className="text-[13px] text-red-500">
                              {fmtShort(s.started_at?.slice(0, 10) ?? null)} — {actualEnd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                            </div>
                            <div className="text-[13px] text-red-500">+{ov} дн.</div>
                            <div className="text-[12px] text-[var(--text-primary)]/65">
                              План до <span className='text-green-400'>{fmtShort(s.planned_end)}</span>
                            </div>
                          </div>
                        );
                      }
                      return <span className="text-green-400">{fmtShort(s.planned_start)} — {fmtShort(s.planned_end)}</span>;
                    })()}
                  </div>
                  {resp && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--border-color)]">
                      <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                        {getInitials(resp.full_name)}
                      </div>
                      <span className="text-[13px] text-[var(--text-primary)]/65 truncate">{resp.full_name}</span>
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

/* ════════════════════════════════════════════════════════════════
   TIMELINE
   ════════════════════════════════════════════════════════════════ */

function TimelineView({ stages, responsibles, projectId, onSelect }: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  projectId: string;
  onSelect: (s: ProjectStageResponse) => void;
}) {
  const [sc, setSc] = useState<TimelineScale>('weeks');
  const ord = useMemo(() => sortOrd(stages.filter(s => s.planned_start && s.planned_end)), [stages]);
  const { minD, maxD, totalD } = useMemo(() => {
    if (!ord.length) return { minD: TODAY, maxD: TODAY, totalD: 30 };
    const ds = ord.flatMap(s => [parseDate(s.planned_start)!, parseDate(s.planned_end)!]);
    ord.forEach(s => { const ae = getActualEnd(s); if (ae) ds.push(ae); });
    const mn = new Date(Math.min(...ds.map(d => d.getTime())));
    const mx = new Date(Math.max(...ds.map(d => d.getTime())));
    mn.setDate(mn.getDate() - 2);
    mx.setDate(mx.getDate() + 2);
    return { minD: mn, maxD: mx, totalD: daysB(mn, mx) + 1 };
  }, [ord]);

  const dW = sc === 'days' ? 42 : sc === 'weeks' ? 18 : 8;
  const tW = totalD * dW;

  const ticks = useMemo(() => {
    const r: { date: Date; label: string; major: boolean }[] = [];
    const c = new Date(minD);
    while (c <= maxD) {
      if (sc === 'days') {
        r.push({ date: new Date(c), label: c.getDate().toString().padStart(2, '0'), major: c.getDate() === 1 });
        c.setDate(c.getDate() + 1);
      } else if (sc === 'weeks') {
        if (c.getDay() === 1 || !r.length)
          r.push({ date: new Date(c), label: c.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), major: c.getDate() <= 7 });
        c.setDate(c.getDate() + 1);
      } else {
        if (c.getDate() === 1 || !r.length)
          r.push({ date: new Date(c), label: c.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }), major: true });
        c.setDate(c.getDate() + 1);
      }
    }
    return r;
  }, [minD, maxD, sc]);

  const tOff = daysB(minD, TODAY) * dW;
  const showT = TODAY >= minD && TODAY <= maxD;

  if (!ord.length) {
    return <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center"><p className="text-[15px] text-[var(--text-primary)]/45">Нет этапов с датами</p></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[18px] font-bold text-[var(--text-primary)]">Хронология</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportTimelineToExcel(ord, responsibles, projectId)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-2.5 text-[14px] font-medium text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] transition-colors"
          >
            <FileText className="w-4 h-4" /> Экспорт в Excel
          </button>
          <div className="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] p-1">
            {(['days', 'weeks', 'months'] as TimelineScale[]).map((s) => (
              <button
                key={s}
                onClick={() => setSc(s)}
                className={`px-3 py-2 rounded-lg text-[14px] font-medium transition-colors ${sc === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]'}`}
              >
                {{ days: 'Дни', weeks: 'Недели', months: 'Месяцы' }[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="w-[300px] flex-shrink-0 border-r border-[var(--border-color)]">
          <div className="h-12 border-b border-[var(--border-color)] px-4 flex items-center bg-[var(--hover-1)]">
            <span className="text-[13px] font-medium text-[var(--text-primary)]/45">Этап</span>
          </div>
          {ord.map(s => {
            const st = effStatus(s);
            const fo = isFactOverPlan(s);
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className={`w-full h-16 px-4 border-b border-[var(--border-color)] flex items-center gap-3 hover:bg-[var(--hover-1)] transition-colors text-left ${fo ? 'bg-[var(--accent-soft)]/10' : ''}`}
              >
                <Badge order={s.execution_order} />
                <span className={`w-2 h-2 rounded-full ${STATUS_CFG[st].dot}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-[14px] text-[var(--text-primary)] truncate block">{s.name}</span>
                  {fo && (
                    <span className="text-[14px] text-[var(--accent)] font-medium flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3 h-3" /> +{overrunDays(s)} дн.
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div style={{ width: tW, minWidth: '100%' }} className="relative">
            <div className="h-12 border-b border-[var(--border-color)] bg-[var(--hover-1)] relative">
              {ticks.map((t, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center" style={{ left: daysB(minD, t.date) * dW }}>
                  <span className={`text-[13px] px-1.5 ${t.major ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-primary)]/40'}`}>{t.label}</span>
                </div>
              ))}
            </div>
            <div className="relative">
              <div className="absolute inset-0 pointer-events-none">
                {ticks.map((t, i) => (
                  <div key={i} className={`absolute top-0 bottom-0 w-px ${t.major ? 'bg-[var(--border-color)]' : 'bg-[var(--border-color)]/50'}`} style={{ left: daysB(minD, t.date) * dW }} />
                ))}
              </div>
              {showT && (
                <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: tOff }}>
                  <div className="w-0.5 h-full bg-[var(--accent)]" />
                  <span className="absolute top-0 left-1 rounded bg-[var(--accent)] px-2 py-1 text-[13px] font-semibold text-white whitespace-nowrap">Сегодня</span>
                </div>
              )}
              {ord.map((s, idx) => {
                const st = effStatus(s);
                const m = STATUS_CFG[st];
                const ps = parseDate(s.planned_start)!;
                const pe = parseDate(s.planned_end)!;
                const sO = daysB(minD, ps) * dW;
                const wP = (daysB(ps, pe) + 1) * dW;
                const fo = isFactOverPlan(s);
                const ae = getActualEnd(s);
                const owW = fo && ae ? daysB(pe, ae) * dW : 0;
                return (
                  <div key={s.id} className="h-16 border-b border-[var(--border-color)] relative">
                    <motion.button
                      onClick={() => onSelect(s)}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: wP, opacity: 1 }}
                      transition={{ delay: idx * 0.05, duration: 0.35 }}
                      whileHover={{ scale: 1.01 }}
                      className={`absolute top-1/2 -translate-y-1/2 h-9 flex items-center px-3 text-white text-[13px] font-medium overflow-hidden ${m.bar} ${fo ? 'rounded-l-xl' : 'rounded-xl'} ${st === 'overdue' && !fo ? `ring-2 ${m.ring}` : ''}`}
                      style={{ left: sO, boxShadow: 'var(--shadow-md)' }}
                    >
                      {st === 'overdue' && !fo && <AlertTriangle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />}
                      <span className="truncate">#{String(s.execution_order).padStart(2, '0')} · {s.name}</span>
                    </motion.button>
                    {fo && owW > 0 && (
                      <motion.button
                        onClick={() => onSelect(s)}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: owW, opacity: 1 }}
                        transition={{ delay: idx * 0.05 + 0.2, duration: 0.3 }}
                        className="absolute top-1/2 -translate-y-1/2 h-9 rounded-r-xl flex items-center px-2 bg-[var(--accent)] text-white text-[14px] font-bold overflow-hidden ring-2 ring-[var(--accent)]/25"
                        style={{ left: sO + wP, boxShadow: 'var(--shadow-md)' }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                        {owW > 50 && <span className="truncate">+{overrunDays(s)} дн.</span>}
                      </motion.button>
                    )}
                    {fo && ae && (
                      <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[13px] font-medium text-[var(--accent)]" style={{ left: sO + wP + owW + 6 }}>
                        {s.completed_at ? fmtShort(s.completed_at.slice(0, 10)) : 'н.в.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   BOARD
   ════════════════════════════════════════════════════════════════ */

function BoardView({ stages, responsibles, onSelect, onMoveStage }: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (s: ProjectStageResponse) => void;
  onMoveStage: (stageId: string, newStatus: ProjectStageStatus) => void;
}) {
  const cols: ProjectStageStatus[] = ['planned', 'active', 'on_hold', 'completed', 'skipped'];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ProjectStageStatus | null>(null);

  const grouped = useMemo(() => {
    const m: Record<ProjectStageStatus, ProjectStageResponse[]> = { planned: [], active: [], on_hold: [], completed: [], skipped: [] };
    sortOrd(stages).forEach(s => m[s.status].push(s));
    return m;
  }, [stages]);

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
        <Milestone className="w-12 h-12 mx-auto text-[var(--text-primary)]/15 mb-3" />
        <p className="text-[15px] text-[var(--text-primary)]/45">Нет этапов</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 xl:grid-cols-5 md:grid-cols-2 grid-cols-1">
      {cols.map(col => {
        const m = STATUS_CFG[col];
        const I = m.icon;
        const items = grouped[col];
        const isO = overCol === col;
        return (
          <div
            key={col}
            onDragOver={e => { e.preventDefault(); setOverCol(col); }}
            onDragLeave={() => setOverCol(null)}
            onDrop={() => {
              if (dragId) {
                const s = stages.find(s => s.id === dragId);
                if (s && s.status !== col) onMoveStage(dragId, col);
              }
              setDragId(null);
              setOverCol(null);
            }}
            className={`rounded-2xl border-2 bg-[var(--bg-card)] flex flex-col min-h-[400px] transition-all duration-200 ${isO ? 'border-[var(--accent)] bg-[var(--accent-soft)]/30 scale-[1.01]' : 'border-transparent'}`}
          >
            <div className="px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--hover-1)] rounded-t-2xl flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2">
                <I className={`w-4 h-4 ${m.text}`} />
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{m.label}</h3>
              </div>
              <span className="min-w-[28px] h-7 rounded-full border border-[var(--border-color)] bg-[var(--hover-2)] px-2 text-[13px] font-semibold text-[var(--text-primary)]/50 flex items-center justify-center">
                {items.length}
              </span>
            </div>
            <div className="p-3 flex-1 space-y-2.5 overflow-y-auto">
              {!items.length ? (
                <div className={`h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors ${isO ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/20 text-[var(--accent)]/60' : 'border-[var(--border-color)] text-[var(--text-primary)]/25'}`}>
                  <Milestone className="w-6 h-6 mb-1.5" />
                  <span className="text-[13px]">{isO ? 'Отпустите' : 'Пусто'}</span>
                </div>
              ) : items.map(stage => {
                const resp = stage.responsible_id ? responsibles[stage.responsible_id] : null;
                const eff = effStatus(stage);
                const isDr = dragId === stage.id;
                const cb = eff === 'overdue' ? STATUS_CFG.overdue.border : m.border;
                return (
                  <motion.div
                    key={stage.id}
                    layout
                    draggable
                    onDragStart={e => {
                      setDragId(stage.id);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    whileHover={{ y: -2 }}
                    className={`rounded-2xl border bg-[var(--hover-2)] p-4 cursor-grab active:cursor-grabbing transition-all select-none ${cb} ${isDr ? 'opacity-40 scale-95 rotate-1 ring-2 ring-[var(--accent)]/30' : ''}`}
                    style={{ boxShadow: 'var(--shadow-md)' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Badge order={stage.execution_order} />
                      <div className="flex items-center gap-1.5">
                        {eff === 'overdue' && <AlertTriangle className="w-4 h-4 text-[var(--accent)]" />}
                        <button
                          onClick={e => { e.stopPropagation(); onSelect(stage); }}
                          className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)]/35 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <button onClick={() => onSelect(stage)} className="text-left w-full">
                      <h4 className="text-[15px] font-semibold text-[var(--text-primary)] leading-6 mb-2">{stage.name}</h4>
                      <p className="text-[14px] text-[var(--text-primary)]/45 line-clamp-2 leading-5 mb-3">{stage.description || 'Без описания'}</p>
                    </button>
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-color)]">
                      {resp ? (
                        <div className="inline-flex items-center gap-2 min-w-0">
                          <Ava name={resp.full_name} size="sm" />
                          <span className="text-[13px] text-[var(--text-primary)]/55 truncate">{resp.full_name.split(' ')[0]}</span>
                        </div>
                      ) : <span className="text-[13px] text-[var(--text-primary)]/40">Не назначен</span>}
                      <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-primary)]/40 flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5" /> {fmtShort(stage.planned_end)}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {dragId && items.length > 0 && (
                <div className={`h-16 rounded-2xl border-2 border-dashed flex items-center justify-center transition-colors ${isO ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/20 text-[var(--accent)]/60' : 'border-[var(--border-color)]/50 text-[var(--text-primary)]/20'}`}>
                  <span className="text-[13px]">{isO ? 'Отпустите' : 'Перетащите сюда'}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ANALYTICS
   ════════════════════════════════════════════════════════════════ */

function AnalyticsView({ stages }: { stages: ProjectStageResponse[] }) {
  const t = stages.length;
  const done = stages.filter(s => s.status === 'completed').length;
  const act = stages.filter(s => s.status === 'active').length;
  const over = stages.filter(s => s.is_overdue && s.status !== 'completed' && s.status !== 'skipped').length;
  const wO = stages.filter(s => isFactOverPlan(s)).length;
  const durs = stages.map(s => s.planned_duration_days).filter((d): d is number => d != null);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const tO = stages.reduce((s, x) => s + overrunDays(x), 0);

  const kpi = [
    { l: 'Всего этапов', v: t, i: Milestone },
    { l: 'Завершено', v: done, i: CheckCircle2, c: 'text-emerald-300', b: 'bg-emerald-500/10 border-emerald-400/15' },
    { l: 'В работе', v: act, i: PlayCircle, c: 'text-blue-300', b: 'bg-blue-500/10 border-blue-400/15' },
    { l: 'Отклонения', v: over, i: AlertTriangle, c: 'text-[var(--accent)]', b: 'bg-[var(--accent-soft)] border-[var(--accent)]/15' },
    { l: 'Ср. длительность', v: `${avg} дн.`, i: Clock, c: 'text-amber-300', b: 'bg-amber-500/10 border-amber-400/15' },
    { l: 'С превышением', v: wO, i: TrendingUp, c: 'text-orange-300', b: 'bg-orange-500/10 border-orange-400/15' },
    { l: 'Итого превыш.', v: `${tO} дн.`, i: AlertTriangle, c: 'text-[var(--accent)]', b: 'bg-[var(--accent-soft)] border-[var(--accent)]/15' }
  ];

  if (!t) {
    return <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8"><p className="text-[15px] text-[var(--text-primary)]/45">Нет данных</p></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7 grid-cols-2">
        {kpi.map((k, i) => (
          <motion.div
            key={k.l}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-2xl border p-4 ${k.b ?? 'bg-[var(--bg-card)] border-[var(--border-color)]'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] text-[var(--text-primary)]/45">{k.l}</p>
                <p className="mt-1 text-[24px] font-bold text-[var(--text-primary)]">{k.v}</p>
              </div>
              <div className={`w-11 h-11 rounded-2xl border border-[var(--border-color)]/40 bg-[var(--bg-card)] flex items-center justify-center ${k.c ?? 'text-[var(--text-primary)]/60'}`}>
                <k.i className="w-5 h-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      {stages.some(s => s.started_at) && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
            <h3 className="text-[16px] font-bold text-[var(--text-primary)]">Сроки и исполнение</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">Этап</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">Плановые сроки</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">Фактические сроки</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">План</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">Факт</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]/45">Δ</th>
                </tr>
              </thead>
              <tbody>
                {sortOrd(stages).filter(s => s.started_at).map(s => {
                  const ps = parseDate(s.planned_start);
                  const pe = parseDate(s.planned_end);
                  const fs = parseDate(s.started_at);
                  const fe = getActualEnd(s);
                  const pd = ps && pe ? daysB(ps, pe) + 1 : null;
                  const fd = fs && fe ? daysB(fs, fe) + 1 : null;
                  const d = pd != null && fd != null ? fd - pd : null;
                  const ov = d != null && d > 0;
                  return (
                    <tr key={s.id} className={`border-b border-[var(--border-color)] ${ov ? 'bg-[var(--accent-soft)]/10' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge order={s.execution_order} />
                          <span className="text-[14px] text-[var(--text-primary)]">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[14px] text-[var(--text-primary)]/60 whitespace-nowrap">
                        {fmtShort(s.planned_start)} — {fmtShort(s.planned_end)}
                      </td>
                      <td className="px-4 py-3 text-[14px] whitespace-nowrap">
                        <span className={ov ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-primary)]/60'}>
                          {fmtShort(s.started_at?.slice(0, 10) ?? null)} — {s.completed_at ? fmtShort(s.completed_at.slice(0, 10)) : 'н.в.'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[14px] text-[var(--text-primary)]/60">{pd ?? '—'}</td>
                      <td className={`px-4 py-3 text-[14px] font-medium ${ov ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/60'}`}>{fd ?? '—'}</td>
                      <td className="px-4 py-3">
                        {d != null ? (
                          <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${d > 0 ? 'text-[var(--accent)]' : d < 0 ? 'text-emerald-400' : 'text-[var(--text-primary)]/40'}`}>
                            {d > 0 && <AlertTriangle className="w-3 h-3" />}
                            {d > 0 ? `+${d} дн.` : d === 0 ? 'в срок' : `${d} дн.`}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAGE DETAIL / EDIT
   ════════════════════════════════════════════════════════════════ */

function StageDetail({ stage, responsible, responsibles, totalStages, onBack, onSave, onDelete, onStart, onComplete, onSkip }: {
  stage: ProjectStageResponse;
  responsible: StageResponsible | null;
  responsibles: Record<string, StageResponsible>;
  totalStages: number;
  onBack: () => void;
  onSave: (id: string, p: StageUpsertPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onSkip: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StageForm>(stageToForm(stage));
  const [action, setAction] = useState<null | string>(null);

  useEffect(() => {
    setForm(stageToForm(stage));
    setEditing(false);
  }, [stage.id, stage.updated_at]);

  const upd = <K extends keyof StageForm>(k: K, v: StageForm[K]) => setForm(p => ({ ...p, [k]: v }));
  const iC = 'w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder-white/20 outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all';
  const lC = 'block text-[13px] font-medium text-[var(--text-primary)]/50 mb-2';
  const eff = effStatus(stage);
  const isOv = eff === 'overdue';
  const fo = isFactOverPlan(stage);
  const ov = overrunDays(stage);
  const canSt = stage.status === 'planned' || stage.status === 'on_hold';
  const canCo = stage.status === 'active';
  const canSk = stage.status === 'planned' || stage.status === 'on_hold';
  const rOpts = Object.values(responsibles).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
  const ps = parseDate(stage.planned_start);
  const pe = parseDate(stage.planned_end);
  const fs = stage.started_at ? parseDate(stage.started_at) : null;
  const fe = getActualEnd(stage);
  const pD = ps && pe ? daysB(ps, pe) + 1 : null;
  const fD = fs && fe ? daysB(fs, fe) + 1 : null;

  const hSave = async () => {
    const p = formToPayload(form);
    if (!p.name) return;
    setSaving(true);
    try {
      await onSave(stage.id, p);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const hAct = async (t: string, fn: (id: string) => Promise<void>) => {
    setAction(t);
    try { await fn(stage.id); } finally { setAction(null); }
  };

  const hDel = async () => {
    if (!confirm(`Удалить этап «${stage.name}»?`)) return;
    setAction('delete');
    try { await onDelete(stage.id); } finally { setAction(null); }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Назад к этапам
      </button>
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 md:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <Badge order={stage.execution_order} />
              <Chip status={stage.status} />
              {isOv && <Chip status="overdue" />}
              {fo && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--accent)]">
                  <AlertTriangle className="w-3.5 h-3.5" /> Отклонение: +{ov} дн.
                </span>
              )}
            </div>
            <h1 className="text-[26px] md:text-[30px] font-bold text-[var(--text-primary)] leading-tight">{stage.name}</h1>
            <p className="mt-3 text-[15px] leading-7 text-[var(--text-primary)]/60 max-w-3xl whitespace-pre-wrap">{stage.description || 'Описание не заполнено'}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-[14px] font-medium text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] transition-colors"
              >
                <PenSquare className="w-4 h-4" /> Редактировать
              </button>
            )}
          </div>
        </div>
      </div>
      {editing ? (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 md:p-8 space-y-6">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">Редактирование</h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={lC}>Название</label>
              <input value={form.name} onChange={e => upd('name', e.target.value)} className={iC} />
            </div>
            <div>
              <label className={lC}>Номер</label>
              <input type="number" min={1} value={form.order} onChange={e => upd('order', e.target.value)} className={iC} />
            </div>
            <div>
              <label className={lC}>Статус</label>
              <Select value={form.status} onValueChange={e => upd('status', e as ProjectStageStatus)}>
                <SelectTrigger className={iC}><SelectValue placeholder="Выберите статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Запланирован</SelectItem>
                  <SelectItem value="active">В работе</SelectItem>
                  <SelectItem value="on_hold">На паузе</SelectItem>
                  <SelectItem value="completed">Завершён</SelectItem>
                  <SelectItem value="skipped">Пропущен</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lC}>Плановое начало</label>
              <input type="date" value={form.planned_start} onChange={e => upd('planned_start', e.target.value)} className={iC} />
            </div>
            <div>
              <label className={lC}>Плановое окончание</label>
              <input type="date" value={form.planned_end} onChange={e => upd('planned_end', e.target.value)} className={iC} />
            </div>
            <div>
              <label className={lC}>Длительность</label>
              <input type="number" min={1} value={form.planned_duration_days} onChange={e => upd('planned_duration_days', e.target.value)} className={iC} />
            </div>
            <div>
              <label className={lC}>Ответственный</label>
              <Select value={form.responsible_id} onValueChange={e => upd('responsible_id', e.target.value)}>
                <SelectTrigger className={iC}><SelectValue placeholder="Выберите ответственного" /></SelectTrigger>
                <SelectContent>
                  {rOpts.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}{p.role ? ` — ${p.role}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className={lC}>Описание</label>
              <textarea value={form.description} onChange={e => upd('description', e.target.value)} className={`${iC} min-h-[140px] resize-y`} />
            </div>
            <div className="md:col-span-2">
              <label className={lC}>Критерии приёмки</label>
              <textarea value={form.completion_criteria} onChange={e => upd('completion_criteria', e.target.value)} className={`${iC} min-h-[140px] resize-y`} placeholder={'Утверждено ТЗ\nПройдены тесты'} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border-color)] flex-wrap">
            <button
              onClick={hDel}
              disabled={action === 'delete'}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-4 py-3 text-[14px] font-medium text-[var(--accent)] disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> {action === 'delete' ? 'Удаляем…' : 'Удалить'}
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => { setEditing(false); setForm(stageToForm(stage)); }}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-[14px] font-medium text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={hSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className={`rounded-2xl border p-6 ${fo ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)]/10' : 'border-[var(--border-color)] bg-[var(--bg-card)]'}`}>
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-5 inline-flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--text-primary)]/45" /> Сроки и исполнение
                {fo && <span className="text-[13px] font-semibold text-[var(--accent)] ml-2">+{ov} дн.</span>}
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-blue-400/20 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-[14px] font-bold text-blue-300/70 uppercase tracking-wider">Плановые сроки</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Начало</p>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{fmtDate(stage.planned_start)}</p>
                    </div>
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Окончание</p>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{fmtDate(stage.planned_end)}</p>
                    </div>
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Длительность</p>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{pD != null ? `${pD} дн.` : '—'}</p>
                    </div>
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${fo ? 'border-[var(--accent)]/25 bg-[var(--accent)]/5' : 'border-emerald-400/20 bg-emerald-500/5'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${fo ? 'bg-[var(--accent)]' : 'bg-emerald-500'}`} />
                    <span className={`text-[14px] font-bold uppercase tracking-wider ${fo ? 'text-[var(--accent)]/70' : 'text-emerald-300/70'}`}>Фактически</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Начало</p>
                      <p className={`text-[14px] font-semibold ${stage.started_at ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>
                        {stage.started_at ? fmtDate(stage.started_at.slice(0, 10)) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Окончание</p>
                      <p className={`text-[14px] font-semibold ${fo ? 'text-[var(--accent)]' : stage.completed_at ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>
                        {stage.completed_at ? fmtDate(stage.completed_at.slice(0, 10)) : stage.started_at ? 'в работе' : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[14px] text-[var(--text-primary)]/35">Длительность</p>
                      <p className={`text-[14px] font-semibold ${fo ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                        {fD != null ? `${fD} дн.` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {pD != null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] text-[var(--text-primary)]/40 w-14 flex-shrink-0">Плановый</span>
                    <div className="flex-1 h-4 rounded-full bg-[var(--hover-2)] overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/60" style={{ width: '100%' }} />
                    </div>
                    <span className="text-[14px] text-[var(--text-primary)]/50 w-12 text-right">{pD} дн.</span>
                  </div>
                  {fD != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] text-[var(--text-primary)]/40 w-14 flex-shrink-0">Фактич.</span>
                      <div className="flex-1 h-4 rounded-full bg-[var(--hover-2)] overflow-hidden">
                        <div className="h-full rounded-full flex overflow-hidden" style={{ width: `${Math.min(150, (fD / pD) * 100)}%` }}>
                          <div className="h-full bg-emerald-500/60" style={{ width: `${Math.min(100, (pD / fD) * 100)}%` }} />
                          {fo && <div className="h-full bg-[var(--accent)]/70 flex-1" />}
                        </div>
                      </div>
                      <span className={`text-[14px] w-12 text-right font-medium ${fo ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/50'}`}>{fD} дн.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-5 inline-flex items-center gap-2">
                <User className="w-4 h-4 text-[var(--text-primary)]/45" /> Ответственный
              </h3>
              {responsible ? (
                <div className="flex items-center gap-4">
                  <Ava name={responsible.full_name} />
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">{responsible.full_name}</p>
                    {responsible.role && <p className="text-[14px] text-[var(--text-primary)]/50 mt-0.5">{responsible.role}</p>}
                    {responsible.email && <p className="text-[14px] text-[var(--text-primary)]/40 mt-0.5">{responsible.email}</p>}
                  </div>
                </div>
              ) : <p className="text-[14px] text-[var(--text-primary)]/40">Не назначен</p>}
            </div>
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-5 inline-flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-[var(--text-primary)]/45" /> Служебная информация
              </h3>
              <div className="space-y-3 text-[14px]">
                {[
                  { l: 'ID', v: stage.id, mono: true },
                  { l: 'Порядок', v: `Этап ${stage.execution_order} из ${totalStages}` },
                  { l: 'Создан', v: fmtDT(stage.created_at) },
                  { l: 'Обновлён', v: fmtDT(stage.updated_at) }
                ].map(r => (
                  <div key={r.l} className="flex justify-between gap-4">
                    <span className="text-[var(--text-primary)]/40">{r.l}</span>
                    <span className={`text-[var(--text-primary)]/70 ${r.mono ? 'font-mono text-[13px]' : ''} text-right break-all`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-5 inline-flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-[var(--text-primary)]/45" /> Критерии приёмки
              </h3>
              {!stage.completion_criteria.length ? (
                <p className="text-[14px] text-[var(--text-primary)]/40">Критерии не указаны</p>
              ) : (
                <div className="space-y-3">
                  {stage.completion_criteria.map((c, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Target className="w-4 h-4 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                      <span className="text-[14px] leading-6 text-[var(--text-primary)]/75">{c}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-5 inline-flex items-center gap-2">
                <Flag className="w-4 h-4 text-[var(--text-primary)]/45" /> Действия
              </h3>
              <div className="grid gap-3">
                {canSt && (
                  <button
                    onClick={() => hAct('start', onStart)}
                    disabled={!!action}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3.5 text-[14px] font-semibold text-white disabled:opacity-50"
                  >
                    <PlayCircle className="w-4 h-4" /> {action === 'start' ? 'Запускаем…' : 'Начать этап'}
                  </button>
                )}
                {canCo && (
                  <button
                    onClick={() => hAct('complete', onComplete)}
                    disabled={!!action}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-[14px] font-semibold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {action === 'complete' ? 'Завершаем…' : 'Завершить этап'}
                  </button>
                )}
                {canSk && (
                  <button
                    onClick={() => hAct('skip', onSkip)}
                    disabled={!!action}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3.5 text-[14px] font-medium text-[var(--text-primary)]/65 hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                  >
                    <SkipForward className="w-4 h-4" /> {action === 'skip' ? 'Пропускаем…' : 'Пропустить'}
                  </button>
                )}
                {!canSt && !canCo && !canSk && (
                  <p className="text-[14px] text-[var(--text-primary)]/40 text-center py-4">Нет доступных действий</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CREATE STAGE
   ════════════════════════════════════════════════════════════════ */

function CreateStage({ nextOrder, responsibles, onBack, onSubmit }: {
  nextOrder: number;
  responsibles: Record<string, StageResponsible>;
  onBack: () => void;
  onSubmit: (p: StageUpsertPayload) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StageForm>(emptyForm(nextOrder));
  const upd = <K extends keyof StageForm>(k: K, v: StageForm[K]) => setForm(p => ({ ...p, [k]: v }));
  const iC = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] px-3 py-2 text-[14px] text-[var(--text-primary)] placeholder-white/20 outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all';
  const lC = 'block text-[13px] font-medium text-[var(--text-primary)]/45 mb-1';
  const rOpts = Object.values(responsibles).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));

  const hSubmit = async () => {
    const p = formToPayload(form);
    if (!p.name) return;
    setSaving(true);
    try { await onSubmit(p); } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)]">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[var(--text-primary)]">Новый этап</h1>
            <p className="text-[14px] text-[var(--text-primary)]/45">Заполните информацию</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] px-3 py-2 text-[14px] text-[var(--text-primary)]/55 hover:text-[var(--text-primary)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={hSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> {saving ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Milestone className="w-4 h-4 text-[var(--text-primary)]/35" /> Основное
            </h3>
            <div className="space-y-3">
              <div>
                <label className={lC}>Название</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)} className={iC} placeholder="Тестирование" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lC}>Номер</label>
                  <input type="number" min={1} value={form.order} onChange={e => upd('order', e.target.value)} className={iC} />
                </div>
                <div>
                  <label className={lC}>Статус</label>
                  <Select value={form.status} onValueChange={e => upd('status', e as ProjectStageStatus)}>
                    <SelectTrigger className={iC}><SelectValue placeholder="Выберите статус" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Запланирован</SelectItem>
                      <SelectItem value="active">В работе</SelectItem>
                      <SelectItem value="on_hold">На паузе</SelectItem>
                      <SelectItem value="completed">Завершён</SelectItem>
                      <SelectItem value="skipped">Пропущен</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className={lC}>Ответственный</label>
                <Select value={form.responsible_id} onValueChange={e => upd('responsible_id', e.target.value)}>
                  <SelectTrigger className={iC}><SelectValue placeholder="Выберите ответственного" /></SelectTrigger>
                  <SelectContent>
                    {rOpts.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}{p.role ? ` — ${p.role}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--text-primary)]/35" /> Сроки
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lC}>Начало</label>
                  <input type="date" value={form.planned_start} onChange={e => upd('planned_start', e.target.value)} className={iC} />
                </div>
                <div>
                  <label className={lC}>Окончание</label>
                  <input type="date" value={form.planned_end} onChange={e => upd('planned_end', e.target.value)} className={iC} />
                </div>
              </div>
              <div>
                <label className={lC}>Длительность</label>
                <input type="number" min={1} value={form.planned_duration_days} onChange={e => upd('planned_duration_days', e.target.value)} className={iC} placeholder="—" />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--text-primary)]/35" /> Описание
          </h3>
          <textarea value={form.description} onChange={e => upd('description', e.target.value)} className={`${iC} min-h-[280px] resize-y`} placeholder="Задачи этапа" />
        </div>
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-[var(--text-primary)]/35" /> Критерии приёмки
          </h3>
          <p className="text-[13px] text-[var(--text-primary)]/40 mb-2">Каждый с новой строки</p>
          <textarea value={form.completion_criteria} onChange={e => upd('completion_criteria', e.target.value)} className={`${iC} min-h-[250px] resize-y`} placeholder={'Утверждено ТЗ\nПройдены тесты'} />
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION — ИНТЕГРАЦИЯ С API
   ════════════════════════════════════════════════════════════════ */

interface SectionProps {
  projectId: string; // ✅ Теперь обязательный проп
}

export function ProjectStagesSection({ projectId }: SectionProps) {
  const [stages, setStages] = useState<ProjectStageResponse[]>([]);
  const [responsibles, setResponsibles] = useState<Record<string, StageResponsible>>(MOCK_RESPONSIBLES);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>('table');
  const [screen, setScreen] = useState<SectionScreen>({ type: 'list' });
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ✅ Загрузка проекта с этапами
  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        const project = await projectsApi.getById(projectId);
        const sorted = [...project.stages].sort((a, b) => a.execution_order - b.execution_order);
        setStages(sorted);
      } catch (err) {
        console.error('Failed to load project:', err);
        push('Не удалось загрузить проект', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadProject();
  }, [projectId]);

  const push = useCallback((title: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, title, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const commit = useCallback((next: ProjectStageResponse[]) => {
    setStages(next);
  }, []);

  const selectedStage = useMemo(() =>
    screen.type === 'detail' ? stages.find(s => s.id === screen.stageId) ?? null : null,
    [stages, screen]
  );

  const goList = useCallback(() => setScreen({ type: 'list' }), []);
  const goDetail = useCallback((s: ProjectStageResponse) => setScreen({ type: 'detail', stageId: s.id, editing: false }), []);
  const goCreate = useCallback(() => setScreen({ type: 'create' }), []);

  // ✅ Создание — извлекаем stages из Project
  const handleCreate = useCallback(async (p: StageUpsertPayload) => {
    const apiPayload = {
      name: p.name,
      description: p.description || undefined,
      execution_order: p.order,
      planned_start: p.planned_start,
      planned_end: p.planned_end,
      responsible_id: p.responsible_id || undefined,
      completion_criteria: p.completion_criteria,
    };
    const prev = stages;
    try {
      const project = await projectsApi.createStage(projectId, apiPayload as any);
      const sorted = [...project.stages].sort((a, b) => a.execution_order - b.execution_order);
      commit(sorted);
      const newStage = sorted.find(s => s.name === p.name);
      setScreen({ type: 'detail', stageId: newStage?.id || sorted[sorted.length - 1].id, editing: false });
      push(`Этап «${p.name}» создан`, 'success');
    } catch {
      commit(prev);
      push('Не удалось создать', 'error');
    }
  }, [stages, commit, projectId, push]);

  // ✅ Обновление — извлекаем stages из Project
 // ✅ Исправленная версия
const handleUpdate = useCallback(async (sid: string, p: StageUpsertPayload) => {
  const cur = stages.find(s => s.id === sid);
  if (!cur) return;
  
  const apiPayload = {
    name: p.name,
    description: p.description || undefined,
    responsible_id: p.responsible_id,
    completion_criteria: p.completion_criteria,
    planned_start: p.planned_start,
    planned_end: p.planned_end,
  };
  
  const prev = stages;
  try {
    // ✅ API возвращает один этап, а не проект
    const updatedStage = await projectsApi.updateStage(projectId, sid, apiPayload as any);
    
    // ✅ Обновляем этап в текущем массиве
    const next = stages.map(s => s.id === sid ? { ...s, ...updatedStage } : s);
    const sorted = [...next].sort((a, b) => a.execution_order - b.execution_order);
    commit(sorted);
    
    push(`Этап «${p.name}» сохранён`, 'success');
  } catch (err) {
    console.error('Update stage error:', err);
    commit(prev);
    push('Не удалось сохранить', 'error');
  }
}, [stages, commit, projectId, push]);

  // ✅ Удаление — извлекаем stages из Project
  const handleDelete = useCallback(async (sid: string) => {
    const cur = stages.find(s => s.id === sid);
    if (!cur) return;
    const prev = stages;
    try {
      const project = await projectsApi.deleteStage(projectId, sid);
      const sorted = [...project.stages].sort((a, b) => a.execution_order - b.execution_order);
      commit(sorted);
      goList();
      push(`Этап «${cur.name}» удалён`, 'success');
    } catch {
      commit(prev);
      setScreen({ type: 'detail', stageId: sid, editing: false });
      push('Не удалось удалить', 'error');
    }
  }, [stages, commit, projectId, push, goList]);

  // ✅ Действия — извлекаем stages из Project
  const quickAction = useCallback(async (sid: string, type: 'start' | 'complete' | 'skip') => {
    const cur = stages.find(s => s.id === sid);
    if (!cur) return;
    const prev = stages;
    try {
      let project: Project;
      if (type === 'start') project = await projectsApi.startStage(projectId, sid);
      else if (type === 'complete') project = await projectsApi.completeStage(projectId, sid);
      else project = await projectsApi.skipStage(projectId, sid);
      const sorted = [...project.stages].sort((a, b) => a.execution_order - b.execution_order);
      commit(sorted);
      push(`Этап «${cur.name}» — ${STATUS_CFG[cur.status].label.toLowerCase()}`, 'success');
    } catch {
      commit(prev);
      push('Ошибка', 'error');
    }
  }, [stages, commit, projectId, push]);

  // ✅ Drag & Drop — извлекаем stages из Project
  const handleMoveStage = useCallback(async (stageId: string, newStatus: ProjectStageStatus) => {
    const cur = stages.find(s => s.id === stageId);
    if (!cur || cur.status === newStatus) return;
    const prev = stages;
    try {
      let project: Project;
      if (newStatus === 'active') project = await projectsApi.startStage(projectId, stageId);
      else if (newStatus === 'completed') project = await projectsApi.completeStage(projectId, stageId);
      else if (newStatus === 'skipped') project = await projectsApi.skipStage(projectId, stageId);
      else {
        const pl = { name: cur.name, description: cur.description, responsible_id: cur.responsible_id, completion_criteria: cur.completion_criteria };
        await projectsApi.updateStage(projectId, stageId, pl as any);
        project = await projectsApi.getById(projectId);
      }
      const sorted = [...project.stages].sort((a, b) => a.execution_order - b.execution_order);
      commit(sorted);
      push(`«${cur.name}» → ${STATUS_CFG[newStatus].label}`, 'success');
    } catch {
      commit(prev);
      push('Не удалось изменить статус', 'error');
    }
  }, [stages, commit, projectId, push]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {screen.type === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
              <ViewTabs view={view} onChange={setView} />
              {stages.length > 0 && view !== 'table' && (
                <button onClick={goCreate} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[14px] font-semibold text-white">
                  <Plus className="w-4 h-4" /> Создать
                </button>
              )}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                {view === 'table' && <TableView stages={stages} responsibles={responsibles} onSelect={goDetail} onCreate={goCreate} />}
                {view === 'overview' && <OverviewView stages={stages} responsibles={responsibles} onSelect={goDetail} />}
                {view === 'roadmap' && <RoadmapView stages={stages} responsibles={responsibles} onSelect={goDetail} />}
                {view === 'timeline' && <TimelineView stages={stages} responsibles={responsibles} projectId={projectId} onSelect={goDetail} />}
                {view === 'board' && <BoardView stages={stages} responsibles={responsibles} onSelect={goDetail} onMoveStage={handleMoveStage} />}
                {view === 'analytics' && <AnalyticsView stages={stages} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
        {screen.type === 'detail' && selectedStage && (
          <StageDetail
            key={selectedStage.id}
            stage={selectedStage}
            responsible={selectedStage.responsible_id ? responsibles[selectedStage.responsible_id] ?? null : null}
            responsibles={responsibles}
            totalStages={stages.length}
            onBack={goList}
            onSave={handleUpdate}
            onDelete={handleDelete}
            onStart={sid => quickAction(sid, 'start')}
            onComplete={sid => quickAction(sid, 'complete')}
            onSkip={sid => quickAction(sid, 'skip')}
          />
        )}
        {screen.type === 'create' && (
          <CreateStage key="create" nextOrder={stages.length + 1} responsibles={responsibles} onBack={goList} onSubmit={handleCreate} />
        )}
      </AnimatePresence>
      <Toasts toasts={toasts} onClose={id => setToasts(p => p.filter(t => t.id !== id))} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════ */
export default ProjectStagesSection;