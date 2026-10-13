// pages/ProjectStagesPage.tsx

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react';

import { createPortal } from 'react-dom';

import {
  motion,
  AnimatePresence,
} from 'framer-motion';

import {
  Calendar,
  Clock,
  CheckCircle2,
  PlayCircle,
  AlertTriangle,
  X,
  LayoutGrid,
  GanttChart,
  Map as MapIcon,
  BarChart3,
  Info,
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  Table as TableIcon,
  Milestone,
  Flag,
  PauseCircle,
  SkipForward,
  PenSquare,
  Save,
  ChevronRight,
  Plus,
  Trash2,
  ArrowLeft,
  Eye,
  User,
  Users,
  UserPlus,
  FileText,
  ListChecks,
  Settings2,
  Layers,
  TrendingUp,
  Loader2,
  Check,
} from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import exportTimelineToExcel from '../components/utils/exportTimelineToExcel';

import {
  projectsApi,
  usersApi,
} from '../api/client';

import { useAuthStore } from '../stores/authStore';

import type {
  Project,
  ProjectStageResponse,
  StageResponsible,
} from '../types';

/* ════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════ */

export type ProjectStageStatus =
  | 'planned'
  | 'active'
  | 'completed'
  | 'on_hold'
  | 'skipped';

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

export type EffectiveStatus =
  | ProjectStageStatus
  | 'overdue';

type ViewType =
  | 'table'
  | 'overview'
  | 'roadmap'
  | 'timeline'
  | 'board'
  | 'analytics';

type TimelineScale =
  | 'days'
  | 'weeks'
  | 'months';

type SortKey =
  | 'order'
  | 'name'
  | 'status'
  | 'responsible'
  | 'dates'
  | 'duration';

type SortDir = 'asc' | 'desc';

type SectionScreen =
  | { type: 'list' }
  | {
    type: 'detail';
    stageId: string;
    editing: boolean;
  }
  | { type: 'create' };

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

interface Toast {
  id: number;
  title: string;
  type?: 'success' | 'error' | 'info';
}

/* ════════════════════════════════════════════════════════════════
   STATUS CONFIGURATION
   ════════════════════════════════════════════════════════════════ */

const STATUS_CFG: Record<
  EffectiveStatus,
  {
    label: string;
    dot: string;
    chip: string;
    bar: string;
    ring: string;
    border: string;
    icon: React.ElementType;
    text: string;
  }
> = {
  planned: {
    label: 'Запланирован',
    dot: 'bg-slate-400',
    chip:
      'bg-slate-500/10 text-slate-400 border-slate-400/20',
    bar: 'bg-slate-500',
    ring: 'ring-slate-400/25',
    border: 'border-slate-400/25',
    icon: Clock,
    text: 'text-slate-400',
  },

  active: {
    label: 'В работе',
    dot: 'bg-blue-500',
    chip:
      'bg-blue-500/10 text-blue-400 border-blue-400/25',
    bar: 'bg-blue-500',
    ring: 'ring-blue-500/25',
    border: 'border-blue-400/25',
    icon: PlayCircle,
    text: 'text-blue-400',
  },

  completed: {
    label: 'Завершён',
    dot: 'bg-emerald-500',
    chip:
      'bg-emerald-500/10 text-emerald-500 border-emerald-400/25',
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/25',
    border: 'border-emerald-400/25',
    icon: CheckCircle2,
    text: 'text-emerald-500',
  },

  on_hold: {
    label: 'На паузе',
    dot: 'bg-amber-500',
    chip:
      'bg-amber-500/10 text-amber-500 border-amber-400/25',
    bar: 'bg-amber-500',
    ring: 'ring-amber-500/25',
    border: 'border-amber-400/25',
    icon: PauseCircle,
    text: 'text-amber-500',
  },

  skipped: {
    label: 'Пропущен',
    dot: 'bg-neutral-500',
    chip:
      'bg-neutral-500/10 text-neutral-400 border-neutral-400/20',
    bar: 'bg-neutral-500',
    ring: 'ring-neutral-400/20',
    border: 'border-neutral-400/20',
    icon: SkipForward,
    text: 'text-neutral-400',
  },

  overdue: {
    label: 'Просрочен',
    dot: 'bg-[var(--accent)]',
    chip:
      'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/25',
    bar: 'bg-[var(--accent)]',
    ring: 'ring-[var(--accent)]/25',
    border: 'border-[var(--accent)]/25',
    icon: AlertTriangle,
    text: 'text-[var(--accent)]',
  },
};

/* ════════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════════ */

const TODAY = new Date();

const parseDate = (
  value: string | null,
): Date | null => {
  if (!value) return null;

  return new Date(
    value +
    (value.length === 10
      ? 'T00:00:00'
      : ''),
  );
};

const fmtDate = (
  value: string | null,
): string => {
  if (!value) return '—';

  const date = parseDate(value);

  if (!date) return '—';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const fmtShort = (
  value: string | null,
): string => {
  if (!value) return '—';

  const date = parseDate(value);

  if (!date) return '—';

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
};

const fmtDT = (
  value: string | null,
): string => {
  if (!value) return '—';

  return new Date(value).toLocaleString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
};

const fmtToday = () =>
  fmtShort(new Date().toISOString());

const daysB = (
  a: Date,
  b: Date,
): number =>
  Math.round(
    (b.getTime() - a.getTime()) /
    86400000,
  );

const effStatus = (
  stage: ProjectStageResponse,
): EffectiveStatus => {
  if (
    stage.is_overdue &&
    stage.status !== 'completed' &&
    stage.status !== 'skipped'
  ) {
    return 'overdue';
  }

  return stage.status;
};

const sortOrd = (
  stages: ProjectStageResponse[],
): ProjectStageResponse[] =>
  [...stages].sort(
    (a, b) =>
      a.execution_order -
      b.execution_order ||
      a.name.localeCompare(
        b.name,
        'ru',
      ),
  );

function getInitials(
  name?: string | null,
): string {
  if (!name?.trim()) return '?';

  const parts = name
    .trim()
    .split(/\s+/);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[1][0]
    ).toUpperCase();
  }

  return parts[0]
    .slice(0, 2)
    .toUpperCase();
}

function stagesOverlap(
  a: ProjectStageResponse,
  b: ProjectStageResponse,
): boolean {
  const as = parseDate(a.planned_start);
  const ae = parseDate(a.planned_end);

  const bs = parseDate(b.planned_start);
  const be = parseDate(b.planned_end);

  if (!as || !ae || !bs || !be) {
    return false;
  }

  return as <= be && bs <= ae;
}

const isRunning = (
  stage: ProjectStageResponse,
) =>
  stage.status === 'active' ||
  stage.status === 'on_hold';

function getActualEnd(
  stage: ProjectStageResponse,
): Date | null {
  if (stage.completed_at) {
    return parseDate(stage.completed_at);
  }

  if (
    stage.status === 'active' ||
    stage.status === 'on_hold'
  ) {
    return new Date();
  }

  return null;
}

function isFactOverPlan(
  stage: ProjectStageResponse,
): boolean {
  const plannedEnd = parseDate(
    stage.planned_end,
  );

  const actualEnd = getActualEnd(stage);

  if (!plannedEnd || !actualEnd) {
    return false;
  }

  return actualEnd > plannedEnd;
}

function overrunDays(
  stage: ProjectStageResponse,
): number {
  const plannedEnd = parseDate(
    stage.planned_end,
  );

  const actualEnd = getActualEnd(stage);

  if (
    !plannedEnd ||
    !actualEnd ||
    actualEnd <= plannedEnd
  ) {
    return 0;
  }

  return daysB(plannedEnd, actualEnd);
}

/* ════════════════════════════════════════════════════════════════
   FORM UTILITIES
   ════════════════════════════════════════════════════════════════ */

const emptyForm = (
  order: number,
): StageForm => ({
  name: '',
  order: String(order),
  status: 'planned',
  responsible_id: '',
  planned_start: '',
  planned_end: '',
  planned_duration_days: '',
  description: '',
  completion_criteria: '',
});

const stageToForm = (
  stage: ProjectStageResponse,
): StageForm => ({
  name: stage.name,
  order: String(stage.execution_order),
  status: stage.status,
  responsible_id:
    stage.responsible_id ?? '',
  planned_start:
    stage.planned_start ?? '',
  planned_end:
    stage.planned_end ?? '',
  planned_duration_days:
    stage.planned_duration_days != null
      ? String(
        stage.planned_duration_days,
      )
      : '',
  description:
    stage.description ?? '',
  completion_criteria:
    stage.completion_criteria.join('\n'),
});

const formToPayload = (
  form: StageForm,
): StageUpsertPayload => ({
  name: form.name.trim(),

  order: Math.max(
    1,
    Number(form.order) || 1,
  ),

  status: form.status,

  planned_start:
    form.planned_start || null,

  planned_end:
    form.planned_end || null,

  responsible_id:
    form.responsible_id || null,

  description:
    form.description.trim() || null,

  completion_criteria:
    form.completion_criteria
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean),

  planned_duration_days:
    form.planned_duration_days
      ? Math.max(
        1,
        Number(
          form.planned_duration_days,
        ),
      )
      : null,
});

/* ════════════════════════════════════════════════════════════════
   AVATAR
   ════════════════════════════════════════════════════════════════ */

function Ava({
  name,
  size = 'md',
}: {
  name?: string | null;
  size?: 'sm' | 'md';
}) {
  const sizes = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
  };

  return (
    <div
      className={`
        ${sizes[size]}
        flex
        shrink-0
        select-none
        items-center
        justify-center
        rounded-xl
        bg-[var(--accent)]
        font-semibold
        text-white
      `}
    >
      {getInitials(name)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAGE BADGE
   ════════════════════════════════════════════════════════════════ */

function Badge({
  order,
}: {
  order: number;
}) {
  return (
    <span
      className="
        inline-flex
        items-center
        gap-1.5
        rounded-lg
        border border-[var(--accent)]/20
        bg-[var(--accent-soft)]
        px-2.5 py-1
        text-xs
        font-semibold
        text-[var(--text-primary)]
      "
    >
      <Milestone className="h-3.5 w-3.5" />

      #{String(order).padStart(2, '0')}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
   STATUS CHIP
   ════════════════════════════════════════════════════════════════ */

function Chip({
  status,
}: {
  status: EffectiveStatus;
}) {
  const config = STATUS_CFG[status];

  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-lg
        border
        px-2.5 py-1
        text-xs
        font-medium
        ${config.chip}
      `}
    >
      <Icon className="h-3.5 w-3.5" />

      {config.label}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
   SKELETON
   ════════════════════════════════════════════════════════════════ */

function Skeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`
        skeleton
        rounded-2xl
        ${className}
      `}
    />
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-80 max-w-full" />

      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TOASTS
   ════════════════════════════════════════════════════════════════ */

function Toasts({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: number) => void;
}) {
  return createPortal(
    <div className="pointer-events-none fixed right-4 top-5 z-[400] flex max-w-[calc(100vw-2rem)] flex-col gap-3">

      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{
              opacity: 0,
              x: 30,
            }}
            animate={{
              opacity: 1,
              x: 0,
            }}
            exit={{
              opacity: 0,
              x: 30,
            }}
            className="
              pointer-events-auto
              flex
              w-full
              min-w-0
              max-w-[380px]
              items-center
              gap-3
              rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--bg-card)]
              px-5 py-4
              shadow-lg
              sm:min-w-[300px]
            "
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            )}

            {toast.type === 'error' && (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            )}

            {(!toast.type ||
              toast.type === 'info') && (
                <Info className="h-5 w-5 shrink-0 text-blue-400" />
              )}

            <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
              {toast.title}
            </span>

            <button
              type="button"
              onClick={() => onClose(toast.id)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════════
   VIEW TABS
   ════════════════════════════════════════════════════════════════ */

const VIEWS: {
  id: ViewType;
  label: string;
  icon: React.ElementType;
}[] = [
    {
      id: 'table',
      label: 'Таблица',
      icon: TableIcon,
    },
    {
      id: 'overview',
      label: 'Обзор',
      icon: Info,
    },
    {
      id: 'roadmap',
      label: 'Карта',
      icon: MapIcon,
    },
    {
      id: 'timeline',
      label: 'Хронология',
      icon: GanttChart,
    },
    {
      id: 'board',
      label: 'Доска',
      icon: LayoutGrid,
    },
    {
      id: 'analytics',
      label: 'Аналитика',
      icon: BarChart3,
    },
  ];

function ViewTabs({
  view,
  onChange,
}: {
  view: ViewType;
  onChange: (view: ViewType) => void;
}) {
  return (
    <div
      className="
        inline-flex
        max-w-full
        gap-1
        overflow-x-auto
        rounded-2xl
        border border-[var(--border-color)]
        bg-[var(--hover-2)]
        p-1.5
      "
    >
      {VIEWS.map(item => {
        const active = view === item.id;

        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`
              relative
              inline-flex
              shrink-0
              items-center
              gap-2
              rounded-xl
              px-4 py-2.5
              text-sm
              font-medium
              transition-colors
              ${active
                ? 'text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            {active && (
              <motion.div
                layoutId="stage-view-tab"
                className="absolute inset-0 rounded-xl bg-[var(--accent)]"
                transition={{
                  type: 'spring',
                  stiffness: 350,
                  damping: 30,
                }}
              />
            )}

            <Icon className="relative h-4 w-4" />

            <span className="relative">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ASSIGNEES MODAL
   ════════════════════════════════════════════════════════════════ */

interface AssigneesModalProps {
  open: boolean;
  onClose: () => void;
  users: Record<string, StageResponsible>;
  selectedIds: string[];
  currentUserId?: string;
  saving: boolean;
  onSave: (ids: string[]) => Promise<void>;
}

function AssigneesModal({
  open,
  onClose,
  users,
  selectedIds,
  currentUserId,
  saving,
  onSave,
}: AssigneesModalProps) {
  const [search, setSearch] = useState('');

  const [selected, setSelected] =
    useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open) return;

    setSelected(selectedIds);
    setSearch('');
  }, [open, selectedIds]);

  const availableUsers = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return Object.values(users)
      .filter(user => {
        if (!query) return true;

        return (
          user.full_name
            .toLowerCase()
            .includes(query) ||
          (user.email ?? '')
            .toLowerCase()
            .includes(query)
        );
      })
      .sort((a, b) => {
        if (a.id === currentUserId) {
          return -1;
        }

        if (b.id === currentUserId) {
          return 1;
        }

        return a.full_name.localeCompare(
          b.full_name,
          'ru',
        );
      });
  }, [users, search, currentUserId]);

  const toggleUser = (id: string) => {
    if (saving) return;

    setSelected(previous =>
      previous.includes(id)
        ? previous.filter(
          userId => userId !== id,
        )
        : [...previous, id],
    );
  };

  const hasChanges = useMemo(() => {
    if (
      selected.length !==
      selectedIds.length
    ) {
      return true;
    }

    const original = new Set(selectedIds);

    return selected.some(
      id => !original.has(id),
    );
  }, [selected, selectedIds]);

  const handleSave = async () => {
    if (saving || !hasChanges) return;

    try {
      await onSave(selected);

      onClose();
    } catch {
      // Не закрываем окно при ошибке API.
      // Сообщение отображается через Toast.
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !saving
      ) {
        onClose();
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-5">

      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={() => {
          if (!saving) {
            onClose();
          }
        }}
      />

      {/* MODAL */}
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.97,
          y: 12,
        }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
        }}
        transition={{
          duration: 0.2,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-assignees-title"
        className="
          relative
          flex
          max-h-[85vh]
          w-full
          max-w-[560px]
          flex-col
          overflow-hidden
          rounded-2xl
          border border-[var(--border-color)]
          bg-[var(--bg-primary)]
        "
        style={{
          boxShadow: 'var(--shadow-lg)',
        }}
      >

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] px-5 py-5 sm:px-6">

          <div className="flex min-w-0 items-center gap-3">

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Users className="h-5 w-5 text-[var(--accent)]" />
            </div>

            <div className="min-w-0">

              <h2
                id="stage-assignees-title"
                className="text-lg font-bold text-[var(--text-primary)]"
              >
                Исполнители этапа
              </h2>

              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Выберите сотрудников для выполнения этапа
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Закрыть"
            className="
              shrink-0
              rounded-lg
              p-2
              text-[var(--text-muted)]
              transition-colors
              hover:bg-[var(--hover-2)]
              hover:text-[var(--text-primary)]
              disabled:opacity-50
            "
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* SEARCH */}
        <div className="border-b border-[var(--border-color)] px-5 py-4 sm:px-6">

          <div className="relative">

            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />

            <input
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
              disabled={saving}
              placeholder="Поиск по имени или почте..."
              className="
                h-12
                w-full
                rounded-xl
                border border-[var(--border-color)]
                bg-[var(--hover-2)]
                pl-11 pr-4
                text-sm
                text-[var(--text-primary)]
                outline-none
                transition-colors
                placeholder:text-[var(--text-muted)]
                focus:border-[var(--accent)]
                disabled:opacity-50
              "
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">

            <span className="text-xs text-[var(--text-muted)]">
              Найдено: {availableUsers.length}
            </span>

            <span className="rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
              Выбрано: {selected.length}
            </span>
          </div>
        </div>

        {/* USERS */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

          {availableUsers.length === 0 ? (
            <div className="py-12 text-center">

              <Search className="mx-auto h-10 w-10 text-[var(--text-disabled)]" />

              <p className="mt-4 text-sm font-medium text-[var(--text-primary)]">
                Сотрудники не найдены
              </p>

              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Попробуйте изменить поисковый запрос
              </p>
            </div>
          ) : (
            <div className="space-y-1">

              {availableUsers.map(user => {
                const isSelected =
                  selected.includes(user.id);

                const isCurrentUser =
                  user.id === currentUserId;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() =>
                      toggleUser(user.id)
                    }
                    disabled={saving}
                    aria-pressed={isSelected}
                    className={`
                      flex
                      w-full
                      items-center
                      gap-3
                      rounded-xl
                      border
                      px-3 py-3
                      text-left
                      transition-colors
                      disabled:opacity-50
                      ${isSelected
                        ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)]'
                        : 'border-transparent hover:bg-[var(--hover-2)]'
                      }
                    `}
                  >

                    <Ava
                      name={user.full_name}
                      size="sm"
                    />

                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2">

                        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {user.full_name}
                        </span>

                        {isCurrentUser && (
                          <span className="rounded-md bg-[var(--hover-3)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                            Вы
                          </span>
                        )}
                      </div>

                      {user.email && (
                        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                          {user.email}
                        </p>
                      )}

                      {user.role && (
                        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                          {user.role}
                        </p>
                      )}
                    </div>

                    {/* CHECKBOX */}
                    <div
                      className={`
                        flex
                        h-5 w-5
                        shrink-0
                        items-center
                        justify-center
                        rounded-md
                        border
                        transition-colors
                        ${isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)]'
                          : 'border-[var(--border-color)]'
                        }
                      `}
                    >
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] px-5 py-4 sm:px-6">

          <span className="text-sm text-[var(--text-muted)]">
            {selected.length === 0
              ? 'Никто не выбран'
              : `Исполнителей: ${selected.length}`}
          </span>

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="
                rounded-xl
                border border-[var(--border-color)]
                bg-[var(--hover-2)]
                px-4 py-2.5
                text-sm
                font-medium
                text-[var(--text-secondary)]
                transition-colors
                hover:bg-[var(--hover-3)]
                disabled:opacity-50
              "
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                !hasChanges
              }
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-[var(--accent)]
                px-5 py-2.5
                text-sm
                font-semibold
                text-white
                transition-opacity
                hover:opacity-90
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Сохранить
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/* ════════════════════════════════════════════════════════════════
   ASSIGNEES PREVIEW
   ════════════════════════════════════════════════════════════════ */

function AssigneesPreview({
  ids,
  users,
  maxVisible = 3,
}: {
  ids?: string[];
  users: Record<string, StageResponsible>;
  maxVisible?: number;
}) {
  const assigneeIds = ids ?? [];

  if (!assigneeIds.length) {
    return (
      <span className="text-sm text-[var(--text-muted)]">
        Не назначены
      </span>
    );
  }

  const visible = assigneeIds.slice(0, maxVisible);
  const remaining = Math.max(0, assigneeIds.length - maxVisible);

  return (
    <div
      className="flex items-center gap-2"
      title={assigneeIds
        .map(id => users[id]?.full_name ?? 'Пользователь')
        .join(', ')}
    >
      <div className="flex items-center -space-x-2">
        {visible.map(id => {
          const user = users[id];

          return (
            <div
              key={id}
              className="
                relative
                flex h-8 w-8
                shrink-0
                items-center justify-center
                rounded-full
                border-2 border-[var(--bg-card)]
                bg-[var(--accent)]
                text-[10px]
                font-bold
                text-white
              "
            >
              {getInitials(user?.full_name)}
            </div>
          );
        })}

        {remaining > 0 && (
          <div
            className="
              relative
              flex h-8 w-8
              items-center justify-center
              rounded-full
              border-2 border-[var(--bg-card)]
              bg-[var(--hover-3)]
              text-[11px]
              font-semibold
              text-[var(--text-primary)]
            "
          >
            +{remaining}
          </div>
        )}
      </div>

      <span className="text-xs text-[var(--text-muted)]">
        {assigneeIds.length}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TABLE VIEW
   ════════════════════════════════════════════════════════════════ */

function TableView({
  stages,
  responsibles,
  onSelect,
  onCreate,
}: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (stage: ProjectStageResponse) => void;
  onCreate: () => void;
}) {
  const [sortKey, setSortKey] =
    useState<SortKey>('order');

  const [sortDir, setSortDir] =
    useState<SortDir>('asc');

  const [search, setSearch] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState<EffectiveStatus | 'all'>('all');

  /* =========================================================
     FILTER & SORT
     ========================================================= */

  const filtered = useMemo(() => {
    let result = [...stages];

    const query = search
      .toLowerCase()
      .replace('#', '')
      .trim();

    if (query) {
      result = result.filter(stage => {
        const responsibleName =
          stage.responsible_id
            ? responsibles[stage.responsible_id]?.full_name ?? ''
            : '';

        const assigneeNames = (stage.assignee_ids ?? [])
          .map(id => responsibles[id]?.full_name ?? '')
          .join(' ');

        return (
          stage.name.toLowerCase().includes(query) ||
          responsibleName.toLowerCase().includes(query) ||
          assigneeNames.toLowerCase().includes(query) ||
          String(stage.execution_order).includes(query) ||
          (stage.description ?? '')
            .toLowerCase()
            .includes(query)
        );
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter(
        stage => effStatus(stage) === statusFilter,
      );
    }

    result.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';

      switch (sortKey) {
        case 'order':
          av = a.execution_order;
          bv = b.execution_order;
          break;

        case 'name':
          av = a.name;
          bv = b.name;
          break;

        case 'status':
          av = effStatus(a);
          bv = effStatus(b);
          break;

        case 'responsible':
          av = a.responsible_id
            ? responsibles[a.responsible_id]?.full_name ?? ''
            : '';

          bv = b.responsible_id
            ? responsibles[b.responsible_id]?.full_name ?? ''
            : '';
          break;

        case 'dates':
          av = a.planned_start ?? '';
          bv = b.planned_start ?? '';
          break;

        case 'duration':
          av = a.planned_duration_days ?? 0;
          bv = b.planned_duration_days ?? 0;
          break;
      }

      if (av < bv) {
        return sortDir === 'asc' ? -1 : 1;
      }

      if (av > bv) {
        return sortDir === 'asc' ? 1 : -1;
      }

      return 0;
    });

    return result;
  }, [
    stages,
    responsibles,
    search,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(previous =>
        previous === 'asc' ? 'desc' : 'asc',
      );
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({
    column,
  }: {
    column: SortKey;
  }) => {
    if (sortKey !== column) {
      return (
        <ArrowUpDown className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
      );
    }

    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[var(--accent)]" />
    );
  };

  /* =========================================================
     EMPTY STATE
     ========================================================= */

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-16 text-center">

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--hover-2)]">
          <Milestone className="h-8 w-8 text-[var(--text-disabled)]" />
        </div>

        <h3 className="mt-5 text-lg font-bold text-[var(--text-primary)]">
          Этапов пока нет
        </h3>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">
          Создайте первый этап проекта, чтобы планировать
          работу, назначать исполнителей и отслеживать сроки.
        </p>

        <button
          type="button"
          onClick={onCreate}
          className="
            mt-6
            inline-flex
            items-center
            gap-2
            rounded-xl
            bg-[var(--accent)]
            px-5 py-3
            text-sm
            font-semibold
            text-white
            transition-opacity
            hover:opacity-90
          "
        >
          <Plus className="h-4 w-4" />
          Создать этап
        </button>
      </div>
    );
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-5 py-4">

        {/* SEARCH */}
        <div className="relative min-w-[220px] flex-1">

          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />

          <input
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
            placeholder="Поиск по этапам и сотрудникам..."
            className="
              h-11
              w-full
              rounded-xl
              border border-[var(--border-color)]
              bg-[var(--hover-2)]
              pl-11 pr-4
              text-sm
              text-[var(--text-primary)]
              outline-none
              transition-colors
              placeholder:text-[var(--text-muted)]
              focus:border-[var(--accent)]
            "
          />
        </div>

        {/* FILTER */}
        <Select
          value={statusFilter}
          onValueChange={value =>
            setStatusFilter(
              value as EffectiveStatus | 'all',
            )
          }
        >
          <SelectTrigger
            className="
              h-11
              w-[190px]
              rounded-xl
              border border-[var(--border-color)]
              bg-[var(--hover-2)]
              px-4
              text-sm
              text-[var(--text-primary)]
            "
          >
            <Filter className="mr-2 h-4 w-4 text-[var(--text-muted)]" />

            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">
              Все статусы
            </SelectItem>

            <SelectItem value="planned">
              Запланирован
            </SelectItem>

            <SelectItem value="active">
              В работе
            </SelectItem>

            <SelectItem value="on_hold">
              На паузе
            </SelectItem>

            <SelectItem value="completed">
              Завершён
            </SelectItem>

            <SelectItem value="skipped">
              Пропущен
            </SelectItem>

            <SelectItem value="overdue">
              Просрочен
            </SelectItem>
          </SelectContent>
        </Select>

        {/* CREATE */}
        <button
          type="button"
          onClick={onCreate}
          className="
            inline-flex
            h-11
            items-center
            gap-2
            rounded-xl
            bg-[var(--accent)]
            px-4
            text-sm
            font-semibold
            text-white
            transition-opacity
            hover:opacity-90
          "
        >
          <Plus className="h-4 w-4" />
          Создать
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto">

        <table className="w-full min-w-[1250px]">

          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">

              {(
                [
                  ['order', '№'],
                  ['name', 'Название'],
                  ['status', 'Статус'],
                  ['dates', 'Плановые сроки'],
                  ['responsible', 'Ответственный'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="px-5 py-4 text-left"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className="
                      inline-flex
                      items-center
                      gap-2
                      text-xs
                      font-semibold
                      text-[var(--text-muted)]
                      transition-colors
                      hover:text-[var(--text-primary)]
                    "
                  >
                    {label}

                    <SortIcon column={key} />
                  </button>
                </th>
              ))}

              <th className="px-5 py-4 text-left text-xs font-semibold text-[var(--text-muted)]">
                Исполнители
              </th>

              <th className="px-5 py-4 text-left">
                <button
                  type="button"
                  onClick={() => toggleSort('duration')}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Дни
                  <SortIcon column="duration" />
                </button>
              </th>

              <th className="px-5 py-4 text-left text-xs font-semibold text-[var(--text-muted)]">
                Исполнение
              </th>

              <th className="w-12" />
            </tr>
          </thead>

          <tbody>

            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-16 text-center"
                >
                  <Search className="mx-auto h-10 w-10 text-[var(--text-disabled)]" />

                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Ничего не найдено
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(stage => {
                const effective = effStatus(stage);

                const responsible = stage.responsible_id
                  ? responsibles[stage.responsible_id]
                  : null;

                const overdue = isFactOverPlan(stage);
                const overdueDays = overrunDays(stage);

                return (
                  <tr
                    key={stage.id}
                    onClick={() => onSelect(stage)}
                    className={`
                      group
                      cursor-pointer
                      border-b border-[var(--border-color)]
                      transition-colors
                      hover:bg-[var(--hover-1)]
                      ${effective === 'overdue'
                        ? 'bg-[var(--accent-soft)]/20'
                        : ''
                      }
                    `}
                  >

                    {/* ORDER */}
                    <td className="px-5 py-5">
                      <Badge order={stage.execution_order} />
                    </td>

                    {/* NAME */}
                    <td className="min-w-[230px] px-5 py-5">

                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {stage.name}
                      </p>

                      <p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">
                        {stage.description || 'Без описания'}
                      </p>
                    </td>

                    {/* STATUS */}
                    <td className="px-5 py-5">

                      <div className="flex flex-wrap gap-2">

                        <Chip status={stage.status} />

                        {effective === 'overdue' && (
                          <Chip status="overdue" />
                        )}
                      </div>
                    </td>

                    {/* DATES */}
                    <td className="whitespace-nowrap px-5 py-5 text-sm text-[var(--text-secondary)]">
                      {fmtShort(stage.planned_start)}
                      {' — '}
                      {fmtShort(stage.planned_end)}
                    </td>

                    {/* RESPONSIBLE */}
                    <td className="px-5 py-5">

                      {responsible ? (
                        <div className="flex items-center gap-2.5">

                          <Ava
                            name={responsible.full_name}
                            size="sm"
                          />

                          <span className="max-w-[160px] truncate text-sm text-[var(--text-secondary)]">
                            {responsible.full_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">
                          Не назначен
                        </span>
                      )}
                    </td>

                    {/* ASSIGNEES */}
                    <td className="px-5 py-5">

                      <AssigneesPreview
                        ids={stage.assignee_ids}
                        users={responsibles}
                        maxVisible={3}
                      />
                    </td>

                    {/* DURATION */}
                    <td className="whitespace-nowrap px-5 py-5 text-sm font-medium text-[var(--text-secondary)]">

                      {stage.planned_duration_days != null
                        ? `${stage.planned_duration_days} дн.`
                        : '—'}
                    </td>

                    {/* EXECUTION */}
                    <td className="px-5 py-5">

                      {stage.started_at ? (
                        <div className="space-y-1">

                          <p className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                            {fmtShort(
                              stage.started_at.slice(0, 10),
                            )}
                            {' — '}
                            {stage.completed_at
                              ? fmtShort(
                                stage.completed_at.slice(0, 10),
                              )
                              : fmtToday()}
                          </p>

                          {overdue && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                              <AlertTriangle className="h-3 w-3" />
                              +{overdueDays} дн.
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">
                          —
                        </span>
                      )}
                    </td>

                    {/* ARROW */}
                    <td className="px-4 py-5">

                      <ChevronRight
                        className="
                          h-5 w-5
                          text-[var(--text-disabled)]
                          transition-all
                          group-hover:translate-x-0.5
                          group-hover:text-[var(--accent)]
                        "
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--hover-1)] px-5 py-3">

        <span className="text-xs text-[var(--text-muted)]">
          Показано {filtered.length} из {stages.length}
        </span>

        <span className="text-xs text-[var(--text-muted)]">
          Нажмите на этап для просмотра
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   OVERVIEW VIEW
   ════════════════════════════════════════════════════════════════ */

function OverviewView({
  stages,
  responsibles,
  onSelect,
}: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (stage: ProjectStageResponse) => void;
}) {
  const activeStages = useMemo(
    () => stages.filter(stage => stage.status === 'active'),
    [stages],
  );

  const onHoldStages = useMemo(
    () => stages.filter(stage => stage.status === 'on_hold'),
    [stages],
  );

  const overdueStages = useMemo(
    () =>
      stages.filter(
        stage =>
          stage.is_overdue &&
          stage.status !== 'completed' &&
          stage.status !== 'skipped',
      ),
    [stages],
  );

  const completedWithOverrun = useMemo(
    () =>
      stages.filter(
        stage =>
          stage.status === 'completed' &&
          isFactOverPlan(stage),
      ),
    [stages],
  );

  const total = stages.length;

  const completed = stages.filter(
    stage => stage.status === 'completed',
  ).length;

  const progress = total
    ? Math.round((completed / total) * 100)
    : 0;

  /* =========================================================
     PARALLEL GROUPS
     ========================================================= */

  const parallelGroups = useMemo(() => {
    const groups: ProjectStageResponse[][] = [];
    const used = new Set<string>();

    const active = sortOrd(activeStages);

    for (const stage of active) {
      if (used.has(stage.id)) continue;

      const group = [stage];

      used.add(stage.id);

      for (const other of active) {
        if (used.has(other.id)) continue;

        if (stagesOverlap(stage, other)) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }, [activeStages]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >

      {/* LEFT COLUMN */}
      <div className="space-y-6">

        {/* ACTIVE STAGES */}
        <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

          {/* HEADER */}
          <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-6 py-5">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <PlayCircle className="h-5 w-5 text-blue-400" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Текущие этапы
              </h2>

              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {activeStages.length
                  ? `${activeStages.length} этапов в работе`
                  : 'Нет активных этапов'}
              </p>
            </div>
          </div>

          {/* CONTENT */}
          <div className="p-5">

            {!activeStages.length ? (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] px-5 py-12 text-center">

                <Clock className="mx-auto h-9 w-9 text-[var(--text-disabled)]" />

                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Сейчас нет этапов в работе
                </p>
              </div>
            ) : (
              <div className="space-y-4">

                {parallelGroups.map((group, groupIndex) => (
                  <div key={groupIndex}>

                    {/* PARALLEL LABEL */}
                    {group.length > 1 && (
                      <div className="mb-3 flex items-center gap-2 px-1">

                        <Layers className="h-4 w-4 text-blue-400" />

                        <span className="text-xs font-semibold text-blue-400">
                          Параллельное выполнение
                        </span>

                        <div className="h-px flex-1 bg-blue-400/15" />
                      </div>
                    )}

                    <div
                      className={
                        group.length > 1
                          ? 'grid grid-cols-1 gap-3 border-l-2 border-blue-400/20 pl-3 md:grid-cols-2'
                          : ''
                      }
                    >

                      {group.map(stage => {
                        const responsible =
                          stage.responsible_id
                            ? responsibles[stage.responsible_id]
                            : null;

                        const overdue = isFactOverPlan(stage);
                        const overdueDays = overrunDays(stage);

                        const startedAt = stage.started_at
                          ? parseDate(stage.started_at)
                          : null;

                        const actualDays = startedAt
                          ? daysB(startedAt, new Date()) + 1
                          : 0;

                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => onSelect(stage)}
                            className={`
                              group
                              w-full
                              rounded-2xl
                              border
                              bg-[var(--hover-1)]
                              p-5
                              text-left
                              transition-all
                              hover:border-[var(--border-hover)]
                              hover:bg-[var(--hover-2)]
                              ${overdue
                                ? 'border-[var(--accent)]/30'
                                : 'border-[var(--border-color)]'
                              }
                            `}
                          >

                            {/* BADGES */}
                            <div className="mb-4 flex flex-wrap items-center gap-2">

                              <Badge order={stage.execution_order} />

                              <Chip status={stage.status} />

                              {overdue && (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">

                                  <AlertTriangle className="h-3 w-3" />

                                  +{overdueDays} дн.
                                </span>
                              )}
                            </div>

                            {/* NAME */}
                            <h3 className="text-base font-bold text-[var(--text-primary)]">
                              {stage.name}
                            </h3>

                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-muted)]">
                              {stage.description || 'Описание не заполнено'}
                            </p>

                            {/* DATES */}
                            <div className="mt-4 grid grid-cols-2 gap-3">

                              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">

                                <p className="text-xs text-[var(--text-muted)]">
                                  Плановые сроки
                                </p>

                                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                                  {fmtShort(stage.planned_start)}
                                  {' — '}
                                  {fmtShort(stage.planned_end)}
                                </p>
                              </div>

                              <div
                                className={`
                                  rounded-xl
                                  border
                                  p-3
                                  ${overdue
                                    ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)]'
                                    : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                                  }
                                `}
                              >

                                <p className="text-xs text-[var(--text-muted)]">
                                  Фактически
                                </p>

                                <p
                                  className={`
                                    mt-1
                                    text-sm
                                    font-semibold
                                    ${overdue
                                      ? 'text-[var(--accent)]'
                                      : 'text-[var(--text-primary)]'
                                    }
                                  `}
                                >
                                  {actualDays} дн.
                                </p>
                              </div>
                            </div>

                            {/* PEOPLE */}
                            <div className="mt-4 border-t border-[var(--border-color)] pt-4">

                              {responsible && (
                                <div className="mb-3 flex items-center gap-2.5">

                                  <Ava
                                    name={responsible.full_name}
                                    size="sm"
                                  />

                                  <div className="min-w-0">

                                    <p className="text-xs text-[var(--text-muted)]">
                                      Ответственный
                                    </p>

                                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                      {responsible.full_name}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-3">

                                <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                  <Users className="h-4 w-4" />
                                  Исполнители
                                </span>

                                <AssigneesPreview
                                  ids={stage.assignee_ids}
                                  users={responsibles}
                                  maxVisible={3}
                                />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* OVERDUE / ON HOLD */}
        {(overdueStages.length > 0 ||
          onHoldStages.length > 0) && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

              {/* OVERDUE */}
              {overdueStages.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]/10">

                  <div className="flex items-center gap-2 border-b border-[var(--accent)]/15 px-5 py-4">

                    <AlertTriangle className="h-4 w-4 text-[var(--accent)]" />

                    <h3 className="text-sm font-bold text-[var(--accent)]">
                      Отставание от графика
                    </h3>

                    <span className="ml-auto text-xs font-semibold text-[var(--accent)]">
                      {overdueStages.length}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">

                    {overdueStages.map(stage => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => onSelect(stage)}
                        className="
                        w-full
                        rounded-xl
                        border border-[var(--border-color)]
                        bg-[var(--bg-card)]
                        p-4
                        text-left
                        transition-colors
                        hover:bg-[var(--hover-2)]
                      "
                      >
                        <Badge order={stage.execution_order} />

                        <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                          {stage.name}
                        </p>

                        <p className="mt-1 text-xs text-[var(--accent)]">
                          Срок до {fmtShort(stage.planned_end)}
                          {' · '}
                          +{overrunDays(stage)} дн.
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ON HOLD */}
              {onHoldStages.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5">

                  <div className="flex items-center gap-2 border-b border-amber-500/15 px-5 py-4">

                    <PauseCircle className="h-4 w-4 text-amber-500" />

                    <h3 className="text-sm font-bold text-amber-500">
                      Приостановлены
                    </h3>

                    <span className="ml-auto text-xs font-semibold text-amber-500">
                      {onHoldStages.length}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">

                    {onHoldStages.map(stage => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => onSelect(stage)}
                        className="
                        w-full
                        rounded-xl
                        border border-[var(--border-color)]
                        bg-[var(--bg-card)]
                        p-4
                        text-left
                        transition-colors
                        hover:bg-[var(--hover-2)]
                      "
                      >
                        <Badge order={stage.execution_order} />

                        <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                          {stage.name}
                        </p>

                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Выполнение приостановлено
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

        {/* COMPLETED WITH OVERRUN */}
        {completedWithOverrun.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

            <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-5 py-4">

              <TrendingUp className="h-5 w-5 text-[var(--text-muted)]" />

              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Завершены с отклонением
              </h3>
            </div>

            <div className="divide-y divide-[var(--border-color)]">

              {completedWithOverrun.map(stage => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onSelect(stage)}
                  className="
                    flex
                    w-full
                    items-center
                    justify-between
                    gap-4
                    px-5 py-4
                    text-left
                    transition-colors
                    hover:bg-[var(--hover-1)]
                  "
                >
                  <div className="flex min-w-0 items-center gap-3">

                    <Badge order={stage.execution_order} />

                    <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {stage.name}
                    </span>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent)]">

                    <AlertTriangle className="h-3.5 w-3.5" />

                    +{overrunDays(stage)} дн.
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-5">

        {/* PROGRESS */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Прогресс проекта
          </h3>

          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Выполнение этапов
          </p>

          {/* CIRCLE */}
          <div className="my-7 flex justify-center">

            <div className="relative h-36 w-36">

              <svg
                viewBox="0 0 100 100"
                className="h-full w-full -rotate-90"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="var(--hover-3)"
                  strokeWidth="9"
                  fill="none"
                />

                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="var(--accent)"
                  strokeWidth="9"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  initial={{
                    strokeDashoffset: 2 * Math.PI * 42,
                  }}
                  animate={{
                    strokeDashoffset:
                      2 *
                      Math.PI *
                      42 *
                      (1 - progress / 100),
                  }}
                  transition={{
                    duration: 0.8,
                  }}
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">

                <span className="text-3xl font-bold text-[var(--text-primary)]">
                  {progress}%
                </span>

                <span className="mt-1 text-xs text-[var(--text-muted)]">
                  {completed} из {total}
                </span>
              </div>
            </div>
          </div>

          {/* STATUS BREAKDOWN */}
          <div className="space-y-3 border-t border-[var(--border-color)] pt-5">

            {[
              {
                label: 'Завершено',
                value: completed,
                color: 'bg-emerald-500',
              },
              {
                label: 'В работе',
                value: activeStages.length,
                color: 'bg-blue-500',
              },
              {
                label: 'На паузе',
                value: onHoldStages.length,
                color: 'bg-amber-500',
              },
              {
                label: 'Запланировано',
                value: stages.filter(
                  stage => stage.status === 'planned',
                ).length,
                color: 'bg-slate-400',
              },
              {
                label: 'Просрочено',
                value: overdueStages.length,
                color: 'bg-[var(--accent)]',
              },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">

                  <span
                    className={`h-2.5 w-2.5 rounded-full ${item.color}`}
                  />

                  {item.label}
                </span>

                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* NEXT STAGE */}
        {(() => {
          const next = sortOrd(
            stages.filter(
              stage => stage.status === 'planned',
            ),
          )[0];

          if (!next) return null;

          return (
            <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

              <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-5 py-4">

                <Flag className="h-4 w-4 text-[var(--text-muted)]" />

                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Следующий этап
                </h3>
              </div>

              <button
                type="button"
                onClick={() => onSelect(next)}
                className="
                  w-full
                  p-5
                  text-left
                  transition-colors
                  hover:bg-[var(--hover-1)]
                "
              >
                <div className="flex flex-wrap items-center gap-2">

                  <Badge order={next.execution_order} />

                  <Chip status="planned" />
                </div>

                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  {next.name}
                </p>

                <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">

                  <Calendar className="h-3.5 w-3.5" />

                  {fmtShort(next.planned_start)}
                  {' — '}
                  {fmtShort(next.planned_end)}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-4">

                  <span className="text-xs text-[var(--text-muted)]">
                    Исполнители
                  </span>

                  <AssigneesPreview
                    ids={next.assignee_ids}
                    users={responsibles}
                  />
                </div>
              </button>
            </section>
          );
        })()}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ROADMAP VIEW
   ════════════════════════════════════════════════════════════════ */

type GraphCol = ProjectStageResponse[];

function buildGraphColumns(
  stages: ProjectStageResponse[],
): GraphCol[] {
  const ordered = sortOrd(stages);

  const columns: GraphCol[] = [];
  const placed = new Set<string>();

  for (const stage of ordered) {
    if (placed.has(stage.id)) continue;

    if (isRunning(stage)) {
      const siblings = ordered.filter(other =>
        !placed.has(other.id) &&
        other.id !== stage.id &&
        isRunning(other) &&
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
  responsibles,
  onSelect,
}: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (stage: ProjectStageResponse) => void;
}) {
  const columns = useMemo(
    () => buildGraphColumns(stages),
    [stages],
  );

  const {
    nodes,
    edges,
    svgW,
    svgH,
  } = useMemo(() => {
    const columnCount = columns.length;

    const maxRows = Math.max(
      ...columns.map(column => column.length),
      1,
    );

    const graphWidth = columnCount * COL_W;
    const leftPadding = COL_W / 2;

    const nodePositions: NodePos[] = [];

    columns.forEach((column, columnIndex) => {
      const centerX =
        leftPadding + columnIndex * COL_W;

      const columnHeight =
        (column.length - 1) * ROW_GAP;

      const totalHeight =
        (maxRows - 1) * ROW_GAP;

      const startY =
        TOP_PAD +
        NODE_R +
        (totalHeight - columnHeight) / 2;

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

    const graphEdges: {
      from: NodePos;
      to: NodePos;
      done: boolean;
    }[] = [];

    for (
      let columnIndex = 0;
      columnIndex < columnCount - 1;
      columnIndex++
    ) {
      const fromNodes = nodePositions.filter(
        node => node.col === columnIndex,
      );

      const toNodes = nodePositions.filter(
        node => node.col === columnIndex + 1,
      );

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
      TOP_PAD +
      (maxRows - 1) * ROW_GAP +
      NODE_D +
      BOTTOM_PAD;

    return {
      nodes: nodePositions,
      edges: graphEdges,
      svgW: Math.max(width, 600),
      svgH: Math.max(height, 400),
    };
  }, [columns]);

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-16 text-center">
        <MapIcon className="mx-auto h-12 w-12 text-[var(--text-disabled)]" />

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Нет этапов для отображения
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >

      {/* HEADER */}
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

        {columns.some(column => column.length > 1) && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400">
            <Layers className="h-4 w-4" />
            Параллельные этапы
          </span>
        )}
      </div>

      {/* GRAPH */}
      <div
        className="overflow-auto p-6"
        style={{ maxHeight: 780 }}
      >
        <div
          className="relative mx-auto"
          style={{
            width: svgW,
            height: svgH,
            minWidth: svgW,
          }}
        >

          {/* CONNECTIONS */}
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
                <path
                  d="M0,0 L8,3 L0,6"
                  fill="#10b981"
                />
              </marker>

              <marker
                id="stage-arrow-pending"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0,0 L8,3 L0,6"
                  fill="#64748b"
                />
              </marker>
            </defs>

            {edges.map((edge, index) => {
              const x1 = edge.from.cx + NODE_R + 4;
              const y1 = edge.from.cy;

              const x2 = edge.to.cx - NODE_R - 12;
              const y2 = edge.to.cy;

              const straight =
                Math.abs(y1 - y2) < 5;

              const middleX = (x1 + x2) / 2;

              const path = straight
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} C${middleX},${y1} ${middleX},${y2} ${x2},${y2}`;

              return (
                <motion.path
                  key={index}
                  d={path}
                  fill="none"
                  stroke={
                    edge.done
                      ? '#10b981'
                      : '#64748b'
                  }
                  strokeWidth={
                    edge.done ? 2.5 : 1.5
                  }
                  strokeDasharray={
                    edge.done
                      ? undefined
                      : '6 4'
                  }
                  markerEnd={
                    edge.done
                      ? 'url(#stage-arrow-completed)'
                      : 'url(#stage-arrow-pending)'
                  }
                  initial={{
                    pathLength: 0,
                    opacity: 0,
                  }}
                  animate={{
                    pathLength: 1,
                    opacity: edge.done
                      ? 0.7
                      : 0.35,
                  }}
                  transition={{
                    delay: 0.15 + index * 0.03,
                    duration: 0.45,
                  }}
                />
              );
            })}
          </svg>

          {/* NODES */}
          {nodes.map((node, nodeIndex) => {
            const stage = node.stage;

            const effective = effStatus(stage);
            const config = STATUS_CFG[effective];

            const StatusIcon = config.icon;

            const active = stage.status === 'active';

            const responsible = stage.responsible_id
              ? responsibles[stage.responsible_id]
              : null;

            const overdue = isFactOverPlan(stage);
            const overdueDays = overrunDays(stage);

            const assigneeIds = stage.assignee_ids ?? [];

            return (
              <motion.div
                key={stage.id}
                initial={{
                  scale: 0,
                  opacity: 0,
                }}
                animate={{
                  scale: 1,
                  opacity: 1,
                }}
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

                {/* ACTIVE PULSE */}
                {active && (
                  <span
                    className="absolute animate-ping rounded-full bg-blue-500/15"
                    style={{
                      width: NODE_D,
                      height: NODE_D,
                    }}
                  />
                )}

                {/* NODE BUTTON */}
                <button
                  type="button"
                  onClick={() => onSelect(stage)}
                  className={`
                    relative
                    z-10
                    flex
                    items-center
                    justify-center
                    rounded-full
                    text-sm
                    font-bold
                    text-white
                    transition-transform
                    hover:scale-110
                    ${config.bar}
                    ${active
                      ? `ring-4 ${config.ring}`
                      : ''
                    }
                  `}
                  style={{
                    width: NODE_D,
                    height: NODE_D,
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  {String(stage.execution_order).padStart(2, '0')}

                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)]">
                    <StatusIcon
                      className={`h-3.5 w-3.5 ${config.text}`}
                    />
                  </span>
                </button>

                {/* STAGE CARD */}
                <button
                  type="button"
                  onClick={() => onSelect(stage)}
                  className={`
                    absolute
                    rounded-xl
                    border
                    bg-[var(--bg-card)]
                    p-3.5
                    text-left
                    transition-colors
                    hover:bg-[var(--hover-2)]
                    ${overdue
                      ? 'border-[var(--accent)]/30'
                      : 'border-[var(--border-color)]'
                    }
                  `}
                  style={{
                    top: NODE_D + 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: CARD_W,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >

                  {/* NAME */}
                  <h4 className="mb-2 line-clamp-2 text-sm font-bold leading-5 text-[var(--text-primary)]">
                    {stage.name}
                  </h4>

                  {/* STATUS */}
                  <p className={`text-xs font-semibold ${config.text}`}>
                    {config.label}
                  </p>

                  {/* DATES */}
                  <div className="mt-3 flex items-start gap-2 text-xs text-[var(--text-muted)]">

                    <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                    <div>
                      <p>
                        {fmtShort(stage.planned_start)}
                        {' — '}
                        {fmtShort(stage.planned_end)}
                      </p>

                      {overdue && (
                        <p className="mt-1 font-semibold text-[var(--accent)]">
                          Отклонение +{overdueDays} дн.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* RESPONSIBLE */}
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

                  {/* ASSIGNEES */}
                  {assigneeIds.length > 0 && (
                    <div className="mt-3 border-t border-[var(--border-color)] pt-3">

                      <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <Users className="h-3.5 w-3.5" />
                        Исполнители
                      </div>

                      <AssigneesPreview
                        ids={assigneeIds}
                        users={responsibles}
                        maxVisible={3}
                      />
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
   TIMELINE VIEW
   ════════════════════════════════════════════════════════════════ */

function TimelineView({
  stages,
  responsibles,
  projectId,
  onSelect,
}: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  projectId: string;
  onSelect: (stage: ProjectStageResponse) => void;
}) {
  const [scale, setScale] =
    useState<TimelineScale>('weeks');

  const ordered = useMemo(
    () =>
      sortOrd(
        stages.filter(
          stage =>
            stage.planned_start &&
            stage.planned_end,
        ),
      ),
    [stages],
  );

  /* =========================================================
     DATE RANGE
     ========================================================= */

  const {
    minDate,
    maxDate,
    totalDays,
  } = useMemo(() => {
    if (!ordered.length) {
      return {
        minDate: new Date(),
        maxDate: new Date(),
        totalDays: 30,
      };
    }

    const dates = ordered.flatMap(stage => [
      parseDate(stage.planned_start)!,
      parseDate(stage.planned_end)!,
    ]);

    ordered.forEach(stage => {
      const actualEnd = getActualEnd(stage);

      if (actualEnd) {
        dates.push(actualEnd);
      }
    });

    const minimum = new Date(
      Math.min(
        ...dates.map(date => date.getTime()),
      ),
    );

    const maximum = new Date(
      Math.max(
        ...dates.map(date => date.getTime()),
      ),
    );

    minimum.setDate(
      minimum.getDate() - 2,
    );

    maximum.setDate(
      maximum.getDate() + 2,
    );

    return {
      minDate: minimum,
      maxDate: maximum,
      totalDays: daysB(minimum, maximum) + 1,
    };
  }, [ordered]);

  const dayWidth =
    scale === 'days'
      ? 42
      : scale === 'weeks'
        ? 18
        : 8;

  const timelineWidth = totalDays * dayWidth;

  /* =========================================================
     TICKS
     ========================================================= */

  const ticks = useMemo(() => {
    const result: {
      date: Date;
      label: string;
      major: boolean;
    }[] = [];

    const current = new Date(minDate);

    while (current <= maxDate) {
      if (scale === 'days') {
        result.push({
          date: new Date(current),
          label: current
            .getDate()
            .toString()
            .padStart(2, '0'),
          major: current.getDate() === 1,
        });

        current.setDate(
          current.getDate() + 1,
        );
      } else if (scale === 'weeks') {
        if (
          current.getDay() === 1 ||
          !result.length
        ) {
          result.push({
            date: new Date(current),
            label: current.toLocaleDateString(
              'ru-RU',
              {
                day: '2-digit',
                month: '2-digit',
              },
            ),
            major: current.getDate() <= 7,
          });
        }

        current.setDate(
          current.getDate() + 1,
        );
      } else {
        if (
          current.getDate() === 1 ||
          !result.length
        ) {
          result.push({
            date: new Date(current),
            label: current.toLocaleDateString(
              'ru-RU',
              {
                month: 'short',
                year: '2-digit',
              },
            ),
            major: true,
          });
        }

        current.setDate(
          current.getDate() + 1,
        );
      }
    }

    return result;
  }, [minDate, maxDate, scale]);

  const today = new Date();

  const todayOffset =
    daysB(minDate, today) * dayWidth;

  const showToday =
    today >= minDate &&
    today <= maxDate;

  /* =========================================================
     EMPTY
     ========================================================= */

  if (!ordered.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-16 text-center">

        <GanttChart className="mx-auto h-12 w-12 text-[var(--text-disabled)]" />

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Нет этапов с плановыми датами
        </p>
      </div>
    );
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
    >

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-6 py-5">

        <div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Хронология
          </h3>

          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Плановые и фактические сроки выполнения
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">

          {/* EXPORT */}
          <button
            type="button"
            onClick={() =>
              exportTimelineToExcel(
                ordered,
                responsibles,
                projectId,
              )
            }
            className="
              inline-flex
              items-center
              gap-2
              rounded-xl
              border border-[var(--border-color)]
              bg-[var(--hover-2)]
              px-4 py-2.5
              text-sm
              font-medium
              text-[var(--text-secondary)]
              transition-colors
              hover:bg-[var(--hover-3)]
              hover:text-[var(--text-primary)]
            "
          >
            <FileText className="h-4 w-4" />
            Экспорт в Excel
          </button>

          {/* SCALE */}
          <div className="inline-flex rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] p-1">

            {(
              ['days', 'weeks', 'months'] as TimelineScale[]
            ).map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setScale(item)}
                className={`
                  rounded-lg
                  px-3 py-2
                  text-sm
                  font-medium
                  transition-colors
                  ${scale === item
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                {{
                  days: 'Дни',
                  weeks: 'Недели',
                  months: 'Месяцы',
                }[item]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TIMELINE */}
      <div className="flex">

        {/* LEFT SIDE */}
        <div className="w-[300px] shrink-0 border-r border-[var(--border-color)]">

          <div className="flex h-12 items-center border-b border-[var(--border-color)] bg-[var(--hover-1)] px-4">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              Этап проекта
            </span>
          </div>

          {ordered.map(stage => {
            const effective = effStatus(stage);

            const overdue = isFactOverPlan(stage);

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onSelect(stage)}
                className={`
                  flex
                  h-20
                  w-full
                  items-center
                  gap-3
                  border-b border-[var(--border-color)]
                  px-4
                  text-left
                  transition-colors
                  hover:bg-[var(--hover-1)]
                  ${overdue
                    ? 'bg-[var(--accent-soft)]/10'
                    : ''
                  }
                `}
              >

                <Badge order={stage.execution_order} />

                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_CFG[effective].dot}`}
                />

                <div className="min-w-0 flex-1">

                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                    {stage.name}
                  </span>

                  <div className="mt-1 flex items-center gap-2">

                    <Users className="h-3 w-3 text-[var(--text-muted)]" />

                    <span className="text-xs text-[var(--text-muted)]">
                      {(stage.assignee_ids ?? []).length} исполн.
                    </span>
                  </div>

                  {overdue && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                      <AlertTriangle className="h-3 w-3" />
                      +{overrunDays(stage)} дн.
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT SIDE */}
        <div className="min-w-0 flex-1 overflow-x-auto">

          <div
            className="relative"
            style={{
              width: timelineWidth,
              minWidth: '100%',
            }}
          >

            {/* DATE HEADER */}
            <div className="relative h-12 border-b border-[var(--border-color)] bg-[var(--hover-1)]">

              {ticks.map((tick, index) => (
                <div
                  key={index}
                  className="absolute inset-y-0 flex items-center"
                  style={{
                    left:
                      daysB(minDate, tick.date) *
                      dayWidth,
                  }}
                >
                  <span
                    className={`
                      whitespace-nowrap
                      px-1.5
                      text-xs
                      ${tick.major
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)]'
                      }
                    `}
                  >
                    {tick.label}
                  </span>
                </div>
              ))}
            </div>

            {/* ROWS */}
            <div className="relative">

              {/* GRID */}
              <div className="pointer-events-none absolute inset-0">

                {ticks.map((tick, index) => (
                  <div
                    key={index}
                    className={`
                      absolute
                      inset-y-0
                      w-px
                      ${tick.major
                        ? 'bg-[var(--border-color)]'
                        : 'bg-[var(--border-color)]/50'
                      }
                    `}
                    style={{
                      left:
                        daysB(minDate, tick.date) *
                        dayWidth,
                    }}
                  />
                ))}
              </div>

              {/* TODAY */}
              {showToday && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10"
                  style={{
                    left: todayOffset,
                  }}
                >
                  <div className="h-full w-0.5 bg-[var(--accent)]" />

                  <span className="absolute left-1 top-0 whitespace-nowrap rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white">
                    Сегодня
                  </span>
                </div>
              )}

              {/* STAGES */}
              {ordered.map((stage, index) => {
                const effective = effStatus(stage);
                const config = STATUS_CFG[effective];

                const plannedStart =
                  parseDate(stage.planned_start)!;

                const plannedEnd =
                  parseDate(stage.planned_end)!;

                const startOffset =
                  daysB(minDate, plannedStart) *
                  dayWidth;

                const plannedWidth =
                  (daysB(plannedStart, plannedEnd) + 1) *
                  dayWidth;

                const overdue = isFactOverPlan(stage);

                const actualEnd = getActualEnd(stage);

                const overrunWidth =
                  overdue && actualEnd
                    ? daysB(plannedEnd, actualEnd) *
                    dayWidth
                    : 0;

                return (
                  <div
                    key={stage.id}
                    className="relative h-20 border-b border-[var(--border-color)]"
                  >

                    {/* PLANNED BAR */}
                    <motion.button
                      type="button"
                      onClick={() => onSelect(stage)}
                      initial={{
                        width: 0,
                        opacity: 0,
                      }}
                      animate={{
                        width: plannedWidth,
                        opacity: 1,
                      }}
                      transition={{
                        delay: index * 0.05,
                        duration: 0.35,
                      }}
                      whileHover={{
                        scale: 1.01,
                      }}
                      className={`
                        absolute
                        top-1/2
                        flex
                        h-10
                        -translate-y-1/2
                        items-center
                        overflow-hidden
                        px-3
                        text-xs
                        font-semibold
                        text-white
                        ${config.bar}
                        ${overdue
                          ? 'rounded-l-xl'
                          : 'rounded-xl'
                        }
                      `}
                      style={{
                        left: startOffset,
                        boxShadow: 'var(--shadow-sm)',
                      }}
                      title={stage.name}
                    >
                      <span className="truncate">
                        #{String(stage.execution_order).padStart(2, '0')}
                        {' · '}
                        {stage.name}
                      </span>
                    </motion.button>

                    {/* OVERRUN */}
                    {overdue && overrunWidth > 0 && (
                      <motion.button
                        type="button"
                        onClick={() => onSelect(stage)}
                        initial={{
                          width: 0,
                          opacity: 0,
                        }}
                        animate={{
                          width: overrunWidth,
                          opacity: 1,
                        }}
                        transition={{
                          delay: index * 0.05 + 0.2,
                          duration: 0.3,
                        }}
                        className="
                          absolute
                          top-1/2
                          flex
                          h-10
                          -translate-y-1/2
                          items-center
                          overflow-hidden
                          rounded-r-xl
                          bg-[var(--accent)]
                          px-2
                          text-xs
                          font-bold
                          text-white
                        "
                        style={{
                          left:
                            startOffset +
                            plannedWidth,
                        }}
                      >
                        {overrunWidth > 50 && (
                          <span className="truncate">
                            +{overrunDays(stage)} дн.
                          </span>
                        )}
                      </motion.button>
                    )}

                    {/* ACTUAL END */}
                    {overdue && actualEnd && (
                      <span
                        className="
                          pointer-events-none
                          absolute
                          top-1/2
                          -translate-y-1/2
                          whitespace-nowrap
                          text-xs
                          font-semibold
                          text-[var(--accent)]
                        "
                        style={{
                          left:
                            startOffset +
                            plannedWidth +
                            overrunWidth +
                            8,
                        }}
                      >
                        {stage.completed_at
                          ? fmtShort(
                            stage.completed_at.slice(0, 10),
                          )
                          : 'н.в.'}
                      </span>
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
   BOARD VIEW
   ════════════════════════════════════════════════════════════════ */

function BoardView({
  stages,
  responsibles,
  onSelect,
  onMoveStage,
}: {
  stages: ProjectStageResponse[];
  responsibles: Record<string, StageResponsible>;
  onSelect: (stage: ProjectStageResponse) => void;
  onMoveStage: (
    stageId: string,
    status: ProjectStageStatus,
  ) => Promise<void>;
}) {
  const columns: ProjectStageStatus[] = [
    'planned',
    'active',
    'on_hold',
    'completed',
    'skipped',
  ];

  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] =
    useState<ProjectStageStatus | null>(null);
  const [moving, setMoving] = useState(false);

  const grouped = useMemo(() => {
    const result: Record<
      ProjectStageStatus,
      ProjectStageResponse[]
    > = {
      planned: [],
      active: [],
      on_hold: [],
      completed: [],
      skipped: [],
    };

    sortOrd(stages).forEach(stage => {
      result[stage.status].push(stage);
    });

    return result;
  }, [stages]);

  const handleDrop = async (
    status: ProjectStageStatus,
  ) => {
    const id = dragId;

    setDragId(null);
    setOverColumn(null);

    if (!id || moving) return;

    const stage = stages.find(item => item.id === id);

    if (!stage || stage.status === status) return;

    setMoving(true);

    try {
      await onMoveStage(id, status);
    } catch {
      // Уведомление об ошибке показывает родитель.
    } finally {
      setMoving(false);
    }
  };

  if (!stages.length) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-16 text-center">
        <LayoutGrid className="mx-auto h-12 w-12 text-[var(--text-disabled)]" />

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Нет этапов для отображения
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5"
    >
      {columns.map(column => {
        const config = STATUS_CFG[column];
        const Icon = config.icon;

        const items = grouped[column];
        const isOver = overColumn === column;

        return (
          <div
            key={column}
            onDragOver={event => {
              event.preventDefault();

              if (!moving) {
                setOverColumn(column);
              }
            }}
            onDragLeave={event => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node,
                )
              ) {
                setOverColumn(null);
              }
            }}
            onDrop={event => {
              event.preventDefault();
              void handleDrop(column);
            }}
            className={`
              flex
              min-h-[420px]
              flex-col
              overflow-hidden
              rounded-2xl
              border
              bg-[var(--bg-card)]
              transition-all
              ${isOver
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]/10'
                : 'border-[var(--border-color)]'
              }
            `}
          >
            {/* COLUMN HEADER */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-4">

              <div className="flex items-center gap-2">

                <Icon className={`h-4 w-4 ${config.text}`} />

                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {config.label}
                </h3>
              </div>

              <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--hover-2)] px-2 text-xs font-semibold text-[var(--text-secondary)]">
                {items.length}
              </span>
            </div>

            {/* COLUMN CONTENT */}
            <div className="flex-1 space-y-3 p-3">

              {items.length === 0 && (
                <div
                  className={`
                    flex h-32 flex-col items-center justify-center
                    rounded-xl border border-dashed
                    ${isOver
                      ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]'
                      : 'border-[var(--border-color)]'
                    }
                  `}
                >
                  <Milestone className="h-6 w-6 text-[var(--text-disabled)]" />

                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {isOver ? 'Отпустите этап' : 'Пусто'}
                  </p>
                </div>
              )}

              {items.map(stage => {
                const responsible = stage.responsible_id
                  ? responsibles[stage.responsible_id]
                  : null;

                const effective = effStatus(stage);

                const dragging = dragId === stage.id;

                return (
                  <motion.div
                    key={stage.id}
                    layout
                    draggable={!moving}
                    onDragStart={event => {
                      setDragId(stage.id);

                      if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                      }
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverColumn(null);
                    }}
                    className={`
                      rounded-xl
                      border
                      bg-[var(--hover-1)]
                      p-4
                      cursor-grab
                      select-none
                      transition-colors
                      hover:bg-[var(--hover-2)]
                      ${effective === 'overdue'
                        ? 'border-[var(--accent)]/30'
                        : 'border-[var(--border-color)]'
                      }
                      ${dragging ? 'opacity-40' : ''}
                    `}
                  >
                    {/* TOP */}
                    <div className="mb-3 flex items-center justify-between gap-2">

                      <Badge order={stage.execution_order} />

                      <button
                        type="button"
                        onClick={() => onSelect(stage)}
                        aria-label="Открыть этап"
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-3)] hover:text-[var(--accent)]"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>

                    {/* NAME */}
                    <button
                      type="button"
                      onClick={() => onSelect(stage)}
                      className="w-full text-left"
                    >
                      <h4 className="text-sm font-bold leading-6 text-[var(--text-primary)]">
                        {stage.name}
                      </h4>

                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                        {stage.description || 'Без описания'}
                      </p>
                    </button>

                    {/* PEOPLE */}
                    <div className="mt-4 space-y-3 border-t border-[var(--border-color)] pt-4">

                      {responsible && (
                        <div className="flex items-center gap-2">

                          <Ava
                            name={responsible.full_name}
                            size="sm"
                          />

                          <div className="min-w-0">

                            <p className="text-[11px] text-[var(--text-muted)]">
                              Ответственный
                            </p>

                            <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                              {responsible.full_name}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">

                        <span className="text-xs text-[var(--text-muted)]">
                          Исполнители
                        </span>

                        <AssigneesPreview
                          ids={stage.assignee_ids}
                          users={responsibles}
                          maxVisible={3}
                        />
                      </div>
                    </div>

                    {/* DATE */}
                    <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3 text-xs text-[var(--text-muted)]">

                      <Calendar className="h-3.5 w-3.5" />

                      {fmtShort(stage.planned_end)}

                      {effective === 'overdue' && (
                        <AlertTriangle className="ml-auto h-4 w-4 text-[var(--accent)]" />
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {dragId && items.length > 0 && (
                <div
                  className={`
                    flex h-16 items-center justify-center
                    rounded-xl border-2 border-dashed
                    text-xs
                    ${isOver
                      ? 'border-[var(--accent)]/40 text-[var(--accent)]'
                      : 'border-[var(--border-color)] text-[var(--text-muted)]'
                    }
                  `}
                >
                  {isOver ? 'Отпустите' : 'Перетащите сюда'}
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
   ANALYTICS VIEW
   ════════════════════════════════════════════════════════════════ */

function AnalyticsView({
  stages,
}: {
  stages: ProjectStageResponse[];
}) {
  const total = stages.length;

  const completed = stages.filter(
    stage => stage.status === 'completed',
  ).length;

  const active = stages.filter(
    stage => stage.status === 'active',
  ).length;

  const overdue = stages.filter(
    stage =>
      stage.is_overdue &&
      stage.status !== 'completed' &&
      stage.status !== 'skipped',
  ).length;

  const completedLate = stages.filter(
    stage => isFactOverPlan(stage),
  ).length;

  const durations = stages
    .map(stage => stage.planned_duration_days)
    .filter((value): value is number => value != null);

  const averageDuration = durations.length
    ? Math.round(
      durations.reduce((sum, value) => sum + value, 0) /
      durations.length,
    )
    : 0;

  const totalOverrun = stages.reduce(
    (sum, stage) => sum + overrunDays(stage),
    0,
  );

  const assignedUsers = new Set(
    stages.flatMap(stage => stage.assignee_ids ?? []),
  );

  const cards = [
    {
      label: 'Всего этапов',
      value: total,
      icon: Milestone,
      color: 'text-[var(--text-primary)]',
      background: 'bg-[var(--hover-2)]',
    },
    {
      label: 'Завершено',
      value: completed,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      background: 'bg-emerald-500/10',
    },
    {
      label: 'В работе',
      value: active,
      icon: PlayCircle,
      color: 'text-blue-400',
      background: 'bg-blue-500/10',
    },
    {
      label: 'Просрочено',
      value: overdue,
      icon: AlertTriangle,
      color: 'text-[var(--accent)]',
      background: 'bg-[var(--accent-soft)]',
    },
    {
      label: 'Исполнителей',
      value: assignedUsers.size,
      icon: Users,
      color: 'text-[var(--text-primary)]',
      background: 'bg-[var(--hover-2)]',
    },
    {
      label: 'Средняя длительность',
      value: `${averageDuration} дн.`,
      icon: Clock,
      color: 'text-amber-500',
      background: 'bg-amber-500/10',
    },
    {
      label: 'С превышением',
      value: completedLate,
      icon: TrendingUp,
      color: 'text-orange-400',
      background: 'bg-orange-500/10',
    },
    {
      label: 'Всего превышено',
      value: `${totalOverrun} дн.`,
      icon: AlertTriangle,
      color: 'text-[var(--accent)]',
      background: 'bg-[var(--accent-soft)]',
    },
  ];

  if (!total) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-[var(--text-disabled)]" />

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Нет данных для аналитики
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {cards.map((card, index) => {
          const Icon = card.icon;

          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="
                rounded-2xl
                border border-[var(--border-color)]
                bg-[var(--bg-card)]
                p-5
              "
            >
              <div className="flex items-start justify-between gap-4">

                <div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {card.label}
                  </p>

                  <p className="mt-3 text-3xl font-bold text-[var(--text-primary)]">
                    {card.value}
                  </p>
                </div>

                <div
                  className={`
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-xl
                    ${card.background}
                  `}
                >
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* EXECUTION TABLE */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

        <div className="border-b border-[var(--border-color)] px-6 py-5">

          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Сроки и исполнение
          </h3>

          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Сравнение плановых и фактических показателей
          </p>
        </div>

        <div className="overflow-x-auto">

          <table className="w-full min-w-[850px]">

            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--hover-1)]">

                {[
                  'Этап',
                  'Плановые сроки',
                  'Фактические сроки',
                  'План',
                  'Факт',
                  'Отклонение',
                  'Исполнители',
                ].map(label => (
                  <th
                    key={label}
                    className="px-5 py-4 text-left text-xs font-semibold text-[var(--text-muted)]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortOrd(stages).map(stage => {
                const plannedStart = parseDate(stage.planned_start);
                const plannedEnd = parseDate(stage.planned_end);

                const actualStart = parseDate(stage.started_at);
                const actualEnd = getActualEnd(stage);

                const plannedDays =
                  plannedStart && plannedEnd
                    ? daysB(plannedStart, plannedEnd) + 1
                    : null;

                const actualDays =
                  actualStart && actualEnd
                    ? daysB(actualStart, actualEnd) + 1
                    : null;

                const difference =
                  plannedDays != null && actualDays != null
                    ? actualDays - plannedDays
                    : null;

                return (
                  <tr
                    key={stage.id}
                    className="border-b border-[var(--border-color)] hover:bg-[var(--hover-1)]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">

                        <Badge order={stage.execution_order} />

                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {stage.name}
                        </span>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-sm text-[var(--text-secondary)]">
                      {fmtShort(stage.planned_start)}
                      {' — '}
                      {fmtShort(stage.planned_end)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-sm text-[var(--text-secondary)]">
                      {fmtShort(stage.started_at)}
                      {' — '}
                      {stage.completed_at
                        ? fmtShort(stage.completed_at)
                        : stage.started_at
                          ? 'н.в.'
                          : '—'}
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--text-secondary)]">
                      {plannedDays ?? '—'}
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--text-secondary)]">
                      {actualDays ?? '—'}
                    </td>

                    <td className="px-5 py-4">

                      {difference == null ? (
                        <span className="text-sm text-[var(--text-muted)]">
                          —
                        </span>
                      ) : (
                        <span
                          className={`
                            text-sm font-semibold
                            ${difference > 0
                              ? 'text-[var(--accent)]'
                              : difference < 0
                                ? 'text-emerald-500'
                                : 'text-[var(--text-secondary)]'
                            }
                          `}
                        >
                          {difference > 0 ? '+' : ''}
                          {difference} дн.
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--text-secondary)]">
                      {(stage.assignee_ids ?? []).length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STAGE DETAIL
   ════════════════════════════════════════════════════════════════ */

function StageDetail({
  stage,
  responsible,
  responsibles,
  totalStages,
  currentUserId,
  onBack,
  onSave,
  onDelete,
  onStart,
  onComplete,
  onSkip,
  onSetAssignees,
}: {
  stage: ProjectStageResponse;
  responsible: StageResponsible | null;
  responsibles: Record<string, StageResponsible>;
  totalStages: number;
  currentUserId?: string;
  onBack: () => void;
  onSave: (
    id: string,
    payload: StageUpsertPayload,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onSkip: (id: string) => Promise<void>;
  onSetAssignees: (
    stageId: string,
    ids: string[],
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const [form, setForm] = useState<StageForm>(
    stageToForm(stage),
  );

  const [assigneesModalOpen, setAssigneesModalOpen] =
    useState(false);

  const [savingAssignees, setSavingAssignees] =
    useState(false);

  const assigneeIds = stage.assignee_ids ?? [];

  useEffect(() => {
    setForm(stageToForm(stage));
  }, [stage.id, stage.updated_at]);

  const updateForm = <K extends keyof StageForm>(
    key: K,
    value: StageForm[K],
  ) => {
    setForm(previous => ({
      ...previous,
      [key]: value,
    }));
  };

  const inputClass = `
    w-full rounded-xl
    border border-[var(--border-color)]
    bg-[var(--hover-2)]
    px-4 py-3
    text-sm text-[var(--text-primary)]
    outline-none
    transition-colors
    placeholder:text-[var(--text-muted)]
    focus:border-[var(--accent)]
  `;

  const labelClass =
    'mb-2 block text-sm font-medium text-[var(--text-secondary)]';

  const effective = effStatus(stage);
  const overdue = isFactOverPlan(stage);
  const overdueDays = overrunDays(stage);

  const canStart =
    stage.status === 'planned' ||
    stage.status === 'on_hold';

  const canComplete = stage.status === 'active';

  const canSkip =
    stage.status === 'planned' ||
    stage.status === 'on_hold';

  const userOptions = Object.values(responsibles).sort(
    (a, b) => a.full_name.localeCompare(b.full_name, 'ru'),
  );

  const plannedStart = parseDate(stage.planned_start);
  const plannedEnd = parseDate(stage.planned_end);
  const actualStart = parseDate(stage.started_at);
  const actualEnd = getActualEnd(stage);

  const plannedDays =
    plannedStart && plannedEnd
      ? daysB(plannedStart, plannedEnd) + 1
      : null;

  const actualDays =
    actualStart && actualEnd
      ? daysB(actualStart, actualEnd) + 1
      : null;

  /* =========================================================
     SAVE
     ========================================================= */

  const handleSave = async () => {
    const payload = formToPayload(form);

    if (!payload.name || saving) return;

    setSaving(true);

    try {
      await onSave(stage.id, payload);
      setEditing(false);
    } catch {
      // Ошибка отображается родителем.
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (
    name: string,
    handler: (id: string) => Promise<void>,
  ) => {
    if (action) return;

    setAction(name);

    try {
      await handler(stage.id);
    } catch {
      // Ошибка отображается родителем.
    } finally {
      setAction(null);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Удалить этап «${stage.name}»?`,
      )
    ) {
      return;
    }

    await handleAction('delete', onDelete);
  };

  const handleSaveAssignees = async (ids: string[]) => {
    setSavingAssignees(true);

    try {
      await onSetAssignees(stage.id, ids);
    } finally {
      setSavingAssignees(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* BACK */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к этапам
      </button>

      {/* HEADER */}
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-8">

        <div className="flex flex-wrap items-start justify-between gap-5">

          <div className="min-w-0 flex-1">

            <div className="mb-4 flex flex-wrap items-center gap-2">

              <Badge order={stage.execution_order} />

              <Chip status={stage.status} />

              {effective === 'overdue' && (
                <Chip status="overdue" />
              )}

              {overdue && (
                <span className="rounded-lg bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                  Отклонение +{overdueDays} дн.
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              {stage.name}
            </h1>

            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
              {stage.description || 'Описание не заполнено'}
            </p>
          </div>

          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="
                inline-flex items-center gap-2
                rounded-xl border border-[var(--border-color)]
                bg-[var(--hover-2)] px-4 py-3
                text-sm font-medium text-[var(--text-primary)]
                hover:bg-[var(--hover-3)]
              "
            >
              <PenSquare className="h-4 w-4" />
              Редактировать
            </button>
          )}
        </div>
      </section>

      {/* EDIT MODE */}
      {editing ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-8">

          <h2 className="mb-6 text-xl font-bold text-[var(--text-primary)]">
            Редактирование этапа
          </h2>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

            <div className="md:col-span-2">
              <label className={labelClass}>
                Название этапа
              </label>

              <input
                value={form.name}
                onChange={event =>
                  updateForm('name', event.target.value)
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Номер этапа
              </label>

              <input
                type="number"
                min={1}
                value={form.order}
                onChange={event =>
                  updateForm('order', event.target.value)
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Статус
              </label>

              <Select
                value={form.status}
                onValueChange={value =>
                  updateForm(
                    'status',
                    value as ProjectStageStatus,
                  )
                }
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="planned">
                    Запланирован
                  </SelectItem>

                  <SelectItem value="active">
                    В работе
                  </SelectItem>

                  <SelectItem value="on_hold">
                    На паузе
                  </SelectItem>

                  <SelectItem value="completed">
                    Завершён
                  </SelectItem>

                  <SelectItem value="skipped">
                    Пропущен
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={labelClass}>
                Плановое начало
              </label>

              <input
                type="date"
                value={form.planned_start}
                onChange={event =>
                  updateForm(
                    'planned_start',
                    event.target.value,
                  )
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Плановое окончание
              </label>

              <input
                type="date"
                value={form.planned_end}
                onChange={event =>
                  updateForm(
                    'planned_end',
                    event.target.value,
                  )
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Длительность, дней
              </label>

              <input
                type="number"
                min={1}
                value={form.planned_duration_days}
                onChange={event =>
                  updateForm(
                    'planned_duration_days',
                    event.target.value,
                  )
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Ответственный
              </label>

              <Select
                value={form.responsible_id || '__none__'}
                onValueChange={value =>
                  updateForm(
                    'responsible_id',
                    value === '__none__' ? '' : value,
                  )
                }
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Выберите ответственного" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="__none__">
                    Не назначен
                  </SelectItem>

                  {userOptions.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>
                Описание
              </label>

              <textarea
                value={form.description}
                onChange={event =>
                  updateForm(
                    'description',
                    event.target.value,
                  )
                }
                rows={5}
                className={`${inputClass} resize-y`}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>
                Критерии приёмки
              </label>

              <textarea
                value={form.completion_criteria}
                onChange={event =>
                  updateForm(
                    'completion_criteria',
                    event.target.value,
                  )
                }
                rows={5}
                placeholder="Каждый критерий с новой строки"
                className={`${inputClass} resize-y`}
              />
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-color)] pt-6">

            <button
              type="button"
              onClick={handleDelete}
              disabled={!!action}
              className="
                inline-flex items-center gap-2
                rounded-xl border border-[var(--accent)]/20
                bg-[var(--accent-soft)]
                px-4 py-3 text-sm font-medium
                text-[var(--accent)]
                disabled:opacity-50
              "
            >
              {action === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              Удалить этап
            </button>

            <div className="flex items-center gap-3">

              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm(stageToForm(stage));
                }}
                disabled={saving}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm text-[var(--text-secondary)]"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">

          {/* LEFT COLUMN */}
          <div className="space-y-6">

            {/* DATES */}
            <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

              <h3 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
                Сроки и исполнение
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                {/* PLAN */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">

                  <div className="mb-4 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />

                    <span className="text-sm font-semibold text-blue-400">
                      Плановые сроки
                    </span>
                  </div>

                  <div className="space-y-4">

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Начало
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {fmtDate(stage.planned_start)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Окончание
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {fmtDate(stage.planned_end)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Длительность
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {plannedDays != null
                          ? `${plannedDays} дн.`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ACTUAL */}
                <div
                  className={`
                    rounded-xl border p-4
                    ${overdue
                      ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)]'
                      : 'border-emerald-500/20 bg-emerald-500/5'
                    }
                  `}
                >
                  <div className="mb-4 flex items-center gap-2">

                    <span
                      className={`h-2.5 w-2.5 rounded-full ${overdue
                          ? 'bg-[var(--accent)]'
                          : 'bg-emerald-500'
                        }`}
                    />

                    <span
                      className={`text-sm font-semibold ${overdue
                          ? 'text-[var(--accent)]'
                          : 'text-emerald-500'
                        }`}
                    >
                      Фактически
                    </span>
                  </div>

                  <div className="space-y-4">

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Начало
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {fmtDate(stage.started_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Окончание
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {stage.completed_at
                          ? fmtDate(stage.completed_at)
                          : stage.started_at
                            ? 'В работе'
                            : '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Длительность
                      </p>

                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {actualDays != null
                          ? `${actualDays} дн.`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {overdue && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-medium text-[var(--accent)]">

                  <AlertTriangle className="h-4 w-4" />

                  Превышение планового срока на {overdueDays} дн.
                </div>
              )}
            </section>

            {/* RESPONSIBLE */}
            <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

              <h3 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">

                <User className="h-4 w-4 text-[var(--text-muted)]" />

                Ответственный
              </h3>

              {responsible ? (
                <div className="flex items-center gap-4">

                  <Ava name={responsible.full_name} />

                  <div className="min-w-0">

                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {responsible.full_name}
                    </p>

                    {responsible.role && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {responsible.role}
                      </p>
                    )}

                    {responsible.email && (
                      <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                        {responsible.email}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Ответственный не назначен
                </p>
              )}
            </section>

            {/* ASSIGNEES */}
            <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">

              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-6 py-5">

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--hover-2)]">
                    <Users className="h-5 w-5 text-[var(--text-secondary)]" />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      Исполнители
                    </h3>

                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Сотрудники, назначенные на этап
                    </p>
                  </div>
                </div>

                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[var(--hover-2)] px-2 text-sm font-semibold text-[var(--text-secondary)]">
                  {assigneeIds.length}
                </span>
              </div>

              <div className="p-6">

                {assigneeIds.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-8 text-center">

                    <Users className="mx-auto h-9 w-9 text-[var(--text-disabled)]" />

                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      Исполнители не назначены
                    </p>

                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Добавьте сотрудников для выполнения этапа
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">

                    {assigneeIds.map(id => {
                      const employee = responsibles[id];

                      return (
                        <div
                          key={id}
                          className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3"
                        >
                          <Ava
                            name={employee?.full_name}
                            size="sm"
                          />

                          <div className="min-w-0 flex-1">

                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {employee?.full_name ?? 'Пользователь'}
                            </p>

                            {employee?.email && (
                              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                                {employee.email}
                              </p>
                            )}
                          </div>

                          {id === currentUserId && (
                            <span className="rounded-lg bg-[var(--hover-2)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                              Вы
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setAssigneesModalOpen(true)}
                  className="
                    mt-4 flex w-full items-center justify-center gap-2
                    rounded-xl border border-[var(--border-color)]
                    bg-[var(--hover-2)] px-4 py-3
                    text-sm font-semibold text-[var(--text-primary)]
                    transition-colors
                    hover:bg-[var(--hover-3)]
                  "
                >
                  <UserPlus className="h-4 w-4" />

                  {assigneeIds.length
                    ? 'Управление исполнителями'
                    : 'Назначить исполнителей'}
                </button>
              </div>
            </section>

            {/* SERVICE INFO */}
            <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

              <h3 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                <Settings2 className="h-4 w-4 text-[var(--text-muted)]" />
                Служебная информация
              </h3>

              <div className="space-y-4">

                {[
                  {
                    label: 'ID',
                    value: stage.id,
                  },
                  {
                    label: 'Порядок',
                    value: `Этап ${stage.execution_order} из ${totalStages}`,
                  },
                  {
                    label: 'Создан',
                    value: fmtDT(stage.created_at),
                  },
                  {
                    label: 'Обновлён',
                    value: fmtDT(stage.updated_at),
                  },
                ].map(item => (
                  <div
                    key={item.label}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <span className="shrink-0 text-[var(--text-muted)]">
                      {item.label}
                    </span>

                    <span className="break-all text-right text-[var(--text-secondary)]">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">

            {/* CRITERIA */}
            <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

              <h3 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                <ListChecks className="h-4 w-4 text-[var(--text-muted)]" />
                Критерии приёмки
              </h3>

              {!stage.completion_criteria.length ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Критерии не указаны
                </p>
              ) : (
                <div className="space-y-4">

                  {stage.completion_criteria.map(
                    (criterion, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3"
                      >
                        <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />

                        <p className="text-sm leading-6 text-[var(--text-secondary)]">
                          {criterion}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>

            {/* ACTIONS */}
            <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

              <h3 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                <Flag className="h-4 w-4 text-[var(--text-muted)]" />
                Действия
              </h3>

              <div className="space-y-3">

                {canStart && (
                  <button
                    type="button"
                    onClick={() =>
                      handleAction('start', onStart)
                    }
                    disabled={!!action}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {action === 'start' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}

                    {action === 'start'
                      ? 'Запускаем...'
                      : 'Начать этап'}
                  </button>
                )}

                {canComplete && (
                  <button
                    type="button"
                    onClick={() =>
                      handleAction('complete', onComplete)
                    }
                    disabled={!!action}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {action === 'complete' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}

                    {action === 'complete'
                      ? 'Завершаем...'
                      : 'Завершить этап'}
                  </button>
                )}

                {canSkip && (
                  <button
                    type="button"
                    onClick={() =>
                      handleAction('skip', onSkip)
                    }
                    disabled={!!action}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
                  >
                    <SkipForward className="h-4 w-4" />

                    {action === 'skip'
                      ? 'Пропускаем...'
                      : 'Пропустить этап'}
                  </button>
                )}

                {!canStart && !canComplete && !canSkip && (
                  <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                    Нет доступных действий
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* MODAL */}
      <AssigneesModal
        open={assigneesModalOpen}
        onClose={() => setAssigneesModalOpen(false)}
        users={responsibles}
        selectedIds={assigneeIds}
        currentUserId={currentUserId}
        saving={savingAssignees}
        onSave={handleSaveAssignees}
      />
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CREATE STAGE
   ════════════════════════════════════════════════════════════════ */

function CreateStage({
  nextOrder,
  responsibles,
  onBack,
  onSubmit,
}: {
  nextOrder: number;
  responsibles: Record<string, StageResponsible>;
  onBack: () => void;
  onSubmit: (payload: StageUpsertPayload) => Promise<void>;
}) {
  const [form, setForm] = useState<StageForm>(
    emptyForm(nextOrder),
  );

  const [saving, setSaving] = useState(false);

  const updateForm = <K extends keyof StageForm>(
    key: K,
    value: StageForm[K],
  ) => {
    setForm(previous => ({
      ...previous,
      [key]: value,
    }));
  };

  const users = Object.values(responsibles).sort(
    (a, b) => a.full_name.localeCompare(b.full_name, 'ru'),
  );

  const inputClass =
    'w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

  const labelClass =
    'mb-2 block text-sm font-medium text-[var(--text-secondary)]';

  const handleSubmit = async () => {
    const payload = formToPayload(form);

    if (!payload.name || saving) return;

    setSaving(true);

    try {
      await onSubmit(payload);
    } catch {
      // Ошибка отображается родителем.
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="space-y-6"
    >
      {/* BACK */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к этапам
      </button>

      {/* HEADER */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <Plus className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Новый этап
            </h1>

            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Заполните информацию об этапе проекта
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}

          {saving ? 'Создание...' : 'Создать этап'}
        </button>
      </section>

      {/* FORM */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">

        {/* MAIN */}
        <div className="space-y-6">

          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

            <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <Milestone className="h-4 w-4 text-[var(--text-muted)]" />
              Основные данные
            </h2>

            <div className="space-y-5">

              <div>
                <label className={labelClass}>
                  Название этапа
                </label>

                <input
                  value={form.name}
                  onChange={event =>
                    updateForm('name', event.target.value)
                  }
                  placeholder="Например, тестирование"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">

                <div>
                  <label className={labelClass}>
                    Номер
                  </label>

                  <input
                    type="number"
                    min={1}
                    value={form.order}
                    onChange={event =>
                      updateForm('order', event.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Статус
                  </label>

                  <Select
                    value={form.status}
                    onValueChange={value =>
                      updateForm(
                        'status',
                        value as ProjectStageStatus,
                      )
                    }
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Статус" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="planned">
                        Запланирован
                      </SelectItem>

                      <SelectItem value="active">
                        В работе
                      </SelectItem>

                      <SelectItem value="on_hold">
                        На паузе
                      </SelectItem>

                      <SelectItem value="completed">
                        Завершён
                      </SelectItem>

                      <SelectItem value="skipped">
                        Пропущен
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Ответственный
                </label>

                <Select
                  value={form.responsible_id || '__none__'}
                  onValueChange={value =>
                    updateForm(
                      'responsible_id',
                      value === '__none__' ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Выберите сотрудника" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="__none__">
                      Не назначен
                    </SelectItem>

                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* DATES */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

            <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              Плановые сроки
            </h2>

            <div className="space-y-4">

              <div>
                <label className={labelClass}>
                  Начало
                </label>

                <input
                  type="date"
                  value={form.planned_start}
                  onChange={event =>
                    updateForm(
                      'planned_start',
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Окончание
                </label>

                <input
                  type="date"
                  value={form.planned_end}
                  onChange={event =>
                    updateForm(
                      'planned_end',
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Длительность, дней
                </label>

                <input
                  type="number"
                  min={1}
                  value={form.planned_duration_days}
                  onChange={event =>
                    updateForm(
                      'planned_duration_days',
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        {/* DESCRIPTION */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

          <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <FileText className="h-4 w-4 text-[var(--text-muted)]" />
            Описание
          </h2>

          <textarea
            value={form.description}
            onChange={event =>
              updateForm('description', event.target.value)
            }
            placeholder="Опишите задачи и цели этапа"
            className={`${inputClass} min-h-[280px] resize-y`}
          />
        </section>

        {/* CRITERIA */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">

          <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <ListChecks className="h-4 w-4 text-[var(--text-muted)]" />
            Критерии приёмки
          </h2>

          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Каждый критерий укажите с новой строки
          </p>

          <textarea
            value={form.completion_criteria}
            onChange={event =>
              updateForm(
                'completion_criteria',
                event.target.value,
              )
            }
            placeholder={'Утверждено ТЗ\nПройдены тесты'}
            className={`${inputClass} min-h-[280px] resize-y`}
          />
        </section>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PROJECT STAGES SECTION
   ════════════════════════════════════════════════════════════════ */

interface SectionProps {
  projectId: string;
}

export function ProjectStagesSection({
  projectId,
}: SectionProps) {
  const { user } = useAuthStore();

  const [stages, setStages] =
    useState<ProjectStageResponse[]>([]);

  const [responsibles, setResponsibles] =
    useState<Record<string, StageResponsible>>({});

  const [loading, setLoading] = useState(true);

  const [view, setView] =
    useState<ViewType>('table');

  const [screen, setScreen] =
    useState<SectionScreen>({ type: 'list' });

  const [toasts, setToasts] =
    useState<Toast[]>([]);

  /* =========================================================
     TOASTS
     ========================================================= */

  const push = useCallback(
    (
      title: string,
      type: Toast['type'] = 'info',
    ) => {
      const id =
        Date.now() + Math.random();

      setToasts(previous => [
        ...previous,
        {
          id,
          title,
          type,
        },
      ]);

      window.setTimeout(() => {
        setToasts(previous =>
          previous.filter(toast => toast.id !== id),
        );
      }, 3500);
    },
    [],
  );

  /* =========================================================
     LOAD USERS
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        const result: Record<
          string,
          StageResponsible
        > = {};

        let page = 1;
        let totalPages = 1;

        do {
          const response =
            await usersApi.getAllUsers(page, 100);

          if (cancelled) return;

          response.items.forEach(item => {
            result[item.id] = {
              id: item.id,
              full_name:
                item.full_name ||
                item.email ||
                'Без имени',
              email: item.email,
            };
          });

          totalPages = response.total_pages;
          page += 1;
        } while (
          page <= totalPages &&
          !cancelled
        );

        if (!cancelled) {
          setResponsibles(result);
        }
      } catch (error) {
        console.error(
          'Failed to load users:',
          error,
        );

        if (!cancelled) {
          push(
            'Не удалось загрузить сотрудников',
            'error',
          );
        }
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [push]);

  /* =========================================================
     LOAD PROJECT
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      setLoading(true);

      try {
        const project =
          await projectsApi.getById(projectId);

        if (cancelled) return;

        setStages(sortOrd(project.stages ?? []));
      } catch (error) {
        console.error(
          'Failed to load project:',
          error,
        );

        if (!cancelled) {
          push(
            'Не удалось загрузить проект',
            'error',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId, push]);

  /* =========================================================
     HELPERS
     ========================================================= */

  const commit = useCallback(
    (next: ProjectStageResponse[]) => {
      setStages(sortOrd(next));
    },
    [],
  );

  const selectedStage = useMemo(() => {
    if (screen.type !== 'detail') {
      return null;
    }

    return (
      stages.find(
        stage => stage.id === screen.stageId,
      ) ?? null
    );
  }, [stages, screen]);

  const goList = useCallback(() => {
    setScreen({ type: 'list' });
  }, []);

  const goDetail = useCallback(
    (stage: ProjectStageResponse) => {
      setScreen({
        type: 'detail',
        stageId: stage.id,
        editing: false,
      });
    },
    [],
  );

  const goCreate = useCallback(() => {
    setScreen({ type: 'create' });
  }, []);

  const reloadProject = useCallback(async () => {
    const project =
      await projectsApi.getById(projectId);

    commit(project.stages ?? []);

    return project;
  }, [projectId, commit]);

  /* =========================================================
     CREATE STAGE
     ========================================================= */

  const handleCreate = useCallback(
    async (payload: StageUpsertPayload) => {
      try {
        const apiPayload = {
          name: payload.name,
          description: payload.description ?? undefined,
          execution_order: payload.order,
          planned_start: payload.planned_start,
          planned_end: payload.planned_end,
          responsible_id:
            payload.responsible_id ?? undefined,
          completion_criteria:
            payload.completion_criteria,
        };

        const project = await projectsApi.createStage(
          projectId,
          apiPayload as any,
        );

        const sorted = sortOrd(project.stages ?? []);

        commit(sorted);

        const newStage = [...sorted]
          .reverse()
          .find(stage => stage.name === payload.name);

        if (newStage) {
          goDetail(newStage);
        } else {
          goList();
        }

        push(
          `Этап «${payload.name}» создан`,
          'success',
        );
      } catch (error) {
        console.error(
          'Create stage error:',
          error,
        );

        push(
          'Не удалось создать этап',
          'error',
        );

        throw error;
      }
    },
    [
      projectId,
      commit,
      goDetail,
      goList,
      push,
    ],
  );

  /* =========================================================
     UPDATE STAGE
     ========================================================= */

  const handleUpdate = useCallback(
    async (
      stageId: string,
      payload: StageUpsertPayload,
    ) => {
      try {
        const current = stages.find(
          stage => stage.id === stageId,
        );

        if (!current) {
          throw new Error('Stage not found');
        }

        const apiPayload = {
          name: payload.name,
          description: payload.description,
          responsible_id: payload.responsible_id,
          completion_criteria:
            payload.completion_criteria,
          planned_start: payload.planned_start,
          planned_end: payload.planned_end,
        };

        const updatedStage =
          await projectsApi.updateStage(
            projectId,
            stageId,
            apiPayload as any,
          );

        commit(
          stages.map(stage =>
            stage.id === stageId
              ? { ...stage, ...updatedStage }
              : stage,
          ),
        );

        push(
          `Этап «${payload.name}» сохранён`,
          'success',
        );
      } catch (error) {
        console.error(
          'Update stage error:',
          error,
        );

        push(
          'Не удалось сохранить этап',
          'error',
        );

        throw error;
      }
    },
    [stages, projectId, commit, push],
  );

  /* =========================================================
     DELETE STAGE
     ========================================================= */

  const handleDelete = useCallback(
    async (stageId: string) => {
      try {
        await projectsApi.deleteStage(
          projectId,
          stageId,
        );

        await reloadProject();

        goList();

        push(
          'Этап удалён',
          'success',
        );
      } catch (error) {
        console.error(
          'Delete stage error:',
          error,
        );

        push(
          'Не удалось удалить этап',
          'error',
        );

        throw error;
      }
    },
    [
      projectId,
      reloadProject,
      goList,
      push,
    ],
  );

  /* =========================================================
     QUICK ACTIONS
     ========================================================= */

  const quickAction = useCallback(
    async (
      stageId: string,
      type: 'start' | 'complete' | 'skip',
    ) => {
      try {
        if (type === 'start') {
          await projectsApi.startStage(
            projectId,
            stageId,
          );
        } else if (type === 'complete') {
          await projectsApi.completeStage(
            projectId,
            stageId,
          );
        } else {
          await projectsApi.skipStage(
            projectId,
            stageId,
          );
        }

        await reloadProject();

        const messages = {
          start: 'Этап запущен',
          complete: 'Этап завершён',
          skip: 'Этап пропущен',
        };

        push(messages[type], 'success');
      } catch (error) {
        console.error(
          'Stage action error:',
          error,
        );

        push(
          'Не удалось выполнить действие',
          'error',
        );

        throw error;
      }
    },
    [
      projectId,
      reloadProject,
      push,
    ],
  );

  /* =========================================================
     MOVE STAGE
     ========================================================= */

  const handleMoveStage = useCallback(
    async (
      stageId: string,
      newStatus: ProjectStageStatus,
    ) => {
      const current = stages.find(
        stage => stage.id === stageId,
      );

      if (!current || current.status === newStatus) {
        return;
      }

      try {
        if (newStatus === 'active') {
          await projectsApi.startStage(
            projectId,
            stageId,
          );
        } else if (newStatus === 'completed') {
          await projectsApi.completeStage(
            projectId,
            stageId,
          );
        } else if (newStatus === 'skipped') {
          await projectsApi.skipStage(
            projectId,
            stageId,
          );
        } else {
          throw new Error(
            'Перемещение в выбранный статус не поддерживается API',
          );
        }

        await reloadProject();

        push(
          `Статус этапа: ${STATUS_CFG[newStatus].label}`,
          'success',
        );
      } catch (error) {
        console.error(
          'Move stage error:',
          error,
        );

        push(
          'Не удалось изменить статус',
          'error',
        );

        throw error;
      }
    },
    [
      stages,
      projectId,
      reloadProject,
      push,
    ],
  );

  /* =========================================================
     SET ASSIGNEES
     ========================================================= */

  const handleSetAssignees = useCallback(
    async (
      stageId: string,
      userIds: string[],
    ) => {
      try {
        const uniqueIds = [...new Set(userIds)];

        const updatedStage =
          await projectsApi.setStageAssignees(
            projectId,
            stageId,
            uniqueIds,
          );

        // Обновляем данные этапа из ответа API.
        setStages(previous =>
          previous.map(stage =>
            stage.id === stageId
              ? {
                ...stage,
                ...updatedStage,
                assignee_ids:
                  updatedStage.assignee_ids ?? uniqueIds,
              }
              : stage,
          ),
        );

        // Синхронизируемся с сервером.
        try {
          await reloadProject();
        } catch (reloadError) {
          console.error(
            'Failed to refresh project after assignee update:',
            reloadError,
          );
        }

        push(
          'Исполнители обновлены',
          'success',
        );
      } catch (error) {
        console.error(
          'Failed to set stage assignees:',
          error,
        );

        push(
          'Не удалось сохранить исполнителей',
          'error',
        );

        throw error;
      }
    },
    [
      projectId,
      reloadProject,
      push,
    ],
  );

  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return <PageSkeleton />;
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="space-y-6">

      <AnimatePresence mode="wait">

        {/* LIST */}
        {screen.type === 'list' && (
          <motion.div
            key="stages-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* VIEW NAVIGATION */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">

              <ViewTabs
                view={view}
                onChange={setView}
              />

              {stages.length > 0 && view !== 'table' && (
                <button
                  type="button"
                  onClick={goCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Создать этап
                </button>
              )}
            </div>

            {/* CURRENT VIEW */}
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{
                  opacity: 0,
                  y: 8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: -8,
                }}
                transition={{
                  duration: 0.15,
                }}
              >

                {view === 'table' && (
                  <TableView
                    stages={stages}
                    responsibles={responsibles}
                    onSelect={goDetail}
                    onCreate={goCreate}
                  />
                )}

                {view === 'overview' && (
                  <OverviewView
                    stages={stages}
                    responsibles={responsibles}
                    onSelect={goDetail}
                  />
                )}

                {view === 'roadmap' && (
                  <RoadmapView
                    stages={stages}
                    responsibles={responsibles}
                    onSelect={goDetail}
                  />
                )}

                {view === 'timeline' && (
                  <TimelineView
                    stages={stages}
                    responsibles={responsibles}
                    projectId={projectId}
                    onSelect={goDetail}
                  />
                )}

                {view === 'board' && (
                  <BoardView
                    stages={stages}
                    responsibles={responsibles}
                    onSelect={goDetail}
                    onMoveStage={handleMoveStage}
                  />
                )}

                {view === 'analytics' && (
                  <AnalyticsView
                    stages={stages}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {/* DETAIL */}
        {screen.type === 'detail' && selectedStage && (
          <StageDetail
            key={selectedStage.id}
            stage={selectedStage}
            responsible={
              selectedStage.responsible_id
                ? responsibles[selectedStage.responsible_id] ?? null
                : null
            }
            responsibles={responsibles}
            totalStages={stages.length}
            currentUserId={user?.id}
            onBack={goList}
            onSave={handleUpdate}
            onDelete={handleDelete}
            onStart={stageId =>
              quickAction(stageId, 'start')
            }
            onComplete={stageId =>
              quickAction(stageId, 'complete')
            }
            onSkip={stageId =>
              quickAction(stageId, 'skip')
            }
            onSetAssignees={handleSetAssignees}
          />
        )}

        {/* CREATE */}
        {screen.type === 'create' && (
          <CreateStage
            key="create-stage"
            nextOrder={stages.length + 1}
            responsibles={responsibles}
            onBack={goList}
            onSubmit={handleCreate}
          />
        )}
      </AnimatePresence>

      {/* TOASTS */}
      <Toasts
        toasts={toasts}
        onClose={id =>
          setToasts(previous =>
            previous.filter(toast => toast.id !== id),
          )
        }
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   DEFAULT EXPORT
   ════════════════════════════════════════════════════════════════ */

export default ProjectStagesSection;