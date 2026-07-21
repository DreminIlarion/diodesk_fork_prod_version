// HistoryEntry.tsx
import type { ReactNode } from 'react';
import {
  Clock, Image as ImageIcon, FileText, Plus, Minus,
  RefreshCw, UserPlus, UserMinus, Tag, Archive,
  MessageSquare, Edit, Trash2, UserCheck,
  Building2, FolderOpen, CheckCircle, X
} from 'lucide-react';

interface HistoryEntryProps {
  entry: {
    action: string;
    actor_id: string;
    occurred_on: string;
    changes: Record<string, any>;
    meta?: Record<string, any>;
    event_id?: string;
  };
  formatDate: (date: string) => string;
  actorNames: Map<string, string>;
}

// ─── Русификация статусов ──────
const STATUS_LABELS: Record<string, string> = {
  'new': 'Новый',
  'pending_approval': 'На согласовании',
  'open': 'Открыт',
  'in_progress': 'В работе',
  'waiting': 'Ожидает ответа',
  'resolved': 'Решён',
  'closed': 'Закрыт',
  'reopened': 'Переоткрыт',
  'rejected': 'Отклонён',
  'cancelled': 'Отменён',
};

// Маппинг старых названий в новые
const ACTION_MAP: Record<string, string> = {
  'ticket.created': 'ticket_created',
  'ticket.status_changed': 'status_changed',
  'ticket.priority_changed': 'priority_changed',
  'ticket.assigned': 'assigned_to_updated',
  'ticket.edited': 'description_edited',
  'ticket.closed': 'closed',
  'ticket.reopened': 'reopened',
  'ticket.resolved': 'resolved',
  'ticket.archived': 'archived',
  'ticket.approved': 'approved',
  'ticket.approval_submitted': 'approval_submitted',
  'ticket.paused': 'paused',
  'ticket.canceled': 'canceled',
};

// ─── Хелперы ──────
const MD_MEDIA_RE = /!\[[^\]]*\]\(media:\/\/[^)]+\)/g;
const MD_ATTACHMENT_RE = /!\[[^\]]*\]\(attachment:[^)]+\)/g;
const MD_LOCAL_RE = /!\[[^\]]*\]\(local:[^)]+\)/g;
const LEGACY_IMAGE_RE = /\[\[image:[^\]]+\]\]/g;
const LEGACY_LOCAL_IMAGE_RE = /\[\[local-image:[^\]]+\]\]/g;

function countMatches(value = '', re: RegExp): number {
  return (value.match(re) || []).length;
}

function stripMedia(value = ''): string {
  return value
    .replace(MD_MEDIA_RE, '').replace(MD_ATTACHMENT_RE, '')
    .replace(MD_LOCAL_RE, '').replace(LEGACY_IMAGE_RE, '')
    .replace(LEGACY_LOCAL_IMAGE_RE, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function countAllImages(value = ''): number {
  return countMatches(value, MD_MEDIA_RE) + countMatches(value, MD_ATTACHMENT_RE) +
    countMatches(value, MD_LOCAL_RE) + countMatches(value, LEGACY_IMAGE_RE) +
    countMatches(value, LEGACY_LOCAL_IMAGE_RE);
}

function countLocalImages(value = ''): number {
  return countMatches(value, MD_LOCAL_RE) + countMatches(value, LEGACY_LOCAL_IMAGE_RE);
}

function shorten(value: string, max = 160): string {
  return value.length <= max ? value : value.slice(0, max) + '…';
}

function getDisplayName(id: string | null | undefined, actorNames: Map<string, string>): string {
  if (!id) return '';
  return actorNames.get(id) || id.slice(0, 8);
}

// ─── Анализ изменений описания ──────
interface EntryAnalysis {
  hidden: boolean;
  textChanged: boolean;
  oldText: string;
  newText: string;
  imagesAdded: number;
  imagesRemoved: number;
  technicalMediaOnly: boolean;
}

function analyzeEntry(changes: Record<string, any> | undefined): EntryAnalysis | null {
  if (!changes) return null;
  
  const oldVal = changes.description?.[0] || '';
  const newVal = changes.description?.[1] || '';
  
  if (!oldVal && !newVal) return null;

  const oldText = stripMedia(oldVal);
  const newText = stripMedia(newVal);
  const textChanged = oldText !== newText;

  const oldTotal = countAllImages(oldVal);
  const newTotal = countAllImages(newVal);
  const oldLocal = countLocalImages(oldVal);
  const newLocal = countLocalImages(newVal);

  const imagesAdded = Math.max(0, newTotal - oldTotal);
  const imagesRemoved = Math.max(0, oldTotal - newTotal);

  const technicalMediaOnly = !textChanged && oldTotal === newTotal && oldLocal !== newLocal;
  const onlyLocalOld = oldTotal > 0 && oldLocal === oldTotal;
  const onlyLocalNew = newTotal > 0 && newLocal === newTotal;
  const hidden = technicalMediaOnly || (!textChanged && onlyLocalOld && onlyLocalNew);

  return { hidden, textChanged, oldText, newText, imagesAdded, imagesRemoved, technicalMediaOnly };
}

// ─── Мета-данные действий ──────
const ACTION_CONFIG: Record<string, {
  label: string;
  icon: ReactNode;
  color: string;
  getChangesText?: (changes: Record<string, any>, actorNames: Map<string, string>) => string | null;
}> = {
  ticket_created: {
    label: 'Создал заявку',
    icon: <Plus className="w-4.5 h-4.5" />,
    color: 'bg-green-500/15 text-green-400',
  },
  status_changed: {
    label: 'Изменил статус',
    icon: <RefreshCw className="w-4.5 h-4.5" />,
    color: 'bg-yellow-500/15 text-yellow-400',
    getChangesText: (changes) => {
      const old = STATUS_LABELS[changes.old_status] || changes.old_status || 'Неизвестно';
      const newS = STATUS_LABELS[changes.new_status] || changes.new_status || 'Неизвестно';
      if (old && newS) return `${old} → ${newS}`;
      return null;
    },
  },
  priority_changed: {
    label: 'Изменил приоритет',
    icon: <RefreshCw className="w-4.5 h-4.5" />,
    color: 'bg-orange-500/15 text-orange-400',
    getChangesText: (changes) => {
      if (changes.old_priority && changes.new_priority) {
        return `${changes.old_priority} → ${changes.new_priority}`;
      }
      return null;
    },
  },
  assigned_to_updated: {
    label: 'Изменил исполнителя',
    icon: <UserCheck className="w-4.5 h-4.5" />,
    color: 'bg-cyan-500/15 text-cyan-400',
    getChangesText: (changes, actorNames) => {
      const old = changes.old_assignee;
      const newA = changes.new_assignee;
      if (old && newA) return `${getDisplayName(old, actorNames)} → ${getDisplayName(newA, actorNames)}`;
      if (newA) return `→ ${getDisplayName(newA, actorNames)}`;
      if (old) return `${getDisplayName(old, actorNames)} → Не назначен`;
      return null;
    },
  },
  description_edited: {
    label: 'Изменил описание',
    icon: <FileText className="w-4.5 h-4.5" />,
    color: 'bg-blue-500/15 text-blue-400',
  },
  title_edited: {
    label: 'Изменил тему',
    icon: <FileText className="w-4.5 h-4.5" />,
    color: 'bg-blue-500/15 text-blue-400',
  },
  tags_updated: {
    label: 'Обновил теги',
    icon: <Tag className="w-4.5 h-4.5" />,
    color: 'bg-purple-500/15 text-purple-400',
  },
  archived: {
    label: 'Архивировал заявку',
    icon: <Archive className="w-4.5 h-4.5" />,
    color: 'bg-amber-500/15 text-amber-400',
  },
  closed: {
    label: 'Закрыл заявку',
    icon: <CheckCircle className="w-4.5 h-4.5" />,
    color: 'bg-green-500/15 text-green-400',
  },
  reopened: {
    label: 'Переоткрыл заявку',
    icon: <RefreshCw className="w-4.5 h-4.5" />,
    color: 'bg-orange-500/15 text-orange-400',
  },
  resolved: {
    label: 'Решил заявку',
    icon: <CheckCircle className="w-4.5 h-4.5" />,
    color: 'bg-green-500/15 text-green-400',
  },
  approved: {
    label: 'Согласовал заявку',
    icon: <CheckCircle className="w-4.5 h-4.5" />,
    color: 'bg-green-500/15 text-green-400',
  },
  approval_submitted: {
    label: 'Отправил на согласование',
    icon: <FileText className="w-4.5 h-4.5" />,
    color: 'bg-blue-500/15 text-blue-400',
  },
  paused: {
    label: 'Приостановил заявку',
    icon: <Clock className="w-4.5 h-4.5" />,
    color: 'bg-amber-500/15 text-amber-400',
  },
  canceled: {
    label: 'Отменил заявку',
    icon: <X className="w-4.5 h-4.5" />,
    color: 'bg-red-500/15 text-red-400',
  },
};

const DEFAULT_ACTION_CONFIG = {
  label: 'Изменение',
  icon: <Clock className="w-4.5 h-4.5" />,
  color: 'bg-[var(--hover-1)] text-[var(--text-primary)]/50',
};

// ─── Компонент ────
export const HistoryEntry = ({ entry, formatDate, actorNames }: HistoryEntryProps) => {
  const mappedAction = ACTION_MAP[entry.action] || entry.action;
  const isDescEdit = mappedAction === 'description_edited';
  
  const changes = entry.changes || {};
  const analysis = isDescEdit ? analyzeEntry(changes) : null;

  if (analysis?.hidden) return null;

  const actorName = entry.actor_id
    ? actorNames.get(entry.actor_id) || 'Поддержка'
    : 'Система';

  const config = ACTION_CONFIG[mappedAction] || DEFAULT_ACTION_CONFIG;

  let actionLabel = config.label;
  if (isDescEdit && analysis && !analysis.textChanged && (analysis.imagesAdded > 0 || analysis.imagesRemoved > 0)) {
    actionLabel = 'Изменил вложения';
  }

  const hasMediaChanges = !!analysis && (analysis.imagesAdded > 0 || analysis.imagesRemoved > 0);
  const changesText = config.getChangesText?.(changes, actorNames);

  return (
    <div className="flex gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        isDescEdit && hasMediaChanges ? 'bg-violet-500/15 text-violet-400' : config.color
      }`}>
        {isDescEdit && hasMediaChanges ? <ImageIcon className="w-4.5 h-4.5" /> : config.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-primary)] text-base font-medium">
          {actorName}{' '}
          <span className="text-[var(--text-primary)]/40 font-normal">• {actionLabel}</span>
        </p>
        <p className="text-[var(--text-primary)]/35 text-sm mt-0.5">
          {formatDate(entry.occurred_on)}
        </p>

        {changesText && (
          <div className="mt-2 text-sm">
            <span className="text-[var(--text-primary)]/60">{changesText}</span>
          </div>
        )}

        {isDescEdit && hasMediaChanges && (
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis!.imagesAdded > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-green-500/10 border border-green-500/20 text-green-400">
                <Plus className="w-3.5 h-3.5" />
                {analysis!.imagesAdded === 1 ? 'Добавлено изображение' : `Добавлено: ${analysis!.imagesAdded}`}
              </span>
            )}
            {analysis!.imagesRemoved > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
                <Minus className="w-3.5 h-3.5" />
                {analysis!.imagesRemoved === 1 ? 'Удалено изображение' : `Удалено: ${analysis!.imagesRemoved}`}
              </span>
            )}
          </div>
        )}

        {isDescEdit && analysis?.textChanged && (
          <div className="mt-2 space-y-1.5 text-sm">
            {analysis.oldText && (
              <div className="px-3 py-2 rounded-lg bg-red-500/[0.06] border border-red-500/[0.12]">
                <span className="text-red-400/70 line-through break-words">{shorten(analysis.oldText)}</span>
              </div>
            )}
            {analysis.newText && (
              <div className="px-3 py-2 rounded-lg bg-green-500/[0.06] border border-green-500/[0.12]">
                <span className="text-green-400/70 break-words">→ {shorten(analysis.newText)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};