import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Check, ChevronDown,
  File, FolderOpen, Loader2, Plus, Search,
  Sparkles, Upload, User, X, Send,
} from 'lucide-react';
import { Flame, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type { Counterparty, Project, TicketPriority, TicketTag, TicketType } from '../types';

/* ══════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════ */

const PRIORITIES = [
  { value: 'low', label: 'Низкий', icon: <SignalLow className="w-4 h-4" />, color: 'emerald' },
  { value: 'medium', label: 'Средний', icon: <SignalMedium className="w-4 h-4" />, color: 'yellow' },
  { value: 'high', label: 'Высокий', icon: <SignalHigh className="w-4 h-4" />, color: 'orange' },
  { value: 'critical', label: 'Критический', icon: <Flame className="w-4 h-4" />, color: 'red' },
] as const;

const TYPES: { value: TicketType; label: string }[] = [
  { value: 'Инцидент', label: 'Инцидент' },
  { value: 'Запрос на услугу', label: 'Запрос на услугу' },
  { value: 'Консультация', label: 'Консультация' },
  { value: 'Жалоба', label: 'Жалоба' },
  { value: 'Задача', label: 'Задача' },
  { value: 'Проблема', label: 'Проблема' },
  { value: 'Запрос на изменение', label: 'Запрос на изменение' },
  { value: 'Улучшение', label: 'Улучшение' },
  { value: 'Прочее', label: 'Прочее' },
];

const PRESET_TAGS: TicketTag[] = [
  { name: 'Инцидент', color: '#dc2626' },
  { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' },
  { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#2563eb' },
  { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
];

const STAFF_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];

/* ══════════════════════════════════════════════
   Dropdown component
   ══════════════════════════════════════════════ */

interface DropdownOption {
  id: string;
  label: string;
  sub?: string;
}

function Dropdown({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  loading,
  icon,
  emptyText = 'Ничего не найдено',
  disabled = false,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  loading?: boolean;
  icon?: JSX.Element;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub && o.sub.toLowerCase().includes(q))
    );
  }, [options, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`
          w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all text-sm
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${open
            ? 'border-red-500/50 bg-[var(--bg-primary)] ring-2 ring-red-500/20'
            : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--text-primary)]/25 hover:bg-[var(--hover-1)]'
          }
          ${selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'}
        `}
      >
        {icon && (
          <span className="flex-shrink-0 text-[var(--text-primary)]/40">{icon}</span>
        )}
        <span className="flex-1 truncate">
          {selected ? selected.label : placeholder}
        </span>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/30 flex-shrink-0" />
        ) : (
          <ChevronDown
            className={`w-4 h-4 text-[var(--text-primary)]/30 transition-transform flex-shrink-0 ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {(searchPlaceholder || options.length > 5) && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/25" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder || 'Поиск...'}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--hover-1)] border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/30 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/30" />
                <span className="text-sm text-[var(--text-primary)]/40">Загрузка...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--text-primary)]/40">
                {emptyText}
              </div>
            ) : (
              filtered.map((option) => {
                const isSelected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors
                      ${isSelected
                        ? 'bg-red-500/10 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]'
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{option.label}</div>
                      {option.sub && (
                        <div className="text-xs text-[var(--text-primary)]/40 truncate mt-0.5">
                          {option.sub}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Clear selection */}
          {value && (
            <div className="border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full px-4 py-2 text-left text-xs text-[var(--text-primary)]/40 hover:bg-[var(--hover-1)] hover:text-red-400 transition-colors"
              >
                Очистить выбор
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════ */

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
}

interface SimpleUser {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
}

type BindType = 'none' | 'counterparty' | 'project';

interface DraftData {
  title: string;
  description: string;
  bindType: BindType;
  counterpartyId: string;
  projectId: string;
  reporterId: string;
  type: string;
  priority: string;
  tags: TicketTag[];
  savedAt: number;
}

/* ══════════════════════════════════════════════
   Helper: priority styling
   ══════════════════════════════════════════════ */

function getPriorityClasses(color: string, active: boolean) {
  const styles: Record<string, { idle: string; active: string }> = {
    emerald: {
      idle: 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]/50 hover:border-emerald-500/30 hover:text-emerald-400/70',
      active: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
    },
    yellow: {
      idle: 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]/50 hover:border-yellow-500/30 hover:text-yellow-400/70',
      active: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/20',
    },
    orange: {
      idle: 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]/50 hover:border-orange-500/30 hover:text-orange-400/70',
      active: 'border-orange-400/50 bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/20',
    },
    red: {
      idle: 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]/50 hover:border-red-500/30 hover:text-red-400/70',
      active: 'border-red-400/50 bg-red-500/15 text-red-300 ring-1 ring-red-400/20',
    },
  };
  const s = styles[color] || styles.yellow;
  return active ? s.active : s.idle;
}

/* ══════════════════════════════════════════════
   Section wrapper
   ══════════════════════════════════════════════ */

function Section({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/50 ${className}`}>
      <div className="px-4 py-2.5 border-b border-[var(--border-color)]">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]/50 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Page component
   ══════════════════════════════════════════════ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const currentUserId = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const preCounterpartyId = searchParams.get('counterparty_id') || '';
  const preProjectId = searchParams.get('project_id') || '';

  const isCustomer =
    user?.roles?.some((r: string) => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectBinding =
    (!isCustomer && user?.roles?.some((r: string) => STAFF_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const draftKey = currentUserId ? `ticket-draft:${currentUserId}` : 'ticket-draft';

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bindType, setBindType] = useState<BindType>('none');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [reporterId, setReporterId] = useState('');
  const [type, setType] = useState<TicketType>('Инцидент');
  const [priority, setPriority] = useState('medium');
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // ── Data state ──
  const [customerCounterparty, setCustomerCounterparty] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);

  // ── Loading state ──
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── UI state ──
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initDoneRef = useRef(false);
  const presetAppliedRef = useRef(false);

  // ── Derived ──
  const selectedCounterparty = counterparties.find((c) => c.id === counterpartyId) || null;
  const selectedProject = projects.find((p) => p.id === projectId) || null;

  const relatedCounterpartyId =
    selectedProject?.counterparty_id || counterpartyId || customerCounterparty?.id || '';

  const counterpartyName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const projectLabel = (p: Project) => `${p.key} — ${p.name}`;
  const userName = (u: SimpleUser) => u.full_name || u.username || u.email;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // ── Dropdown options ──
  const counterpartyOptions: DropdownOption[] = useMemo(
    () =>
      counterparties.map((c) => ({
        id: c.id,
        label: counterpartyName(c),
        sub: c.inn ? `ИНН ${c.inn}` : undefined,
      })),
    [counterparties]
  );

  const projectOptions: DropdownOption[] = useMemo(
    () => projects.map((p) => ({ id: p.id, label: projectLabel(p) })),
    [projects]
  );

  const userOptions: DropdownOption[] = useMemo(
    () => users.map((u) => ({ id: u.id, label: userName(u), sub: u.email })),
    [users]
  );

  const typeOptions: DropdownOption[] = useMemo(
    () => TYPES.map((t) => ({ id: t.value, label: t.label })),
    []
  );

  const clearError = (field: string) =>
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  /* ══════════════════════════════════════════════
     Draft: check on mount
     ══════════════════════════════════════════════ */

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    const raw = localStorage.getItem(draftKey);
    if (!raw) return;

    try {
      const data: DraftData = JSON.parse(raw);
      if (data.title || data.description || data.tags?.length) {
        setDraftData(data);
        setShowDraftBanner(true);
      }
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    setTitle(draftData.title || '');
    setDescription(draftData.description || '');
    setBindType(draftData.bindType || 'none');
    setCounterpartyId(draftData.counterpartyId || '');
    setProjectId(draftData.projectId || '');
    setReporterId(draftData.reporterId || '');
    setType((draftData.type as TicketType) || 'Инцидент');
    setPriority(draftData.priority || 'medium');
    setTags(draftData.tags || []);
    setSavedAt(draftData.savedAt);
    setShowDraftBanner(false);
    presetAppliedRef.current = true;
  }, [draftData]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  /* ══════════════════════════════════════════════
     Draft: auto-save
     ══════════════════════════════════════════════ */

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!title.trim() && !description.trim() && !tags.length) return;

      const draft: DraftData = {
        title,
        description,
        bindType,
        counterpartyId,
        projectId,
        reporterId,
        type,
        priority,
        tags,
        savedAt: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setSavedAt(Date.now());
    }, 800);

    return () => clearTimeout(timer);
  }, [draftKey, title, description, bindType, counterpartyId, projectId, reporterId, type, priority, tags]);

  // beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (title.trim() || description.trim()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [title, description]);

  /* ══════════════════════════════════════════════
     API: load data
     ══════════════════════════════════════════════ */

  // Customer counterparty
  useEffect(() => {
    if (!isCustomer || !user?.counterparty_id) return;

    counterpartiesApi
      .getById(user.counterparty_id)
      .then(setCustomerCounterparty)
      .catch((err) => console.error('Failed to load customer counterparty:', err));
  }, [isCustomer, user]);

  // Counterparties + projects for staff
  useEffect(() => {
    if (!canSelectBinding) return;

    const loadAll = async () => {
      setLoadingCounterparties(true);
      setLoadingProjects(true);

      try {
        const [cpResponse, projectResponse] = await Promise.all([
          counterpartiesApi.getAll(1, 200),
          projectsApi.getAll(1, 200),
        ]);

        console.log('Loaded counterparties:', cpResponse.items.length);
        console.log('Loaded projects:', projectResponse.items.length);

        setCounterparties(cpResponse.items);
        setProjects(projectResponse.items);
      } catch (err) {
        console.error('Failed to load counterparties/projects:', err);
      } finally {
        setLoadingCounterparties(false);
        setLoadingProjects(false);
      }
    };

    loadAll();
  }, [canSelectBinding]);

  // URL presets
  useEffect(() => {
    if (presetAppliedRef.current || !canSelectBinding) return;
    if (!counterparties.length && !projects.length) return;

    if (preProjectId) {
      const found = projects.find((p) => p.id === preProjectId);
      if (found) {
        setBindType('project');
        setProjectId(preProjectId);
        presetAppliedRef.current = true;
        return;
      }
    }

    if (preCounterpartyId) {
      const found = counterparties.find((c) => c.id === preCounterpartyId);
      if (found) {
        setBindType('counterparty');
        setCounterpartyId(preCounterpartyId);
        presetAppliedRef.current = true;
      }
    }
  }, [canSelectBinding, counterparties, projects, preCounterpartyId, preProjectId]);

  // Users for reporter selection
  useEffect(() => {
    if (!canSelectReporter || !relatedCounterpartyId) {
      setUsers([]);
      return;
    }

    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await usersApi.getCustomers(relatedCounterpartyId, 1, 100);
        const items: SimpleUser[] = response.items.map((u: any) => ({
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          email: u.email,
        }));

        const alreadyHasCurrentUser = items.some((u) => u.id === currentUserId);
        const currentUserAsOption: SimpleUser | null = currentUserId
          ? {
              id: currentUserId,
              username: (user as any)?.username || '',
              full_name: (user as any)?.full_name || null,
              email: (user as any)?.email || '',
            }
          : null;

        setUsers(
          alreadyHasCurrentUser || !currentUserAsOption
            ? items
            : [currentUserAsOption, ...items]
        );
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [canSelectReporter, relatedCounterpartyId, currentUserId, user]);

  // Reset reporter if users list changed
  useEffect(() => {
    if (reporterId && !users.some((u) => u.id === reporterId)) {
      setReporterId('');
    }
  }, [users, reporterId]);

  /* ══════════════════════════════════════════════
     Handlers
     ══════════════════════════════════════════════ */

  const handleBindTypeChange = (value: BindType) => {
    setBindType(value);
    if (value !== 'counterparty') setCounterpartyId('');
    if (value !== 'project') setProjectId('');
    setReporterId('');
    clearError('counterparty');
    clearError('project');
  };

  const toggleTag = (tag: TicketTag) => {
    setTags((prev) =>
      prev.some((t) => t.name === tag.name)
        ? prev.filter((t) => t.name !== tag.name)
        : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const value = newTagInput.trim();
    if (!value) return;
    if (tags.some((t) => t.name.toLowerCase() === value.toLowerCase())) {
      setNewTagInput('');
      return;
    }
    setTags((prev) => [...prev, { name: value, color: '#64748b' }]);
    setNewTagInput('');
  };

  const handleFileAdd = (fileList: File[]) => {
    const newFiles: AttachedFile[] = fileList.map((file) => ({
      id: `${file.name}_${Date.now()}_${Math.random()}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedFiles((prev) => [...prev, ...newFiles].slice(0, 10));
  };

  const handleFileRemove = (id: string) => {
    const found = attachedFiles.find((f) => f.id === id);
    if (found?.preview) URL.revokeObjectURL(found.preview);
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleAiSuggest = async () => {
    if (!title.trim() || !description.trim()) {
      if (!title.trim()) setErrors((p) => ({ ...p, title: 'Сначала укажите тему' }));
      if (!description.trim()) setErrors((p) => ({ ...p, description: 'Сначала опишите проблему' }));
      return;
    }

    setAiLoading(true);
    try {
      const result = await ticketsApi.predict(title.trim(), description.trim());
      if (result?.suggested_priority) setPriority(result.suggested_priority);
      if (result?.suggested_tags?.length) {
        setTags((prev) => {
          const map = new Map<string, TicketTag>();
          [...prev, ...result.suggested_tags].forEach((t) =>
            map.set(t.name.toLowerCase(), t)
          );
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('AI prediction failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!title.trim()) nextErrors.title = 'Укажите тему заявки';
    if (!description.trim()) nextErrors.description = 'Опишите проблему';

    if (canSelectBinding && bindType === 'counterparty' && !counterpartyId) {
      nextErrors.counterparty = 'Выберите компанию';
    }
    if (canSelectBinding && bindType === 'project' && !projectId) {
      nextErrors.project = 'Выберите проект';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        priority,
        type,
        tags: tags.map((t) => ({ name: t.name, color: t.color || '#64748b' })),
        reporter_id: reporterId || currentUserId,
      };

      if (isCustomer && customerCounterparty) {
        payload.counterparty_id = customerCounterparty.id;
      } else if (bindType === 'project' && projectId) {
        payload.project_id = projectId;
      } else if (bindType === 'counterparty' && counterpartyId) {
        payload.counterparty_id = counterpartyId;
      }

      const ticket = await ticketsApi.create(payload);

      // Upload files
      for (const item of attachedFiles) {
        try {
          await attachmentsApi.uploadAttachment(item.file, 'ticket', ticket.id);
        } catch (err) {
          console.error('File upload failed:', item.file.name, err);
        }
      }

      localStorage.removeItem(draftKey);
      navigate('/tickets');
    } catch (err: any) {
      console.error('Submit failed:', err?.response?.data || err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ══════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════ */

  return (
    <div className="h-[calc(100vh-var(--header-height,64px))] flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            К заявкам
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Новая заявка</h1>
        </div>

        <div className="flex items-center gap-4">
          {savedAt && (
            <span className="text-xs text-[var(--text-primary)]/35">
              Сохранено · {formatTime(savedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-red-900/25"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? 'Создаём...' : 'Создать заявку'}
          </button>
        </div>
      </div>

      {/* ── Draft banner ── */}
      {showDraftBanner && draftData && (
        <div className="flex-shrink-0 px-6 py-3 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <span className="text-sm font-medium text-amber-300">Найден черновик: </span>
              <span className="text-sm text-[var(--text-primary)]/60">
                «{draftData.title || 'без темы'}» · сохранён в {formatTime(draftData.savedAt)}
              </span>
            </div>
            <button
              type="button"
              onClick={restoreDraft}
              className="px-4 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-medium transition-colors"
            >
              Восстановить
            </button>
            <button
              type="button"
              onClick={dismissDraft}
              className="px-4 py-1.5 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 text-sm transition-colors"
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      {/* ── Errors ── */}
      {Object.keys(errors).length > 0 && (
        <div className="flex-shrink-0 px-6 py-2.5 bg-red-500/8 border-b border-red-500/20">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {Object.values(errors).map((error, idx) => (
              <span key={idx} className="text-sm text-red-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                {error}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Main area: two columns ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ═══ LEFT COLUMN: title + description + files ═══ */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl p-6 space-y-5">
            {/* Title */}
            <Section title="Тема заявки">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError('title');
                }}
                placeholder="Коротко опишите проблему"
                className={`w-full px-4 py-3 rounded-xl border bg-[var(--bg-primary)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/40 transition-all ${
                  errors.title
                    ? 'border-red-500/50 ring-1 ring-red-500/20'
                    : 'border-[var(--border-color)]'
                }`}
              />
            </Section>

            {/* Description */}
            <Section title="Описание проблемы">
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError('description');
                }}
                placeholder="Что произошло, как воспроизвести, когда началось, что ожидалось..."
                rows={10}
                className={`w-full px-4 py-3 rounded-xl border bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/40 transition-all resize-y min-h-[180px] ${
                  errors.description
                    ? 'border-red-500/50 ring-1 ring-red-500/20'
                    : 'border-[var(--border-color)]'
                }`}
              />
            </Section>

            {/* Files */}
            <Section title={`Вложения${attachedFiles.length ? ` (${attachedFiles.length})` : ''}`}>
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileAdd(Array.from(e.dataTransfer.files));
                }}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-dashed border-[var(--border-color)] hover:border-[var(--text-primary)]/25 bg-[var(--bg-primary)] transition-colors"
              >
                <Upload className="w-5 h-5 text-[var(--text-primary)]/25 flex-shrink-0" />
                <span className="flex-1 text-sm text-[var(--text-primary)]/40">
                  Перетащите файлы сюда или
                </span>
                <label className="px-4 py-2 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60 cursor-pointer transition-colors font-medium">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => handleFileAdd(Array.from(e.target.files || []))}
                    className="hidden"
                  />
                  Выбрать файлы
                </label>
              </div>

              {attachedFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {attachedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                    >
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[var(--hover-1)] flex items-center justify-center flex-shrink-0">
                          <File className="w-4 h-4 text-[var(--text-primary)]/30" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">
                          {f.file.name}
                        </div>
                        <div className="text-xs text-[var(--text-primary)]/40">
                          {formatFileSize(f.file.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileRemove(f.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-xs text-[var(--text-primary)]/30">
                До 10 файлов, максимум 25 МБ каждый
              </p>
            </Section>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: settings ═══ */}
        <div className="w-80 xl:w-96 flex-shrink-0 border-l border-[var(--border-color)] overflow-y-auto bg-[var(--bg-secondary)]/30">
          <div className="p-4 space-y-4">
            {/* Binding */}
            <Section title="Привязка">
              {isCustomer && customerCounterparty && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 mb-3">
                  <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text-primary)] font-medium truncate">
                      {customerCounterparty.name}
                    </div>
                    {customerCounterparty.inn && (
                      <div className="text-xs text-[var(--text-primary)]/40">
                        ИНН {customerCounterparty.inn}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {canSelectBinding && (
                <div className="space-y-3">
                  {/* Tabs */}
                  <div className="flex gap-1 p-1 rounded-xl bg-[var(--hover-1)]">
                    {(
                      [
                        { value: 'none' as BindType, label: 'Нет' },
                        { value: 'counterparty' as BindType, label: 'Компания' },
                        { value: 'project' as BindType, label: 'Проект' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleBindTypeChange(item.value)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all text-center ${
                          bindType === item.value
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Counterparty dropdown */}
                  {bindType === 'counterparty' && (
                    <div>
                      <label className="block text-sm text-[var(--text-primary)]/60 mb-1.5">
                        Компания
                      </label>
                      <Dropdown
                        options={counterpartyOptions}
                        value={counterpartyId}
                        onChange={(id) => {
                          setCounterpartyId(id);
                          clearError('counterparty');
                          setReporterId('');
                        }}
                        placeholder="Выберите компанию..."
                        searchPlaceholder="Название или ИНН..."
                        loading={loadingCounterparties}
                        icon={<Building2 className="w-4 h-4" />}
                        emptyText="Компании не найдены"
                      />
                      {loadingCounterparties && (
                        <p className="mt-1.5 text-xs text-[var(--text-primary)]/30">
                          Загружаем список компаний...
                        </p>
                      )}
                    </div>
                  )}

                  {/* Project dropdown */}
                  {bindType === 'project' && (
                    <div>
                      <label className="block text-sm text-[var(--text-primary)]/60 mb-1.5">
                        Проект
                      </label>
                      <Dropdown
                        options={projectOptions}
                        value={projectId}
                        onChange={(id) => {
                          setProjectId(id);
                          clearError('project');
                          setReporterId('');
                        }}
                        placeholder="Выберите проект..."
                        searchPlaceholder="Ключ или название..."
                        loading={loadingProjects}
                        icon={<FolderOpen className="w-4 h-4" />}
                        emptyText="Проекты не найдены"
                      />
                      {loadingProjects && (
                        <p className="mt-1.5 text-xs text-[var(--text-primary)]/30">
                          Загружаем проекты...
                        </p>
                      )}
                      {selectedProject && (
                        <p className="mt-1.5 text-xs text-[var(--text-primary)]/40">
                          Контрагент:{' '}
                          {counterparties.find((c) => c.id === selectedProject.counterparty_id)
                            ? counterpartyName(
                                counterparties.find(
                                  (c) => c.id === selectedProject.counterparty_id
                                ) as Counterparty
                              )
                            : '—'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Reporter */}
            {canSelectReporter && relatedCounterpartyId && (
              <Section title="Инициатор">
                <Dropdown
                  options={userOptions}
                  value={reporterId}
                  onChange={setReporterId}
                  placeholder="Я создаю заявку сам"
                  searchPlaceholder="Имя или email..."
                  loading={loadingUsers}
                  icon={<User className="w-4 h-4" />}
                  emptyText="Пользователи не найдены"
                />
                <p className="mt-1.5 text-xs text-[var(--text-primary)]/30">
                  Оставьте пустым, если создаёте заявку от своего имени
                </p>
              </Section>
            )}

            {/* Category */}
            <Section title="Категория">
              <Dropdown
                options={typeOptions}
                value={type}
                onChange={(v) => setType(v as TicketType)}
                placeholder="Тип заявки"
              />
            </Section>

            {/* Priority */}
            <Section title="Срочность">
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${getPriorityClasses(
                      p.color,
                      priority === p.value
                    )}`}
                  >
                    {p.icon}
                    {p.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* AI button */}
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-amber-500/8 border border-amber-500/20 text-amber-300/80 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 transition-colors font-medium"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              ИИ: подобрать приоритет и теги
            </button>

            {/* Tags */}
            <Section title="Теги">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESET_TAGS.map((tag) => {
                  const active = tags.some((t) => t.name === tag.name);
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? `${tag.color}20` : 'transparent',
                        borderColor: active ? `${tag.color}60` : 'var(--border-color)',
                        color: active ? tag.color : 'var(--text-primary)',
                        opacity: active ? 1 : 0.5,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="Свой тег..."
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none focus:border-red-500/30 focus:ring-1 focus:ring-red-500/20"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  disabled={!newTagInput.trim()}
                  className="px-3 py-2 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] disabled:opacity-25 transition-colors"
                >
                  <Plus className="w-4 h-4 text-[var(--text-primary)]/50" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
                      style={{
                        backgroundColor: `${tag.color || '#64748b'}18`,
                        borderColor: `${tag.color || '#64748b'}40`,
                        color: tag.color || '#94a3b8',
                      }}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => setTags((p) => p.filter((t) => t.name !== tag.name))}
                        className="hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}