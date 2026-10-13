import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';

import {
  ArrowLeft, FolderOpen, Building2, Users, Calendar,
  User, Mail, Phone, Loader2, Archive, Plus, Ticket,
  Crown, Hash, UserPlus, ChevronRight, Search, X,
  Check, Settings, AlertTriangle, Milestone, Pencil,
} from 'lucide-react';

import {
  projectsApi,
  ticketsApi,
  counterpartiesApi,
  usersApi,
} from '../api/client';

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

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

type TabType = 'info' | 'members' | 'tickets';

type ProjectMember = {
  user_id: string;
  project_role: string;
  user: CounterpartyCustomer | SimpleUser | null;
};

/* ═══════════════════════════════════════════════════════════════
   ROLES
   ═══════════════════════════════════════════════════════════════ */

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
  PROJECT_ROLES.find(item => item.value === role) ??
  PROJECT_ROLES[2];

/* ═══════════════════════════════════════════════════════════════
   TICKET LABELS
   ═══════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getInitials(name?: string | null): string {
  if (!name?.trim()) return '?';

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return parts[0].slice(0, 2).toUpperCase();
}

function Avatar({
  name,
  size = 'md',
}: {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <div className={`${sizes[size]} rounded-xl bg-[var(--accent)] flex items-center justify-center font-semibold text-white shrink-0 select-none`}>
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

/* ═══════════════════════════════════════════════════════════════
   PROJECT EDIT MODAL
   ═══════════════════════════════════════════════════════════════ */

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

  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };

    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const submit = async () => {
    if (!name.trim() || saving) return;

    setSaving(true);

    try {
      await projectsApi.update(project.id, {
        name: name.trim(),
        description: description.trim() || null,
      });

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>

        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Pencil className="w-5 h-5 text-[var(--accent)]" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Редактирование проекта
              </h2>
              <p className="mt-1 text-xs font-mono text-[var(--text-muted)]">
                {project.key}
              </p>
            </div>
          </div>

          <button onClick={onClose} disabled={saving}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-[var(--text-secondary)]">
              Название <span className="text-[var(--accent)]">*</span>
            </label>

            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Название проекта"
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-[var(--text-secondary)]">
              Описание
            </label>

            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={5}
              placeholder="Описание проекта"
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)]">
          <button onClick={onClose} disabled={saving}
            className="px-5 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-3)]">
            Отмена
          </button>

          <button onClick={submit} disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════
   ARCHIVE MODAL
   ═══════════════════════════════════════════════════════════════ */

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
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };

    document.addEventListener('keydown', handler);

    return () => document.removeEventListener('keydown', handler);
  }, [loading, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onClose()} />

      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>

        <div className="px-7 pt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Archive className="w-8 h-8 text-amber-500" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-[var(--text-primary)]">
            Архивировать проект?
          </h2>

          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Проект <span className="font-semibold text-[var(--text-primary)]">«{projectName}»</span> будет архивирован.
          </p>
        </div>

        <div className="flex gap-3 p-6 mt-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] text-sm font-medium text-[var(--text-secondary)]">
            Отмена
          </button>

          <button onClick={onConfirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm font-semibold text-amber-500">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Архивировать
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROJECT DETAIL PAGE
   ═══════════════════════════════════════════════════════════════ */

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
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [projectTickets, setProjectTickets] = useState<TicketListItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [stages, setStages] = useState<ProjectStageResponse[]>([]);

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Array<CounterpartyCustomer | SimpleUser>>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Map<string, CounterpartyCustomer | SimpleUser>>(new Map());
  const [selectedRoles, setSelectedRoles] = useState<RoleValue[]>(['contributor']);
  const [searchUser, setSearchUser] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);

  const isSupportOrHigher = user?.roles?.some(role =>
    ['admin', 'support_manager', 'support_agent'].includes(role),
  ) ?? false;

  const canEdit = isSupportOrHigher || project?.owner_id === user?.id;
  const isActive = project?.status === 'active';

  /* ═══════════════════════════════════════════════════════════
     LOAD PROJECT
     ═══════════════════════════════════════════════════════════ */

  const loadProject = useCallback(async () => {
    if (!id) return;

    setLoading(true);

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
      setLoading(false);
    }
  }, [id, navigate, toast]);

  /* ═══════════════════════════════════════════════════════════
     LOAD MEMBERS
     ═══════════════════════════════════════════════════════════ */

  const loadMembers = useCallback(async () => {
    if (!id) return;

    setLoadingMembers(true);

    try {
      const memberships = await projectsApi.getMembers(id);
      const usersResponse = await usersApi.getAllUsers(1, 100);

      const userMap = new Map<string, SimpleUser>();

      usersResponse.items.forEach(item => {
        userMap.set(item.id, item);
      });

      const result: ProjectMember[] = memberships.map((member: any) => ({
        user_id: member.user_id,
        project_role:
          member.roles?.[0] ||
          member.project_role ||
          'contributor',
        user: userMap.get(member.user_id) ?? null,
      }));

      setMembers(result);
    } catch (error) {
      console.error('Failed to load project members:', error);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [id]);

  /* ═══════════════════════════════════════════════════════════
     LOAD TICKETS
     ═══════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════
     AVAILABLE USERS
     ═══════════════════════════════════════════════════════════ */

  const loadAvailableUsers = useCallback(async () => {
    setLoadingAvailable(true);

    try {
      const existingIds = new Set(members.map(member => member.user_id));
      const allUsers: Array<CounterpartyCustomer | SimpleUser> = [];
      const seen = new Set<string>();

      if (project?.counterparty_id) {
        try {
          const response = await usersApi.getCustomers(project.counterparty_id, 1, 100);

          response.items.forEach(item => {
            if (!existingIds.has(item.id) && !seen.has(item.id)) {
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
        if (!existingIds.has(item.id) && !seen.has(item.id)) {
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

  /* ═══════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════ */

  const handleArchive = async () => {
    if (!id) return;

    setArchiving(true);

    try {
      await projectsApi.archive(id);

      toast({
        title: 'Проект архивирован',
      });

      setShowArchiveModal(false);
      await loadProject();
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

  const toggleUser = (selectedUser: CounterpartyCustomer | SimpleUser) => {
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

  /* ═══════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════ */

  const resolveDisplay = (member: ProjectMember) => {
    const memberUser = member.user;
    const isMe = member.user_id === user?.id;

    if (!memberUser) {
      return {
        name: `ID: ${member.user_id.slice(0, 8)}`,
        email: undefined,
        isMe,
      };
    }

    return {
      name:
        memberUser.full_name ||
        (memberUser as any).username ||
        memberUser.email ||
        'Пользователь',
      email: memberUser.email,
      isMe,
    };
  };

  const ownerMember =
    members.find(member => member.project_role === 'owner') ??
    members.find(member => member.user_id === project?.owner_id);

  const ownerDisplay = ownerMember
    ? resolveDisplay(ownerMember)
    : null;

  const creatorMember = members.find(
    member => member.user_id === project?.created_by,
  );

  const creatorDisplay = creatorMember
    ? resolveDisplay(creatorMember)
    : project?.created_by === user?.id
      ? {
          name: user?.full_name || user?.username || 'Вы',
          email: user?.email,
          isMe: true,
        }
      : null;

  const filteredAvailable = availableUsers.filter(item => {
    const query = searchUser.trim().toLowerCase();

    if (!query) return true;

    const name =
      item.full_name ||
      (item as any).username ||
      '';

    return (
      name.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query)
    );
  });

  const statusClass = (status: string) => {
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

  /* ═══════════════════════════════════════════════════════════
     LOADING
     ═══════════════════════════════════════════════════════════ */

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

        <Link to="/projects" className="mt-5 inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
          Вернуться к проектам
        </Link>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 pb-12 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-5">

        <div className="flex items-start gap-4">

          <button onClick={() => navigate('/projects')}
            className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-secondary)] hover:bg-[var(--hover-2)]">
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">

            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-[var(--hover-2)] sm:flex">
              <FolderOpen className="h-7 w-7 text-[var(--text-primary)]" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                  {project.name}
                </h1>

                <span className={`rounded-lg border px-3 py-1 text-sm font-medium ${
                  isActive
                    ? 'status-resolved'
                    : 'status-closed'
                }`}>
                  {isActive ? 'Активен' : 'Архивирован'}
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

        {canEdit && isActive && (
          <div className="flex flex-wrap items-center gap-2">

            <button onClick={() => setShowEditProjectModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-3)]">
              <Pencil className="h-4 w-4" />
              Редактировать
            </button>

            <button onClick={() => setShowArchiveModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-500 hover:bg-amber-500/20">
              <Archive className="h-4 w-4" />
              Архивировать
            </button>

            <Link to={`/tickets/new?project_id=${project.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" />
              Создать заявку
            </Link>
          </div>
        )}
      </div>

      {/* NAVIGATION */}
      <div className="flex gap-1 border-b border-[var(--border-color)] overflow-x-auto">

        {([
          { id: 'info' as TabType, label: 'Информация', icon: FolderOpen },
          { id: 'members' as TabType, label: 'Участники', icon: Users, count: members.length },
          { id: 'tickets' as TabType, label: 'Заявки', icon: Ticket, count: projectTickets.length },
        ]).map(tab => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}

              {'count' in tab && (tab.count ?? 0) > 0 && (
                <span className="rounded-lg bg-[var(--hover-2)] px-2 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}

        {/* SEPARATE STAGES PAGE */}
        <Link
          to={`/projects/${project.id}/stages`}
          className="group flex items-center gap-2 whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
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
      </div>

      {/* CONTENT */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">

        {/* MAIN */}
        <div className="min-w-0">

          {/* INFO */}
          {activeTab === 'info' && (
            <div className="space-y-6">

              {project.description && (
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-6">
                  <h2 className="mb-3 text-base font-bold text-[var(--text-primary)]">
                    Описание проекта
                  </h2>

                  <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                    {project.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
                  <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Building2 className="h-4 w-4" />
                    Контрагент
                  </p>

                  {counterparty ? (
                    <>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {counterparty.name}
                      </p>

                      {counterparty.legal_name && (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
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
                    <p className="text-sm text-[var(--text-muted)]">
                      Не указан
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
                  <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Crown className="h-4 w-4" />
                    Владелец
                  </p>

                  {ownerDisplay ? (
                    <div className="flex items-center gap-3">
                      <Avatar name={ownerDisplay.name} />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {ownerDisplay.name}
                        </p>

                        {ownerDisplay.email && (
                          <a href={`mailto:${ownerDisplay.email}`}
                            className="mt-1 block truncate text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                            {ownerDisplay.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Не указан
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
                  <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Calendar className="h-4 w-4" />
                    Дата создания
                  </p>

                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {fmtDateTime(project.created_at)}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
                  <p className="mb-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <User className="h-4 w-4" />
                    Создатель
                  </p>

                  {creatorDisplay ? (
                    <div className="flex items-center gap-3">
                      <Avatar name={creatorDisplay.name} />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {creatorDisplay.name}
                        </p>

                        {creatorDisplay.email && (
                          <p className="truncate text-xs text-[var(--text-muted)]">
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
              </div>

              {/* STATS */}
              <div className="grid grid-cols-3 gap-3">

                {[
                  { label: 'Участников', value: members.length, icon: Users },
                  { label: 'Этапов', value: stages.length, icon: Milestone },
                  { label: 'Заявок', value: projectTickets.length, icon: Ticket },
                ].map(item => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label}
                      className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5 text-center">

                      <Icon className="mx-auto h-5 w-5 text-[var(--text-muted)]" />

                      <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">
                        {item.value}
                      </p>

                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {item.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MEMBERS */}
          {activeTab === 'members' && (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)]">

              <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">

                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    Участники проекта
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {members.length} участников
                  </p>
                </div>

                {canEdit && (
                  <button onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
                    <UserPlus className="h-4 w-4" />
                    Добавить
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
                        <div key={member.user_id}
                          className="flex flex-wrap items-center gap-3 px-2 py-4">

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

                          <span className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${role.bg} ${role.color} ${role.border}`}>
                            {role.label}
                          </span>

                          {canEdit && member.project_role !== 'owner' && (
                            <button
                              title="Удалить участника"
                              onClick={async () => {
                                if (!window.confirm(`Удалить «${display.name}» из проекта?`)) return;

                                try {
                                  await projectsApi.removeMember(project.id, member.user_id);
                                  toast({ title: 'Участник удалён' });
                                  await loadMembers();
                                } catch {
                                  toast({
                                    title: 'Ошибка',
                                    description: 'Не удалось удалить участника',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
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
            </div>
          )}

          {/* TICKETS */}
          {activeTab === 'tickets' && (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)]">

              <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">

                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    Заявки проекта
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {projectTickets.length} заявок
                  </p>
                </div>

                {canEdit && (
                  <Link to={`/tickets/new?project_id=${project.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
                    <Plus className="h-4 w-4" />
                    Создать
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
                        className="group flex items-center gap-4 px-2 py-4 hover:bg-[var(--hover-2)] transition-colors"
                      >
                        <div className="min-w-0 flex-1">

                          <p className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                            {ticket.title}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2">

                            <span className="font-mono text-xs text-[var(--text-muted)]">
                              #{ticket.number}
                            </span>

                            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(ticket.status)}`}>
                              {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                            </span>

                            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${priorityClass(ticket.priority)}`}>
                              {TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
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
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-5">

          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">

            <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Settings className="h-4 w-4 text-[var(--text-muted)]" />
              Информация
            </h3>

            <div className="divide-y divide-[var(--border-color)]">

              {[
                { label: 'Ключ', value: project.key },
                { label: 'Статус', value: isActive ? 'Активен' : 'Архивирован' },
                { label: 'Участников', value: String(members.length) },
                { label: 'Этапов', value: String(stages.length) },
                { label: 'Заявок', value: String(projectTickets.length) },
                { label: 'Создан', value: fmtDate(project.created_at) },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-3">

                  <span className="text-sm text-[var(--text-muted)]">
                    {item.label}
                  </span>

                  <span className="text-right text-sm font-medium text-[var(--text-primary)]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {counterparty && (
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">

              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                Контрагент
              </h3>

              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {counterparty.name}
              </p>

              {counterparty.legal_name && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {counterparty.legal_name}
                </p>
              )}

              {counterparty.inn && (
                <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">
                  ИНН {counterparty.inn}
                </p>
              )}

              <div className="mt-4 space-y-3">

                {counterparty.phone && (
                  <a href={`tel:${counterparty.phone}`}
                    className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
                    <Phone className="h-4 w-4" />
                    {counterparty.phone}
                  </a>
                )}

                {counterparty.email && (
                  <a href={`mailto:${counterparty.email}`}
                    className="flex items-center gap-2 break-all text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
                    <Mail className="h-4 w-4 shrink-0" />
                    {counterparty.email}
                  </a>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* MODALS */}
      {showEditProjectModal && (
        <ProjectEditModal
          project={project}
          onClose={() => setShowEditProjectModal(false)}
          onSaved={async () => {
            setShowEditProjectModal(false);
            await loadProject();
          }}
        />
      )}

      {showArchiveModal && (
        <ArchiveModal
          projectName={project.name}
          loading={archiving}
          onConfirm={handleArchive}
          onClose={() => setShowArchiveModal(false)}
        />
      )}

      {/* ADD MEMBERS */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">

          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !addingMembers && setShowAddModal(false)} />

          <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]"
            style={{ boxShadow: 'var(--shadow-lg)' }}>

            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-color)] px-6 py-5">

              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Добавить участников
                </h2>

                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Выберите сотрудников и роли в проекте
                </p>
              </div>

              <button onClick={() => setShowAddModal(false)} disabled={addingMembers}
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover-2)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">

              {/* ROLES */}
              <div>
                <label className="mb-3 block text-sm font-medium text-[var(--text-secondary)]">
                  Роли в проекте
                </label>

                <div className="flex flex-wrap gap-2">

                  {PROJECT_ROLES.map(role => (
                    <button
                      key={role.value}
                      onClick={() =>
                        setSelectedRoles(previous =>
                          previous.includes(role.value)
                            ? previous.filter(value => value !== role.value)
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

              {/* USERS */}
              <div>
                <label className="mb-3 block text-sm font-medium text-[var(--text-secondary)]">
                  Сотрудники
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
                    placeholder="Поиск сотрудников..."
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
                      Сотрудники не найдены
                    </div>
                  ) : (
                    filteredAvailable.map(item => {
                      const selected = selectedUsers.has(item.id);

                      const name =
                        item.full_name ||
                        (item as any).username ||
                        item.email ||
                        'Пользователь';

                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleUser(item)}
                          className={`flex w-full items-center gap-3 border-b border-[var(--border-color)] px-4 py-3 text-left transition-colors last:border-0 ${
                            selected
                              ? 'bg-[var(--accent-soft)]'
                              : 'hover:bg-[var(--hover-2)]'
                          }`}
                        >
                          <Avatar name={name} size="sm" />

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {name}
                            </p>

                            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                              {item.email}
                            </p>
                          </div>

                          <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                            selected
                              ? 'border-[var(--accent)] bg-[var(--accent)]'
                              : 'border-[var(--border-color)]'
                          }`}>
                            {selected && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">

              <button onClick={() => setShowAddModal(false)} disabled={addingMembers}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-2)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)]">
                Отмена
              </button>

              <button onClick={handleAddMembers}
                disabled={!selectedUsers.size || !selectedRoles.length || addingMembers}
                className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {addingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Добавить {selectedUsers.size > 0 ? `(${selectedUsers.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}