import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  File,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  User,
  X,
} from 'lucide-react';
import { Flame, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type { Counterparty, Project, TicketPriority, TicketTag, TicketType } from '../types';

const PRIORITIES: {
  value: TicketPriority;
  label: string;
  icon: JSX.Element;
  className: string;
  activeClassName: string;
}[] = [
  {
    value: 'low' as TicketPriority,
    label: 'Низкий',
    icon: <SignalLow className="w-4 h-4" />,
    className: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    activeClassName: 'border-emerald-400 text-white bg-emerald-500/25 ring-1 ring-emerald-400/40',
  },
  {
    value: 'medium' as TicketPriority,
    label: 'Средний',
    icon: <SignalMedium className="w-4 h-4" />,
    className: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5',
    activeClassName: 'border-yellow-400 text-white bg-yellow-500/25 ring-1 ring-yellow-400/40',
  },
  {
    value: 'high' as TicketPriority,
    label: 'Высокий',
    icon: <SignalHigh className="w-4 h-4" />,
    className: 'border-orange-500/30 text-orange-400 bg-orange-500/5',
    activeClassName: 'border-orange-400 text-white bg-orange-500/25 ring-1 ring-orange-400/40',
  },
  {
    value: 'critical' as TicketPriority,
    label: 'Критический',
    icon: <Flame className="w-4 h-4" />,
    className: 'border-red-500/30 text-red-400 bg-red-500/5',
    activeClassName: 'border-red-400 text-white bg-red-500/25 ring-1 ring-red-400/40',
  },
];

const TICKET_TYPES: TicketType[] = [
  'Инцидент',
  'Запрос на услугу',
  'Консультация',
  'Жалоба',
  'Задача',
  'Проблема',
  'Запрос на изменение',
  'Улучшение',
  'Прочее',
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

interface GeneralFile {
  id: string;
  file: File;
  preview?: string;
}

interface SimpleUser {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  role?: string;
}

type SelectionType = 'none' | 'counterparty' | 'project';

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const currentUserId = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const preselectedCounterpartyId = searchParams.get('counterparty_id') || '';
  const preselectedProjectId = searchParams.get('project_id') || '';

  const isCustomer =
    user?.roles?.some((r: string) => r === 'customer' || r === 'customer_admin') ?? false;

  const canSelectCounterparty =
    (!isCustomer &&
      user?.roles?.some((r: string) => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ??
    false;

  const canSelectReporter = !isCustomer;

  const draftKey = currentUserId ? `new-ticket-draft:${currentUserId}` : 'new-ticket-draft';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [selectionType, setSelectionType] = useState<SelectionType>('none');
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedReporterId, setSelectedReporterId] = useState('');

  const [type, setType] = useState<TicketType>('Инцидент');
  const [priority, setPriority] = useState<TicketPriority>('medium' as TicketPriority);
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  const [generalFiles, setGeneralFiles] = useState<GeneralFile[]>([]);

  const [customerCounterparty, setCustomerCounterparty] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);

  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const restoredDraftRef = useRef(false);
  const appliedPresetRef = useRef(false);

  const selectedCounterparty =
    counterparties.find((item) => item.id === selectedCounterpartyId) || null;

  const selectedProject = projects.find((item) => item.id === selectedProjectId) || null;

  const selectedReporter = users.find((item) => item.id === selectedReporterId) || null;

  const relatedCounterpartyId =
    selectedProject?.counterparty_id || selectedCounterpartyId || customerCounterparty?.id || '';

  const isDirty = useMemo(() => {
    return Boolean(
      title.trim() ||
        description.trim() ||
        selectedCounterpartyId ||
        selectedProjectId ||
        selectedReporterId ||
        tags.length ||
        generalFiles.length ||
        selectionType !== 'none' ||
        type !== 'Инцидент' ||
        priority !== 'medium'
    );
  }, [
    title,
    description,
    selectedCounterpartyId,
    selectedProjectId,
    selectedReporterId,
    tags,
    generalFiles,
    selectionType,
    type,
    priority,
  ]);

  const filteredCounterparties = useMemo(() => {
    const q = counterpartyFilter.trim().toLowerCase();
    if (!q) return counterparties;
    return counterparties.filter((cp) => {
      const name = `${cp.name || ''} ${cp.legal_name || ''} ${cp.inn || ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [counterparties, counterpartyFilter]);

  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const name = `${p.key || ''} ${p.name || ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [projects, projectFilter]);

  const cpName = (cp: Counterparty) => cp.name || cp.legal_name || cp.inn || '—';
  const projectName = (project: Project) => `${project.key} — ${project.name}`;
  const userName = (item: SimpleUser) => item.full_name || item.username || item.email;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatSavedTime = (value: number | null) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const mergeTags = (incoming: TicketTag[]) => {
    setTags((prev) => {
      const map = new Map<string, TicketTag>();

      [...prev, ...incoming].forEach((tag) => {
        const name = tag.name?.trim();
        if (!name) return;
        map.set(name.toLowerCase(), {
          name,
          color: tag.color || '#64748b',
        });
      });

      return Array.from(map.values());
    });
  };

  const removeTag = (name: string) => {
    setTags((prev) => prev.filter((tag) => tag.name !== name));
  };

  const addCustomTag = () => {
    const value = newTagInput.trim();
    if (!value) return;
    if (tags.some((tag) => tag.name.toLowerCase() === value.toLowerCase())) {
      setNewTagInput('');
      return;
    }

    setTags((prev) => [...prev, { name: value, color: '#64748b' }]);
    setNewTagInput('');
  };

  const togglePresetTag = (tag: TicketTag) => {
    const exists = tags.some((item) => item.name === tag.name);
    if (exists) {
      removeTag(tag.name);
      return;
    }
    mergeTags([tag]);
  };

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    if (!isCustomer || !user?.counterparty_id) return;

    const loadCustomerCounterparty = async () => {
      try {
        const cp = await counterpartiesApi.getById(user.counterparty_id);
        setCustomerCounterparty(cp);
      } catch (e) {
        console.error('Failed to load customer counterparty', e);
      }
    };

    loadCustomerCounterparty();
  }, [isCustomer, user]);

  useEffect(() => {
    if (!canSelectCounterparty) return;

    const loadData = async () => {
      setLoadingCounterparties(true);
      setLoadingProjects(true);

      try {
        const [cpResponse, projectResponse] = await Promise.all([
          counterpartiesApi.getAll(1, 200),
          projectsApi.getAll(1, 200),
        ]);

        setCounterparties(cpResponse.items);
        setProjects(projectResponse.items);
      } catch (e) {
        console.error('Failed to load form data', e);
      } finally {
        setLoadingCounterparties(false);
        setLoadingProjects(false);
      }
    };

    loadData();
  }, [canSelectCounterparty]);

  useEffect(() => {
    if (!canSelectReporter || !relatedCounterpartyId) {
      setUsers([]);
      return;
    }

    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await usersApi.getCustomers(relatedCounterpartyId, 1, 100);
        const items: SimpleUser[] = response.items.map((item: any) => ({
          id: item.id,
          username: item.username,
          full_name: item.full_name,
          email: item.email,
          role: item.role,
        }));

        const alreadyHasCurrentUser = items.some((item) => item.id === currentUserId);

        const currentUserItem: SimpleUser | null = currentUserId
          ? {
              id: currentUserId,
              username: (user as any)?.username || '',
              full_name: (user as any)?.full_name || null,
              email: (user as any)?.email || '',
              role: (user as any)?.role,
            }
          : null;

        setUsers(
          alreadyHasCurrentUser || !currentUserItem ? items : [currentUserItem, ...items]
        );
      } catch (e) {
        console.error('Failed to load users', e);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [canSelectReporter, relatedCounterpartyId, currentUserId, user]);

  useEffect(() => {
    if (selectedReporterId && !users.some((u) => u.id === selectedReporterId)) {
      setSelectedReporterId('');
    }
  }, [users, selectedReporterId]);

  useEffect(() => {
    if (restoredDraftRef.current) return;
    restoredDraftRef.current = true;

    const raw = localStorage.getItem(draftKey);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      const shouldRestore = window.confirm(
        'Найден черновик заявки. Восстановить?'
      );

      if (!shouldRestore) return;

      setTitle(draft.title || '');
      setDescription(draft.description || '');
      setSelectionType(draft.selectionType || 'none');
      setSelectedCounterpartyId(draft.selectedCounterpartyId || '');
      setSelectedProjectId(draft.selectedProjectId || '');
      setSelectedReporterId(draft.selectedReporterId || '');
      setType(draft.type || 'Инцидент');
      setPriority(draft.priority || 'medium');
      setTags(draft.tags || []);
      setCounterpartyFilter(draft.counterpartyFilter || '');
      setProjectFilter(draft.projectFilter || '');
      setDraftSavedAt(draft.updatedAt || null);

      appliedPresetRef.current = true;
    } catch (e) {
      console.error('Draft restore failed', e);
    }
  }, [draftKey]);

  useEffect(() => {
    if (appliedPresetRef.current) return;
    if (!canSelectCounterparty) return;
    if (!counterparties.length && !projects.length) return;

    if (preselectedProjectId) {
      setSelectionType('project');
      setSelectedProjectId(preselectedProjectId);
      appliedPresetRef.current = true;
      return;
    }

    if (preselectedCounterpartyId) {
      setSelectionType('counterparty');
      setSelectedCounterpartyId(preselectedCounterpartyId);
      appliedPresetRef.current = true;
    }
  }, [
    canSelectCounterparty,
    counterparties.length,
    projects.length,
    preselectedCounterpartyId,
    preselectedProjectId,
  ]);

  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      const draft = {
        title,
        description,
        selectionType,
        selectedCounterpartyId,
        selectedProjectId,
        selectedReporterId,
        type,
        priority,
        tags,
        counterpartyFilter,
        projectFilter,
        updatedAt: Date.now(),
      };

      localStorage.setItem(draftKey, JSON.stringify(draft));
      setDraftSavedAt(Date.now());
    }, 600);

    return () => clearTimeout(timer);
  }, [
    isDirty,
    draftKey,
    title,
    description,
    selectionType,
    selectedCounterpartyId,
    selectedProjectId,
    selectedReporterId,
    type,
    priority,
    tags,
    counterpartyFilter,
    projectFilter,
  ]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const handleSelectionTypeChange = (value: SelectionType) => {
    setSelectionType(value);
    clearFieldError('counterparty');
    clearFieldError('project');

    if (value !== 'counterparty') {
      setSelectedCounterpartyId('');
      setCounterpartyFilter('');
    }

    if (value !== 'project') {
      setSelectedProjectId('');
      setProjectFilter('');
    }

    setSelectedReporterId('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const nextFiles: GeneralFile[] = files.map((file) => ({
      id: `${file.name}_${Date.now()}_${Math.random()}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setGeneralFiles((prev) => [...prev, ...nextFiles].slice(0, 10));
    e.target.value = '';
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    const nextFiles: GeneralFile[] = files.map((file) => ({
      id: `${file.name}_${Date.now()}_${Math.random()}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setGeneralFiles((prev) => [...prev, ...nextFiles].slice(0, 10));
  };

  const removeFile = (id: string) => {
    const found = generalFiles.find((item) => item.id === id);
    if (found?.preview) URL.revokeObjectURL(found.preview);

    setGeneralFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!title.trim()) nextErrors.title = 'Укажите тему заявки';
    if (!description.trim()) nextErrors.description = 'Опишите проблему';

    if (canSelectCounterparty && selectionType === 'counterparty' && !selectedCounterpartyId) {
      nextErrors.counterparty = 'Выберите компанию';
    }

    if (canSelectCounterparty && selectionType === 'project' && !selectedProjectId) {
      nextErrors.project = 'Выберите проект';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleAiSuggest = async () => {
    if (!title.trim() || !description.trim()) {
      const nextErrors: Record<string, string> = {};
      if (!title.trim()) nextErrors.title = 'Сначала укажите тему';
      if (!description.trim()) nextErrors.description = 'Сначала заполните описание';
      setErrors((prev) => ({ ...prev, ...nextErrors }));
      return;
    }

    setAiLoading(true);
    try {
      const response = await ticketsApi.predict(title.trim(), description.trim());

      if (response?.suggested_priority) {
        setPriority(response.suggested_priority);
      }

      if (Array.isArray(response?.suggested_tags)) {
        mergeTags(response.suggested_tags);
      }
    } catch (e) {
      console.error('AI prediction failed', e);
    } finally {
      setAiLoading(false);
    }
  };

  const clearDraftAndForm = () => {
    const ok = window.confirm('Очистить форму и удалить черновик?');
    if (!ok) return;

    generalFiles.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });

    setTitle('');
    setDescription('');
    setSelectionType('none');
    setSelectedCounterpartyId('');
    setSelectedProjectId('');
    setSelectedReporterId('');
    setType('Инцидент');
    setPriority('medium' as TicketPriority);
    setTags([]);
    setNewTagInput('');
    setGeneralFiles([]);
    setCounterpartyFilter('');
    setProjectFilter('');
    setErrors({});
    setDraftSavedAt(null);
    localStorage.removeItem(draftKey);
  };

  const handleExit = () => {
    if (isDirty) {
      const ok = window.confirm('Выйти к списку заявок? Черновик останется сохранён.');
      if (!ok) return;
    }
    navigate('/tickets');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validate()) return;

    setSubmitting(true);

    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        priority,
        type,
        tags: tags.map((tag) => ({
          name: tag.name,
          color: tag.color || '#64748b',
        })),
        reporter_id: selectedReporterId || currentUserId,
      };

      if (isCustomer && customerCounterparty) {
        payload.counterparty_id = customerCounterparty.id;
      } else if (selectionType === 'project' && selectedProjectId) {
        payload.project_id = selectedProjectId;
      } else if (selectionType === 'counterparty' && selectedCounterpartyId) {
        payload.counterparty_id = selectedCounterpartyId;
      }

      const ticket = await ticketsApi.create(payload);

      for (const item of generalFiles) {
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

  return (
    <div className="max-w-5xl mx-auto pb-32">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>К списку заявок</span>
          </button>

          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Новая заявка</h1>
            <p className="text-sm text-[var(--text-primary)]/60">
              Только самое важное: тема, описание и вложения
            </p>
          </div>
        </div>

        <div className="text-sm text-[var(--text-primary)]/50">
          {draftSavedAt ? (
            <>Черновик сохранён в {formatSavedTime(draftSavedAt)}</>
          ) : (
            <>Черновик пока не сохранён</>
          )}
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="glass-card p-4 mb-6 border border-red-500/30 bg-red-500/10">
          <div className="flex items-start gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 text-sm">
              {Object.values(errors).map((error, index) => (
                <div key={`${error}_${index}`}>{error}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="glass-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Что случилось
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Коротко: что случилось <span className="text-red-400">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearFieldError('title');
                }}
                placeholder="Например: не работает выгрузка отчёта"
                className={`input-field w-full ${
                  errors.title ? 'border-red-500 ring-1 ring-red-500/40' : ''
                }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Опишите проблему <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={8}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearFieldError('description');
                }}
                placeholder="Что произошло, где это проявляется, когда началось, как повторить проблему..."
                className={`input-field w-full resize-y min-h-[180px] ${
                  errors.description ? 'border-red-500 ring-1 ring-red-500/40' : ''
                }`}
              />
              <p className="mt-2 text-xs text-[var(--text-primary)]/40">
                Скриншоты и документы лучше добавить отдельными файлами ниже.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-sm font-medium text-[var(--text-primary)]">
                  Вложения
                </label>

                <button
                  type="button"
                  onClick={handleAiSuggest}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 hover:bg-yellow-500/15 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Подсказать приоритет и теги
                </button>
              </div>

              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border border-dashed border-[var(--border-color)] rounded-xl p-5 bg-[var(--hover-1)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Upload className="w-5 h-5 text-[var(--text-primary)]/40 mt-0.5" />
                    <div>
                      <div className="text-sm text-[var(--text-primary)]">
                        Перетащите файлы сюда или выберите вручную
                      </div>
                      <div className="text-xs text-[var(--text-primary)]/40 mt-1">
                        До 10 файлов. Файлы в черновике не сохраняются.
                      </div>
                    </div>
                  </div>

                  <label className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium cursor-pointer transition-colors">
                    <input type="file" multiple onChange={handleFileSelect} className="hidden" />
                    Выбрать файлы
                  </label>
                </div>

                {generalFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {generalFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                      >
                        {item.preview ? (
                          <img
                            src={item.preview}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[var(--hover-2)] flex items-center justify-center">
                            <File className="w-4 h-4 text-[var(--text-primary)]/40" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-[var(--text-primary)] truncate">
                            {item.file.name}
                          </div>
                          <div className="text-xs text-[var(--text-primary)]/40">
                            {formatFileSize(item.file.size)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          className="p-1 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            К чему относится заявка
          </h2>

          <div className="space-y-4">
            {isCustomer && customerCounterparty && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Building2 className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {customerCounterparty.name}
                  </div>
                  {customerCounterparty.inn && (
                    <div className="text-xs text-[var(--text-primary)]/40">
                      ИНН: {customerCounterparty.inn}
                    </div>
                  )}
                </div>
              </div>
            )}

            {canSelectCounterparty && (
              <>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Привязка
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectionTypeChange('none')}
                      className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                        selectionType === 'none'
                          ? 'border-white bg-[var(--hover-2)] text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      Без привязки
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectionTypeChange('counterparty')}
                      className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                        selectionType === 'counterparty'
                          ? 'border-blue-400 bg-blue-500/15 text-white'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      К компании
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectionTypeChange('project')}
                      className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                        selectionType === 'project'
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      К проекту
                    </button>
                  </div>
                </div>

                {selectionType === 'counterparty' && (
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        Компания
                      </label>
                      <input
                        value={counterpartyFilter}
                        onChange={(e) => setCounterpartyFilter(e.target.value)}
                        placeholder="Поиск компании"
                        className="input-field w-full"
                      />
                    </div>

                    <div>
                      <select
                        value={selectedCounterpartyId}
                        onChange={(e) => {
                          setSelectedCounterpartyId(e.target.value);
                          clearFieldError('counterparty');
                          setSelectedReporterId('');
                        }}
                        className={`input-field w-full ${
                          errors.counterparty ? 'border-red-500 ring-1 ring-red-500/40' : ''
                        }`}
                      >
                        <option value="">Выберите компанию</option>
                        {filteredCounterparties.map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cpName(cp)}
                          </option>
                        ))}
                      </select>

                      {loadingCounterparties && (
                        <div className="mt-2 text-xs text-[var(--text-primary)]/40">
                          Загружаем компании...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectionType === 'project' && (
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        Проект
                      </label>
                      <input
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        placeholder="Поиск проекта"
                        className="input-field w-full"
                      />
                    </div>

                    <div>
                      <select
                        value={selectedProjectId}
                        onChange={(e) => {
                          setSelectedProjectId(e.target.value);
                          clearFieldError('project');
                          setSelectedReporterId('');
                        }}
                        className={`input-field w-full ${
                          errors.project ? 'border-red-500 ring-1 ring-red-500/40' : ''
                        }`}
                      >
                        <option value="">Выберите проект</option>
                        {filteredProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {projectName(project)}
                          </option>
                        ))}
                      </select>

                      {loadingProjects && (
                        <div className="mt-2 text-xs text-[var(--text-primary)]/40">
                          Загружаем проекты...
                        </div>
                      )}

                      {selectedProject && (
                        <div className="mt-2 text-xs text-[var(--text-primary)]/50">
                          Контрагент проекта:{' '}
                          {counterparties.find((cp) => cp.id === selectedProject.counterparty_id)
                            ? cpName(
                                counterparties.find(
                                  (cp) => cp.id === selectedProject.counterparty_id
                                ) as Counterparty
                              )
                            : '—'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {canSelectReporter && relatedCounterpartyId && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Кто сообщает о проблеме
                </label>
                <select
                  value={selectedReporterId}
                  onChange={(e) => setSelectedReporterId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Я создаю заявку сам</option>
                  {users.map((item) => (
                    <option key={item.id} value={item.id}>
                      {userName(item)} {item.email ? `— ${item.email}` : ''}
                    </option>
                  ))}
                </select>

                {loadingUsers && (
                  <div className="mt-2 text-xs text-[var(--text-primary)]/40">
                    Загружаем пользователей...
                  </div>
                )}
              </div>
            )}

            {!relatedCounterpartyId && canSelectReporter && canSelectCounterparty && (
              <div className="text-xs text-[var(--text-primary)]/40">
                Инициатора можно выбрать после выбора компании или проекта.
              </div>
            )}
          </div>
        </section>

        <section className="glass-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Параметры
          </h2>

          <div className="grid gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Категория
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TicketType)}
                className="input-field w-full"
              >
                {TICKET_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Насколько срочно
              </label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((item) => {
                  const active = priority === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPriority(item.value)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all ${
                        active ? item.activeClassName : item.className
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Теги
              </label>

              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_TAGS.map((tag) => {
                  const active = tags.some((item) => item.name === tag.name);

                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => togglePresetTag(tag)}
                      className="px-3 py-2 rounded-xl border text-sm transition-colors"
                      style={{
                        backgroundColor: active ? `${tag.color}22` : 'transparent',
                        borderColor: active ? `${tag.color}80` : 'var(--border-color)',
                        color: active ? tag.color : 'var(--text-primary)',
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
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                  placeholder="Свой тег"
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  disabled={!newTagInput.trim()}
                  className="px-4 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.name}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
                      style={{
                        backgroundColor: `${tag.color || '#64748b'}22`,
                        borderColor: `${tag.color || '#64748b'}66`,
                        color: tag.color || '#cbd5e1',
                      }}
                    >
                      {tag.name}
                      <button type="button" onClick={() => removeTag(tag.name)}>
                        <X className="w-4 h-4 opacity-70 hover:opacity-100" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="glass-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            Что будет отправлено
          </h2>

          <div className="grid gap-3 text-sm">
            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Тема:</span>{' '}
              <span className="text-[var(--text-primary)]">{title || '—'}</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Категория:</span>{' '}
              <span className="text-[var(--text-primary)]">{type}</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Приоритет:</span>{' '}
              <span className="text-[var(--text-primary)]">
                {PRIORITIES.find((p) => p.value === priority)?.label || priority}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Привязка:</span>{' '}
              <span className="text-[var(--text-primary)]">
                {selectionType === 'project' && selectedProject
                  ? projectName(selectedProject)
                  : selectionType === 'counterparty' && selectedCounterparty
                  ? cpName(selectedCounterparty)
                  : isCustomer && customerCounterparty
                  ? cpName(customerCounterparty)
                  : 'Без привязки'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Инициатор:</span>{' '}
              <span className="text-[var(--text-primary)]">
                {selectedReporter
                  ? userName(selectedReporter)
                  : (user as any)?.full_name || (user as any)?.email || 'Вы'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--hover-1)]">
              <span className="text-[var(--text-primary)]/50">Вложений:</span>{' '}
              <span className="text-[var(--text-primary)]">{generalFiles.length}</span>
            </div>
          </div>
        </section>

        <div className="fixed left-0 right-0 bottom-0 z-40 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[var(--text-primary)]/50">
              {draftSavedAt ? (
                <>Черновик сохранён в {formatSavedTime(draftSavedAt)}.</>
              ) : (
                <>Черновик будет сохранён автоматически.</>
              )}{' '}
              Файлы при закрытии страницы нужно выбрать заново.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearDraftAndForm}
                className="px-4 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm"
              >
                Очистить
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Создаём заявку...' : 'Создать заявку'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}