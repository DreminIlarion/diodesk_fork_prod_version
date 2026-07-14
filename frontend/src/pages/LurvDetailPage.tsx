// src/pages/TimesheetsPage.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  Clock, Plus, Search, Calendar, ChevronRight, ChevronDown,
  CheckCircle2, XCircle, Send, FileText, Loader2, X, Check,
  AlertCircle, Edit2, Trash2, Building2, FolderOpen,
  CalendarDays, Ticket as TicketIcon, ListTodo,
  AlertTriangle, Sparkles, TrendingUp, Coffee, Sunrise,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// ТИПЫ (точно под бэк)
// ═══════════════════════════════════════════════════════════════════════════

type WorklogStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'partially_approved';

interface Worklog {
  id: string;
  created_at: string;
  updated_at: string;
  timesheet_id: string | null;
  ticket_id: string | null;
  task_id: string | null;
  user_id: string;
  hours_spent: string;
  entry_date: string;
  description: string;
  status: WorklogStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

interface Timesheet {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  period_start: string;
  period_end: string;
  name: string;
  counterparty_id: string | null;
  project_id: string | null;
  status: TimesheetStatus;
  total_hours: string;
  approved_hours: string;
  pending_hours: string;
  draft_hours: string;
  worklogs_count: number;
  worklog_ids: string[];
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

interface Task {
  id: string;
  title: string;
  ticket_id: string | null;
  ticket_number?: number;
  ticket_title?: string;
  project_id: string | null;
  project_name?: string;
  counterparty_id: string | null;
  counterparty_name?: string;
  assignee_id: string | null;
  status: 'open' | 'in_progress' | 'done';
}

// ═══════════════════════════════════════════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════════════════════════════════════════

const TIMESHEET_STATUSES = [
  { value: 'draft', label: 'Черновик', color: 'text-[var(--text-primary)]/60', bg: 'bg-[var(--hover-2)]', border: 'border-[var(--border-color)]', icon: FileText },
  { value: 'submitted', label: 'На согласовании', color: 'text-[var(--warning)]', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Send },
  { value: 'approved', label: 'Согласован', color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/10', border: 'border-emerald-500/30', icon: CheckCircle2 },
  { value: 'partially_approved', label: 'Частично согласован', color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30', icon: CheckCircle2 },
  { value: 'rejected', label: 'Отклонён', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', icon: XCircle },
] as const;

const WORKLOG_STATUSES = [
  { value: 'draft', label: 'Черновик', color: 'text-[var(--text-primary)]/60', bg: 'bg-[var(--hover-2)]', border: 'border-[var(--border-color)]' },
  { value: 'submitted', label: 'На согласовании', color: 'text-[var(--warning)]', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30' },
  { value: 'approved', label: 'Согласован', color: 'text-[var(--success)]', bg: 'bg-[var(--success)]/10', border: 'border-emerald-500/30' },
  { value: 'rejected', label: 'Отклонён', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' },
] as const;

const getTSStatusMeta = (s: string) => TIMESHEET_STATUSES.find(x => x.value === s) ?? TIMESHEET_STATUSES[0];
const getWLStatusMeta = (s: string) => WORKLOG_STATUSES.find(x => x.value === s) ?? WORKLOG_STATUSES[0];

// ═══════════════════════════════════════════════════════════════════════════
// МОКОВЫЕ ДАННЫЕ
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_USER_ID = 'user-current';
const MOCK_APPROVER_ID = 'user-manager';

const MOCK_COUNTERPARTIES = [
  { id: 'cp-1', name: 'ДИО-Консалт' },
  { id: 'cp-2', name: 'ТехноСервис' },
  { id: 'cp-3', name: 'АльфаРешения' },
];

const MOCK_PROJECTS = [
  { id: 'pr-1', name: 'Внедрение CRM', counterparty_id: 'cp-1' },
  { id: 'pr-2', name: 'Customer Portal', counterparty_id: 'cp-2' },
  { id: 'pr-3', name: 'Mobile App', counterparty_id: 'cp-3' },
];

// Задачи и тикеты, на которых пользователь работает
const MOCK_TASKS: Task[] = [
  {
    id: 'ts-1', title: 'Реализация модуля авторизации',
    ticket_id: 'tk-1', ticket_number: 1024, ticket_title: 'Не работает авторизация',
    project_id: 'pr-1', project_name: 'Внедрение CRM',
    counterparty_id: 'cp-1', counterparty_name: 'ДИО-Консалт',
    assignee_id: MOCK_USER_ID, status: 'in_progress',
  },
  {
    id: 'ts-2', title: 'Оптимизация запросов БД',
    ticket_id: 'tk-2', ticket_number: 1025, ticket_title: 'Ошибка экспорта в Excel',
    project_id: 'pr-2', project_name: 'Customer Portal',
    counterparty_id: 'cp-2', counterparty_name: 'ТехноСервис',
    assignee_id: MOCK_USER_ID, status: 'in_progress',
  },
  {
    id: 'ts-3', title: 'Code review PR от Иванова',
    ticket_id: null, project_id: 'pr-1', project_name: 'Внедрение CRM',
    counterparty_id: 'cp-1', counterparty_name: 'ДИО-Консалт',
    assignee_id: MOCK_USER_ID, status: 'in_progress',
  },
  {
    id: 'ts-4', title: 'Подготовка демо-стенда',
    ticket_id: 'tk-3', ticket_number: 1031, ticket_title: 'Запрос на доработку отчётов',
    project_id: 'pr-3', project_name: 'Mobile App',
    counterparty_id: 'cp-3', counterparty_name: 'АльфаРешения',
    assignee_id: MOCK_USER_ID, status: 'open',
  },
];

const todayISO = () => new Date().toISOString();
const dateISO = (d: Date) => d.toISOString().split('T')[0];
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return dateISO(d); };

const MOCK_WORKLOGS: Worklog[] = [
  {
    id: 'wl-1', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: 't-1', ticket_id: 'tk-1', task_id: 'ts-1', user_id: MOCK_USER_ID,
    hours_spent: '4.00', entry_date: daysAgo(20),
    description: 'Анализ проблемы авторизации, поиск root cause в логах backend',
    status: 'approved', approved_by: MOCK_APPROVER_ID, approved_at: todayISO(), rejection_reason: null,
  },
  {
    id: 'wl-2', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: 't-1', ticket_id: 'tk-1', task_id: 'ts-1', user_id: MOCK_USER_ID,
    hours_spent: '3.50', entry_date: daysAgo(19),
    description: 'Исправление бага с JWT-токенами, добавление refresh-механизма',
    status: 'approved', approved_by: MOCK_APPROVER_ID, approved_at: todayISO(), rejection_reason: null,
  },
  {
    id: 'wl-3', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: 't-2', ticket_id: 'tk-2', task_id: 'ts-2', user_id: MOCK_USER_ID,
    hours_spent: '5.00', entry_date: daysAgo(9),
    description: 'Оптимизация запроса, стриминг вместо загрузки в память',
    status: 'submitted', approved_by: null, approved_at: null, rejection_reason: null,
  },
  {
    id: 'wl-4', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: 't-2', ticket_id: 'tk-2', task_id: 'ts-2', user_id: MOCK_USER_ID,
    hours_spent: '2.50', entry_date: daysAgo(10),
    description: 'Диагностика ошибки экспорта при больших объёмах',
    status: 'submitted', approved_by: null, approved_at: null, rejection_reason: null,
  },
  // СВОБОДНЫЕ — не привязаны к ЛУРВ
  {
    id: 'wl-5', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: null, ticket_id: null, task_id: 'ts-3', user_id: MOCK_USER_ID,
    hours_spent: '2.00', entry_date: daysAgo(2),
    description: 'Code review pull request',
    status: 'draft', approved_by: null, approved_at: null, rejection_reason: null,
  },
  {
    id: 'wl-6', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: null, ticket_id: 'tk-3', task_id: 'ts-4', user_id: MOCK_USER_ID,
    hours_spent: '1.50', entry_date: dateISO(new Date()),
    description: 'Подготовка стенда для презентации',
    status: 'draft', approved_by: null, approved_at: null, rejection_reason: null,
  },
  {
    id: 'wl-7', created_at: todayISO(), updated_at: todayISO(),
    timesheet_id: null, ticket_id: null, task_id: 'ts-3', user_id: MOCK_USER_ID,
    hours_spent: '3.00', entry_date: dateISO(new Date()),
    description: 'Встреча с заказчиком',
    status: 'draft', approved_by: null, approved_at: null, rejection_reason: null,
  },
];

const MOCK_TIMESHEETS: Timesheet[] = [
  {
    id: 't-1', created_at: todayISO(), updated_at: todayISO(),
    user_id: MOCK_USER_ID,
    period_start: daysAgo(25), period_end: daysAgo(15),
    name: 'ЛУРВ за первую половину месяца — ДИО-Консалт',
    counterparty_id: 'cp-1', project_id: 'pr-1',
    status: 'approved',
    total_hours: '7.50', approved_hours: '7.50', pending_hours: '0.00', draft_hours: '0.00',
    worklogs_count: 2, worklog_ids: ['wl-1', 'wl-2'],
    submitted_at: todayISO(), approved_at: todayISO(), approved_by: MOCK_APPROVER_ID,
  },
  {
    id: 't-2', created_at: todayISO(), updated_at: todayISO(),
    user_id: MOCK_USER_ID,
    period_start: daysAgo(14), period_end: daysAgo(7),
    name: 'ЛУРВ за неделю — ТехноСервис',
    counterparty_id: 'cp-2', project_id: 'pr-2',
    status: 'submitted',
    total_hours: '7.50', approved_hours: '0.00', pending_hours: '7.50', draft_hours: '0.00',
    worklogs_count: 2, worklog_ids: ['wl-3', 'wl-4'],
    submitted_at: todayISO(), approved_at: null, approved_by: null,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════════════

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
const fmtRelative = (d: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff === -1) return 'Завтра';
  if (diff > 1 && diff < 7) return `${diff} ${diff < 5 ? 'дня' : 'дней'} назад`;
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};
const fmtHours = (h: string | number) => {
  const n = typeof h === 'string' ? parseFloat(h) : h;
  return `${n.toFixed(1)} ч`;
};
const fmtPeriod = (start: string, end: string) => `${fmtShort(start)} — ${fmtShort(end)}`;

const getCounterpartyName = (id: string | null) =>
  id ? MOCK_COUNTERPARTIES.find(c => c.id === id)?.name ?? null : null;
const getProjectName = (id: string | null) =>
  id ? MOCK_PROJECTS.find(p => p.id === id)?.name ?? null : null;
const getTask = (id: string | null) =>
  id ? MOCK_TASKS.find(t => t.id === id) : null;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6) return { text: 'Доброй ночи', icon: Coffee };
  if (h < 12) return { text: 'Доброе утро', icon: Sunrise };
  if (h < 18) return { text: 'Добрый день', icon: Sparkles };
  return { text: 'Добрый вечер', icon: Coffee };
};

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛКА: Списать время на задачу (главная UX-точка)
// ═══════════════════════════════════════════════════════════════════════════

function LogTimeModal({
  task, defaultDate, loading, onSubmit, onClose,
}: {
  task: Task | null;       // если null — выбор задачи
  defaultDate?: string;
  loading: boolean;
  onSubmit: (data: { task_id: string; ticket_id: string | null; hours_spent: string; entry_date: string; description: string }) => void;
  onClose: () => void;
}) {
  const [selectedTaskId, setSelectedTaskId] = useState(task?.id ?? '');
  const [hours, setHours] = useState('');
  const [entryDate, setEntryDate] = useState(defaultDate ?? dateISO(new Date()));
  const [description, setDescription] = useState('');
  const [taskSearch, setTaskSearch] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch) return MOCK_TASKS;
    const q = taskSearch.toLowerCase();
    return MOCK_TASKS.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.ticket_title ?? '').toLowerCase().includes(q) ||
      String(t.ticket_number ?? '').includes(q)
    );
  }, [taskSearch]);

  const selectedTask = MOCK_TASKS.find(t => t.id === selectedTaskId);

  const handleSubmit = () => {
    if (!selectedTaskId || !hours || !entryDate || !description.trim()) return;
    const t = MOCK_TASKS.find(x => x.id === selectedTaskId);
    onSubmit({
      task_id: selectedTaskId,
      ticket_id: t?.ticket_id ?? null,
      hours_spent: hours,
      entry_date: entryDate,
      description: description.trim(),
    });
  };

  const isValid = selectedTaskId && hours && parseFloat(hours) > 0 && entryDate && description.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Списать время</h2>
              <p className="text-l text-[var(--text-primary)]/40 mt-0.5">Укажите, сколько времени потратили на задачу</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Выбор задачи */}
          {!task && !selectedTask && (
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Задача *</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40" />
                <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)}
                  placeholder="Поиск по названию или номеру тикета..."
                  className="w-full pl-9 pr-3 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                             text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30" />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border-color)] divide-y divide-[var(--border-color)]/40">
                {filteredTasks.map(t => (
                  <button key={t.id} onClick={() => setSelectedTaskId(t.id)}
                    className="w-full text-left p-3 hover:bg-[var(--hover-1)] transition-colors">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-l text-[var(--text-primary)]/50 flex-wrap">
                      {t.ticket_number && (
                        <span className="flex items-center gap-1">
                          <TicketIcon className="w-3 h-3" />#{t.ticket_number}
                        </span>
                      )}
                      {t.project_name && (
                        <span className="flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />{t.project_name}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Выбранная задача */}
          {selectedTask && (
            <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ListTodo className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-l uppercase tracking-wider text-[var(--accent)] font-semibold">Задача</span>
                  </div>
                  <p className="text-base font-semibold text-[var(--text-primary)]">{selectedTask.title}</p>
                  <div className="flex items-center gap-3 mt-2 text-l text-[var(--text-primary)]/60 flex-wrap">
                    {selectedTask.ticket_number && (
                      <span className="flex items-center gap-1">
                        <TicketIcon className="w-3 h-3" />
                        #{selectedTask.ticket_number} {selectedTask.ticket_title}
                      </span>
                    )}
                    {selectedTask.project_name && (
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />{selectedTask.project_name}
                      </span>
                    )}
                    {selectedTask.counterparty_name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />{selectedTask.counterparty_name}
                      </span>
                    )}
                  </div>
                </div>
                {!task && (
                  <button onClick={() => setSelectedTaskId('')}
                    className="p-1.5 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedTaskId && (
            <>
              {/* Часы — большой ввод */}
              <div>
                <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Сколько часов потратили? *</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={0.25} step={0.25} value={hours} onChange={e => setHours(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 px-5 py-4 bg-[var(--hover-2)] border-2 border-[var(--border-color)] rounded-xl
                               text-[var(--text-primary)] text-3xl font-bold text-center
                               focus:outline-none focus:border-[var(--accent)]" />
                  <span className="text-xl font-semibold text-[var(--text-primary)]/40">часов</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['0.25', '0.5', '1', '2', '4', '6', '8'].map(h => (
                    <button key={h} onClick={() => setHours(h)}
                      className={`px-3 py-1.5 rounded-lg border text-l font-medium transition-colors ${hours === h
                          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                          : 'bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/70'
                        }`}>
                      {h} ч
                    </button>
                  ))}
                </div>
              </div>

              {/* Дата */}
              <div>
                <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Дата выполнения *</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[0, 1, 2].map(off => {
                    const d = new Date(); d.setDate(d.getDate() - off);
                    const iso = dateISO(d);
                    return (
                      <button key={off} onClick={() => setEntryDate(iso)}
                        className={`px-3 py-1.5 rounded-lg border text-l font-medium transition-colors ${entryDate === iso
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/70'
                          }`}>
                        {fmtRelative(iso)}
                      </button>
                    );
                  })}
                </div>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                             text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30" />
              </div>

              {/* Описание */}
              <div>
                <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Что было сделано? *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Например: исправил баг с авторизацией, провёл код-ревью"
                  className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                             text-[var(--text-primary)] text-sm placeholder-white/25 resize-none
                             focus:outline-none focus:border-[var(--accent)]/30" />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm">
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={loading || !isValid}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium
                       disabled:opacity-40 shadow-[var(--shadow-md)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Списать время
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛКА: Создание ЛУРВ
// ═══════════════════════════════════════════════════════════════════════════

function TimesheetModal({
  loading, onSubmit, onClose, freeHours,
}: {
  loading: boolean; freeHours: number;
  onSubmit: (data: { period_start: string; period_end: string; name: string; counterparty_id?: string; project_id?: string; auto_add_worklogs: boolean }) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [periodStart, setPeriodStart] = useState(dateISO(firstDay));
  const [periodEnd, setPeriodEnd] = useState(dateISO(lastDay));
  const [name, setName] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [autoAdd, setAutoAdd] = useState(true);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  useEffect(() => {
    if (periodStart && periodEnd) {
      const startD = new Date(periodStart);
      const monthName = startD.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      const cpName = counterpartyId ? MOCK_COUNTERPARTIES.find(c => c.id === counterpartyId)?.name : '';
      const suffix = cpName ? ` — ${cpName}` : '';
      setName(`ЛУРВ за ${monthName}${suffix}`);
    }
  }, [periodStart, periodEnd, counterpartyId]);

  const setPreset = (preset: 'this_week' | 'last_week' | 'this_month' | 'last_month') => {
    const now = new Date();
    let start: Date, end: Date;
    switch (preset) {
      case 'this_week': {
        const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
        start = new Date(now); start.setDate(now.getDate() - dow);
        end = new Date(start); end.setDate(start.getDate() + 6);
        break;
      }
      case 'last_week': {
        const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
        end = new Date(now); end.setDate(now.getDate() - dow - 1);
        start = new Date(end); start.setDate(end.getDate() - 6);
        break;
      }
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
    }
    setPeriodStart(dateISO(start));
    setPeriodEnd(dateISO(end));
  };

  const handleSubmit = () => {
    if (!periodStart || !periodEnd || !name.trim()) return;
    onSubmit({
      period_start: periodStart, period_end: periodEnd, name: name.trim(),
      counterparty_id: counterpartyId || undefined,
      project_id: projectId || undefined,
      auto_add_worklogs: autoAdd,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Создать ЛУРВ</h2>
              <p className="text-l text-[var(--text-primary)]/40 mt-0.5">Лист учёта рабочего времени для согласования</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Период</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { value: 'this_week', label: 'Эта неделя' },
                { value: 'last_week', label: 'Прошлая неделя' },
                { value: 'this_month', label: 'Этот месяц' },
                { value: 'last_month', label: 'Прошлый месяц' },
              ].map(p => (
                <button key={p.value} onClick={() => setPreset(p.value as any)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border border-[var(--border-color)]
                             text-[var(--text-primary)]/70 text-l font-medium transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                           text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30" />
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                           text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Контрагент</label>
              <select value={counterpartyId} onChange={e => setCounterpartyId(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                           text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30">
                <option value="">— Все —</option>
                {MOCK_COUNTERPARTIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Проект</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                           text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30">
                <option value="">— Все —</option>
                {MOCK_PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Наименование *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                         text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30" />
          </div>

          <label className="flex items-start gap-3 p-3 bg-[var(--accent-soft)] border border-[var(--accent)]/20 rounded-xl cursor-pointer">
            <input type="checkbox" checked={autoAdd} onChange={e => setAutoAdd(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Автоматически собрать списанное время за период
              </p>
              <p className="text-l text-[var(--text-primary)]/50 mt-0.5">
                Все ваши свободные записи времени попадут в этот ЛУРВ
                {freeHours > 0 && (
                  <span className="text-[var(--accent)] font-semibold ml-1">
                    (~ {freeHours.toFixed(1)} ч доступно)
                  </span>
                )}
              </p>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm">
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={loading || !periodStart || !periodEnd || !name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium
                       disabled:opacity-40 shadow-[var(--shadow-md)]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Создать ЛУРВ
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛКА: Отклонение
// ═══════════════════════════════════════════════════════════════════════════

function RejectModal({
  timesheetName, loading, onConfirm, onClose,
}: { timesheetName: string; loading: boolean; onConfirm: (reason: string) => void; onClose: () => void; }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="pt-8 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
        </div>
        <div className="px-7 pt-5 pb-2 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Отклонить ЛУРВ?</h2>
          <p className="text-sm text-[var(--text-primary)]/60">
            «<span className="font-semibold text-[var(--text-primary)]">{timesheetName}</span>»
          </p>
        </div>
        <div className="px-6 pt-4">
          <label className="block text-sm text-[var(--text-primary)]/60 mb-2">Причина отклонения *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="Укажите причину..."
            className="w-full px-4 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                       text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:border-[var(--accent)]/30" />
        </div>
        <div className="flex gap-3 p-6">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-base font-medium">
            Отмена
          </button>
          <button onClick={() => onConfirm(reason)} disabled={loading || !reason.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-red-600/20 border border-red-600/30 text-red-400 text-base font-medium disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Отклонить
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ОСНОВНОЙ КОМПОНЕНТ
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'my_time' | 'timesheets';

export default function TimesheetsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [view, setView] = useState<ViewMode>('my_time');
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedTS, setExpandedTS] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Модалки
  const [logTimeTask, setLogTimeTask] = useState<Task | null | undefined>(undefined); // undefined = закрыто
  const [logTimeDate, setLogTimeDate] = useState<string | undefined>(undefined);
  const [savingLog, setSavingLog] = useState(false);

  const [showTSModal, setShowTSModal] = useState(false);
  const [savingTS, setSavingTS] = useState(false);

  const [rejectingTS, setRejectingTS] = useState<Timesheet | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isApprover = ['admin', 'support_manager'].includes(user?.role ?? '');

  // ── Загрузка ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      await new Promise(r => setTimeout(r, 300));
      setTimesheets(MOCK_TIMESHEETS);
      setWorklogs(MOCK_WORKLOGS);
      setLoading(false);
    })();
  }, []);

  // ── Метрики ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalH = worklogs.reduce((s, w) => s + parseFloat(w.hours_spent), 0);
    const approvedH = worklogs.filter(w => w.status === 'approved').reduce((s, w) => s + parseFloat(w.hours_spent), 0);
    const pendingH = worklogs.filter(w => w.status === 'submitted').reduce((s, w) => s + parseFloat(w.hours_spent), 0);
    const freeH = worklogs.filter(w => !w.timesheet_id && w.status === 'draft').reduce((s, w) => s + parseFloat(w.hours_spent), 0);

    // Часы за сегодня и неделю
    const today = dateISO(new Date());
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6);
    const weekStartISO = dateISO(weekStart);

    const todayH = worklogs.filter(w => w.entry_date === today).reduce((s, w) => s + parseFloat(w.hours_spent), 0);
    const weekH = worklogs.filter(w => w.entry_date >= weekStartISO).reduce((s, w) => s + parseFloat(w.hours_spent), 0);

    return { totalH, approvedH, pendingH, freeH, todayH, weekH };
  }, [worklogs]);

  // ── Фильтрация ────────────────────────────────────────────────────────────
  const filteredTimesheets = useMemo(() => {
    return timesheets.filter(ts => statusFilter === 'all' || ts.status === statusFilter);
  }, [timesheets, statusFilter]);

  // Группировка свободных записей по дате
  const freeWorklogsByDate = useMemo(() => {
    const free = worklogs.filter(w => !w.timesheet_id && w.status === 'draft');
    const map = new Map<string, Worklog[]>();
    free.forEach(w => {
      const arr = map.get(w.entry_date) ?? [];
      arr.push(w);
      map.set(w.entry_date, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [worklogs]);

  // ── Действия ──────────────────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpandedTS(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const openLogTime = (task: Task | null = null, date?: string) => {
    setLogTimeTask(task);
    setLogTimeDate(date);
  };

  const handleSaveLog = async (data: any) => {
    setSavingLog(true);
    await new Promise(r => setTimeout(r, 400));
    const newWL: Worklog = {
      id: `wl-${Date.now()}`, created_at: todayISO(), updated_at: todayISO(),
      timesheet_id: null, user_id: MOCK_USER_ID,
      ticket_id: data.ticket_id, task_id: data.task_id,
      hours_spent: data.hours_spent, entry_date: data.entry_date, description: data.description,
      status: 'draft', approved_by: null, approved_at: null, rejection_reason: null,
    };
    setWorklogs(prev => [newWL, ...prev]);
    toast({ title: 'Время списано', description: `${fmtHours(data.hours_spent)} добавлено` });
    setLogTimeTask(undefined);
    setLogTimeDate(undefined);
    setSavingLog(false);
  };

  const handleDeleteWorklog = (wl: Worklog) => {
    if (wl.status !== 'draft' || wl.timesheet_id) {
      toast({ title: 'Нельзя удалить', description: 'Можно удалить только свободные черновики', variant: 'destructive' });
      return;
    }
    setWorklogs(prev => prev.filter(w => w.id !== wl.id));
    toast({ title: 'Удалено', description: 'Запись удалена' });
  };

  const handleCreateTS = async (data: any) => {
    setSavingTS(true);
    await new Promise(r => setTimeout(r, 500));

    const newId = `t-${Date.now()}`;
    let attachedIds: string[] = [];
    let totalH = 0;
    if (data.auto_add_worklogs) {
      const matched = worklogs.filter(w =>
        !w.timesheet_id && w.status === 'draft' &&
        w.entry_date >= data.period_start && w.entry_date <= data.period_end
      );
      attachedIds = matched.map(w => w.id);
      totalH = matched.reduce((s, w) => s + parseFloat(w.hours_spent), 0);
      setWorklogs(prev => prev.map(w => attachedIds.includes(w.id) ? { ...w, timesheet_id: newId } : w));
    }

    const newTS: Timesheet = {
      id: newId, created_at: todayISO(), updated_at: todayISO(),
      user_id: MOCK_USER_ID,
      period_start: data.period_start, period_end: data.period_end, name: data.name,
      counterparty_id: data.counterparty_id ?? null, project_id: data.project_id ?? null,
      status: 'draft',
      total_hours: totalH.toFixed(2), approved_hours: '0.00', pending_hours: '0.00', draft_hours: totalH.toFixed(2),
      worklogs_count: attachedIds.length, worklog_ids: attachedIds,
      submitted_at: null, approved_at: null, approved_by: null,
    };
    setTimesheets(prev => [newTS, ...prev]);
    toast({
      title: 'ЛУРВ создан',
      description: attachedIds.length ? `Включено ${attachedIds.length} записей (${totalH.toFixed(1)} ч)` : 'Пустой ЛУРВ',
    });
    setShowTSModal(false);
    setSavingTS(false);
    setView('timesheets');
  };

  const handleSubmitTS = async (ts: Timesheet) => {
    setActionLoading(ts.id);
    await new Promise(r => setTimeout(r, 400));
    setTimesheets(prev => prev.map(t => t.id === ts.id
      ? { ...t, status: 'submitted', submitted_at: todayISO(), pending_hours: t.total_hours, draft_hours: '0.00' }
      : t));
    setWorklogs(prev => prev.map(w => ts.worklog_ids.includes(w.id) ? { ...w, status: 'submitted' } : w));
    toast({ title: 'Отправлено', description: 'ЛУРВ отправлен на согласование' });
    setActionLoading(null);
  };

  const handleApproveTS = async (ts: Timesheet) => {
    setActionLoading(ts.id);
    await new Promise(r => setTimeout(r, 400));
    setTimesheets(prev => prev.map(t => t.id === ts.id
      ? {
        ...t, status: 'approved', approved_at: todayISO(), approved_by: MOCK_APPROVER_ID,
        approved_hours: t.total_hours, pending_hours: '0.00'
      }
      : t));
    setWorklogs(prev => prev.map(w => ts.worklog_ids.includes(w.id)
      ? { ...w, status: 'approved', approved_at: todayISO(), approved_by: MOCK_APPROVER_ID } : w));
    toast({ title: 'Согласовано', description: 'ЛУРВ успешно согласован' });
    setActionLoading(null);
  };

  const handleRejectTS = async (reason: string) => {
    if (!rejectingTS) return;
    setRejectLoading(true);
    await new Promise(r => setTimeout(r, 400));
    setTimesheets(prev => prev.map(t => t.id === rejectingTS.id ? { ...t, status: 'rejected' } : t));
    setWorklogs(prev => prev.map(w => rejectingTS.worklog_ids.includes(w.id)
      ? { ...w, status: 'rejected', rejection_reason: reason } : w));
    toast({ title: 'Отклонено', description: 'ЛУРВ отклонён' });
    setRejectingTS(null);
    setRejectLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
    </div>
  );

  const greeting = getGreeting();
  const GreetIcon = greeting.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-[var(--shadow-md)]">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <div>

            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Лист учета рабочего времени</h1>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button onClick={() => openLogTime()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium
                       transition-colors shadow-[var(--shadow-md)] hover:opacity-90">
            <Plus className="w-4 h-4" />
            Списать время
          </button>
          {isApprover || metrics.freeH > 0 ? (
            <button onClick={() => setShowTSModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)]
                         border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium transition-colors">
              <FileText className="w-4 h-4" />
              Сформировать ЛУРВ
            </button>
          ) : null}
        </div>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Calendar} label="Сегодня" value={metrics.todayH.toFixed(1)} suffix="ч" color="text-[var(--accent)]" />
        <StatCard icon={TrendingUp} label="За неделю" value={metrics.weekH.toFixed(1)} suffix="ч" color="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Согласовано" value={metrics.approvedH.toFixed(1)} suffix="ч" color="text-[var(--success)]" />
        <StatCard icon={FileText} label="Не в ЛУРВ" value={metrics.freeH.toFixed(1)} suffix="ч" color="text-[var(--warning)]"
          subtitle="готово к отчёту" highlight={metrics.freeH > 0} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-[var(--border-color)]">
        {([
          { id: 'my_time' as ViewMode, label: 'Моё время', icon: Clock, count: freeWorklogsByDate.reduce((s, [, items]) => s + items.length, 0) },
          { id: 'timesheets' as ViewMode, label: 'Мои ЛУРВ', icon: FileText, count: timesheets.length },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl transition-all whitespace-nowrap ${view === tab.id
                ? 'bg-[var(--accent)]/50 text-white border-b-2 border-red-500'
                : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
              }`}>
            <tab.icon className="w-4 h-4" />
            <span className="text-base font-medium">{tab.label}</span>
            {tab.count > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── MY TIME VIEW ─── */}
      {view === 'my_time' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Левая колонка: задачи для быстрого списания */}
          <div className="lg:col-span-1">
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-[var(--text-primary)]/40" />
                  Мои задачи
                </h3>
                <p className="text-l text-[var(--text-primary)]/40 mt-0.5">
                  Кликните, чтобы списать время
                </p>
              </div>
              <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
                {MOCK_TASKS.map(t => {
                  const taskWLs = worklogs.filter(w => w.task_id === t.id);
                  const totalH = taskWLs.reduce((s, w) => s + parseFloat(w.hours_spent), 0);
                  return (
                    <button key={t.id} onClick={() => openLogTime(t)}
                      className="w-full text-left p-3 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--accent-soft)]
                                 border border-[var(--border-color)] hover:border-[var(--accent)]/30
                                 transition-all group">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">{t.title}</p>
                        <Plus className="w-4 h-4 text-[var(--text-primary)]/40 group-hover:text-[var(--accent)] flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[13px] text-[var(--text-primary)]/50">
                        {t.ticket_number && (
                          <span className="flex items-center gap-0.5">
                            <TicketIcon className="w-3 h-3" />#{t.ticket_number}
                          </span>
                        )}
                        {t.project_name && (
                          <span className="flex items-center gap-0.5">
                            <FolderOpen className="w-3 h-3" />{t.project_name}
                          </span>
                        )}
                        {totalH > 0 && (
                          <span className="ml-auto px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium">
                            {totalH.toFixed(1)} ч
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Правая колонка: журнал времени по дням */}
          <div className="lg:col-span-2">
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[var(--text-primary)]/40" />
                    Списанное время (не в ЛУРВ)
                  </h3>
                  <p className="text-l text-[var(--text-primary)]/40 mt-0.5">
                    {metrics.freeH > 0
                      ? `${metrics.freeH.toFixed(1)} ч готовы попасть в ЛУРВ`
                      : 'Свободных записей нет'}
                  </p>
                </div>
                {metrics.freeH > 0 && (
                  <button onClick={() => setShowTSModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-l font-medium shadow-[var(--shadow-md)]">
                    <FileText className="w-3 h-3" />
                    В ЛУРВ
                  </button>
                )}
              </div>

              <div className="p-5">
                {freeWorklogsByDate.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 text-[var(--text-primary)]/10 mx-auto mb-3" />
                    <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Всё чисто!</p>
                    <p className="text-[var(--text-primary)]/40 text-sm mb-4">
                      Все ваши записи времени включены в ЛУРВ
                    </p>
                    <button onClick={() => openLogTime()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium">
                      <Plus className="w-4 h-4" />
                      Списать время
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {freeWorklogsByDate.map(([date, items]) => {
                      const totalH = items.reduce((s, w) => s + parseFloat(w.hours_spent), 0);
                      return (
                        <div key={date}>
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]/40">
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">{fmtRelative(date)}</h4>
                            <div className="flex items-center gap-3">
                              <span className="text-l text-[var(--text-primary)]/50">
                                {items.length} {items.length === 1 ? 'запись' : 'записей'}
                              </span>
                              <span className="text-sm font-bold text-[var(--accent)]">{totalH.toFixed(1)} ч</span>
                              <button onClick={() => openLogTime(null, date)}
                                className="p-1 rounded hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 hover:text-[var(--accent)]">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {items.map(wl => <WorklogRow key={wl.id} worklog={wl} onDelete={handleDeleteWorklog} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TIMESHEETS VIEW ─── */}
      {view === 'timesheets' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                         text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]/30">
              <option value="all">Все статусы</option>
              {TIMESHEET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {!filteredTimesheets.length ? (
            <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-16 text-center">
              <FileText className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
              <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Нет ЛУРВ</p>
              <p className="text-[var(--text-primary)]/40 text-sm mb-4">
                Создайте первый лист учёта рабочего времени
              </p>
              <button onClick={() => setShowTSModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium">
                <FileText className="w-4 h-4" />
                Сформировать ЛУРВ
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTimesheets.map(ts => {
                const meta = getTSStatusMeta(ts.status);
                const Icon = meta.icon;
                const isExpanded = expandedTS.has(ts.id);
                const tsWLs = worklogs.filter(w => ts.worklog_ids.includes(w.id));
                const total = parseFloat(ts.total_hours);
                const isLoading = actionLoading === ts.id;

                return (
                  <div key={ts.id}
                    className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl overflow-hidden hover:border-[var(--border-color)]/80 transition-all">
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleExpand(ts.id)}
                          className="p-1.5 rounded-lg hover:bg-[var(--hover-1)] mt-0.5">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-[var(--text-primary)]/50" />
                            : <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/50" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[var(--text-primary)] font-semibold text-base truncate">{ts.name}</h3>
                              <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                <span className="flex items-center gap-1.5 text-l text-[var(--text-primary)]/50">
                                  <CalendarDays className="w-3.5 h-3.5" />{fmtPeriod(ts.period_start, ts.period_end)}
                                </span>
                                {getCounterpartyName(ts.counterparty_id) && (
                                  <span className="flex items-center gap-1.5 text-l text-[var(--text-primary)]/50">
                                    <Building2 className="w-3.5 h-3.5" />{getCounterpartyName(ts.counterparty_id)}
                                  </span>
                                )}
                                {getProjectName(ts.project_id) && (
                                  <span className="flex items-center gap-1.5 text-l text-[var(--text-primary)]/50">
                                    <FolderOpen className="w-3.5 h-3.5" />{getProjectName(ts.project_id)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-l font-medium border flex-shrink-0
                                             ${meta.bg} ${meta.color} ${meta.border}`}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </div>

                          {/* Прогресс-бар */}
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1.5 text-l">
                              <span className="text-[var(--text-primary)]/50">
                                {ts.worklogs_count} {ts.worklogs_count === 1 ? 'запись' : 'записей'} · {fmtHours(ts.total_hours)}
                              </span>
                              {total > 0 && (
                                <span className="text-[var(--text-primary)]/70 font-medium">
                                  {((parseFloat(ts.approved_hours) / total) * 100).toFixed(0)}% согласовано
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 bg-[var(--hover-1)] rounded-full overflow-hidden flex">
                              {parseFloat(ts.approved_hours) > 0 && total > 0 && (
                                <div className="bg-[var(--success)]" style={{ width: `${(parseFloat(ts.approved_hours) / total) * 100}%` }} />
                              )}
                              {parseFloat(ts.pending_hours) > 0 && total > 0 && (
                                <div className="bg-[var(--warning)]" style={{ width: `${(parseFloat(ts.pending_hours) / total) * 100}%` }} />
                              )}
                              {parseFloat(ts.draft_hours) > 0 && total > 0 && (
                                <div className="bg-[var(--text-primary)]/20" style={{ width: `${(parseFloat(ts.draft_hours) / total) * 100}%` }} />
                              )}
                            </div>
                          </div>

                          {/* Часы по статусам */}
                          <div className="flex items-center gap-4 flex-wrap text-l mb-3">
                            {parseFloat(ts.approved_hours) > 0 && (
                              <HoursBadge color="bg-[var(--success)]" label="Согласовано" hours={ts.approved_hours} />
                            )}
                            {parseFloat(ts.pending_hours) > 0 && (
                              <HoursBadge color="bg-[var(--warning)]" label="На согласовании" hours={ts.pending_hours} />
                            )}
                            {parseFloat(ts.draft_hours) > 0 && (
                              <HoursBadge color="bg-[var(--text-primary)]/40" label="Черновик" hours={ts.draft_hours} />
                            )}
                          </div>

                          {/* Действия */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {(ts.status === 'draft' || ts.status === 'rejected') && (
                              <button onClick={() => handleSubmitTS(ts)} disabled={isLoading || ts.worklogs_count === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-l font-medium
                                           transition-colors disabled:opacity-40 shadow-[var(--shadow-md)]">
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Отправить на согласование
                              </button>
                            )}
                            {ts.status === 'submitted' && isApprover && (
                              <>
                                <button onClick={() => handleApproveTS(ts)} disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--success)]/15 hover:bg-[var(--success)]/25
                                             border border-[var(--success)]/30 text-[var(--success)] text-l font-medium transition-colors disabled:opacity-40">
                                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  Согласовать
                                </button>
                                <button onClick={() => setRejectingTS(ts)} disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25
                                             border border-red-500/30 text-red-400 text-l font-medium transition-colors disabled:opacity-40">
                                  <XCircle className="w-3 h-3" />
                                  Отклонить
                                </button>
                              </>
                            )}
                            {ts.status === 'submitted' && !isApprover && (
                              <div className="flex items-center gap-1.5 text-l text-[var(--text-primary)]/40">
                                <AlertCircle className="w-3 h-3" />
                                Ожидание решения от руководителя
                              </div>
                            )}
                            {ts.status === 'rejected' && (
                              <div className="flex items-center gap-1.5 text-l text-red-400">
                                <AlertTriangle className="w-3 h-3" />
                                Отклонён — исправьте и отправьте снова
                              </div>
                            )}
                            {ts.status === 'approved' && ts.approved_at && (
                              <div className="flex items-center gap-1.5 text-l text-[var(--success)]">
                                <CheckCircle2 className="w-3 h-3" />
                                Согласован {fmtRelative(ts.approved_at)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Раскрытие */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border-color)] bg-[var(--hover-1)]/50 px-5 py-4">
                        <p className="text-l uppercase tracking-widest text-[var(--text-primary)]/40 mb-3 font-semibold">
                          Записи в ЛУРВ ({tsWLs.length})
                        </p>
                        {tsWLs.length === 0 ? (
                          <p className="text-sm text-[var(--text-primary)]/40 py-4 text-center">Нет записей</p>
                        ) : (
                          <div className="space-y-2">
                            {tsWLs.map(wl => <WorklogRow key={wl.id} worklog={wl} compact />)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* MODALS */}
      {logTimeTask !== undefined && (
        <LogTimeModal task={logTimeTask} defaultDate={logTimeDate} loading={savingLog}
          onSubmit={handleSaveLog}
          onClose={() => { setLogTimeTask(undefined); setLogTimeDate(undefined); }} />
      )}
      {showTSModal && (
        <TimesheetModal loading={savingTS} freeHours={metrics.freeH}
          onSubmit={handleCreateTS} onClose={() => setShowTSModal(false)} />
      )}
      {rejectingTS && (
        <RejectModal timesheetName={rejectingTS.name} loading={rejectLoading}
          onConfirm={handleRejectTS} onClose={() => setRejectingTS(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// СУБ-КОМПОНЕНТЫ
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({
  icon: Icon, label, value, suffix, color, subtitle, highlight,
}: { icon: any; label: string; value: string; suffix?: string; color: string; subtitle?: string; highlight?: boolean }) {
  return (
    <div className={`bg-[var(--hover-2)] rounded-2xl border p-5 transition-all ${highlight ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent)]/10' : 'border-[var(--border-color)]'
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-[var(--hover-1)] flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-l uppercase tracking-widest text-[var(--text-primary)]/40 mb-2">{label}</p>
      <p className="text-3xl font-bold text-[var(--text-primary)]">
        {value}<span className="text-base font-normal text-[var(--text-primary)]/40 ml-1">{suffix}</span>
      </p>
      {subtitle && <p className={`text-l mt-1.5 ${highlight ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}>{subtitle}</p>}
    </div>
  );
}

function HoursBadge({ color, label, hours }: { color: string; label: string; hours: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[var(--text-primary)]/60">{label}:</span>
      <span className="text-[var(--text-primary)] font-semibold">{fmtHours(hours)}</span>
    </div>
  );
}

function WorklogRow({
  worklog, onDelete, compact = false,
}: { worklog: Worklog; compact?: boolean; onDelete?: (wl: Worklog) => void }) {
  const meta = getWLStatusMeta(worklog.status);
  const task = getTask(worklog.task_id);
  const canDelete = worklog.status === 'draft' && !worklog.timesheet_id;

  return (
    <div className={`group bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
                    hover:border-[var(--border-color)]/80 transition-all ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        {/* Часы — большая плашка */}
        <div className="flex flex-col items-center justify-center px-3 py-1.5 rounded-lg bg-[var(--accent-soft)]
                        border border-[var(--accent)]/15 flex-shrink-0 min-w-[64px]">
          <span className="text-lg font-bold text-[var(--text-primary)] leading-none">
            {parseFloat(worklog.hours_spent).toFixed(1)}
          </span>
          <span className="text-[9px] uppercase text-[var(--text-primary)]/60 font-semibold tracking-wider mt-0.5">часов</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {task && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20
                              text-[13px] text-purple-400 font-medium max-w-[280px]">
                <ListTodo className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{task.title}</span>
              </span>
            )}
            {task?.ticket_number && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20
                              text-[13px] text-blue-400 font-medium">
                <TicketIcon className="w-3 h-3" />#{task.ticket_number}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-md text-[13px] font-medium border ${meta.bg} ${meta.color} ${meta.border}`}>
              {meta.label}
            </span>
          </div>

          <p className="text-sm text-[var(--text-primary)]/80 leading-relaxed">{worklog.description}</p>

          {worklog.rejection_reason && (
            <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-l text-red-300 leading-relaxed">
                <span className="font-semibold">Причина отклонения:</span> {worklog.rejection_reason}
              </p>
            </div>
          )}
        </div>

        {!compact && canDelete && onDelete && (
          <button onClick={() => onDelete(worklog)}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-[var(--text-primary)]/40 hover:text-red-400
                       opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}