import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Search, Filter, Calendar, Loader2, X, Check, Circle, Timer, Eye,
  ArrowUpRight, ChevronDown, Flag, AlertCircle, CheckCircle2, Ban, RotateCcw,
  RefreshCw, Archive, FolderOpen, Ticket, Zap, Star, User, Layers, UserCheck,
  GitPullRequest, ThumbsUp, ThumbsDown, Pencil, List, LayoutGrid, Clock3,
  FileText, File as FileIcon, Download,
} from 'lucide-react';
import { tasksApi, projectsApi, ticketsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import type {
  TaskKanbanItem, TaskKanbanColumn, TaskStatus, TaskPriority,
  TaskCreateInput, TaskUpdateInput, TaskKanbanContext,
  SimpleUser, CounterpartyCustomer,
} from '../types';

/* ───────────────── types ───────────────── */

type TaskTag = { name: string; color?: string | null };

type TaskAttachment = {
  id?: string;
  file_name?: string | null;
  original_name?: string | null;
  original_filename?: string | null;
  filename?: string | null;
  name?: string | null;
  file_url?: string | null;
  url?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  size?: number | null;
  file_size?: number | null;
  size_bytes?: number | null;
  storage_key?: string | null;
};

type AttachmentPreviewItem = {
  name: string;
  url: string;
  size?: number | null;
  mimeType?: string | null;
  extension?: string;
  isImage: boolean;
};

type TaskViewItem = TaskKanbanItem & {
  description?: string | null;
  estimated_hours?: number | string | null;
  actual_hours?: number | string | null;
  reviewer_id?: string | null;
  ticket_number?: string | null;
  ticket_title?: string | null;
  project_name?: string | null;
  tags?: TaskTag[] | null;
  tag?: TaskTag[] | null;
  attachments?: TaskAttachment[] | null;
};

type TaskViewColumn = Omit<TaskKanbanColumn, 'tasks'> & {
  tasks: Omit<TaskKanbanColumn['tasks'], 'items'> & { items: TaskViewItem[] };
};

type CtxMode = 'my' | 'internal' | 'project' | 'assignee' | 'ticket';
type ViewMode = 'kanban' | 'list';

type CompleteIntent = { task: TaskViewItem; mode: 'status_done' | 'review_done' };
type AssignIntent = { task: TaskViewItem; targetStatus: 'todo' | 'in_progress' };

/* ───────────────── constants ───────────────── */

const SP_SERIES = [1, 2, 3, 5, 8, 13, 21];

const PRI_LABEL: Record<TaskPriority, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический',
};

const PRI_LIST: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критический' },
];

const ST_LABEL: Record<TaskStatus, string> = {
  backlog: 'В резерве', todo: 'Готово к выполнению', in_progress: 'В работе',
  paused: 'На паузе', blocked: 'Приостановлено', to_review: 'На проверке',
  to_fix: 'На доработку', to_test: 'На тестировании', done: 'Выполнено',
  cancelled: 'Отменено',
};

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'to_review', 'done', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  to_review: ['in_progress', 'done', 'to_fix', 'to_test', 'cancelled'],
  to_fix: ['in_progress', 'to_review', 'cancelled'],
  to_test: ['in_progress', 'to_review', 'done', 'cancelled'],
  done: [], cancelled: [],
};

const ASSIGN_OK: Set<TaskStatus> = new Set([
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test',
]);

const EDIT_OK: Set<TaskStatus> = new Set(['backlog', 'todo', 'paused']);

const COL_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'paused', 'blocked',
  'to_review', 'to_fix', 'to_test', 'done', 'cancelled',
];

const CM: Record<string, {
  icon: React.ComponentType<{ className?: string }>; tc: string; dot: string;
  brd: string; chip: string; empty: string;
}> = {
  backlog: { icon: Circle, tc: 'text-[var(--text-primary)]/60', dot: 'bg-gray-400', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 border-[var(--border-color)]', empty: 'Пусто' },
  todo: { icon: AlertCircle, tc: 'text-blue-500', dot: 'bg-blue-500', brd: 'border-blue-500/30', chip: 'bg-blue-500/10 text-blue-500 border-blue-500/20', empty: 'Пусто' },
  in_progress: { icon: Timer, tc: 'text-amber-500', dot: 'bg-amber-500', brd: 'border-amber-500/30', chip: 'bg-amber-500/10 text-amber-500 border-amber-500/20', empty: 'Пусто' },
  paused: { icon: Ban, tc: 'text-[var(--text-primary)]/50', dot: 'bg-gray-400', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/50 border-[var(--border-color)]', empty: 'Пусто' },
  blocked: { icon: Ban, tc: 'text-red-500', dot: 'bg-red-500', brd: 'border-red-500/30', chip: 'bg-red-500/10 text-red-500 border-red-500/20', empty: 'Пусто' },
  to_review: { icon: Eye, tc: 'text-violet-500', dot: 'bg-violet-500', brd: 'border-violet-500/30', chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
  to_fix: { icon: AlertCircle, tc: 'text-orange-500', dot: 'bg-orange-500', brd: 'border-orange-500/30', chip: 'bg-orange-500/10 text-orange-500 border-orange-500/20', empty: 'Пусто' },
  to_test: { icon: CheckCircle2, tc: 'text-cyan-500', dot: 'bg-cyan-500', brd: 'border-cyan-500/30', chip: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', empty: 'Пусто' },
  done: { icon: CheckCircle2, tc: 'text-emerald-500', dot: 'bg-emerald-500', brd: 'border-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', empty: 'Пусто' },
  cancelled: { icon: RotateCcw, tc: 'text-[var(--text-primary)]/40', dot: 'bg-gray-500/60', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]', empty: 'Пусто' },
  review: { icon: Eye, tc: 'text-violet-500', dot: 'bg-violet-500', brd: 'border-violet-500/30', chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
};

const PM: Record<TaskPriority, { c: string; bg: string; brd: string; dot: string; icon: React.ReactNode }> = {
  low: { c: 'text-emerald-500', bg: 'bg-emerald-500/10', brd: 'border-emerald-500/20', dot: 'bg-emerald-500', icon: <Flag className="w-3.5 h-3.5" /> },
  medium: { c: 'text-yellow-500', bg: 'bg-yellow-500/10', brd: 'border-yellow-500/20', dot: 'bg-yellow-500', icon: <Flag className="w-3.5 h-3.5" /> },
  high: { c: 'text-orange-500', bg: 'bg-orange-500/10', brd: 'border-orange-500/20', dot: 'bg-orange-500', icon: <Flag className="w-3.5 h-3.5" /> },
  critical: { c: 'text-red-500', bg: 'bg-red-500/10', brd: 'border-red-500/20', dot: 'bg-red-500', icon: <Zap className="w-3.5 h-3.5" /> },
};

const INP =
  'w-full px-3 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent-ring)] transition-all';

/* ───────────────── helpers ───────────────── */

const ini = (n?: string | null) =>
  n ? n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '?';

const overdue = (t: TaskViewItem) =>
  !!t.due_date && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();

const fmtDue = (d: string) => {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `${-diff} дн. просрочено`;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const apiErr = (e: any) =>
  e?.response?.data?.error?.public_message ??
  e?.response?.data?.error?.message ??
  e?.response?.data?.detail?.[0]?.msg ??
  e?.message ?? 'Неизвестная ошибка';

const snapCols = (c: TaskViewColumn[]) =>
  c.map((x) => ({ ...x, tasks: { ...x.tasks, items: [...x.tasks.items] } }));

const getTaskTags = (t: TaskViewItem): TaskTag[] => t.tags ?? t.tag ?? [];

const normalizeDecimalString = (value: string) => {
  const v = value.trim().replace(',', '.');
  const m = v.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) return value;
  const sign = m[1] === '-' ? '-' : '';
  let intPart = m[2].replace(/^0+(?=\d)/, '');
  if (!intPart) intPart = '0';
  const frac = (m[3] ?? '').replace(/0+$/, '');
  return frac ? `${sign}${intPart}.${frac}` : `${sign}${intPart}`;
};

const toNumberOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const normalized = normalizeDecimalString(String(v));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const fmtHours = (v: unknown) => {
  if (v == null || v === '') return '—';
  const n = toNumberOrNull(v);
  if (n != null) {
    return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ч`;
  }
  const s = normalizeDecimalString(String(v));
  return s.length > 18 ? `${s.slice(0, 18)}… ч` : `${s} ч`;
};

const getTaskTicketNumber = (task: TaskViewItem) => {
  const explicit = String(task.ticket_number ?? '').trim();
  if (explicit) return explicit;
  if (!task.ticket_id || !task.number) return null;
  const parts = String(task.number).split('-');
  if (parts.length < 2) return null;
  return parts.slice(0, -1).join('-');
};

const getTaskTicketPath = (task: TaskViewItem) => {
  const number = getTaskTicketNumber(task);
  if (number) return `/tickets/${number}`;
  return task.ticket_id ? `/tickets/${task.ticket_id}` : null;
};

const formatFileSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const fixPresignedUrl = (url: string) =>
  url.replace(/http:\/\/(minio|maildev):9000/g, 'http://localhost:9900');

const getFileExtension = (name?: string | null) => {
  const v = String(name ?? '').split('?')[0].split('#')[0];
  const i = v.lastIndexOf('.');
  return i >= 0 ? v.slice(i + 1).toUpperCase() : '';
};

const MIME_LABELS: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP', 'image/gif': 'GIF',
  'image/svg+xml': 'SVG', 'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/csv': 'CSV',
  'application/zip': 'ZIP', 'application/x-rar-compressed': 'RAR',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
};

const getMimeShortLabel = (mime?: string | null) => {
  const m = String(mime ?? '').toLowerCase();
  return MIME_LABELS[m] || '';
};

const isImageFile = (file?: Pick<File, 'type' | 'name'> | null) => {
  if (!file) return false;
  const mime = String(file.type ?? '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(file.name ?? ''));
};

const buildPendingFileKey = (file: File, index: number) =>
  `${file.name}-${file.size}-${file.lastModified}-${index}`;

const getAttachmentName = (a: TaskAttachment) =>
  a.original_filename || a.original_name || a.file_name || a.filename || a.name ||
  (a.storage_key ? a.storage_key.split('/').pop() : null) || 'Файл';

const getAttachmentUrl = (a: TaskAttachment) => a.file_url || a.url || '';

const getAttachmentMime = (a: TaskAttachment) => a.mime_type || a.content_type || null;

const getAttachmentSize = (a: TaskAttachment) => {
  const size =
    typeof a.size_bytes === 'number' ? a.size_bytes :
    typeof a.size === 'number' ? a.size :
    typeof a.file_size === 'number' ? a.file_size : null;
  return size != null && Number.isFinite(size) ? size : null;
};

const getAttachmentTypeLabel = (a: TaskAttachment) =>
  getFileExtension(getAttachmentName(a)) ||
  getFileExtension(a.storage_key) ||
  getMimeShortLabel(getAttachmentMime(a)) ||
  'FILE';

const getLocalFileTypeLabel = (file: File) =>
  getFileExtension(file.name) || getMimeShortLabel(file.type) || 'FILE';

const isImageAttachment = (a: TaskAttachment) => {
  const mime = String(a.mime_type || a.content_type || '').toLowerCase();
  const probe = `${getAttachmentName(a)} ${a.storage_key ?? ''}`.toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(probe);
};

/* ───────────────── Attachment preview ───────────────── */

function AttachmentPreviewModal({ item, onClose }: {
  item: AttachmentPreviewItem;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{item.name}</h3>
              {item.extension && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/55 border border-[var(--border-color)]">
                  {item.extension}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-[var(--text-primary)]/40 flex flex-wrap gap-2">
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {item.mimeType && <span>{item.mimeType}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-black/20 flex items-center justify-center p-6">
          {item.isImage ? (
            <img src={item.url} alt={item.name} className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" />
          ) : (
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--hover-2)] border border-[var(--border-color)] flex items-center justify-center">
                <FileIcon className="w-8 h-8 text-[var(--text-primary)]/35" />
              </div>
              <div className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{item.extension || 'FILE'}</div>
              <div className="mt-2 text-sm text-[var(--text-primary)]/50 break-all">{item.name}</div>
              <div className="mt-3 text-xs text-[var(--text-primary)]/35">Для этого типа файла предпросмотр недоступен</div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] text-sm">
            Закрыть
          </button>
          <a
            href={item.url}
            download={item.name}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent)]/90 text-sm"
          >
            <Download className="w-4 h-4" />
            Скачать
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TaskAttachmentItem({ attachment, onPreview }: {
  attachment: TaskAttachment;
  onPreview: (item: AttachmentPreviewItem) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const name = getAttachmentName(attachment);
  const size = getAttachmentSize(attachment);
  const mimeType = getAttachmentMime(attachment);
  const isImage = isImageAttachment(attachment);
  const typeLabel = getAttachmentTypeLabel(attachment);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!attachment.id) {
      setError(true);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { download_url } = await attachmentsApi.getPresignedDownloadUrl(attachment.id);
        const fixedUrl = fixPresignedUrl(download_url);
        const res = await fetch(fixedUrl);
        if (!res.ok) throw new Error('download failed');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) { setUrl(objectUrl); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]">
        <div className="w-12 h-12 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/35" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</p>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">{typeLabel}</span>
          </div>
          <p className="text-xs text-[var(--text-primary)]/35">Загрузка предпросмотра...</p>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5">
        <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <FileIcon className="w-5 h-5 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-red-400 truncate">{name}</p>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">{typeLabel}</span>
          </div>
          <p className="text-xs text-red-400/70">Не удалось загрузить файл</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPreview({ name, url, size, mimeType, extension: typeLabel, isImage })}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] hover:bg-[var(--hover-2)] transition-colors text-left group"
    >
      {isImage ? (
        <img src={url} alt={name} className="w-12 h-12 rounded-lg object-cover border border-[var(--border-color)] shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[var(--hover-3)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
          <FileIcon className="w-5 h-5 text-[var(--text-primary)]/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">{name}</p>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)] shrink-0">{typeLabel}</span>
        </div>
        <p className="text-xs text-[var(--text-primary)]/35">{size != null ? formatFileSize(size) : 'Размер неизвестен'}</p>
      </div>
      <Eye className="w-4 h-4 text-[var(--text-primary)]/25 shrink-0" />
    </button>
  );
}

function statusErr(err: any, task: TaskViewItem, to: TaskStatus) {
  const raw = apiErr(err);
  const lw = raw.toLowerCase();

  if (to === 'todo' && (!task.assignee_id || lw.includes('assignee'))) {
    return { title: 'Нужен исполнитель', description: 'Назначьте исполнителя перед переводом задачи в «Готово к выполнению».' };
  }
  if (to === 'in_progress' && (!task.assignee_id || lw.includes('assignee'))) {
    return { title: 'Нужен исполнитель', description: 'Назначьте исполнителя перед переводом задачи в работу.' };
  }
  if (lw.includes('transition') || lw.includes('cannot')) {
    return { title: 'Переход недоступен', description: `Из «${ST_LABEL[task.status]}» нельзя перейти в «${ST_LABEL[to]}».` };
  }
  return { title: `Ошибка перевода в «${ST_LABEL[to]}»`, description: raw };
}

/* ───────────────── dropdown primitives ───────────────── */

interface DDOpt { value: string; label: string; sublabel?: string; icon?: React.ReactNode; dotColor?: string; }

function useDDPos(ref: React.RefObject<HTMLDivElement | null>, open: boolean, wide?: boolean) {
  const [s, setS] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 300;
    setS({
      position: 'fixed',
      left: Math.max(8, r.left),
      width: wide ? Math.max(r.width, 380) : r.width,
      zIndex: 9999,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, wide, ref]);
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
  const sel = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (open && searchable) setTimeout(() => iRef.current?.focus(), 50);
    if (!open) setQ('');
  }, [open, searchable]);

  const fl = q
    ? options.filter((o) =>
        o.label.toLowerCase().includes(q.toLowerCase()) ||
        (o.sublabel || '').toLowerCase().includes(q.toLowerCase()),
      )
    : options;

  const dd = open
    ? createPortal(
        <div ref={dRef} style={pos} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/30" />
                <input ref={iRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..."
                  className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none" />
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-[240px] p-1">
            <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--hover-2)]'} text-[var(--text-primary)]/60`}>
              <span>—</span><span className="flex-1">Не выбрано</span>
              {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            {fl.length === 0 && q && <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">Не найдено</div>}
            {fl.map((o) => (
              <div key={o.value} role="button" tabIndex={0} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'}`}>
                {o.dotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />}
                {o.icon && <span className="shrink-0">{o.icon}</span>}
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate">{o.sublabel}</span>}
                </div>
                {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'
        } ${open ? 'border-[var(--accent)]/50 ring-1 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${sel ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {sel ? sel.label : placeholder || '—'}
        </span>
        {sel && value && (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
            className="p-1 rounded text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-3.5 h-3.5" />
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
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const doLoad = useCallback(async (search: string, page: number, append = false) => {
    append ? setLdMore(true) : setLd(true);
    try {
      const r = await loadFn(search, page);
      setOpts((prev) => (append ? [...prev, ...r.items] : r.items));
      setMore(r.hasNext);
      setPg(page);
    } finally {
      setLd(false);
      setLdMore(false);
    }
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
    const f = opts.find((o) => o.value === value);
    if (f) { setSelLbl(f.label); return; }
    loadFn('', 1).then((r) => {
      const x = r.items.find((o) => o.value === value);
      setSelLbl(x ? x.label : '…');
    }).catch(() => setSelLbl('…'));
  }, [value, opts, loadFn]);

  const dd = open
    ? createPortal(
        <div ref={dRef} style={pos} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/30" />
              <input ref={iRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..."
                className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none" />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[280px] p-1">
            <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${
                !value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]/60'
              }`}>
              <span>—</span><span className="flex-1">Не выбрано</span>
              {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
            </div>
            {ld && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/30" /></div>}
            {!ld && opts.length === 0 && <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">{q ? 'Не найдено' : 'Нет данных'}</div>}
            {!ld && opts.map((o) => (
              <div key={o.value} role="button" tabIndex={0} onClick={() => { onChange(o.value); setSelLbl(o.label); setOpen(false); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${
                  o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'
                }`}>
                {o.dotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />}
                {o.icon && <span className="shrink-0">{o.icon}</span>}
                <div className="flex-1 min-w-0">
                  <span className="block leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {o.label}
                  </span>
                  {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate mt-0.5">{o.sublabel}</span>}
                </div>
                {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
              </div>
            ))}
            {!ld && more && (
              <div role="button" tabIndex={0} onClick={() => !ldMore && doLoad(q, pg + 1, true)}
                className="flex items-center justify-center gap-1.5 py-2 text-sm text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer transition-colors">
                {ldMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />} Ещё
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'
        } ${open ? 'border-[var(--accent)]/50 ring-1 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${selLbl ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {selLbl || placeholder || '—'}
        </span>
        {value && (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(''); setSelLbl(''); setOpen(false); }}
            className="p-1 rounded text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dd}
    </div>
  );
}

/* ───────────────── atoms ───────────────── */

function Ava({ name, url, sz = 'sm' }: { name?: string | null; url?: string | null; sz?: 'xs' | 'sm' }) {
  const c = sz === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-sm';
  if (url) return <img src={url} alt="" className={`${c} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${c} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white shrink-0 select-none`}>
      {ini(name)}
    </div>
  );
}

function PriBadge({ p }: { p: TaskPriority }) {
  const m = PM[p];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${m.bg} ${m.c} ${m.brd}`}>
      {m.icon}{PRI_LABEL[p]}
    </span>
  );
}

function ComplexityBadge({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Сложность">
      <Star className="w-3 h-3" />{v}
    </span>
  );
}

function HoursBadge({ label, value, tone = 'default', title }: {
  label: string; value: unknown; tone?: 'default' | 'accent'; title?: string;
}) {
  const cls = tone === 'accent'
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : 'bg-[var(--hover-2)] text-[var(--text-primary)]/55 border-[var(--border-color)]';
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      <Clock3 className="w-3 h-3" />{label}: {fmtHours(value)}
    </span>
  );
}

/* ───────────────── list view ───────────────── */

function ListView({ tasks, umap, onView }: {
  tasks: TaskViewItem[];
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onView: (t: TaskViewItem) => void;
}) {
  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--text-primary)]/30 h-full">
        <Layers className="w-12 h-12 mb-3" />
        <p className="text-sm">Задач нет</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden h-full flex flex-col">
      <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--hover-1)] border-b border-[var(--border-color)] sticky top-0 z-10">
            <tr className="text-[var(--text-primary)]/50 text-xs">
              <th className="px-4 py-3 font-medium">Задача</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Приоритет</th>
              <th className="px-4 py-3 font-medium">Исполнитель</th>
              <th className="px-4 py-3 font-medium">Срок</th>
              <th className="px-4 py-3 font-medium">Трудозатраты</th>
              <th className="px-4 py-3 font-medium">Факт</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {tasks.map((t) => {
              const a = t.assignee_id ? umap.get(t.assignee_id) : null;
              const cm = CM[t.status];
              const od = overdue(t);
              const ticketNo = getTaskTicketNumber(t);
              return (
                <tr key={t.id} onClick={() => onView(t)} className="hover:bg-[var(--hover-1)] cursor-pointer transition-colors align-top">
                  <td className="px-4 py-3 min-w-[320px]">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-mono text-[var(--text-primary)]/40 text-xs shrink-0">#{t.number}</span>
                        {ticketNo && (
                          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">
                            <Ticket className="w-3 h-3" />{ticketNo}
                          </span>
                        )}
                      </div>
                      <div className="text-[var(--text-primary)] font-medium leading-snug">{t.title}</div>
                      {t.description && <div className="text-xs text-[var(--text-primary)]/45 line-clamp-2 max-w-[420px]">{t.description}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${cm.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cm.dot}`} />{ST_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PriBadge p={t.priority} />
                      {t.story_points != null && <ComplexityBadge v={t.story_points} />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a ? (
                      <div className="flex items-center gap-2">
                        <Ava name={a.full_name || a.username} url={a.avatar_url} sz="xs" />
                        <span className="text-[var(--text-primary)]/70 truncate max-w-[140px] text-sm">{a.full_name || a.username}</span>
                      </div>
                    ) : <span className="text-[var(--text-primary)]/30">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {t.due_date ? (
                      <span className={`text-sm ${od ? 'text-red-400 font-medium' : 'text-[var(--text-primary)]/50'}`}>{fmtDue(t.due_date)}</span>
                    ) : <span className="text-[var(--text-primary)]/30">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]/60 whitespace-nowrap" title="Плановые трудозатраты">{fmtHours(t.estimated_hours)}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]/60 whitespace-nowrap">{fmtHours(t.actual_hours)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────── task card ───────────────── */

function TCard({ task: t, umap, dragging, onDS, onDE, onView }: {
  task: TaskViewItem;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  dragging: boolean;
  onDS: (id: string, f: TaskStatus) => void;
  onDE: () => void;
  onView: (t: TaskViewItem) => void;
}) {
  const od = overdue(t);
  const a = t.assignee_id ? umap.get(t.assignee_id) : null;
  const assigneeSurname = a ? (a.full_name || a.username || '').split(' ')[0] : null;

  return (
    <motion.div
      layout
      draggable
      onDragStart={(e) => { (e as any).dataTransfer.effectAllowed = 'move'; onDS(t.id, t.status); }}
      onDragEnd={onDE}
      onClick={() => onView(t)}
      className={`group bg-[var(--bg-card)] border rounded-xl px-4 py-3.5 cursor-pointer transition-all duration-200 shadow-sm min-h-[140px] flex flex-col relative
        hover:bg-[var(--hover-2)] hover:border-[var(--accent)]/40
        ${dragging ? 'opacity-40 rotate-2 scale-[1.02] shadow-xl z-50 ring-1 ring-[var(--accent)]' : od ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/15' : 'border-[var(--border-color)]'}`}
    >
      <span className="text-xs font-mono text-[var(--text-primary)]/45 mb-1.5 leading-none">#{t.number}</span>
      <h4 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug tracking-tight line-clamp-2 mb-3">{t.title}</h4>
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <PriBadge p={t.priority} />
        {t.story_points != null && <ComplexityBadge v={t.story_points} />}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3 mt-auto">
        <div className="flex items-center gap-2 min-w-0">
          {a ? (
            <>
              <Ava name={a.full_name || a.username} url={a.avatar_url} sz="xs" />
              <span className="text-[13px] text-[var(--text-primary)]/75 font-medium truncate max-w-[100px]">{assigneeSurname}</span>
            </>
          ) : <span className="text-xs text-[var(--text-primary)]/30">—</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.ticket_id && <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/30" />}
          {t.project_id && <FolderOpen className="w-3.5 h-3.5 text-[var(--text-primary)]/30" />}
          {t.due_date && <span className={`text-[12px] font-semibold ml-0.5 ${od ? 'text-red-400' : 'text-[var(--text-primary)]/45'}`}>{fmtDue(t.due_date)}</span>}
        </div>
      </div>
    </motion.div>
  );
}

/* ───────────────── kanban column ───────────────── */

function KCol({ col, umap, isDO, dragId, ldMore, onDS, onDE, onDO, onDL, onDrop, onAdd, onView, onMore }: {
  col: TaskViewColumn;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  isDO: boolean;
  dragId: string | null;
  ldMore: boolean;
  onDS: (id: string, f: TaskStatus) => void;
  onDE: () => void;
  onDO: (e: React.DragEvent, s: TaskStatus) => void;
  onDL: () => void;
  onDrop: (e: React.DragEvent, s: TaskStatus) => void;
  onAdd: (s: TaskStatus) => void;
  onView: (t: TaskViewItem) => void;
  onMore: (s: TaskStatus) => void;
}) {
  const m = CM[col.status];
  const I = m.icon;

  return (
    <div
      onDragOver={(e) => onDO(e, col.status)}
      onDragLeave={onDL}
      onDrop={(e) => onDrop(e, col.status)}
      className={`bg-[var(--hover-1)] rounded-xl flex flex-col w-[320px] shrink-0 border transition-colors h-full ${isDO ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)]'}`}
    >
      <div className="px-3 py-3 flex items-center justify-between border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-card)] rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <I className={`w-4 h-4 shrink-0 ${m.tc}`} />
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{ST_LABEL[col.status]}</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50 shrink-0">{col.tasks.total_items}</span>
        </div>
        <button onClick={() => onAdd(col.status)} className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {col.tasks.items.length === 0 && !isDO ? (
          <div className="h-24 flex flex-col items-center justify-center text-[var(--text-primary)]/30 border border-dashed border-[var(--border-color)] rounded-xl">
            <Layers className="w-5 h-5 mb-1 opacity-50" />
            <span className="text-xs">{m.empty}</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {col.tasks.items.map((t) => (
              <TCard key={t.id} task={t} umap={umap} dragging={dragId === t.id} onDS={onDS} onDE={onDE} onView={onView} />
            ))}
          </AnimatePresence>
        )}
        {isDO && col.tasks.items.length === 0 && (
          <div className="h-24 flex items-center justify-center border-2 border-dashed border-[var(--accent)]/50 rounded-xl bg-[var(--accent)]/10">
            <span className="text-sm font-medium text-[var(--accent)]">Отпустите задачу</span>
          </div>
        )}
        {col.tasks.has_next && (
          <button onClick={() => onMore(col.status)} disabled={ldMore}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] text-xs font-medium transition-colors disabled:opacity-40">
            {ldMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
            Ещё ({Math.max(col.tasks.total_items - col.tasks.items.length, 0)})
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────── drag panel ───────────────── */

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
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed right-4 top-0 h-full z-[100] flex items-center pointer-events-none"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto" style={{ width: 220 }}>
        <div className="px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <p className="text-xs uppercase tracking-wider text-[var(--text-primary)]/40 mb-0.5 font-medium">Перетащить</p>
          <p className="text-sm font-bold text-[var(--text-primary)] truncate">#{task.number}</p>
        </div>
        <div className="p-1.5 space-y-1">
          {al.map((s) => {
            const c = CM[s];
            const I = c.icon;
            const h = hov === s;
            return (
              <div key={s}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHov(s); }}
                onDragLeave={() => setHov(null)}
                onDrop={(e) => { setHov(null); onDrop(e, s); }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all ${h ? `${c.brd} bg-[var(--accent)]/10 scale-[1.02] shadow-sm` : 'border-transparent hover:bg-[var(--hover-2)]'}`}
              >
                <div className={`w-1 h-5 rounded-full ${c.dot}`} />
                <I className={`w-4 h-4 ${c.tc}`} />
                <span className={`text-sm font-medium truncate ${h ? c.tc : 'text-[var(--text-primary)]/70'}`}>{ST_LABEL[s]}</span>
                {h && <Check className={`w-4 h-4 ml-auto ${c.tc}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/* ───────────────── assign modal ───────────────── */

function AssignModal({ task, targetStatus, umap, loading, onClose, onOk }: {
  task: TaskViewItem;
  targetStatus: 'todo' | 'in_progress';
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  loading: boolean;
  onClose: () => void;
  onOk: (id: string) => Promise<void>;
}) {
  const [aid, setAid] = useState(task.assignee_id ?? '');
  const opts: DDOpt[] = Array.from(umap.values()).map((u) => ({
    value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email,
  }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><UserCheck className="w-5 h-5 text-amber-500" /></div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Назначить исполнителя</h2>
              <p className="text-sm text-[var(--text-primary)]/50">Это обязательно для перевода в «В работе»</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[var(--hover-2)] p-3 border border-[var(--border-color)]">
            <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{task.number}</span>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-1.5">{task.title}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Исполнитель <span className="text-red-400">*</span></label>
            <SelectDD value={aid} onChange={setAid} options={opts} placeholder="Выберите исполнителя" icon={UserCheck} searchable />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">Отмена</button>
          <button onClick={() => onOk(aid)} disabled={!aid || loading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent)]/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── complete modal ───────────────── */

function CompleteModal({ task, loading, onClose, onOk }: {
  task: TaskViewItem;
  loading: boolean;
  onClose: () => void;
  onOk: (actualHours: number) => Promise<void>;
}) {
  const defaultActual = toNumberOrNull(task.estimated_hours);
  const [actual, setActual] = useState(defaultActual != null ? String(defaultActual) : '');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  const actualNum = actual === '' ? null : Number(actual);
  const valid = actualNum != null && Number.isFinite(actualNum) && actualNum >= 0;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Перевод в «Выполнено»</h2>
              <p className="text-sm text-[var(--text-primary)]/50">Укажите фактические трудозатраты</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[var(--hover-2)] p-3 border border-[var(--border-color)]">
            <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">{task.number}</span>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-1.5">{task.title}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-3">
            <div className="text-xs text-[var(--text-primary)]/45 mb-1" title="Плановые трудозатраты">Трудозатраты (ч)</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{fmtHours(task.estimated_hours)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Факт (ч) <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="0.5" value={actual} onChange={(e) => setActual(e.target.value)} className={INP} autoFocus placeholder="Введите фактические трудозатраты" />
            <p className="mt-1.5 text-xs text-[var(--text-primary)]/40">По умолчанию подставлены плановые трудозатраты.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">Отмена</button>
          <button onClick={() => valid && onOk(actualNum)} disabled={!valid || loading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-emerald-500/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Завершить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── task editor modal ───────────────── */

function TaskEditorModal({ mode, task, initSt, context, ticketLabel, onClose, onSaved }: {
  mode: 'create' | 'edit';
  task?: TaskViewItem | null;
  initSt?: TaskStatus;
  context: TaskKanbanContext;
  ticketLabel?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();

  const [title, setTitle] = useState(task?.title ?? '');
  const [desc, setDesc] = useState(task?.description ?? '');
  const [pri, setPri] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [sp, setSp] = useState(task?.story_points != null ? String(task.story_points) : '');
  const [estimatedHours, setEstimatedHours] = useState(
    task?.estimated_hours != null ? String(toNumberOrNull(task.estimated_hours) ?? '') : '',
  );
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [ticketId, setTicketId] = useState(
    task?.ticket_id ?? (context.type === 'ticket' ? context.ticket_id : ''),
  );
  const [projectId, setProjectId] = useState(
    task?.project_id ?? (context.type === 'project' ? context.project_id : ''),
  );
  const [todo, setTodo] = useState(initSt === 'todo' && !!assigneeId);
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [localFileUrls, setLocalFileUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewItem, setPreviewItem] = useState<AttachmentPreviewItem | null>(null);
  const existingAttachments = Array.isArray(task?.attachments) ? task.attachments : [];

  const firstProjectChange = useRef(true);

  useEffect(() => {
    if (!assigneeId && todo) setTodo(false);
  }, [assigneeId, todo]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  useEffect(() => {
    if (firstProjectChange.current) { firstProjectChange.current = false; return; }
    setTicketId('');
  }, [projectId]);

  useEffect(() => {
    const next: Record<string, string> = {};
    files.forEach((file, index) => {
      next[buildPendingFileKey(file, index)] = URL.createObjectURL(file);
    });
    setLocalFileUrls(next);
    return () => {
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected].slice(0, 10));
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const loadProjects = useCallback(async (q: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = q
      ? r.items.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()) || x.key.toLowerCase().includes(q.toLowerCase()))
      : r.items;
    return {
      items: f.map((x) => ({ value: x.id, label: x.name, sublabel: x.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })),
      hasNext: r.items.length === 20,
    };
  }, []);

  const loadUsers = useCallback(async (q: string, p: number) => {
    let items: any[] = [];
    try { items = (await usersApi.getAllUsers(p, 20)).items; } catch { items = []; }
    const f = q
      ? items.filter((u) => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
      : items;
    return {
      items: f.map((u) => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })),
      hasNext: items.length === 20,
    };
  }, []);

  const loadTickets = useCallback(async (q: string, p: number) => {
    const r = await ticketsApi.getAll(p, 20, {
      project_ids: projectId ? [projectId] : undefined,
      query: q || undefined,
    });
    return {
      items: r.items.map((t: any) => ({
        value: t.id,
        label: `${t.number} — ${t.title}`,
        icon: <Ticket className="w-4 h-4 text-[var(--text-primary)]/40" />,
      })),
      hasNext: r.items.length === 20,
    };
  }, [projectId]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);

    try {
      let taskId = task?.id;

      if (mode === 'create') {
        const payload: Record<string, any> = { title: title.trim(), priority: pri };
        if (desc.trim()) payload.description = desc.trim();
        if (projectId) payload.project_id = projectId;
        if (ticketId) payload.ticket_id = ticketId;
        if (sp) payload.story_points = Number(sp);
        if (estimatedHours) payload.estimated_hours = Number(estimatedHours);
        if (assigneeId) payload.assignee_id = assigneeId;
        if (dueDate) payload.due_date = dueDate;

        const created = await tasksApi.create(payload as TaskCreateInput);
        taskId = created.id;

        if (todo) {
          await tasksApi.changeStatus(created.id, 'todo');
        }

        toast({ title: 'Задача создана', description: `${created.number} — ${created.title}` });
      } else if (task) {
        const payload: Record<string, any> = {};

        if (title.trim() !== task.title) payload.title = title.trim();
        if ((desc.trim() || '') !== (task.description?.trim() || '')) {
          payload.description = desc.trim() || null;
        }
        if (pri !== task.priority) payload.priority = pri;

        const currentSP = task.story_points != null ? String(task.story_points) : '';
        if (sp !== currentSP) payload.story_points = sp ? Number(sp) : null;

        const currentEst = task.estimated_hours != null ? String(toNumberOrNull(task.estimated_hours) ?? '') : '';
        if (estimatedHours !== currentEst) {
          payload.estimated_hours = estimatedHours ? Number(estimatedHours) : null;
        }

        if (dueDate !== (task.due_date ?? '')) payload.due_date = dueDate || null;
        if (assigneeId !== (task.assignee_id ?? '')) payload.assignee_id = assigneeId || null;
        if (projectId !== (task.project_id ?? '')) payload.project_id = projectId || null;
        if (ticketId !== (task.ticket_id ?? '')) payload.ticket_id = ticketId || null;

        if (Object.keys(payload).length > 0) {
          await tasksApi.update(task.id, payload as TaskUpdateInput);
        }

        toast({ title: 'Задача обновлена', description: `${task.number} — ${title.trim()}` });
      }

      if (taskId && files.length > 0) {
        for (const file of files) {
          try {
            await attachmentsApi.uploadAttachment(file, 'task', taskId);
          } catch (err) {
            console.error('File upload failed:', file.name, err);
          }
        }
      }

      await onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const titleText = mode === 'create' ? 'Создание задачи' : 'Редактирование задачи';
  const subtitleText = mode === 'create' ? 'Проверьте заполнение' : `Изменение задачи ${task?.number ?? ''}`;
  const lockTicket = context.type === 'ticket' && mode === 'create';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                {mode === 'create' ? <Plus className="w-4 h-4 text-[var(--accent)]" /> : <Pencil className="w-4 h-4 text-[var(--accent)]" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">{titleText}</h2>
                <p className="text-sm text-[var(--text-primary)]/50">{subtitleText}</p>
              </div>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Название <span className="text-red-400">*</span>
                </label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что нужно сделать?" autoFocus className={INP} />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Описание</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Опиши задачу " rows={7} className={`${INP} resize-none`} />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-[var(--text-primary)]/70">
                  Вложения <span className="text-[var(--text-primary)]/40 text-xs">(до 10 файлов)</span>
                </label>

                {mode === 'edit' && (
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]/45 mb-2">Уже прикреплено</div>
                    {existingAttachments.length > 0 ? (
                      <div className="space-y-2">
                        {existingAttachments.map((att, i) => (
                          <TaskAttachmentItem key={att.id ?? `${getAttachmentName(att)}-${i}`} attachment={att} onPreview={setPreviewItem} />
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/35">
                        У задачи пока нет вложений
                      </div>
                    )}
                    <p className="mt-2 text-xs text-[var(--text-primary)]/35">
                      Существующие вложения не пропадут. Новые файлы будут просто добавлены к ним.
                    </p>
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-[var(--text-primary)]/45 mb-2">
                    {mode === 'edit' ? 'Добавить новые файлы' : 'Файлы'}
                  </div>
                  <div className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-4 text-center bg-[var(--hover-1)] hover:bg-[var(--hover-2)] transition-colors">
                    <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm text-[var(--accent)] hover:text-[var(--accent-light)] font-medium">
                      + Выбрать файлы
                    </button>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, i) => {
                      const key = buildPendingFileKey(f, i);
                      const fileUrl = localFileUrls[key];
                      const isImg = isImageFile(f);
                      const typeLabel = getLocalFileTypeLabel(f);
                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]">
                          <button
                            type="button"
                            onClick={() => fileUrl && setPreviewItem({ name: f.name, url: fileUrl, size: f.size, mimeType: f.type, extension: typeLabel, isImage: isImg })}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            {isImg && fileUrl ? (
                              <img src={fileUrl} alt={f.name} className="w-10 h-10 rounded-lg object-cover border border-[var(--border-color)] shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[var(--hover-3)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                                <FileIcon className="w-4 h-4 text-[var(--text-primary)]/40" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-[var(--text-primary)] truncate">{f.name}</p>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-1)] text-[var(--text-primary)]/45 border border-[var(--border-color)] shrink-0">{typeLabel}</span>
                              </div>
                              <p className="text-[10px] text-[var(--text-primary)]/30">{formatFileSize(f.size)}</p>
                            </div>
                          </button>
                          <button type="button" onClick={() => removeFile(i)} className="text-[var(--text-primary)]/40 hover:text-red-400 p-1 shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Приоритет</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRI_LIST.map((p) => {
                    const m = PM[p.value];
                    return (
                      <button key={p.value} onClick={() => setPri(p.value)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          pri === p.value ? `${m.bg} ${m.c} ${m.brd}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${m.dot}`} />{p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
                                <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Сложность
                </label>
                <div className="flex flex-wrap gap-2">
                  {SP_SERIES.map((v) => (
                    <button
                      key={v}
                      onClick={() => setSp(String(v))}
                      className={`px-3 py-2 rounded-xl text-sm border transition-all ${
                        sp === String(v)
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    onClick={() => setSp('')}
                    className={`px-3 py-2 rounded-xl text-sm border transition-all ${
                      sp === ''
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30'
                        : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                    }`}
                  >
                    Без сложности
                  </button>
                </div>
              </div>

            </div>


            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Проект</label>
                <AsyncDD value={projectId} onChange={setProjectId} loadFn={loadProjects} placeholder="Не выбран" icon={FolderOpen} />
              </div>

              {!lockTicket && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Заявка</label>
                  <AsyncDD value={ticketId} onChange={setTicketId} loadFn={loadTickets} placeholder={projectId ? 'Выберите заявку' : 'Выберите заявку'} icon={Ticket} wide />
                </div>
              )}

              {lockTicket && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
                  <Ticket className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Создание на основании заявки</p>
                    <p className="text-xs text-blue-400 truncate mt-0.5">{ticketLabel || 'Заявка будет привязана автоматически'}</p>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5" title="Плановые трудозатраты">Трудозатраты (ч)</label>
                  <input type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="Например 4" className={INP} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Срок</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INP} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Исполнитель</label>
                <AsyncDD value={assigneeId} onChange={setAssigneeId} loadFn={loadUsers} placeholder="Не назначен" icon={UserCheck} />
              </div>

              {mode === 'create' && !!assigneeId && (
                <div className="pt-1">
                  <button onClick={() => setTodo((v) => !v)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-sm font-medium ${
                      todo ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'
                    }`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${todo ? 'bg-blue-500 border-blue-500' : 'border-[var(--border-color)]'}`}>
                      {todo && <Check className="w-3 h-3 text-white" />}
                    </div>
                    Сразу к выполнению (статус «{ST_LABEL.todo}»)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] disabled:opacity-50 text-sm">Отмена</button>
          <button onClick={submit} disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-40 hover:bg-[var(--accent)]/90 text-sm shadow-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'create' ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {mode === 'create' ? 'Создать задачу' : 'Сохранить изменения'}
          </button>
        </div>
      </div>

      {previewItem && (
        <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}

/* ───────────────── detail modal ───────────────── */

function DetailModal({ task: t, umap, onClose, onRefresh, onNeedAssign, onEdit, onNeedComplete }: {
  task: TaskViewItem;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onNeedAssign: (t: TaskViewItem, targetStatus: 'todo' | 'in_progress') => void;
  onEdit: (t: TaskViewItem) => void;
  onNeedComplete: (t: TaskViewItem, mode: 'status_done' | 'review_done') => void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [showArchive, setShowArchive] = useState(false);
  const [showSt, setShowSt] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showRR, setShowRR] = useState(false);
  const [busy, setBusy] = useState('');
  const [aId, setAId] = useState(t.assignee_id ?? '');
  const [rvId, setRvId] = useState('');
  const [previewItem, setPreviewItem] = useState<AttachmentPreviewItem | null>(null);

  const assignee = t.assignee_id ? umap.get(t.assignee_id) : null;
  const cm = CM[t.status];
  const SI = cm.icon;
  const users = Array.from(umap.values());
  const uOpts: DDOpt[] = users.map((u) => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email }));

  const isStaff = user?.roles?.some((r) => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;

  const statusAsString = String(t.status);
  const canReview = (statusAsString === 'to_review' || statusAsString === 'review') && isStaff;
  const canRR = t.status === 'in_progress';
  const canAssign = ASSIGN_OK.has(t.status) && users.length > 0;
  const canEdit = EDIT_OK.has(t.status);
  const allowed = TRANSITIONS[t.status];
  const ticketPath = getTaskTicketPath(t);
  const ticketNo = getTaskTicketNumber(t);
  const tags = getTaskTags(t);
  const attachments = Array.isArray(t.attachments) ? t.attachments : [];

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);

  const act = async (lbl: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(lbl);
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

  const chSt = async (s: TaskStatus) => {
    if (s === 'todo' && t.status === 'backlog' && !t.assignee_id) {
      setShowSt(false);
      onNeedAssign(t, 'todo');
      return;
    }
    if (s === 'in_progress' && !t.assignee_id) {
      setShowSt(false);
      onNeedAssign(t, 'in_progress');
      return;
    }
    if (s === 'done') {
      setShowSt(false);
      onNeedComplete(t, 'status_done');
      return;
    }
    setShowSt(false);
    setBusy('st');
    try {
      await tasksApi.changeStatus(t.id, s);
      toast({ title: `Статус изменён: ${ST_LABEL[s]}` });
      await onRefresh();
      onClose();
    } catch (e: any) {
      const m = statusErr(e, t, s);
      toast({ title: m.title, description: m.description, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-xs text-[var(--text-primary)]/60 bg-[var(--hover-2)] border border-[var(--border-color)] px-1.5 py-0.5 rounded-md">{t.number}</span>
              <PriBadge p={t.priority} />
              {t.story_points != null && <ComplexityBadge v={t.story_points} />}
              {t.estimated_hours != null && <HoursBadge label="Трудозатраты" value={t.estimated_hours} title="Плановые трудозатраты" />}
              {t.actual_hours != null && <HoursBadge label="Факт" value={t.actual_hours} tone="accent" />}
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] leading-snug">{t.title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button onClick={() => onEdit(t)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/75 text-sm font-medium hover:bg-[var(--hover-3)]">
                <Pencil className="w-4 h-4" />Редактировать
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {t.status === 'in_progress' && !t.assignee_id && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 font-medium">
              ⚠ У задачи нет исполнителя, но она находится в статусе «В работе».
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--hover-1)] border-b border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)]">Описание</div>
            <div className="px-4 py-4">
              {t.description ? (
                <div className="text-sm text-[var(--text-primary)]/80 whitespace-pre-wrap leading-6">{t.description}</div>
              ) : (
                <div className="text-sm text-[var(--text-primary)]/35">Описание не заполнено</div>
              )}
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-4 py-3 bg-[var(--hover-1)] border-b border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)]">Вложения</div>
              <div className="px-4 py-4 grid sm:grid-cols-2 gap-3">
                {attachments.map((att, i) => (
                  <TaskAttachmentItem key={att.id ?? `${getAttachmentName(att)}-${i}`} attachment={att} onPreview={setPreviewItem} />
                ))}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-4 py-3 bg-[var(--hover-1)] border-b border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)]">Теги</div>
              <div className="px-4 py-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={`${tag.name}-${tag.color ?? 'x'}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border"
                    style={{ borderColor: tag.color ?? 'var(--border-color)', color: tag.color ?? 'var(--text-primary)', background: `${tag.color ?? '#888'}14` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: tag.color ?? '#888' }} />
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Статус</p>
              <div className="relative">
                <button onClick={() => allowed.length > 0 && setShowSt((v) => !v)} disabled={busy !== '' || !allowed.length}
                  className={`flex items-center gap-1.5 text-sm font-semibold ${cm.tc} disabled:opacity-40`}>
                  {busy === 'st' ? <Loader2 className="w-4 h-4 animate-spin" /> : <SI className="w-4 h-4" />}
                  {ST_LABEL[t.status]}
                  {allowed.length > 0 && <ChevronDown className="w-4 h-4 opacity-50" />}
                </button>
                {showSt && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSt(false)} />
                    <div className="absolute left-0 top-full mt-2 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
                      <div className="p-1.5">
                        {allowed.map((s) => {
                          const sm = CM[s];
                          const SII = sm.icon;
                          return (
                            <button key={s} onClick={() => chSt(s)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] font-medium">
                              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                              <SII className={`w-4 h-4 ${sm.tc}`} />
                              <span className="flex-1 text-left">{ST_LABEL[s]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Исполнитель</p>
              <div className="h-[24px] flex items-center">
                {assignee ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Ava name={assignee.full_name || assignee.username} url={assignee.avatar_url} sz="xs" />
                    <span className="text-sm text-[var(--text-primary)]/70 font-medium truncate">{assignee.full_name || assignee.username}</span>
                  </div>
                ) : <span className="text-sm text-[var(--text-primary)]/30">Не назначен</span>}
              </div>
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Срок</p>
              <div className="h-[24px] flex items-center">
                {t.due_date ? (
                  <span className={`flex items-center gap-1.5 text-sm font-medium ${overdue(t) ? 'text-red-400' : 'text-[var(--text-primary)]/70'}`}>
                    <Calendar className="w-4 h-4" />{fmtDue(t.due_date)}
                  </span>
                ) : <span className="text-sm text-[var(--text-primary)]/30">Не задан</span>}
              </div>
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]" title="Плановые трудозатраты">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Трудозатраты (ч)</p>
              <span className="text-sm text-[var(--text-primary)]/70 font-medium h-[24px] flex items-center">{fmtHours(t.estimated_hours)}</span>
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Факт (ч)</p>
              <span className="text-sm text-[var(--text-primary)]/70 font-medium h-[24px] flex items-center">{fmtHours(t.actual_hours)}</span>
            </div>

            <div className="bg-[var(--hover-1)] rounded-xl p-3 border border-[var(--border-color)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 font-medium">Создана</p>
              <span className="text-sm text-[var(--text-primary)]/70 font-medium h-[24px] flex items-center">
                {new Date(t.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {canAssign && (
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
              <button onClick={() => setShowAssign((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] font-medium transition-colors">
                <span className="flex items-center gap-2"><UserCheck className="w-4 h-4" />{t.assignee_id ? 'Сменить исполнителя' : 'Назначить исполнителя'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAssign ? 'rotate-180' : ''}`} />
              </button>
              {showAssign && (
                <div className="px-4 py-3 border-t border-[var(--border-color)] space-y-2.5 bg-[var(--bg-card)]">
                  <SelectDD value={aId} onChange={setAId} options={uOpts} placeholder="Выберите исполнителя" icon={UserCheck} searchable />
                  <button onClick={() => act('assign', () => tasksApi.assign(t.id, { assignee_id: aId }), 'Исполнитель назначен')}
                    disabled={!aId || busy === 'assign'} className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40">
                    {busy === 'assign' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Сохранить исполнителя'}
                  </button>
                </div>
              )}
            </div>
          )}

          {canRR && users.length > 0 && (
            <div className="rounded-xl border border-violet-500/30 overflow-hidden">
              <button onClick={() => setShowRR((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-violet-500/10 text-sm text-violet-400 font-medium hover:bg-violet-500/15 transition-colors">
                <span className="flex items-center gap-2"><GitPullRequest className="w-4 h-4" />Отправить на ревью</span>
                <ChevronDown className={`w-4 h-4 opacity-70 transition-transform ${showRR ? 'rotate-180' : ''}`} />
              </button>
              {showRR && (
                <div className="px-4 py-3 border-t border-violet-500/30 space-y-2.5 bg-violet-500/5">
                  <SelectDD value={rvId} onChange={setRvId} options={uOpts} placeholder="Выберите ревьюера" searchable />
                  <button onClick={() => act('rr', () => tasksApi.requestReview(t.id, { reviewer_id: rvId }), 'Задача отправлена на ревью')}
                    disabled={!rvId || busy === 'rr'} className="w-full py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-400 text-sm font-medium disabled:opacity-40">
                    Отправить
                  </button>
                </div>
              )}
            </div>
          )}

          {canReview && (
            <div className="flex gap-3">
              <button onClick={() => onNeedComplete(t, 'review_done')} disabled={busy === 'rv'}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50 hover:bg-emerald-500/20 transition-colors">
                <ThumbsUp className="w-4 h-4 inline mr-1.5" />Принять
              </button>
              <button onClick={() => act('rv', () => tasksApi.review(t.id, { decision: 'to_fix' }), 'Задача возвращена на доработку')}
                disabled={busy === 'rv'} className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium disabled:opacity-50 hover:bg-red-500/20 transition-colors">
                <ThumbsDown className="w-4 h-4 inline mr-1.5" />Вернуть
              </button>
            </div>
          )}

          {ticketPath && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
              <Ticket className="w-4 h-4 text-[var(--text-primary)]/30" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)]/45">Заявка</div>
                <div className="text-sm text-[var(--text-primary)]/80 font-medium truncate">{ticketNo ?? 'Открыть заявку'}</div>
              </div>
              <Link to={ticketPath} onClick={onClose} className="text-sm text-[var(--accent)] flex items-center gap-1 font-medium hover:underline">
                Открыть<ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {t.project_id && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
              <FolderOpen className="w-4 h-4 text-[var(--text-primary)]/30" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)]/45">Проект</div>
                <div className="text-sm text-[var(--text-primary)]/80 font-medium truncate">{t.project_name || 'Открыть проект'}</div>
              </div>
              <Link to={`/projects/${t.project_id}`} onClick={onClose} className="text-sm text-[var(--accent)] flex items-center gap-1 font-medium hover:underline">
                Открыть<ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <button onClick={() => setShowArchive(true)} disabled={busy === 'arch'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[var(--text-primary)]/40 hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <Archive className="w-4 h-4" />В архив
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium hover:bg-[var(--hover-3)]">Закрыть</button>
        </div>
      </div>

      {showArchive && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowArchive(false)} />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <Archive className="w-10 h-10 text-[var(--text-primary)]/20 mx-auto mb-3" />
              <p className="text-base font-bold text-[var(--text-primary)]">Архивировать задачу?</p>
              <p className="text-sm text-[var(--text-primary)]/50 mt-1">«{t.title}»</p>
            </div>
            <div className="flex border-t border-[var(--border-color)]">
              <button onClick={() => setShowArchive(false)} className="flex-1 py-3 text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)] font-medium">Отмена</button>
              <button onClick={() => { setShowArchive(false); act('arch', () => tasksApi.archive(t.id), 'Задача архивирована'); }}
                className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 border-l border-[var(--border-color)]">Да</button>
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}

/* ───────────────── main page ───────────────── */

export default function TasksPage() {
  const [sp] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const up = sp.get('project_id');
  const ua = sp.get('assignee_id');
  const ut = sp.get('ticket_id');
  const shouldCreate = sp.get('create') === '1';

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const bottomBoardScrollRef = useRef<HTMLDivElement>(null);
  const boardScrollSyncRef = useRef(false);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const [boardViewportWidth, setBoardViewportWidth] = useState(0);

  const staff = (user?.roles ?? []).some((r) => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r));

  const [mode, setMode] = useState<CtxMode>(() => {
    if (up) return 'project';
    if (ua) return 'assignee';
    if (ut) return 'ticket';
    return staff ? 'internal' : 'my';
  });

  const [selP, setSelP] = useState(up ?? '');
  const [selA, setSelA] = useState(ua ?? '');
  const [selT, setSelT] = useState(ut ?? '');
  const [selTLabel, setSelTLabel] = useState('');
  const ticketLabelsRef = useRef<Record<string, string>>({});

  const [umap, setUmap] = useState<Map<string, SimpleUser | CounterpartyCustomer>>(new Map());
  const [cols, setCols] = useState<TaskViewColumn[]>([]);
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

  const [view, setView] = useState<TaskViewItem | null>(null);
  const [editTask, setEditTask] = useState<TaskViewItem | null>(null);
  const [create, setCreate] = useState<TaskStatus | null>(null);

  const [assignIntent, setAssignIntent] = useState<AssignIntent | null>(null);
  const [assignLd, setAssignLd] = useState(false);

  const [completeIntent, setCompleteIntent] = useState<CompleteIntent | null>(null);
  const [completeLd, setCompleteLd] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const fpR = useRef(fp);
  const foR = useRef(fo);
  fpR.current = fp;
  foR.current = fo;

  useEffect(() => {
    if (shouldCreate && ut) setCreate('backlog');
  }, [shouldCreate, ut]);

  useEffect(() => {
    if (up) setMode('project');
    else if (ua) setMode('assignee');
    else if (ut) setMode('ticket');
  }, [up, ua, ut]);

  const ctx = useCallback((): TaskKanbanContext => {
    if (mode === 'project' && selP) return { type: 'project', project_id: selP };
    if (mode === 'ticket' && selT) return { type: 'ticket', ticket_id: selT };
    if (mode === 'assignee' && selA) return { type: 'assignee', assignee_id: selA };
    if (mode === 'internal') return { type: 'internal' };
    return { type: 'my' };
  }, [mode, selP, selA, selT]);

  const syncBoardScrollbarMetrics = useCallback(() => {
    const board = boardScrollRef.current;
    const inner = boardInnerRef.current;
    if (!board || !inner) return;
    setBoardScrollWidth(Math.max(board.scrollWidth, inner.scrollWidth));
    setBoardViewportWidth(board.clientWidth);
    if (bottomBoardScrollRef.current) {
      bottomBoardScrollRef.current.scrollLeft = board.scrollLeft;
    }
  }, []);

  const handleBoardScroll = useCallback(() => {
    if (boardScrollSyncRef.current) return;
    boardScrollSyncRef.current = true;
    if (bottomBoardScrollRef.current && boardScrollRef.current) {
      bottomBoardScrollRef.current.scrollLeft = boardScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => boardScrollSyncRef.current = false);
  }, []);

  const handleBottomBoardScroll = useCallback(() => {
    if (boardScrollSyncRef.current) return;
    boardScrollSyncRef.current = true;
    if (boardScrollRef.current && bottomBoardScrollRef.current) {
      boardScrollRef.current.scrollLeft = bottomBoardScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => boardScrollSyncRef.current = false);
  }, []);

  useEffect(() => {
    if (viewMode !== 'kanban') return;
    syncBoardScrollbarMetrics();
    const board = boardScrollRef.current;
    const inner = boardInnerRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && board && inner) {
      ro = new ResizeObserver(() => syncBoardScrollbarMetrics());
      ro.observe(board);
      ro.observe(inner);
    }
    window.addEventListener('resize', syncBoardScrollbarMetrics);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncBoardScrollbarMetrics);
    };
  }, [viewMode, cols, syncBoardScrollbarMetrics]);

  const loadUsersMap = useCallback(async () => {
    const m = new Map<string, SimpleUser | CounterpartyCustomer>();
    try {
      (await usersApi.getAllUsers(1, 100)).items.forEach((u) => m.set(u.id, u));
    } catch { /* ignore */ }
    setUmap(m);
  }, []);

  const fetchBoard = useCallback(async (silent = false) => {
    if ((mode === 'project' && !selP) || (mode === 'ticket' && !selT) || (mode === 'assignee' && !selA)) {
      setCols([]);
      setTotal(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const d: any = await tasksApi.getKanban(ctx(), {
        size: 20,
        priorities: fpR.current.length ? fpR.current : undefined,
        overdue_only: foR.current || undefined,
      });
      const mapped: TaskViewColumn[] = COL_ORDER.map((s) => d.columns.find((c: TaskViewColumn) => c.status === s)).filter((c): c is TaskViewColumn => !!c);
      setCols(mapped);
      setTotal(d.total_tasks ?? 0);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ctx, toast, mode, selP, selT, selA]);

  useEffect(() => { loadUsersMap(); }, [loadUsersMap]);
  useEffect(() => { fetchBoard(); }, [fetchBoard]);
  useEffect(() => { fetchBoard(true); }, [fp, fo, fetchBoard]);

  const more = useCallback(async (st: TaskStatus) => {
    const c = cols.find((x) => x.status === st);
    if (!c?.tasks.has_next) return;
    setMoreCol(st);
    try {
      const d: any = await tasksApi.getKanban(ctx(), {
        page: c.tasks.page + 1,
        size: c.tasks.size,
        priorities: fpR.current.length ? fpR.current : undefined,
        overdue_only: foR.current || undefined,
      });
      const nc = d.columns.find((x: TaskViewColumn) => x.status === st);
      if (nc) {
        setCols((prev) => prev.map((x) => x.status === st ? { ...x, tasks: { ...nc.tasks, items: [...x.tasks.items, ...nc.tasks.items] } } : x));
      }
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setMoreCol(null);
    }
  }, [cols, ctx, toast]);

  const moveTo = useCallback(async (id: string, from: TaskStatus, to: TaskStatus) => {
    const src = cols.find((c) => c.status === from);
    const task = src?.tasks.items.find((x) => x.id === id);
    if (!task) return;

    if (to === 'todo' && from === 'backlog' && !task.assignee_id) {
      setAssignIntent({ task, targetStatus: 'todo' });
      return;
    }
    if (to === 'in_progress' && !task.assignee_id) {
      setAssignIntent({ task, targetStatus: 'in_progress' });
      return;
    }
    if (to === 'done') {
      setCompleteIntent({ task, mode: 'status_done' });
      return;
    }

    const snap = snapCols(cols);
    let moved: TaskViewItem | undefined;

    setCols((prev) => {
      const n = prev.map((c) => {
        if (c.status === from) {
          const items = c.tasks.items.filter((x) => {
            if (x.id === id) { moved = x; return false; }
            return true;
          });
          return { ...c, tasks: { ...c.tasks, items, total_items: c.tasks.total_items - 1 } };
        }
        return c;
      });
      if (!moved) return prev;
      const updated = { ...moved, status: to };
      return n.map((c) => c.status === to ? { ...c, tasks: { ...c.tasks, items: [updated, ...c.tasks.items], total_items: c.tasks.total_items + 1 } } : c);
    });

    try {
      await tasksApi.changeStatus(id, to);
      toast({ title: `Статус: ${ST_LABEL[to]}` });
    } catch (e: any) {
      setCols(snap);
      const m = statusErr(e, task, to);
      toast({ title: m.title, description: m.description, variant: 'destructive' });
    }
  }, [cols, toast]);

  const handleAssignAndMove = useCallback(async (aid: string) => {
    if (!assignIntent) return;
    setAssignLd(true);
    try {
      await tasksApi.assign(assignIntent.task.id, { assignee_id: aid });
      await tasksApi.changeStatus(assignIntent.task.id, assignIntent.targetStatus);
      toast({ title: `Задача переведена в «${ST_LABEL[assignIntent.targetStatus]}»` });
      setAssignIntent(null);
      await fetchBoard(true);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setAssignLd(false);
    }
  }, [assignIntent, fetchBoard, toast]);

  const handleComplete = useCallback(async (actualHours: number) => {
    if (!completeIntent) return;
    setCompleteLd(true);
    try {
      await tasksApi.update(completeIntent.task.id, { actual_hours: actualHours } as any);
      if (completeIntent.mode === 'review_done') {
        await tasksApi.review(completeIntent.task.id, { decision: 'done' });
        toast({ title: 'Задача принята' });
      } else {
        await tasksApi.changeStatus(completeIntent.task.id, 'done');
        toast({ title: 'Задача выполнена' });
      }
      setCompleteIntent(null);
      await fetchBoard(true);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setCompleteLd(false);
    }
  }, [completeIntent, fetchBoard, toast]);

  const onDS = useCallback((id: string, from: TaskStatus) => setDrag({ id, from }), []);
  const onDE = useCallback(() => { setDrag(null); setDragO(null); }, []);
  const onDO = useCallback((e: React.DragEvent, st: TaskStatus) => {
    e.preventDefault();
    if (drag && !TRANSITIONS[drag.from].includes(st)) return;
    e.dataTransfer.dropEffect = 'move';
    setDragO(st);
  }, [drag]);
  const onDL = useCallback(() => setDragO(null), []);
  const onDrop = useCallback(async (e: React.DragEvent, to: TaskStatus) => {
    e.preventDefault();
    setDragO(null);
    if (!drag || drag.from === to) { setDrag(null); return; }
    if (!TRANSITIONS[drag.from].includes(to)) {
      toast({ title: 'Переход недоступен', variant: 'destructive' });
      setDrag(null);
      return;
    }
    const { id, from } = drag;
    setDrag(null);
    await moveTo(id, from, to);
  }, [drag, moveTo, toast]);

  const ql = q.trim().toLowerCase();
  const disp = cols.map((c) => !ql ? c : {
    ...c,
    tasks: {
      ...c.tasks,
      items: c.tasks.items.filter((t) => {
        const ticketNo = getTaskTicketNumber(t) ?? '';
        return t.title.toLowerCase().includes(ql) || t.number.toLowerCase().includes(ql) ||
          String(t.description ?? '').toLowerCase().includes(ql) || ticketNo.toLowerCase().includes(ql);
      }),
    },
  });

  const hf = fp.length > 0 || fo;
  const done = cols.find((c) => c.status === 'done')?.tasks.total_items ?? 0;

  const ctxTabs = [
    { id: 'my' as CtxMode, label: 'Мои', icon: User },
    ...(staff ? [{ id: 'internal' as CtxMode, label: 'Все', icon: Layers }] : []),
    { id: 'project' as CtxMode, label: 'Проект', icon: FolderOpen },
    ...(staff ? [{ id: 'assignee' as CtxMode, label: 'Исполнитель', icon: UserCheck }] : []),
    ...(staff ? [{ id: 'ticket' as CtxMode, label: 'Заявка', icon: Ticket }] : []),
  ];

  const ldTicketsAsync = useCallback(async (search: string, p: number) => {
    const r = await ticketsApi.getAll(p, 20, { project_ids: selP ? [selP] : undefined, query: search || undefined });
    const items = r.items.map((t: any) => {
      const label = `${t.number} — ${t.title}`;
      ticketLabelsRef.current[t.id] = label;
      return { value: t.id, label };
    });
    return { items, hasNext: r.items.length === 20 };
  }, [selP]);

  const ldProjAsync = useCallback(async (search: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = search ? r.items.filter(x => x.name.toLowerCase().includes(search.toLowerCase()) || x.key.toLowerCase().includes(search.toLowerCase())) : r.items;
    return { items: f.map(x => ({ value: x.id, label: x.name, sublabel: x.key, icon: <FolderOpen className="w-4 h-4 text-amber-500" /> })), hasNext: r.items.length === 20 };
  }, []);

  const ldAssAsync = useCallback(async (search: string, p: number) => {
    let items = []; try { items = (await usersApi.getAllUsers(p, 20)).items; } catch { items = []; }
    const f = search ? items.filter(u => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) : items;
    return { items: f.map(u => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })), hasNext: items.length === 20 };
  }, []);

  const dragInfo = drag ? (() => {
    const t = cols.flatMap(c => c.tasks.items).find(x => x.id === drag.id);
    return t ? { id: drag.id, from: drag.from, title: t.title, number: t.number } : null;
  })() : null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500" onDragEnd={onDE}>
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Задачи</h1>
          {!loading && <span className="px-2 py-0.5 rounded bg-[var(--hover-2)] text-xs text-[var(--text-primary)]/50">{Math.max(total - done, 0)} активных · {done} завершено</span>}
          {refreshing && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..." className="w-72 pl-9 pr-8 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:border-[var(--accent)]/40 focus:ring-1 focus:ring-[var(--accent-ring)]" />
            {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]"><X className="w-3.5 h-3.5" /></button>}
          </div>

          <div className="relative">
            <button onClick={() => setSf((v) => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${hf ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-3)]'}`}><Filter className="w-4 h-4" />Фильтры{hf && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}</button>
            {sf && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSf(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl p-3 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-2 font-medium">Приоритет</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRI_LIST.map((p) => {
                        const m = PM[p.value];
                        return <button key={p.value} onClick={() => setFp((v) => v.includes(p.value) ? v.filter((x) => x !== p.value) : [...v, p.value])} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-all ${fp.includes(p.value) ? `${m.bg} ${m.c} ${m.brd}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}><span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{p.label}</button>;
                      })}
                    </div>
                  </div>
                  <div className="border-t border-[var(--border-color)] pt-2">
                    <button onClick={() => setFo((v) => !v)} className={`w-full flex items-center gap-2 py-1.5 px-2 rounded font-medium text-sm transition-colors ${fo ? 'text-[var(--accent)] bg-[var(--accent)]/5' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}><div className={`w-4 h-4 rounded border flex items-center justify-center ${fo ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'}`}>{fo && <Check className="w-3 h-3 text-white" />}</div>Просроченные</button>
                  </div>
                  {hf && <div className="border-t border-[var(--border-color)] pt-2"><button onClick={() => { setFp([]); setFo(false); }} className="w-full text-center text-sm font-medium text-[var(--accent)] hover:underline">Сбросить</button></div>}
                </div>
              </>
            )}
          </div>

          <button onClick={() => fetchBoard(true)} disabled={refreshing || loading} className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-40"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setCreate('backlog')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors shadow-sm"><Plus className="w-4 h-4" />Новая задача</button>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-lg border border-[var(--border-color)]">
            {ctxTabs.map((t) => {
              const I = t.icon;
              return <button key={t.id} onClick={() => setMode(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === t.id ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/80 hover:bg-[var(--hover-2)]'}`}><I className="w-3.5 h-3.5" />{t.label}</button>;
            })}
          </div>

          {mode === 'project' && <div className="w-72"><AsyncDD value={selP} onChange={setSelP} loadFn={ldProjAsync} placeholder="Выберите проект" icon={FolderOpen} /></div>}
          {mode === 'ticket' && <div className="w-80"><AsyncDD value={selT} onChange={(v) => { setSelT(v); setSelTLabel(v ? ticketLabelsRef.current[v] ?? '' : ''); }} loadFn={ldTicketsAsync} placeholder="Выберите заявку" icon={Ticket} wide /></div>}
          {mode === 'assignee' && <div className="w-72"><AsyncDD value={selA} onChange={setSelA} loadFn={ldAssAsync} placeholder="Выберите исполнителя" icon={UserCheck} /></div>}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-lg border border-[var(--border-color)]">
          <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'kanban' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}><LayoutGrid className="w-3.5 h-3.5" />Доска</button>
          <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}><List className="w-3.5 h-3.5" />Список</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" /></div>
        ) : viewMode === 'list' ? (
          <ListView tasks={disp.flatMap((c) => c.tasks.items)} umap={umap} onView={setView} />
        ) : !cols.length ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-primary)]/30"><FileText className="w-12 h-12 mb-3 opacity-50" /><p className="text-base font-medium">{mode === 'project' && !selP ? 'Выберите проект' : mode === 'assignee' && !selA ? 'Выберите исполнителя' : mode === 'ticket' && !selT ? 'Выберите заявку' : 'Нет задач'}</p></div>
        ) : (
                    <div className="flex-1 flex flex-col min-h-0">
            <div
              ref={boardScrollRef}
              onScroll={handleBoardScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent"
            >
              <div ref={boardInnerRef} className="flex gap-3 h-full w-max min-w-full">
                {disp.map((c) => (
                  <KCol key={c.status} col={c} umap={umap} isDO={dragO === c.status} dragId={drag?.id ?? null} ldMore={moreCol === c.status} onDS={onDS} onDE={onDE} onDO={onDO} onDL={onDL} onDrop={onDrop} onAdd={setCreate} onView={setView} onMore={more} />
                ))}
              </div>
            </div>

            <div className="h-4 mt-2 shrink-0 bg-[var(--hover-1)] rounded-full border border-[var(--border-color)] relative overflow-hidden">
              <div
                ref={bottomBoardScrollRef}
                onScroll={handleBottomBoardScroll}
                className="absolute inset-0 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-[var(--accent)]/50 scrollbar-track-transparent"
              >
                <div style={{ width: boardScrollWidth || '100%', height: '1px' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>{dragInfo && <DragPanel task={dragInfo} onDrop={onDrop} />}</AnimatePresence>

      {view && (
        <DetailModal
          task={view}
          umap={umap}
          onClose={() => setView(null)}
          onRefresh={() => fetchBoard(true)}
          onNeedAssign={(t, targetStatus) => { setView(null); setAssignIntent({ task: t, targetStatus }); }}
          onEdit={(t) => { setView(null); setEditTask(t); }}
          onNeedComplete={(t, mode) => { setView(null); setCompleteIntent({ task: t, mode }); }}
        />
      )}

      {create != null && (
        <TaskEditorModal
          mode="create"
          initSt={create}
          context={ctx()}
          ticketLabel={mode === 'ticket' && selT ? selTLabel : undefined}
          onClose={() => setCreate(null)}
          onSaved={async () => { setCreate(null); await fetchBoard(true); }}
        />
      )}

      {editTask && (
        <TaskEditorModal
          mode="edit"
          task={editTask}
          context={ctx()}
          onClose={() => setEditTask(null)}
          onSaved={async () => { setEditTask(null); await fetchBoard(true); }}
        />
      )}

      {assignIntent && (
        <AssignModal
          task={assignIntent.task}
          targetStatus={assignIntent.targetStatus}
          umap={umap}
          loading={assignLd}
          onClose={() => { if (!assignLd) setAssignIntent(null); }}
          onOk={handleAssignAndMove}
        />
      )}

      {completeIntent && (
        <CompleteModal
          task={completeIntent.task}
          loading={completeLd}
          onClose={() => { if (!completeLd) setCompleteIntent(null); }}
          onOk={handleComplete}
        />
      )}
    </div>
  );
}