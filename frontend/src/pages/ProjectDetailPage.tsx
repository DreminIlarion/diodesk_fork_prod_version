// ProjectDetailPage.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, FolderOpen, Building2, Users, Calendar,
  User, Mail, Phone, Loader2, Archive, Plus, Ticket,
  Crown, Hash, Clock, UserPlus, ChevronRight, ChevronDown,
  Search, X, Check, Settings, AlertTriangle,
  Milestone, Edit2, Trash2, CheckCircle2, PlayCircle, PauseCircle,
  Filter, LayoutGrid, List, Clock3, Target, Flag, Pencil,
} from 'lucide-react';
import { projectsApi, ticketsApi, counterpartiesApi, usersApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import type { Project, Counterparty, TicketListItem, SimpleUser, CounterpartyCustomer } from '../types';
import  ProjectStagesSection  from './ProjectStagesPage';

// ═══════════════════════════════════════════════════════════════════
// ТИПЫ
// ═══════════════════════════════════════════════════════════════════

type TabType = 'info' | 'members' | 'stages' | 'tickets';
type StageStatus = 'planned' | 'in_progress' | 'completed' | 'blocked' | 'paused';
type ViewMode = 'board' | 'list';

interface ProjectStage {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  name: string;
  order: number;
  status: StageStatus;
  planned_start: string;
  planned_end: string;
  started_at: string | null;
  completed_at: string | null;
  responsible_id: string | null;
  description: string;
  completion_criteria: string[];
  is_overdue: boolean;
  planned_duration_days: number;
}

interface StageUser {
  id: string;
  full_name: string;
  role: string;
  email?: string;
}

// ═══════════════════════════════════════════════════════════════════
// МОКОВЫЕ ДАННЫЕ ЭТАПОВ
// ═══════════════════════════════════════════════════════════════════

const MOCK_STAGE_USERS: Record<string, StageUser> = {
  'user-pm-1': { id: 'user-pm-1', full_name: 'Алексей Петров', role: 'Project Manager', email: 'petrov@company.ru' },
  'user-ba-1': { id: 'user-ba-1', full_name: 'Мария Сидорова', role: 'Business Analyst', email: 'sidorova@company.ru' },
  'user-dev-1': { id: 'user-dev-1', full_name: 'Иван Кузнецов', role: 'Backend Lead', email: 'kuznetsov@company.ru' },
  'user-qa-1': { id: 'user-qa-1', full_name: 'Ольга Новикова', role: 'QA Lead', email: 'novikova@company.ru' },
  'user-devops-1': { id: 'user-devops-1', full_name: 'Дмитрий Орлов', role: 'DevOps Engineer', email: 'orlov@company.ru' },
};

const MOCK_PROJECT_STAGES: ProjectStage[] = [
  {
    id: 'stg-001', created_at: '2026-06-01T09:00:00.000Z', updated_at: '2026-06-08T18:20:00.000Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Инициация и сбор требований', order: 1, status: 'completed',
    planned_start: '2026-06-01', planned_end: '2026-06-07',
    started_at: '2026-06-01T10:00:00.000Z', completed_at: '2026-06-06T17:40:00.000Z',
    responsible_id: 'user-ba-1',
    description: 'Фиксация бизнес-требований, интервью с заказчиком, согласование scope и ключевых ограничений проекта.',
    completion_criteria: ['Собраны и зафиксированы требования заказчика', 'Согласован scope проекта', 'Подписан протокол discovery-сессии'],
    is_overdue: false, planned_duration_days: 7,
  },
  {
    id: 'stg-002', created_at: '2026-06-02T09:00:00.000Z', updated_at: '2026-06-14T12:00:00.000Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Проектирование решения', order: 2, status: 'completed',
    planned_start: '2026-06-08', planned_end: '2026-06-14',
    started_at: '2026-06-08T09:30:00.000Z', completed_at: '2026-06-14T16:10:00.000Z',
    responsible_id: 'user-pm-1',
    description: 'Формирование архитектуры решения, согласование ключевых интеграций и ограничений по безопасности.',
    completion_criteria: ['Подготовлена архитектурная схема', 'Согласованы интеграционные точки', 'Утверждён технический план реализации'],
    is_overdue: false, planned_duration_days: 7,
  },
  {
    id: 'stg-003', created_at: '2026-06-05T10:00:00.000Z', updated_at: '2026-06-16T08:46:29.327Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Разработка backend и API', order: 3, status: 'in_progress',
    planned_start: '2026-06-15', planned_end: '2026-06-30',
    started_at: '2026-06-15T10:20:00.000Z', completed_at: null,
    responsible_id: 'user-dev-1',
    description: 'Реализация сервисов, бизнес-логики, REST API и интеграционного слоя.',
    completion_criteria: ['Реализованы все согласованные endpoints', 'Покрыты unit/integration тестами критичные сценарии', 'Подготовлена swagger/openapi документация'],
    is_overdue: false, planned_duration_days: 16,
  },
  {
    id: 'stg-004', created_at: '2026-06-06T11:00:00.000Z', updated_at: '2026-07-05T14:10:00.000Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Интеграция с внешними системами', order: 4, status: 'blocked',
    planned_start: '2026-07-01', planned_end: '2026-07-10',
    started_at: '2026-07-01T09:00:00.000Z', completed_at: null,
    responsible_id: 'user-devops-1',
    description: 'Подключение внешних API, настройка обмена данными, проверка SLA и сетевых доступов.',
    completion_criteria: ['Настроены доступы до внешних контуров', 'Проверены сценарии обмена данными', 'Зафиксированы fallback-механизмы'],
    is_overdue: true, planned_duration_days: 10,
  },
  {
    id: 'stg-005', created_at: '2026-06-10T09:30:00.000Z', updated_at: '2026-06-16T08:46:29.327Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Системное тестирование и UAT', order: 5, status: 'planned',
    planned_start: '2026-07-11', planned_end: '2026-07-20',
    started_at: null, completed_at: null,
    responsible_id: 'user-qa-1',
    description: 'Полный регресс, smoke, приёмочное тестирование совместно с представителями заказчика.',
    completion_criteria: ['Smoke и regression успешно пройдены', 'Критичные дефекты закрыты', 'Заказчик подтвердил результат UAT'],
    is_overdue: false, planned_duration_days: 10,
  },
  {
    id: 'stg-006', created_at: '2026-06-10T09:30:00.000Z', updated_at: '2026-06-16T08:46:29.327Z',
    project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Релиз и запуск в production', order: 6, status: 'planned',
    planned_start: '2026-07-21', planned_end: '2026-07-24',
    started_at: null, completed_at: null,
    responsible_id: 'user-pm-1',
    description: 'Финальная поставка, релизное окно, мониторинг post-release и передача в сопровождение.',
    completion_criteria: ['Подготовлен release checklist', 'Сервис доступен в production', 'Передача в сопровождение завершена'],
    is_overdue: false, planned_duration_days: 4,
  },
];

// ═══════════════════════════════════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════════════════════════════════

const PROJECT_ROLES = [
  { value: 'owner',           label: 'Владелец',         color: 'text-[var(--accent)]',         bg: 'bg-[var(--accent-soft)]',  border: 'border-[var(--accent)]/15' },
  { value: 'manager',         label: 'Менеджер',         color: 'text-[var(--info)]',           bg: 'bg-blue-500/15',           border: 'border-blue-500/30' },
  { value: 'contributor',     label: 'Участник',         color: 'text-[var(--success)]',        bg: 'bg-[var(--success)]/8',    border: 'border-emerald-500/30' },
  { value: 'viewer',          label: 'Наблюдатель',      color: 'text-[var(--text-primary)]/50',bg: 'bg-[var(--hover-2)]',      border: 'border-[var(--border-color)]' },
  { value: 'customer',        label: 'Клиент',           color: 'text-violet-400',              bg: 'bg-violet-500/15',         border: 'border-violet-500/30' },
  { value: 'customer_manager',label: 'Менеджер клиента', color: 'text-[var(--info)]',           bg: 'bg-cyan-500/15',           border: 'border-cyan-500/30' },
] as const;

type RoleValue = typeof PROJECT_ROLES[number]['value'];
const getRoleMeta = (role: string) => PROJECT_ROLES.find(r => r.value === role) ?? PROJECT_ROLES[2];

const STAGE_COLUMNS: StageStatus[] = ['planned', 'in_progress', 'blocked', 'paused', 'completed'];

const STAGE_STATUS_META: Record<StageStatus, {
  label: string; chip: string; soft: string; text: string;
  border: string; icon: any; barColor: string;
}> = {
  planned:     { label: 'Запланирован',   chip: 'bg-slate-500/15 text-slate-300',   soft: 'bg-slate-500/10',   text: 'text-slate-200',   border: 'border-slate-500/20',   icon: Clock3,         barColor: 'bg-slate-500' },
  in_progress: { label: 'В работе',       chip: 'bg-blue-500/15 text-blue-300',     soft: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/20',    icon: PlayCircle,     barColor: 'bg-blue-500' },
  completed:   { label: 'Завершён',       chip: 'bg-emerald-500/15 text-emerald-300', soft: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20', icon: CheckCircle2,   barColor: 'bg-emerald-500' },
  blocked:     { label: 'Заблокирован',   chip: 'bg-red-500/15 text-red-300',       soft: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/20',     icon: AlertTriangle,  barColor: 'bg-red-500' },
  paused:      { label: 'На паузе',       chip: 'bg-amber-500/15 text-amber-300',   soft: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/20',   icon: PauseCircle,    barColor: 'bg-amber-500' },
};

const STAGE_STATUS_OPTIONS: { value: StageStatus; label: string }[] = [
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'paused', label: 'На паузе' },
  { value: 'completed', label: 'Завершён' },
];

// ═══════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const cls = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }[size];
  return (
    <div className={`${cls} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}>
      {getInitials(name)}
    </div>
  );
}

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateTime = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function getDuration(stage: ProjectStage) {
  if (stage.planned_duration_days > 0) return stage.planned_duration_days;
  const start = new Date(stage.planned_start + 'T00:00:00');
  const end = new Date(stage.planned_end + 'T00:00:00');
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function getStageProgress(stage: ProjectStage): number {
  switch (stage.status) {
    case 'completed': return 100;
    case 'in_progress': return 60;
    case 'paused': return 45;
    case 'blocked': return 30;
    default: return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════
// МОДАЛКА АРХИВИРОВАНИЯ
// ═══════════════════════════════════════════════════════════════════

function ArchiveModal({ projectName, loading, onConfirm, onClose }: {
  projectName: string; loading: boolean; onConfirm: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="pt-8 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
        </div>
        <div className="px-7 pt-5 pb-2 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Архивировать проект?</h2>
          <p className="text-base text-[var(--text-primary)]/60 leading-relaxed">
            Проект <span className="text-[var(--text-primary)] font-semibold">«{projectName}»</span> будет архивирован.
          </p>
        </div>
        <div className="flex gap-3 p-6">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50">
            Отмена
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-400 text-base font-medium transition-all disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            {loading ? 'Архивируем...' : 'Архивировать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DRAWER ДЕТАЛЕЙ ЭТАПА
// ═══════════════════════════════════════════════════════════════════

function StageDetailsDrawer({ stage, responsible, canEdit, onEdit, onClose }: {
  stage: ProjectStage; responsible?: StageUser; canEdit?: boolean;
  onEdit?: (stage: ProjectStage) => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);

  const meta = STAGE_STATUS_META[stage.status];
  const Icon = meta.icon;
  const progress = getStageProgress(stage);

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/70">Этап #{stage.order}</span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${meta.chip}`}>{meta.label}</span>
              {stage.is_overdue && stage.status !== 'completed' && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/15 text-red-300 animate-pulse">⚠ Просрочен</span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] leading-tight">{stage.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {stage.description && (
            <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-3">Описание</p>
              <p className="text-sm text-[var(--text-primary)]/80 leading-relaxed whitespace-pre-wrap">{stage.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {([
              { icon: Calendar, label: 'Плановое начало', value: fmtDate(stage.planned_start) },
              { icon: Calendar, label: 'Плановое окончание', value: fmtDate(stage.planned_end) },
              { icon: Clock3, label: 'Длительность', value: `${getDuration(stage)} дн.` },
              { icon: Flag, label: 'Статус', value: meta.label },
              { icon: PlayCircle, label: 'Фактический старт', value: fmtDateTime(stage.started_at) },
              { icon: CheckCircle2, label: 'Фактическое завершение', value: fmtDateTime(stage.completed_at) },
            ] as const).map(card => (
              <div key={card.label} className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]/35">
                  <card.icon className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">{card.label}</span>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Ответственный */}
          <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4">Ответственный</p>
            {responsible ? (
              <div className="flex items-center gap-3">
                <Avatar name={responsible.full_name} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{responsible.full_name}</p>
                  <p className="text-xs text-[var(--text-primary)]/45">{responsible.role}</p>
                  {responsible.email && <p className="text-xs text-[var(--text-primary)]/35 truncate mt-0.5">{responsible.email}</p>}
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--text-primary)]/40">Не назначен</div>
            )}
          </div>

          {/* Критерии завершения */}
          <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4">Критерии завершения</p>
            {stage.completion_criteria.length === 0 ? (
              <p className="text-sm text-[var(--text-primary)]/40">Не указаны</p>
            ) : (
              <div className="space-y-2.5">
                {stage.completion_criteria.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
                    <Target className="w-4 h-4 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[var(--text-primary)]/80 leading-relaxed">{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Служебная информация */}
          <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4">Служебная информация</p>
            <div className="space-y-3 text-sm">
              {([
                { label: 'ID этапа', value: stage.id, mono: true },
                { label: 'Project ID', value: stage.project_id, mono: true },
                { label: 'Создан', value: fmtDateTime(stage.created_at) },
                { label: 'Обновлён', value: fmtDateTime(stage.updated_at) },
              ] as const).map(row => (
                <div key={row.label} className="flex items-start justify-between gap-4">
                  <span className="text-[var(--text-primary)]/40">{row.label}</span>
                  <span className={`text-right text-[var(--text-primary)]/85 ${'mono' in row && row.mono ? 'font-mono text-xs break-all' : ''}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
          <div className="w-full max-w-[220px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--text-primary)]/40 uppercase tracking-wider">Прогресс</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">{progress}%</span>
            </div>
            <div className="h-2 bg-[var(--hover-2)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${meta.barColor}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && onEdit && (
              <button onClick={() => onEdit(stage)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium">
                <Pencil className="w-4 h-4" /> Редактировать
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════════
// МОДАЛКА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ЭТАПА
// ═══════════════════════════════════════════════════════════════════

function StageModal({ stage, loading, onSubmit, onClose }: {
  stage: ProjectStage | null; loading: boolean;
  onSubmit: (data: Partial<ProjectStage>) => void; onClose: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? '');
  const [description, setDescription] = useState(stage?.description ?? '');
  const [status, setStatus] = useState<StageStatus>(stage?.status ?? 'planned');
  const [plannedStart, setPlannedStart] = useState(stage?.planned_start ?? '');
  const [plannedEnd, setPlannedEnd] = useState(stage?.planned_end ?? '');
  const [order, setOrder] = useState(stage?.order ?? 1);
  const [criteria, setCriteria] = useState<string[]>(stage?.completion_criteria ?? ['']);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  const addCriterion = () => setCriteria(prev => [...prev, '']);
  const removeCriterion = (idx: number) => setCriteria(prev => prev.filter((_, i) => i !== idx));
  const updateCriterion = (idx: number, val: string) => setCriteria(prev => prev.map((c, i) => i === idx ? val : c));

  const handleSubmit = () => {
    if (!name.trim() || !plannedStart || !plannedEnd) return;
    onSubmit({
      name: name.trim(), description: description.trim(), status,
      planned_start: plannedStart, planned_end: plannedEnd, order,
      completion_criteria: criteria.filter(c => c.trim()),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center">
              <Milestone className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {stage ? 'Редактировать этап' : 'Новый этап'}
            </h2>
          </div>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Название */}
          <div>
            <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Название *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Разработка backend"
              className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-white/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)]" />
          </div>

          {/* Описание */}
          <div>
            <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-white/25 resize-none focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)]" />
          </div>

          {/* Порядок + Статус */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Порядок</label>
              <input type="number" min={1} value={order} onChange={e => setOrder(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm" />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Статус</label>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => setStatus(s.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      status === s.value
                        ? `${STAGE_STATUS_META[s.value].chip} border-current`
                        : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)]'
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Даты */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Начало *</label>
              <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm" />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Окончание *</label>
              <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm" />
            </div>
          </div>

          {/* Критерии завершения */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-[var(--text-primary)]/60">Критерии завершения</label>
              <button onClick={addCriterion} className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Добавить
              </button>
            </div>
            <div className="space-y-2">
              {criteria.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0" />
                  <input value={c} onChange={e => updateCriterion(idx, e.target.value)}
                    placeholder={`Критерий ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-white/20 focus:outline-none focus:border-[var(--accent)]/30" />
                  {criteria.length > 1 && (
                    <button onClick={() => removeCriterion(idx)} className="p-1 rounded hover:bg-red-500/20 text-[var(--text-primary)]/40 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm">
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={loading || !name.trim() || !plannedStart || !plannedEnd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {stage ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// МОДАЛКА УДАЛЕНИЯ ЭТАПА
// ═══════════════════════════════════════════════════════════════════

function DeleteStageModal({ stageName, loading, onConfirm, onClose }: {
  stageName: string; loading: boolean; onConfirm: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="pt-8 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Trash2 className="w-8 h-8 text-red-400" />
          </div>
        </div>
        <div className="px-7 pt-5 pb-2 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Удалить этап?</h2>
          <p className="text-base text-[var(--text-primary)]/60">
            «<span className="font-semibold text-[var(--text-primary)]">{stageName}</span>» будет удалён без возможности восстановления.
          </p>
        </div>
        <div className="flex gap-3 p-6">
          <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-base font-medium">Отмена</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600/20 border border-red-600/30 text-red-400 text-base font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Удалить
          </button>
        </div>
      </div>
    </div>
  );
}


export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('info');

  const [members, setMembers] = useState<Array<{ user_id: string; project_role: string; user: CounterpartyCustomer | SimpleUser | null }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [projectTickets, setProjectTickets] = useState<TicketListItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Stages
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [showStageModal, setShowStageModal] = useState(false);
  const [editingStage, setEditingStage] = useState<ProjectStage | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [deletingStage, setDeletingStage] = useState<ProjectStage | null>(null);
  const [deletingStageLoading, setDeletingStageLoading] = useState(false);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Array<CounterpartyCustomer | SimpleUser>>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Map<string, CounterpartyCustomer | SimpleUser>>(new Map());
  const [selectedRoles, setSelectedRoles] = useState<RoleValue[]>(['contributor']);
  const [searchUser, setSearchUser] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);

const isSupportOrHigher = user?.roles?.some(r => 
  r === 'admin' || 
  r === 'support_manager' || 
  r === 'support_agent'
) ?? false;
  const canEdit = isSupportOrHigher || project?.owner_id === user?.id;
  const isActive = project?.status === 'active';

  // ── Загрузка участников ──────────────────────────────────────────────

const loadMembers = useCallback(async () => {
  if (!project?.id) return;
  setLoadingMembers(true);
  try {
    const data = await projectsApi.getMembers(project.id);
    setMembers(data.map((m: any) => ({
      user_id: m.user_id,
      project_role: m.project_role || m.roles?.[0],
      user: m.user || null,
    })));
  } catch (e) {
    console.error('Failed to load members:', e);
    setMembers([]);
  } finally {
    setLoadingMembers(false);
  }
}, [project?.id]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectsApi.getById(id!);
      setProject(data);
      await Promise.all([
        data.counterparty_id ? counterpartiesApi.getById(data.counterparty_id).then(cp => setCounterparty(cp)).catch(() => {}) : Promise.resolve(),
        await loadMembers(),
      ]);
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить проект', variant: 'destructive' });
      navigate('/projects');
    } finally { setLoading(false); }
  }, [id, loadMembers, toast, navigate]);

  const loadTickets = useCallback(async () => {
    if (!project?.id) return;
    setLoadingTickets(true);
    try {
      const res = await ticketsApi.getAllWithFilters(1, 100, { project_id: project.id });
      setProjectTickets(res.items);
    } catch { setProjectTickets([]); }
    finally { setLoadingTickets(false); }
  }, [project?.id]);

  const loadStages = useCallback(async () => {
    // TODO: заменить моки на реальный API
    await new Promise(r => setTimeout(r, 300));
    setStages(MOCK_PROJECT_STAGES);
  }, []);

  const loadAvailableUsers = useCallback(async () => {
    setLoadingAvailable(true);
    try {
      const existingIds = new Set(members.map(m => m.user_id));
      const allAvailable: Array<CounterpartyCustomer | SimpleUser> = [];
      const seenIds = new Set<string>();
      if (project?.counterparty_id) {
        try {
          const res = await counterpartiesApi.getCustomers(project.counterparty_id, 1, 15);
          (res.items ?? []).forEach((u: CounterpartyCustomer) => { if (!existingIds.has(u.id) && !seenIds.has(u.id)) { allAvailable.push(u); seenIds.add(u.id); } });
        } catch {}
      }
      try {
  // Загружаем всех пользователей, включая админов и поддержку
  const res = await usersApi.getAllUsers(1, 100);
  (res.items ?? []).forEach((u: SimpleUser) => { 
    if (!existingIds.has(u.id) && !seenIds.has(u.id)) { 
      allAvailable.push(u); 
      seenIds.add(u.id); 
    } 
  });
} catch (e) {
  console.error('Ошибка загрузки всех пользователей:', e);
}
      setAvailableUsers(allAvailable);
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить пользователей', variant: 'destructive' });
    } finally { setLoadingAvailable(false); }
  }, [project?.counterparty_id, members, toast]);

  useEffect(() => { if (id) loadProject(); }, [id, loadProject]);
  useEffect(() => { if (activeTab === 'tickets') loadTickets(); }, [activeTab, loadTickets]);
  useEffect(() => { if (activeTab === 'stages') loadStages(); }, [activeTab, loadStages]);
  useEffect(() => { if (showAddModal) loadAvailableUsers(); }, [showAddModal, loadAvailableUsers]);

  // ── Действия ──────────────────────────────────────────────────────

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await projectsApi.archive(id!);
      toast({ title: 'Успешно', description: 'Проект архивирован' });
      setShowArchiveModal(false);
      await loadProject();
    } catch { toast({ title: 'Ошибка', description: 'Не удалось архивировать', variant: 'destructive' }); }
    finally { setArchiving(false); }
  };

 const handleAddMembers = async () => {
  if (!selectedUsers.size) return;
  setAddingMembers(true);
  try {
    // Новый формат: каждый пользователь добавляется отдельно с массивом ролей
    const selectedUsersArray = Array.from(selectedUsers.values());
    for (const u of selectedUsersArray) {
      await projectsApi.addMember(id!, u.id, selectedRoles);
    }
    
    toast({ 
      title: 'Успешно', 
      description: `Добавлено ${selectedUsersArray.length} участников` 
    });
    setShowAddModal(false);
    setSelectedUsers(new Map());
    setSearchUser('');
    setSelectedRole('contributor');
    await loadProject();
  } catch (e: any) {
    const msg = e?.response?.data?.detail?.[0]?.msg || 
                e?.response?.data?.detail || 
                'Не удалось добавить';
    toast({ 
      title: 'Ошибка', 
      description: typeof msg === 'string' ? msg : 'Не удалось добавить', 
      variant: 'destructive' 
    });
  } finally { 
    setAddingMembers(false); 
  }
};

  // Stage CRUD (МОКИ — потом заменить на API)
  const handleSaveStage = async (data: Partial<ProjectStage>) => {
    setSavingStage(true);
    await new Promise(r => setTimeout(r, 400));
    if (editingStage) {
      setStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, ...data, updated_at: new Date().toISOString() } as ProjectStage : s));
      toast({ title: 'Успешно', description: 'Этап обновлён' });
    } else {
      const newStage: ProjectStage = {
        id: `stg-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        project_id: project?.id ?? '', name: '', order: stages.length + 1, status: 'planned',
        planned_start: '', planned_end: '', started_at: null, completed_at: null, responsible_id: null,
        description: '', completion_criteria: [], is_overdue: false, planned_duration_days: 0,
        ...data,
      };
      setStages(prev => [...prev, newStage]);
      toast({ title: 'Успешно', description: 'Этап создан' });
    }
    setShowStageModal(false); setEditingStage(null); setSavingStage(false);
  };

  const handleDeleteStage = async () => {
    if (!deletingStage) return;
    setDeletingStageLoading(true);
    await new Promise(r => setTimeout(r, 300));
    setStages(prev => prev.filter(s => s.id !== deletingStage.id));
    toast({ title: 'Успешно', description: 'Этап удалён' });
    setDeletingStage(null); setDeletingStageLoading(false);
  };

  const toggleUser = (u: CounterpartyCustomer | SimpleUser) => {
    setSelectedUsers(prev => { const m = new Map(prev); m.has(u.id) ? m.delete(u.id) : m.set(u.id, u as any); return m; });
  };

  // ── Helpers ───────────────────────────────────────────────────────

  const resolveDisplay = (member: typeof members[0]) => {
    const u = member.user;
    const isMe = member.user_id === user?.id;
    if (!u) {
      if (user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false) return { name: 'Агент поддержки', email: undefined, isMe: false };
      return { name: `ID: ${member.user_id.slice(0, 8)}`, email: undefined, isMe: false };
    }
    return { name: u.full_name || (u as any).username || u.email || `ID: ${member.user_id.slice(0, 8)}`, email: u.email, isMe };
  };

  const ownerMember = members.find(m => m.project_role === 'owner') ?? members.find(m => m.user_id === project?.owner_id);
  const ownerDisplay = ownerMember ? resolveDisplay(ownerMember) : null;
  const creatorMember = members.find(m => m.user_id === project?.created_by);
  const creatorDisplay = creatorMember ? resolveDisplay(creatorMember)
    : project?.created_by === user?.id
      ? { name: user?.full_name || user?.username || 'Вы', email: user?.email, isMe: true }
      : null;

  const filteredAvailable = availableUsers.filter(u => {
    if (!searchUser) return true;
    const q = searchUser.toLowerCase();
    const name = u.full_name || (u as any).username || '';
    return name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const statusClr = (s: string) => ({
    'Новый': 'bg-blue-500/15 text-[var(--info)] border-blue-500/30',
    'На согласовании': 'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
    'Открыт': 'bg-[var(--info)]/15 text-[var(--info)] border-[var(--info)]/30',
    'В работе': 'bg-yellow-500/15 text-[var(--warning)] border-yellow-500/30',
    'Ожидает ответа': 'bg-orange-500/15 text-[var(--warning)] border-orange-500/30',
    'Решён': 'bg-[var(--success)]/8 text-[var(--success)] border-emerald-500/30',
    'Закрыт': 'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
    'Переоткрыт': 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/15',
  }[s] ?? 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-white/10');

  const priorityClr = (p: string) => ({
    'Низкий': 'bg-[var(--success)]/8 text-[var(--success)] border-emerald-500/30',
    'Средний': 'bg-yellow-500/15 text-[var(--warning)] border-yellow-500/30',
    'Высокий': 'bg-orange-500/15 text-[var(--warning)] border-orange-500/30',
    'Критический': 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/15',
  }[p] ?? 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-white/10');

  // ── Render ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-16 text-center">
      <FolderOpen className="w-20 h-20 text-[var(--text-primary)]/15 mx-auto mb-5" />
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Проект не найден</h2>
      <Link to="/projects" className="inline-flex px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-base font-medium">Вернуться к проектам</Link>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <button onClick={() => navigate('/projects')}
            className="p-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] border border-[var(--border-color)] text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-all mt-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl  flex items-center justify-center ">
              <FolderOpen className="w-10 h-10 text-[var(--text-primary)]" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-3xl font-bold text-[var(--text-primary)]">{project.name}</h1>
                <span className={`px-3 py-1 rounded-lg text-base font-medium border ${
                  isActive ? 'bg-[var(--success)]/8 text-[var(--success)] border-emerald-500/30' : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]'
                }`}>{isActive ? 'Активен' : 'Архивирован'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-[var(--text-primary)]/40" />
                <span className="text-[var(--text-primary)]/50 font-mono text-base">{project.key}</span>
              </div>
            </div>
          </div>
        </div>
        {canEdit && isActive && (
          <div className="flex gap-2.5 flex-shrink-0">
            <button onClick={() => setShowArchiveModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-base font-medium">
              <Archive className="w-4 h-4" /> Архивировать
            </button>
            <Link to={`/tickets/new?project_id=${project.id}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-[var(--shadow-md)]">
              <Plus className="w-4 h-4" /> Создать заявку
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-[var(--border-color)] overflow-x-auto">
        {([
          { id: 'info' as TabType, label: 'Информация', icon: FolderOpen },
          { id: 'members' as TabType, label: 'Участники', icon: Users, count: members.length },
          { id: 'tickets' as TabType, label: 'Заявки', icon: Ticket, count: projectTickets.length },
          { id: 'stages' as TabType, label: 'Этапы', icon: Milestone, count: stages.length },

        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[var(--accent)]/50 text-white border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
            }`}>
            <tab.icon className="w-4 h-4" />
            <span className="text-base font-medium">{tab.label}</span>
            {'count' in tab && (tab.count ?? 0) > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: STAGES ═══ */}
      {activeTab === 'stages' ? (
        <ProjectStagesSection projectId={project.id} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">

            {/* ═══ TAB: INFO ═══ */}
            {activeTab === 'info' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                {project.description && (
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-6">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-3">Описание</p>
                    <p className="text-[var(--text-primary)] text-base leading-relaxed whitespace-pre-wrap">{project.description}</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Контрагент</p>
                    {counterparty ? (
                      <>
                        <p className="text-[var(--text-primary)] font-semibold text-base">{counterparty.name}</p>
                        {counterparty.legal_name && <p className="text-[var(--text-primary)]/50 text-sm mt-1">{counterparty.legal_name}</p>}
                        {counterparty.inn && <p className="text-[var(--text-primary)]/40 text-sm mt-1.5 font-mono">ИНН {counterparty.inn}</p>}
                      </>
                    ) : <p className="text-[var(--text-primary)]/40 text-base">Не указан</p>}
                  </div>
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2"><Crown className="w-3.5 h-3.5" /> Владелец</p>
                    {ownerDisplay ? (
                      <div className="flex items-center gap-3">
                        <Avatar name={ownerDisplay.name} />
                        <div className="min-w-0">
                          <p className="text-[var(--text-primary)] font-semibold text-base truncate">{ownerDisplay.name}</p>
                          {ownerDisplay.email && <a href={`mailto:${ownerDisplay.email}`} className="text-[var(--text-primary)]/40 text-sm hover:text-[var(--text-primary)]/60 truncate block">{ownerDisplay.email}</a>}
                        </div>
                      </div>
                    ) : <p className="text-[var(--text-primary)]/40 text-base">Не указан</p>}
                  </div>
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Дата создания</p>
                    <p className="text-[var(--text-primary)] text-base font-medium">{fmtDateTime(project.created_at)}</p>
                  </div>
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Создатель</p>
                    {creatorDisplay ? (
                      <div className="flex items-center gap-3">
                        <Avatar name={creatorDisplay.name} />
                        <div className="min-w-0">
                          <p className="text-[var(--text-primary)] font-semibold text-base truncate">{creatorDisplay.name}</p>
                          {creatorDisplay.email && <a href={`mailto:${creatorDisplay.email}`} className="text-[var(--text-primary)]/40 text-sm hover:text-[var(--text-primary)]/60 truncate block">{creatorDisplay.email}</a>}
                        </div>
                      </div>
                    ) : <p className="text-[var(--text-primary)]/40 text-base">Не удалось определить</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { icon: Users, value: members.length, label: 'Участников' },
                    { icon: Milestone, value: stages.length, label: 'Этапов' },
                    { icon: Ticket, value: projectTickets.length, label: 'Заявок' },
                  ].map(s => (
                    <div key={s.label} className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5 text-center">
                      <s.icon className="w-5 h-5 text-[var(--text-primary)]/40 mx-auto mb-3" />
                      <p className="text-3xl font-bold text-[var(--text-primary)] mb-1">{s.value}</p>
                      <p className="text-sm text-[var(--text-primary)]/40">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TAB: MEMBERS ═══ */}
            {activeTab === 'members' && (
              <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                    <Users className="w-5 h-5 text-[var(--text-primary)]/40" /> Участники
                    {members.length > 0 && <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">{members.length}</span>}
                  </h2>
                  {canEdit && (
                    <button onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-[var(--shadow-md)]">
                      <UserPlus className="w-4 h-4" /> Добавить
                    </button>
                  )}
                </div>
                <div className="p-6">
                  {loadingMembers ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]/20" /></div>
                  ) : members.length === 0 ? (
                    <div className="text-center py-20">
                      <Users className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                      <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Нет участников</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-color)]">
                      {members.map(member => {
  const { name, email, isMe } = resolveDisplay(member);
  const role = getRoleMeta(member.project_role);
  return (
    <div key={member.user_id} className={`flex items-center gap-4 py-4 px-2 rounded-xl ${isMe ? 'bg-[var(--accent)]/[0.04]' : ''}`}>
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--text-primary)] font-semibold text-base truncate">{name}</span>
          {isMe && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-[var(--text-primary)]/50">Вы</span>}
        </div>
        {email ? (
          <a href={`mailto:${email}`} className="text-[var(--text-primary)]/40 text-sm hover:text-[var(--text-primary)]/60 truncate block">{email}</a>
        ) : <span className="text-[var(--text-primary)]/20 text-sm">email не указан</span>}
      </div>
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border flex-shrink-0 ${role.bg} ${role.color} ${role.border}`}>
        {member.project_role === 'owner' && <Crown className="w-3 h-3" />} {role.label}
      </span>
      {canEdit && member.project_role !== 'owner' && (
        <button
          onClick={async () => {
            if (!confirm(`Удалить пользователя "${name}" из проекта?`)) return;
            try {
              await projectsApi.removeMember(project.id, member.user_id);
              toast({ title: 'Успешно', description: 'Участник удалён' });
              await loadProject();
            } catch (e) {
              toast({ 
                title: 'Ошибка', 
                description: 'Не удалось удалить участника', 
                variant: 'destructive' 
              });
            }
          }}
          className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/40 hover:text-red-400 transition-colors"
          title="Удалить"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
})}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ TAB: TICKETS ═══ */}
            {activeTab === 'tickets' && (
              <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
                  <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                    <Ticket className="w-5 h-5 text-[var(--text-primary)]/40" /> Заявки
                  </h2>
                  {(isSupportOrHigher || project?.owner_id === user?.id) && (
        <Link to={`/tickets/new?project_id=${project.id}`}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-[var(--shadow-md)]">
          <Plus className="w-4 h-4" /> Создать
        </Link>
      )}
                </div>
                <div className="p-6">
                  {loadingTickets ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]/20" /></div>
                  ) : projectTickets.length === 0 ? (
                    <div className="text-center py-20">
                      <Ticket className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                      <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Нет заявок</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-color)]">
                      {projectTickets.map(ticket => (
                        <Link key={ticket.id} to={`/tickets/${ticket.number}`}
                          className="flex items-start justify-between gap-4 py-4 px-2 hover:bg-[var(--hover-1)] rounded-xl transition-colors group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-[var(--accent)] font-mono text-sm bg-[var(--accent-soft)] border border-[var(--accent)]/15 px-2 py-0.5 rounded-lg">#{ticket.number}</span>
                              <span className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${statusClr(ticket.status)}`}>{ticket.status}</span>
                              <span className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${priorityClr(ticket.priority)}`}>{ticket.priority}</span>
                            </div>
                            <p className="text-[var(--text-primary)] font-medium text-base group-hover:text-[var(--accent)] truncate">{ticket.title}</p>
                            <p className="text-[var(--text-primary)]/40 text-sm mt-1">{fmtDate(ticket.created_at)}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 group-hover:text-[var(--accent)] flex-shrink-0 mt-1" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ═══ SIDEBAR ═══ */}
          <div className="space-y-5">
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-5 flex items-center gap-2"><Settings className="w-3.5 h-3.5" /> Информация</p>
              <div className="divide-y divide-white/[0.06]">
                {[
                  { label: 'Ключ', value: <span className="font-mono text-[var(--text-primary)]/80">{project.key}</span> },
                  { label: 'Статус', value: <span className={`text-sm px-2.5 py-1 rounded-lg font-medium border ${isActive ? 'bg-[var(--success)]/8 text-[var(--success)] border-emerald-500/30' : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>{isActive ? 'Активен' : 'Архивирован'}</span> },
                  { label: 'Участников', value: <span className="text-[var(--text-primary)] font-bold">{members.length}</span> },
                  { label: 'Этапов', value: <span className="text-[var(--text-primary)] font-bold">{stages.length}</span> },
                  { label: 'Заявок', value: <span className="text-[var(--text-primary)] font-bold">{projectTickets.length}</span> },
                  { label: 'Создан', value: <span className="text-[var(--text-primary)]/70 text-sm">{fmtDate(project.created_at)}</span> },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-3">
                    <span className="text-[var(--text-primary)]/40 text-base">{row.label}</span>
                    {row.value}
                  </div>
                ))}
              </div>
            </div>
            {counterparty && (
              <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Контрагент</p>
                <p className="text-[var(--text-primary)] font-semibold text-base">{counterparty.name}</p>
                {counterparty.legal_name && <p className="text-[var(--text-primary)]/50 text-sm mt-1">{counterparty.legal_name}</p>}
                {counterparty.inn && <p className="text-[var(--text-primary)]/40 text-sm mt-1.5 font-mono">ИНН {counterparty.inn}</p>}
                <div className="mt-4 space-y-2">
                  {counterparty.phone && <a href={`tel:${counterparty.phone}`} className="flex items-center gap-2 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 text-base"><Phone className="w-4 h-4" /> {counterparty.phone}</a>}
                  {counterparty.email && <a href={`mailto:${counterparty.email}`} className="flex items-center gap-2 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 text-base break-all"><Mail className="w-4 h-4" /> {counterparty.email}</a>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {showArchiveModal && (
        <ArchiveModal projectName={project.name} loading={archiving} onConfirm={handleArchive} onClose={() => setShowArchiveModal(false)} />
      )}

      {showStageModal && (
        <StageModal stage={editingStage} loading={savingStage} onSubmit={handleSaveStage} onClose={() => { setShowStageModal(false); setEditingStage(null); }} />
      )}

      {deletingStage && (
        <DeleteStageModal stageName={deletingStage.name} loading={deletingStageLoading} onConfirm={handleDeleteStage} onClose={() => setDeletingStage(null)} />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center"><UserPlus className="w-4 h-4 text-[var(--accent)]" /></div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Добавить участников</h2>
                  <p className="text-sm text-[var(--text-primary)]/40 mt-0.5">Из контрагента «{counterparty?.name ?? '...'}»</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-base text-[var(--text-primary)]/60 mb-3">Роль в проекте</label>
                <div className="flex flex-wrap gap-2">
  {PROJECT_ROLES.map(role => (
    <button
      key={role.value}
      onClick={() => {
        setSelectedRoles(prev => 
          prev.includes(role.value) 
            ? prev.filter(r => r !== role.value)
            : [...prev, role.value]
        );
      }}
      className={`px-3.5 py-2 rounded-xl text-base font-medium transition-all border ${
        selectedRoles.includes(role.value)
          ? `${role.bg} ${role.color} ${role.border}`
          : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
      }`}
    >
      {role.label}
    </button>
  ))}
</div>
              </div>
              <div>
                <label className="block text-base text-[var(--text-primary)]/60 mb-2">
                  Сотрудники {selectedUsers.size > 0 && <span className="ml-2 text-sm text-[var(--accent)]">· {selectedUsers.size} выбрано</span>}
                </label>
                <div className="relative mb-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40" />
                  <input value={searchUser} onChange={e => setSearchUser(e.target.value)} placeholder="Поиск по имени или email..."
                    className="w-full pl-10 pr-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-white/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)]" />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] divide-y divide-white/[0.04]">
                  {loadingAvailable ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-primary)]/20" /></div>
                  ) : filteredAvailable.length === 0 ? (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 mx-auto mb-3 text-[var(--text-primary)]/10" />
                      <p className="text-[var(--text-primary)]/40 text-base">{searchUser ? 'Ничего не найдено' : 'Все сотрудники уже добавлены'}</p>
                    </div>
                  ) : filteredAvailable.map(u => {
                    const isSel = selectedUsers.has(u.id);
                    const displayName = u.full_name || (u as any).username || u.email;
                    const isSupport = !(u as any).counterparty_id;
                    return (
                      <button key={u.id} onClick={() => toggleUser(u)}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${isSel ? 'bg-[var(--accent)]/[0.08]' : 'hover:bg-[var(--hover-1)]'}`}>
                        <Avatar name={displayName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[var(--text-primary)] font-medium text-base truncate">{displayName}</p>
                            {isSupport && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15 flex-shrink-0">Поддержка</span>}
                          </div>
                          <p className="text-[var(--text-primary)]/40 text-sm truncate">{u.email}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${isSel ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'}`}>
                          {isSel && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] flex-shrink-0">
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-base">Отмена</button>
              <button onClick={handleAddMembers} disabled={!selectedUsers.size || addingMembers}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
                {addingMembers ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Добавить{selectedUsers.size > 0 ? ` (${selectedUsers.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}