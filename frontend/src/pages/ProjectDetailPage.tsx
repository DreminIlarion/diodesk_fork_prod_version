import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';

import {
  ArrowLeft,
  FolderOpen,
  Building2,
  Users,
  Calendar,
  User,
  Mail,
  Phone,
  Loader2,
  Archive,
  Plus,
  Ticket,
  Crown,
  Hash,
  UserPlus,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Check,
  Milestone,
  Pencil,
  Layers,
  FileText,
} from 'lucide-react';

import {
  projectsApi,
  ticketsApi,
  counterpartiesApi,
  usersApi,
} from '../api/client';

import { ContractsTab } from '../components/contracts/ContractsTab';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';

import type {
  Project,
  ProjectStageResponse,
  Counterparty,
  TicketListItem,
  SimpleUser,
  CounterpartyCustomer,
} from '../types';

/* ────────────────────────────────────────────────────────────────
   TYPES
──────────────────────────────────────────────────────────────── */

type TabType = 'info' | 'members' | 'tickets' | 'contracts';
type UserOption = CounterpartyCustomer | SimpleUser;

type ProjectMember = {
  user_id: string;
  project_role: string;
  user: UserOption | null;
};

type UserDisplay = {
  name: string;
  email?: string;
  isMe: boolean;
};

/* ────────────────────────────────────────────────────────────────
   PROJECT ROLES
──────────────────────────────────────────────────────────────── */

const PROJECT_ROLES = [
  {
    value: 'owner',
    label: 'Владелец',
    color: 'text-[var(--accent)]',
    bg: 'bg-[var(--accent-soft)]',
    border: 'border-[var(--accent)]/20',
  },
  {
    value: 'manager',
    label: 'Менеджер',
    color: 'text-[var(--info)]',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    value: 'contributor',
    label: 'Участник',
    color: 'text-[var(--success)]',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    value: 'viewer',
    label: 'Наблюдатель',
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--hover-2)]',
    border: 'border-[var(--border-color)]',
  },
  {
    value: 'customer',
    label: 'Клиент',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
  },
  {
    value: 'customer_manager',
    label: 'Менеджер клиента',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
] as const;

type RoleValue = typeof PROJECT_ROLES[number]['value'];

const getRoleMeta = (role: string) =>
  PROJECT_ROLES.find(item => item.value === role) ?? PROJECT_ROLES[2];

/* ────────────────────────────────────────────────────────────────
   LABELS
──────────────────────────────────────────────────────────────── */

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  on_hold: 'На паузе',
  completed: 'Завершён',
  archived: 'В архиве',
  cancelled: 'Отменён',
};

const ALL_STATUSES = [
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
];

const NEXT_STATUSES: Record<string, string[]> = {
  active: ALL_STATUSES.filter(status => status !== 'active'),
  on_hold: ALL_STATUSES.filter(status => status !== 'on_hold'),
  completed: ALL_STATUSES.filter(status => status !== 'completed'),
  cancelled: ALL_STATUSES.filter(status => status !== 'cancelled'),
  archived: ALL_STATUSES.filter(status => status !== 'archived'),
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  pending_approval: 'На согласовании',
  open: 'Открыт',
  in_progress: 'В работе',
  waiting: 'Ожидает ответа',
  resolved: 'Решён',
  closed: 'Закрыт',
  reopened: 'Переоткрыт',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

/* ────────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────────── */

function getInitials(name?: string | null): string {
  if (!name?.trim()) return '?';

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return parts[0].slice(0, 2).toUpperCase();
}

function getUserName(user: UserOption): string {
  const extra = user as UserOption & { username?: string | null };

  return (
    user.full_name ||
    extra.username ||
    user.email ||
    'Пользователь'
  );
}

function isUserActive(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false;

  const record = user as Record<string, unknown>;
  const flags = [
    record.is_active,
    record.isActive,
    record.active,
  ];

  const inactiveFlag = flags.some(
    flag => flag === false || flag === 0 || flag === 'false',
  );

  return (
    !inactiveFlag &&
    record.status !== 'inactive' &&
    record.status !== 'disabled'
  );
}

function Avatar({
  name,
  size = 'md',
}: {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  return (
    <div
      className={`${sizes[size]} flex shrink-0 select-none items-center justify-center rounded-xl bg-[var(--accent)] font-semibold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}

const fmtDate = (date?: string | null) => {
  if (!date) return '—';

  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const fmtDateTime = (date?: string | null) => {
  if (!date) return '—';

  return new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const projectStatusClass = (status: string) => {
  if (status === 'active') return 'status-resolved';
  if (status === 'cancelled') return 'status-rejected';
  if (status === 'on_hold') return 'status-agreement';
  if (status === 'completed') return 'status-resolved';
  return 'status-closed';
};

/* ────────────────────────────────────────────────────────────────
   SEARCHABLE USER PICKER
──────────────────────────────────────────────────────────────── */

function ProjectUserPicker({
  label,
  value,
  options,
  loading,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: UserOption[];
  loading: boolean;
  disabled?: boolean;
  placeholder: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedUser = options.find(option => option.id === value);
  const queryLower = query.trim().toLowerCase();

  const filteredOptions = options.filter(option => {
    if (!queryLower) return true;

    const name = getUserName(option).toLowerCase();
    const email = option.email?.toLowerCase() ?? '';

    return name.includes(queryLower) || email.includes(queryLower);
  });

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  let selectedLabel = placeholder;

  if (selectedUser) {
    selectedLabel = getUserName(selectedUser);
  } else if (value) {
    selectedLabel = `Пользователь не найден (${value.slice(0, 8)})`;
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>

      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--text-muted)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
          <div className="border-b border-[var(--border-color)] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="Поиск пользователя..."
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
              </div>
            ) : filteredOptions.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                Пользователи не найдены
              </p>
            ) : (
              filteredOptions.map(option => {
                const isSelected = option.id === value;
                const name = getUserName(option);

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.id);
                      setQuery('');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-soft)]'
                        : 'hover:bg-[var(--hover-2)]'
                    }`}
                  >
                    <Avatar name={name} size="sm" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                        {name}
                      </span>
                      {option.email && (
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                          {option.email}
                        </span>
                      )}
                    </span>

                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   PROJECT EDIT MODAL
──────────────────────────────────────────────────────────────── */

function ProjectEditModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [ownerId, setOwnerId] = useState(project.owner_id ?? '');
  const [creatorId, setCreatorId] = useState(project.created_by ?? '');
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.roles?.includes('admin') ?? false;
  const isSupportManager = user?.roles?.includes('support_manager') ?? false;
  const isOwner = user?.id === project.owner_id;

  const canChangeOwner = isAdmin || isSupportManager || isOwner;
  const canChangeCreator = isAdmin || isSupportManager;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, saving]);

  useEffect(() => {
    let alive = true;

    const loadUsers = async () => {
      setLoadingUsers(true);
      setUsersLoadError(false);

      try {
        const response = await usersApi.getAllUsers(1, 200);

        if (alive) {
          setUsers((response.items ?? []).filter(isUserActive));
        }
      } catch (error) {
        console.error('Failed to load users for project edit:', error);

        if (alive) {
          setUsersLoadError(true);
          toast({
            title: 'Не удалось загрузить пользователей',
            description: 'Название и описание проекта всё ещё можно изменить.',
            variant: 'destructive',
          });
        }
      } finally {
        if (alive) setLoadingUsers(false);
      }
    };

    void loadUsers();

    return () => {
      alive = false;
    };
  }, [toast]);

  const submit = async () => {
    if (!name.trim() || saving) return;

    setSaving(true);

    try {
      const updatePayload = {
        name: name.trim(),
        description: description.trim() || null,
        ...(canChangeOwner && ownerId !== (project.owner_id ?? '')
          ? { owner_id: ownerId || null }
          : {}),
        ...(canChangeCreator && creatorId !== (project.created_by ?? '')
          ? { created_by: creatorId || null }
          : {}),
      };

      await projectsApi.update(
        project.id,
        updatePayload as Parameters<typeof projectsApi.update>[1],
      );

      toast({ title: 'Проект обновлён' });
      await onSaved();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description:
          error?.response?.data?.detail ||
          'Не удалось сохранить проект',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-edit-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />

      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Pencil className="h-5 w-5 text-[var(--accent)]" />
            </div>

            <div className="min-w-0">
              <h2
                id="project-edit-title"
                className="text-lg font-bold text-[var(--text-primary)]"
              >
                Редактирование проекта
              </h2>
              <p className="mt-1 truncate font-mono text-xs text-[var(--text-muted)]">
                {project.key}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
              Название <span className="text-[var(--accent)]">*</span>
            </label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Название проекта"
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
              Описание
            </label>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={4}
              placeholder="Описание проекта"
              className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {(canChangeOwner || canChangeCreator) && (
            <div className="border-t border-[var(--border-color)] pt-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Ответственные
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Доступные поля зависят от ваших прав в проекте.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {canChangeOwner && (
                  <ProjectUserPicker
                    label="Владелец проекта"
                    value={ownerId}
                    options={users}
                    loading={loadingUsers}
                    disabled={saving}
                    placeholder="Выберите владельца"
                    onChange={setOwnerId}
                  />
                )}

                {canChangeCreator && (
                  <ProjectUserPicker
                    label="Ответственный проекта"
                    value={creatorId}
                    options={users}
                    loading={loadingUsers}
                    disabled={saving}
                    placeholder="Выберите создателя"
                    onChange={setCreatorId}
                  />
                )}
              </div>

              {usersLoadError && (
                <p className="mt-3 text-xs text-amber-500">
                  Список пользователей не загрузился. Попробуйте открыть редактирование ещё раз.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-3)] disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────────────────────────────
   ARCHIVE MODAL
──────────────────────────────────────────────────────────────── */

function ArchiveModal({
  projectName,
  loading,
  onConfirm,
  onClose,
}: {
  projectName: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loading, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-project-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="px-7 pt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <Archive className="h-8 w-8 text-amber-500" />
          </div>

          <h2
            id="archive-project-title"
            className="mt-5 text-xl font-bold text-[var(--text-primary)]"
          >
            Архивировать проект?
          </h2>

          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Проект{' '}
            <span className="font-semibold text-[var(--text-primary)]">
              «{projectName}»
            </span>{' '}
            будет архивирован.
          </p>
        </div>

        <div className="mt-3 flex gap-3 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Архивировать
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────────────────────────────
   PROJECT DETAIL PAGE
──────────────────────────────────────────────────────────────── */

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('info');

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [projectUsers, setProjectUsers] = useState<SimpleUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [projectTickets, setProjectTickets] = useState<TicketListItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [stages, setStages] = useState<ProjectStageResponse[]>([]);

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Map<string, UserOption>>(
    new Map(),
  );
  const [selectedRoles, setSelectedRoles] = useState<RoleValue[]>([
    'contributor',
  ]);
  const [searchUser, setSearchUser] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);

  const statusMenuRef = useRef<HTMLDivElement>(null);

  const isSupportOrHigher =
    user?.roles?.some(role =>
      ['admin', 'support_manager', 'support_agent'].includes(role),
    ) ?? false;

  const canEdit =
    isSupportOrHigher || project?.owner_id === user?.id;

  const isActive = project?.status === 'active';

  /* ──────────────────────────────────────────────────────────────
     LOAD PROJECT
  ────────────────────────────────────────────────────────────── */

  const loadProject = useCallback(
    async (silent = false) => {
      if (!id) return;

      if (!silent) setLoading(true);

      try {
        const data = await projectsApi.getById(id);

        setProject(data);
        setStages(data.stages ?? []);

        if (data.counterparty_id) {
          try {
            const cp = await counterpartiesApi.getById(data.counterparty_id);
            setCounterparty(cp);
          } catch {
            setCounterparty(null);
          }
        } else {
          setCounterparty(null);
        }
      } catch (error) {
        console.error('Failed to load project:', error);

        toast({
          title: 'Ошибка',
          description: 'Не удалось загрузить проект',
          variant: 'destructive',
        });

        navigate('/projects');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, navigate, toast],
  );

  /* ──────────────────────────────────────────────────────────────
     LOAD MEMBERS AND USER DIRECTORY
  ────────────────────────────────────────────────────────────── */

  const loadMembers = useCallback(async () => {
    if (!id) return;

    setLoadingMembers(true);

    try {
      const memberships = await projectsApi.getMembers(id);

      let users: SimpleUser[] = [];

      try {
        const usersResponse = await usersApi.getAllUsers(1, 200);
        users = usersResponse.items ?? [];
        setProjectUsers(users);
      } catch (error) {
        console.error('Failed to load project user directory:', error);
        setProjectUsers([]);
      }

      const userMap = new Map<string, SimpleUser>();

      users.forEach(item => {
        userMap.set(item.id, item);
      });

      const result: ProjectMember[] = (memberships ?? []).map(
        (member: any) => ({
          user_id: member.user_id,
          project_role:
            member.roles?.[0] ||
            member.project_role ||
            'contributor',
          user:
            userMap.get(member.user_id) ??
            (member.user as UserOption | null) ??
            null,
        }),
      );

      setMembers(result);
    } catch (error) {
      console.error('Failed to load project members:', error);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [id]);

  /* ──────────────────────────────────────────────────────────────
     LOAD TICKETS
  ────────────────────────────────────────────────────────────── */

  const loadTickets = useCallback(async () => {
    if (!id) return;

    setLoadingTickets(true);

    try {
      const response = await ticketsApi.getAll(1, 100, {
        project_ids: [id],
      });

      setProjectTickets(response.items ?? []);
    } catch (error) {
      console.error('Failed to load project tickets:', error);
      setProjectTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, [id]);

  useEffect(() => {
    void loadProject();
    void loadMembers();
    void loadTickets();
  }, [loadProject, loadMembers, loadTickets]);

  useEffect(() => {
    if (!statusMenuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusMenuOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [statusMenuOpen]);

  useEffect(() => {
    if (!showAddModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !addingMembers) {
        setShowAddModal(false);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showAddModal, addingMembers]);

  /* ──────────────────────────────────────────────────────────────
     AVAILABLE USERS
  ────────────────────────────────────────────────────────────── */

  const loadAvailableUsers = useCallback(async () => {
    setLoadingAvailable(true);

    try {
      const existingIds = new Set(members.map(member => member.user_id));
      const allUsers: UserOption[] = [];
      const seen = new Set<string>();

      if (project?.counterparty_id) {
        try {
          const response = await usersApi.getCustomers(
            project.counterparty_id,
            1,
            100,
          );

          response.items.forEach(item => {
            if (
              isUserActive(item) &&
              !existingIds.has(item.id) &&
              !seen.has(item.id)
            ) {
              allUsers.push(item);
              seen.add(item.id);
            }
          });
        } catch (error) {
          console.error('Failed to load customers:', error);
        }
      }

      const response = await usersApi.getAllUsers(1, 100);

      response.items.forEach(item => {
        if (
          isUserActive(item) &&
          !existingIds.has(item.id) &&
          !seen.has(item.id)
        ) {
          allUsers.push(item);
          seen.add(item.id);
        }
      });

      setAvailableUsers(allUsers);
    } catch (error) {
      console.error('Failed to load available users:', error);

      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить пользователей',
        variant: 'destructive',
      });
    } finally {
      setLoadingAvailable(false);
    }
  }, [members, project?.counterparty_id, toast]);

  useEffect(() => {
    if (showAddModal) {
      void loadAvailableUsers();
    }
  }, [showAddModal, loadAvailableUsers]);

  /* ──────────────────────────────────────────────────────────────
     ACTIONS
  ────────────────────────────────────────────────────────────── */

  const handleChangeStatus = async (next: Project['status']) => {
    if (!id || changingStatus) return;

    setStatusMenuOpen(false);
    setChangingStatus(true);

    try {
      await projectsApi.changeStatus(id, next);

      toast({
        title: `Статус: ${PROJECT_STATUS_LABELS[next] ?? next}`,
      });

      await loadProject(true);
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось изменить статус',
        variant: 'destructive',
      });
    } finally {
      setChangingStatus(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;

    setArchiving(true);

    try {
      await projectsApi.archive(id);

      toast({ title: 'Проект архивирован' });
      setShowArchiveModal(false);
      await loadProject(true);
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось архивировать проект',
        variant: 'destructive',
      });
    } finally {
      setArchiving(false);
    }
  };

  const handleAddMembers = async () => {
    if (!id || !selectedUsers.size || !selectedRoles.length) return;

    setAddingMembers(true);

    try {
      for (const selectedUser of selectedUsers.values()) {
        await projectsApi.addMember(id, selectedUser.id, selectedRoles);
      }

      toast({
        title: 'Участники добавлены',
        description: `Добавлено: ${selectedUsers.size}`,
      });

      setShowAddModal(false);
      setSelectedUsers(new Map());
      setSelectedRoles(['contributor']);
      setSearchUser('');

      await loadMembers();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description:
          typeof error?.response?.data?.detail === 'string'
            ? error.response.data.detail
            : 'Не удалось добавить участников',
        variant: 'destructive',
      });
    } finally {
      setAddingMembers(false);
    }
  };

  const toggleUser = (selectedUser: UserOption) => {
    setSelectedUsers(previous => {
      const next = new Map(previous);

      if (next.has(selectedUser.id)) {
        next.delete(selectedUser.id);
      } else {
        next.set(selectedUser.id, selectedUser);
      }

      return next;
    });
  };

  /* ──────────────────────────────────────────────────────────────
     DISPLAY HELPERS
  ────────────────────────────────────────────────────────────── */

  const resolveDisplay = (member: ProjectMember): UserDisplay => {
    if (member.user) {
      return {
        name: getUserName(member.user),
        email: member.user.email ?? undefined,
        isMe: member.user_id === user?.id,
      };
    }

    if (member.user_id === user?.id) {
      return {
        name: user?.full_name || user?.username || user?.email || 'Вы',
        email: user?.email ?? undefined,
        isMe: true,
      };
    }

    const directoryUser = projectUsers.find(
      item => item.id === member.user_id,
    );

    if (directoryUser) {
      return {
        name: getUserName(directoryUser),
        email: directoryUser.email ?? undefined,
        isMe: false,
      };
    }

    return {
      name: `ID: ${member.user_id.slice(0, 8)}`,
      isMe: false,
    };
  };

  const resolveUserById = (userId?: string | null): UserDisplay | null => {
    if (!userId) return null;

    if (userId === user?.id) {
      return {
        name: user?.full_name || user?.username || user?.email || 'Вы',
        email: user?.email ?? undefined,
        isMe: true,
      };
    }

    const directoryUser = projectUsers.find(item => item.id === userId);

    if (directoryUser) {
      return {
        name: getUserName(directoryUser),
        email: directoryUser.email ?? undefined,
        isMe: false,
      };
    }

    const member = members.find(item => item.user_id === userId);

    if (member) return resolveDisplay(member);

    return {
      name: `ID: ${userId.slice(0, 8)}`,
      isMe: false,
    };
  };

  const ownerMember =
    members.find(member => member.user_id === project?.owner_id) ??
    members.find(member => member.project_role === 'owner');

  const ownerDisplay =
    resolveUserById(project?.owner_id) ??
    (ownerMember ? resolveDisplay(ownerMember) : null);

  const creatorDisplay = resolveUserById(project?.created_by);

  const filteredAvailable = availableUsers.filter(item => {
    const query = searchUser.trim().toLowerCase();

    if (!query) return true;

    return (
      getUserName(item).toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query)
    );
  });

  const ticketStatusClass = (status: string) => {
    const map: Record<string, string> = {
      new: 'status-new',
      pending_approval: 'status-agreement',
      open: 'status-open',
      in_progress: 'status-progress',
      waiting: 'status-waiting',
      resolved: 'status-resolved',
      closed: 'status-closed',
      reopened: 'status-reopened',
      rejected: 'status-rejected',
      cancelled: 'status-closed',
    };

    return map[status] ?? 'status-closed';
  };

  const priorityClass = (priority: string) => {
    const map: Record<string, string> = {
      low: 'priority-low',
      medium: 'priority-medium',
      high: 'priority-high',
      critical: 'priority-critical',
    };

    return map[priority] ?? 'priority-medium';
  };

  /* ──────────────────────────────────────────────────────────────
     LOADING / EMPTY STATES
  ────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-9 w-9 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] p-12 text-center">
        <FolderOpen className="mx-auto h-12 w-12 text-[var(--text-disabled)]" />

        <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          Проект не найден
        </h2>

        <Link
          to="/projects"
          className="mt-5 inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
        >
          Вернуться к проектам
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'info' as const, label: 'Информация', icon: FolderOpen },
    {
      id: 'members' as const,
      label: 'Участники',
      icon: Users,
      count: members.length,
    },
    {
      id: 'tickets' as const,
      label: 'Заявки',
      icon: Ticket,
      count: projectTickets.length,
    },
    ...(project.counterparty_id
      ? [{ id: 'contracts' as const, label: 'Договоры', icon: FileText }]
      : []),
  ];

  /* ──────────────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 pb-12 animate-in fade-in duration-500">
      {/* PROJECT HEADER */}
      <header className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              aria-label="Вернуться к проектам"
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-2)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-start gap-4">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--hover-2)] sm:flex">
                <FolderOpen className="h-7 w-7 text-[var(--text-primary)]" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="break-words text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                    {project.name}
                  </h1>

                  <span
                    className={`rounded-lg border px-3 py-1 text-sm font-medium ${projectStatusClass(
                      project.status,
                    )}`}
                  >
                    {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Hash className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="font-mono text-sm text-[var(--text-muted)]">
                    {project.key}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ALL PROJECT ACTIONS, INCLUDING STATUS, ARE IN THE HEADER */}
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {canEdit && (NEXT_STATUSES[project.status]?.length ?? 0) > 0 && (
              <div ref={statusMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(current => !current)}
                  disabled={changingStatus}
                  aria-expanded={statusMenuOpen}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-3)] disabled:opacity-60"
                >
                  {changingStatus ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        statusMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                  Сменить статус
                </button>

                {statusMenuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                    <p className="border-b border-[var(--border-color)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Новый статус
                    </p>

                    {(NEXT_STATUSES[project.status] ?? []).map(next => (
                      <button
                        key={next}
                        type="button"
                        onClick={() =>
                          void handleChangeStatus(next as Project['status'])
                        }
                        className="w-full px-4 py-3 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-2)]"
                      >
                        {PROJECT_STATUS_LABELS[next] ?? next}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canEdit && isActive && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditProjectModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-3)]"
                >
                  <Pencil className="h-4 w-4" />
                  Редактировать
                </button>

                <button
                  type="button"
                  onClick={() => setShowArchiveModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
                >
                  <Archive className="h-4 w-4" />
                  Архивировать
                </button>

                <Link
                  to={`/tickets/new?project_id=${project.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Создать заявку
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* PAGE NAVIGATION */}
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]">
        {tabs.map(tab => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}

              {'count' in tab && typeof tab.count === 'number' && (
                <span className="rounded-lg bg-[var(--hover-2)] px-2 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}

        <Link
          to={`/projects/${project.id}/stages`}
          className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
        >
          <Milestone className="h-4 w-4" />
          Этапы

          {stages.length > 0 && (
            <span className="rounded-lg bg-[var(--hover-2)] px-2 py-0.5 text-xs">
              {stages.length}
            </span>
          )}

          <ChevronRight className="ml-1 h-4 w-4 text-[var(--text-disabled)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
        </Link>

        <Link
          to={`/tasks?project_id=${project.id}`}
          className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
        >
          <Layers className="h-4 w-4" />
          Задачи
          <ChevronRight className="ml-1 h-4 w-4 text-[var(--text-disabled)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
        </Link>
      </nav>

      {/* TAB CONTENT — USES THE FULL AVAILABLE WIDTH */}
      <main className="min-w-0">
        {/* PROJECT INFO */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {project.description && (
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
                <h2 className="mb-3 text-base font-bold text-[var(--text-primary)]">
                  Описание проекта
                </h2>

                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-secondary)]">
                  {project.description}
                </p>
              </section>
            )}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Building2 className="h-4 w-4" />
                  Контрагент
                </p>

                {counterparty ? (
                  <>
                    <p className="break-words text-base font-semibold text-[var(--text-primary)]">
                      {counterparty.name}
                    </p>

                    {counterparty.legal_name && (
                      <p className="mt-1 break-words text-sm text-[var(--text-muted)]">
                        {counterparty.legal_name}
                      </p>
                    )}

                    {counterparty.inn && (
                      <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
                        ИНН {counterparty.inn}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">Не указан</p>
                )}
              </div>

              <div className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Crown className="h-4 w-4" />
                  Владелец
                </p>

                {ownerDisplay ? (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={ownerDisplay.name} />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {ownerDisplay.name}
                      </p>

                      {ownerDisplay.email && (
                        <a
                          href={`mailto:${ownerDisplay.email}`}
                          className="mt-1 block truncate text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                        >
                          {ownerDisplay.email}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">Не указан</p>
                )}
              </div>

              <div className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Calendar className="h-4 w-4" />
                  Дата создания
                </p>

                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {fmtDateTime(project.created_at)}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <User className="h-4 w-4" />
                  Ответственный
                </p>

                {creatorDisplay ? (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={creatorDisplay.name} />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {creatorDisplay.name}
                      </p>

                      {creatorDisplay.email && (
                        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                          {creatorDisplay.email}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Не удалось определить
                  </p>
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--hover-1)]"
              >
                <Users className="h-5 w-5 text-[var(--text-muted)]" />
                <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">
                  {members.length}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Участников
                </p>
              </button>

              <Link
                to={`/projects/${project.id}/stages`}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--hover-1)]"
              >
                <Milestone className="h-5 w-5 text-[var(--text-muted)]" />
                <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">
                  {stages.length}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Этапов</p>
              </Link>

              <button
                type="button"
                onClick={() => setActiveTab('tickets')}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--hover-1)]"
              >
                <Ticket className="h-5 w-5 text-[var(--text-muted)]" />
                <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">
                  {projectTickets.length}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Заявок</p>
              </button>
            </section>
          </div>
        )}

        {/* MEMBERS */}
        {activeTab === 'members' && (
          <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Участники проекта
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {members.length} участников
                </p>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" />
                  Добавить участника
                </button>
              )}
            </div>

            <div className="p-5">
              {loadingMembers ? (
                <div className="flex justify-center py-14">
                  <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
                </div>
              ) : members.length === 0 ? (
                <div className="py-14 text-center">
                  <Users className="mx-auto h-10 w-10 text-[var(--text-disabled)]" />
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Участники не найдены
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {members.map(member => {
                    const display = resolveDisplay(member);
                    const role = getRoleMeta(member.project_role);

                    return (
                      <div
                        key={member.user_id}
                        className="flex flex-wrap items-center gap-3 px-2 py-4"
                      >
                        <Avatar name={display.name} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {display.name}
                            </p>

                            {display.isMe && (
                              <span className="rounded-md bg-[var(--hover-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                                Вы
                              </span>
                            )}
                          </div>

                          {display.email && (
                            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                              {display.email}
                            </p>
                          )}
                        </div>

                        <span
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${role.bg} ${role.color} ${role.border}`}
                        >
                          {role.label}
                        </span>

                        {canEdit && member.project_role !== 'owner' && (
                          <button
                            type="button"
                            title="Удалить участника"
                            aria-label={`Удалить ${display.name} из проекта`}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Удалить «${display.name}» из проекта?`,
                                )
                              ) {
                                return;
                              }

                              try {
                                await projectsApi.removeMember(
                                  project.id,
                                  member.user_id,
                                );

                                toast({ title: 'Участник удалён' });
                                await loadMembers();
                              } catch {
                                toast({
                                  title: 'Ошибка',
                                  description:
                                    'Не удалось удалить участника',
                                  variant: 'destructive',
                                });
                              }
                            }}
                            className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TICKETS */}
        {activeTab === 'tickets' && (
          <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Заявки проекта
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {projectTickets.length} заявок
                </p>
              </div>

              {canEdit && (
                <Link
                  to={`/tickets/new?project_id=${project.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Создать заявку
                </Link>
              )}
            </div>

            <div className="p-5">
              {loadingTickets ? (
                <div className="flex justify-center py-14">
                  <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
                </div>
              ) : projectTickets.length === 0 ? (
                <div className="py-14 text-center">
                  <Ticket className="mx-auto h-10 w-10 text-[var(--text-disabled)]" />
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Заявок пока нет
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {projectTickets.map(ticket => (
                    <Link
                      key={ticket.id}
                      to={`/tickets/${ticket.number}`}
                      className="group flex items-center gap-4 px-2 py-4 transition-colors hover:bg-[var(--hover-2)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                          {ticket.title}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            #{ticket.number}
                          </span>

                          <span
                            className={`rounded-md border px-2 py-1 text-xs font-medium ${ticketStatusClass(
                              ticket.status,
                            )}`}
                          >
                            {TICKET_STATUS_LABELS[ticket.status] ??
                              ticket.status}
                          </span>

                          <span
                            className={`rounded-md border px-2 py-1 text-xs font-medium ${priorityClass(
                              ticket.priority,
                            )}`}
                          >
                            {TICKET_PRIORITY_LABELS[ticket.priority] ??
                              ticket.priority}
                          </span>
                        </div>
                      </div>

                      <span className="hidden shrink-0 text-xs text-[var(--text-muted)] sm:block">
                        {fmtDate(ticket.created_at)}
                      </span>

                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--accent)]" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* CONTRACTS */}
        {activeTab === 'contracts' && project.counterparty_id && (
          <ContractsTab
            counterpartyId={project.counterparty_id}
            projectId={project.id}
          />
        )}
      </main>

      {/* EDIT PROJECT */}
      {showEditProjectModal && (
        <ProjectEditModal
          project={project}
          onClose={() => setShowEditProjectModal(false)}
          onSaved={async () => {
            setShowEditProjectModal(false);
            await Promise.all([loadProject(true), loadMembers()]);
          }}
        />
      )}

      {/* ARCHIVE CONFIRMATION */}
      {showArchiveModal && (
        <ArchiveModal
          projectName={project.name}
          loading={archiving}
          onConfirm={handleArchive}
          onClose={() => setShowArchiveModal(false)}
        />
      )}

      {/* ADD MEMBERS */}
      {showAddModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-members-title"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() =>
                !addingMembers && setShowAddModal(false)
              }
            />

            <div
              className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">
                <div>
                  <h2
                    id="add-members-title"
                    className="text-lg font-bold text-[var(--text-primary)]"
                  >
                    Добавить участников
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Выберите пользователей и их роли в проекте
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addingMembers}
                  aria-label="Закрыть"
                  className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-2)] disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                <div>
                  <label className="mb-3 block text-sm font-medium text-[var(--text-secondary)]">
                    Роли в проекте
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {PROJECT_ROLES.map(role => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() =>
                          setSelectedRoles(previous =>
                            previous.includes(role.value)
                              ? previous.filter(
                                  value => value !== role.value,
                                )
                              : [...previous, role.value],
                          )
                        }
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          selectedRoles.includes(role.value)
                            ? `${role.bg} ${role.color} ${role.border}`
                            : 'border-[var(--border-color)] bg-[var(--hover-2)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-medium text-[var(--text-secondary)]">
                    Пользователи
                    {selectedUsers.size > 0 && (
                      <span className="ml-2 text-[var(--accent)]">
                        {selectedUsers.size} выбрано
                      </span>
                    )}
                  </label>

                  <div className="relative mb-3">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />

                    <input
                      value={searchUser}
                      onChange={event => setSearchUser(event.target.value)}
                      placeholder="Поиск по имени или почте..."
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)]">
                    {loadingAvailable ? (
                      <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
                      </div>
                    ) : filteredAvailable.length === 0 ? (
                      <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                        Пользователи не найдены
                      </div>
                    ) : (
                      filteredAvailable.map(item => {
                        const selected = selectedUsers.has(item.id);
                        const name = getUserName(item);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleUser(item)}
                            className={`flex w-full items-center gap-3 border-b border-[var(--border-color)] px-4 py-3 text-left transition-colors last:border-0 ${
                              selected
                                ? 'bg-[var(--accent-soft)]'
                                : 'hover:bg-[var(--hover-2)]'
                            }`}
                          >
                            <Avatar name={name} size="sm" />

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                                {name}
                              </span>
                              {item.email && (
                                <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                                  {item.email}
                                </span>
                              )}
                            </span>

                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                selected
                                  ? 'border-[var(--accent)] bg-[var(--accent)]'
                                  : 'border-[var(--border-color)]'
                              }`}
                            >
                              {selected && (
                                <Check className="h-3.5 w-3.5 text-white" />
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addingMembers}
                  className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-50"
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={
                    !selectedUsers.size ||
                    !selectedRoles.length ||
                    addingMembers
                  }
                  className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {addingMembers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Добавить
                  {selectedUsers.size > 0 && ` (${selectedUsers.size})`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}