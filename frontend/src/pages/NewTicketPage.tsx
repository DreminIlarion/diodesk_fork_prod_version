import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  File,
  FileText,
  Flame,
  FolderOpen,
  HelpCircle,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import {
  counterpartiesApi,
  projectsApi,
  ticketsApi,
  usersApi,
} from '../api/client';
import { attachmentsApi } from '../api/attachments';

import type {
  Counterparty,
  Project,
  TicketPriority,
  TicketTag,
  TicketType,
} from '../types';

import { SpellCheckField } from '../components/helpers/SpellCheckField';
import { renderInlineFormatting } from '../components/helpers/TicketDescriptionContent';
import {
  TicketEditor,
  serializeBlocks,
  type DescriptionBlock,
} from '../components/helpers/TicketEditor';

// ============================================================================
// Constants
// ============================================================================

const AI_TIMEOUT_MS = 5000;
const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const PRIORITIES = [
  {
    value: 'low',
    label: 'Низкий',
    desc: 'Плановый порядок',
    icon: SignalLow,
    color: 'text-emerald-400',
    selected:
      'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/20',
  },
  {
    value: 'medium',
    label: 'Средний',
    desc: 'Стандартный',
    icon: SignalMedium,
    color: 'text-yellow-400',
    selected:
      'border-yellow-500/50 bg-yellow-500/10 ring-1 ring-yellow-500/20',
  },
  {
    value: 'high',
    label: 'Высокий',
    desc: 'Требует внимания',
    icon: SignalHigh,
    color: 'text-orange-400',
    selected:
      'border-orange-500/50 bg-orange-500/10 ring-1 ring-orange-500/20',
  },
  {
    value: 'critical',
    label: 'Критический',
    desc: 'Немедленно',
    icon: Flame,
    color: 'text-red-400',
    selected:
      'border-red-500/50 bg-red-500/10 ring-1 ring-red-500/20',
  },
];

const TICKET_TYPES = [
  {
    value: 'Инцидент',
    label: 'Инцидент',
    desc: 'Сбой или ошибка',
    icon: AlertTriangle,
    color: 'text-red-400',
  },
  {
    value: 'Запрос на услугу',
    label: 'Запрос на услугу',
    desc: 'Стандартная услуга',
    icon: CheckCircle,
    color: 'text-blue-400',
  },
  {
    value: 'Консультация',
    label: 'Консультация',
    desc: 'Вопрос или консультация',
    icon: HelpCircle,
    color: 'text-zinc-400',
  },
  {
    value: 'Жалоба',
    label: 'Жалоба',
    desc: 'Жалоба клиента',
    icon: AlertTriangle,
    color: 'text-orange-400',
  },
  {
    value: 'Задача',
    label: 'Задача',
    desc: 'Планируемая работа',
    icon: CheckCircle,
    color: 'text-emerald-400',
  },
  {
    value: 'Проблема',
    label: 'Проблема',
    desc: 'Поиск корневой причины',
    icon: AlertTriangle,
    color: 'text-yellow-400',
  },
  {
    value: 'Запрос на изменение',
    label: 'Запрос на изменение',
    desc: 'Изменение системы',
    icon: Edit3,
    color: 'text-blue-400',
  },
  {
    value: 'Улучшение',
    label: 'Улучшение',
    desc: 'Предложение по улучшению',
    icon: Sparkles,
    color: 'text-emerald-400',
  },
  {
    value: 'Прочее',
    label: 'Прочее',
    desc: 'Другая категория',
    icon: MessageSquare,
    color: 'text-zinc-400',
  },
];

const PRESET_TAGS = [
  { name: 'Инцидент', color: '#dc2626' },
  { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' },
  { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#2563eb' },
  { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
];

const CAN_SELECT_COUNTERPARTY_ROLES = [
  'admin',
  'support_agent',
  'support_manager',
  'executor',
];

type SelectionType = 'project' | 'counterparty' | null;

interface GeneralFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface SimpleUser {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  role?: string;
}

interface DraftData {
  step: number;
  title: string;
  descriptionBlocks: DescriptionBlock[];
  priority: TicketPriority;
  type: TicketType;
  tags: TicketTag[];

  selectionType: SelectionType;

  selectedCounterpartyId: string | null;
  selectedCounterpartyName: string | null;

  selectedProjectId: string | null;
  selectedProjectName: string | null;

  selectedReporterId: string | null;
  selectedReporterName: string | null;

  counterpartySearch: string;
  projectSearch: string;
  reporterSearch: string;

  savedAt: number;
  userId: string;
}

// ============================================================================
// Draft
// ============================================================================

function getDraftKey(userId: string | undefined) {
  return userId
    ? `new_ticket_draft:${userId}`
    : 'new_ticket_draft:anonymous';
}

function saveDraft(data: DraftData, key: string) {
  try {
    const descriptionBlocks = data.descriptionBlocks.map((block) => {
      if (block.type === 'image') {
        return {
          id: block.id,
          type: 'image' as const,
          value: block.value,
        };
      }

      return { ...block };
    });

    localStorage.setItem(
      key,
      JSON.stringify({
        ...data,
        descriptionBlocks,
      }),
    );
  } catch {
    // localStorage может быть недоступен
  }
}

function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) return null;

    const data = JSON.parse(raw) as DraftData;

    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

// ============================================================================
// Small UI
// ============================================================================

function SearchInput({
  value,
  onChange,
  onFocus,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
  loading?: boolean;
}) {
  return (
    <div
      className="
        flex min-h-[46px] w-full items-center gap-3 rounded-xl
        border border-[var(--border-color)]
        bg-[var(--hover-1)]
        px-3
        transition
        focus-within:border-[var(--accent)]
        focus-within:ring-2 focus-within:ring-[var(--accent)]/10
      "
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-primary)]/40" />
      ) : (
        <Search className="h-4 w-4 shrink-0 text-[var(--text-primary)]/40" />
      )}

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="
          min-w-0 flex-1 bg-transparent py-3
          text-sm text-[var(--text-primary)]
          outline-none
          placeholder:text-[var(--text-primary)]/30
        "
      />

      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-primary)]/30" />
    </div>
  );
}

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-2">
      <label className="text-sm font-medium text-[var(--text-primary)]">
        {children}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>

      {hint && (
        <span className="text-xs text-[var(--text-primary)]/40">
          {hint}
        </span>
      )}
    </div>
  );
}

function Dropdown({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        absolute left-0 right-0 top-full z-50 mt-2
        max-h-72 overflow-y-auto rounded-xl
        border border-[var(--border-color)]
        bg-[var(--bg-primary)]
        p-1.5 shadow-2xl
      "
    >
      {children}
    </div>
  );
}

function DropdownEmpty({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-6 text-center text-sm text-[var(--text-primary)]/40">
      {children}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const pageRef = useRef<HTMLDivElement>(null);

  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');

  const currentUserId = user?.id ?? user?.user_id;
  const draftKey = getDraftKey(currentUserId);

  const draft = useRef(loadDraft(draftKey));

  // ==========================================================================
  // Main state
  // ==========================================================================

  const [step, setStep] = useState(draft.current?.step || 1);

  const [title, setTitle] = useState(draft.current?.title || '');

  const [descriptionBlocks, setDescriptionBlocks] = useState<
    DescriptionBlock[]
  >(
    draft.current?.descriptionBlocks?.length
      ? draft.current.descriptionBlocks
      : [{ id: 'init', type: 'text', value: '' }],
  );

  const description = serializeBlocks(descriptionBlocks);

  const [priority, setPriority] = useState<TicketPriority>(
    draft.current?.priority || 'medium',
  );

  const [type, setType] = useState<TicketType>(
    draft.current?.type || 'Инцидент',
  );

  const [tags, setTags] = useState<TicketTag[]>(
    draft.current?.tags || [],
  );

  const [generalFiles, setGeneralFiles] = useState<GeneralFile[]>([]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(Boolean(draft.current));

  // ==========================================================================
  // Binding
  // ==========================================================================

  const [customerCounterparty, setCustomerCounterparty] =
    useState<Counterparty | null>(null);

  const [selectionType, setSelectionType] = useState<SelectionType>(
    draft.current?.selectionType ?? null,
  );

  const [selectedCounterparty, setSelectedCounterparty] =
    useState<Counterparty | null>(null);

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);

  const [counterpartySearch, setCounterpartySearch] = useState(
    draft.current?.counterpartySearch || '',
  );

  const [showCounterpartyDropdown, setShowCounterpartyDropdown] =
    useState(false);

  const [loadingCounterparties, setLoadingCounterparties] =
    useState(false);

  const [projects, setProjects] = useState<Project[]>([]);

  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);

  const [projectSearch, setProjectSearch] = useState(
    draft.current?.projectSearch || '',
  );

  const [showProjectDropdown, setShowProjectDropdown] =
    useState(false);

  const [loadingProjects, setLoadingProjects] = useState(false);

  // ==========================================================================
  // Reporter
  // ==========================================================================

  const [users, setUsers] = useState<SimpleUser[]>([]);

  const [selectedReporter, setSelectedReporter] =
    useState<SimpleUser | null>(null);

  const [reporterSearch, setReporterSearch] = useState(
    draft.current?.reporterSearch || '',
  );

  const [showReporterDropdown, setShowReporterDropdown] =
    useState(false);

  const [loadingUsers, setLoadingUsers] = useState(false);

  // ==========================================================================
  // AI
  // ==========================================================================

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTimedOut, setAiTimedOut] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<TicketTag[]>([]);

  const aiDoneRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  const titleRef = useRef(title);
  const descriptionRef = useRef(description);

  titleRef.current = title;
  descriptionRef.current = description;

  // ==========================================================================
  // Misc
  // ==========================================================================

  const [newTagInput, setNewTagInput] = useState('');
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);

  const isCustomer =
    user?.roles?.some(
      (role) => role === 'customer' || role === 'customer_admin',
    ) ?? false;

  const canSelectCounterparty =
    (!isCustomer &&
      user?.roles?.some((role) =>
        CAN_SELECT_COUNTERPARTY_ROLES.includes(role),
      )) ??
    false;

  const canSelectReporter = !isCustomer;

  const hasDescription = descriptionBlocks.some(
    (block) =>
      (block.type === 'text' && block.value.trim().length > 0) ||
      (block.type === 'image' && block.localFile),
  );

  // ==========================================================================
  // User switch
  // ==========================================================================

  const prevUserIdRef = useRef<string | undefined>(currentUserId);

  useEffect(() => {
    if (
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== currentUserId
    ) {
      clearDraft(getDraftKey(prevUserIdRef.current));

      draft.current = null;

      setHasDraft(false);
      setStep(1);
      setTitle('');
      setDescriptionBlocks([
        { id: 'init', type: 'text', value: '' },
      ]);
      setPriority('medium');
      setType('Инцидент');
      setTags([]);
      setGeneralFiles([]);

      setSelectionType(null);
      setSelectedCounterparty(null);
      setSelectedProject(null);
      setSelectedReporter(null);

      setCounterpartySearch('');
      setProjectSearch('');
      setReporterSearch('');

      setAiSuggestion(null);
      setAiSuggestedTags([]);
      setAiTimedOut(false);

      aiDoneRef.current = false;
    }

    prevUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // ==========================================================================
  // Draft autosave
  // ==========================================================================

  const draftSaveTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      if (!currentUserId) return;

      saveDraft(
        {
          step,
          title,
          descriptionBlocks,
          priority,
          type,
          tags,

          selectionType,

          selectedCounterpartyId:
            selectedCounterparty?.id || null,

          selectedCounterpartyName: selectedCounterparty
            ? selectedCounterparty.name ||
            selectedCounterparty.legal_name ||
            ''
            : null,

          selectedProjectId: selectedProject?.id || null,

          selectedProjectName: selectedProject
            ? `${selectedProject.key} - ${selectedProject.name}`
            : null,

          selectedReporterId: selectedReporter?.id || null,

          selectedReporterName: selectedReporter
            ? selectedReporter.full_name ||
            selectedReporter.username
            : null,

          counterpartySearch,
          projectSearch,
          reporterSearch,

          savedAt: Date.now(),
          userId: currentUserId,
        },
        draftKey,
      );

      setHasDraft(true);
    }, 500);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [
    step,
    title,
    descriptionBlocks,
    priority,
    type,
    tags,
    selectionType,
    selectedCounterparty,
    selectedProject,
    selectedReporter,
    counterpartySearch,
    projectSearch,
    reporterSearch,
    draftKey,
    currentUserId,
  ]);

  // ==========================================================================
  // Restore draft binding
  // ==========================================================================

  useEffect(() => {
    if (!draft.current || !canSelectCounterparty) return;

    const data = draft.current;

    const restore = async () => {
      if (
        data.selectionType === 'counterparty' &&
        data.selectedCounterpartyId
      ) {
        try {
          const cp = await counterpartiesApi.getById(
            data.selectedCounterpartyId,
          );

          setSelectedCounterparty(cp);
          setCounterpartySearch(
            cp.name || cp.legal_name || '',
          );
        } catch {
          // ignore deleted counterparty
        }
      }

      if (
        data.selectionType === 'project' &&
        data.selectedProjectId
      ) {
        try {
          const response = await projectsApi.getAll(1, 100);
          const items = response.items;

          setProjects(items);

          const found = items.find(
            (project) => project.id === data.selectedProjectId,
          );

          if (found) {
            setSelectedProject(found);
            setProjectSearch(`${found.key} - ${found.name}`);

            if (found.counterparty_id) {
              try {
                const cp = await counterpartiesApi.getById(
                  found.counterparty_id,
                );

                setSelectedCounterparty(cp);
                setCounterpartySearch(
                  cp.name || cp.legal_name || '',
                );
              } catch {
                // noop
              }
            }
          }
        } catch {
          // noop
        }
      }

      if (data.selectedReporterId) {
        // Репортёр восстановится после загрузки списка пользователей.
        setReporterSearch(data.selectedReporterName || '');
      }

      draft.current = null;
    };

    restore();
  }, [canSelectCounterparty]);

  // ==========================================================================
  // Dropdown outside click
  // ==========================================================================

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        counterpartyDropdownRef.current &&
        !counterpartyDropdownRef.current.contains(target)
      ) {
        setShowCounterpartyDropdown(false);
      }

      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(target)
      ) {
        setShowProjectDropdown(false);
      }

      if (
        reporterDropdownRef.current &&
        !reporterDropdownRef.current.contains(target)
      ) {
        setShowReporterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // ==========================================================================
  // Scroll
  // ==========================================================================

  useEffect(() => {
    pageRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [step]);

  // ==========================================================================
  // Load initial data
  // ==========================================================================

  useEffect(() => {
    if (isCustomer && user?.counterparty_id) {
      loadCustomerCounterparty();
    }
  }, [isCustomer, user?.counterparty_id]);

  useEffect(() => {
    if (canSelectCounterparty) {
      loadCounterparties();
    }
  }, [canSelectCounterparty]);

  useEffect(() => {
    if (
      selectionType === 'counterparty' &&
      selectedCounterparty
    ) {
      loadProjects(selectedCounterparty.id);
      return;
    }

    if (selectionType === 'project') {
      loadProjectsForAll();
      return;
    }

    setProjects([]);
  }, [selectionType, selectedCounterparty?.id]);

  useEffect(() => {
    const cpId =
      selectedCounterparty?.id ||
      selectedProject?.counterparty_id;

    if (cpId) {
      loadUsers(cpId);
      return;
    }

    setUsers([]);
    setSelectedReporter(null);
    setReporterSearch('');
  }, [
    selectedCounterparty?.id,
    selectedProject?.counterparty_id,
  ]);

  // ==========================================================================
  // URL preselected project
  // ==========================================================================

  useEffect(() => {
    if (!preselectedProjectId || !canSelectCounterparty) return;

    const run = async () => {
      setSelectionType('project');
      setLoadingProjects(true);

      try {
        const response = await projectsApi.getAll(1, 100);
        const items = response.items;

        setProjects(items);

        const found = items.find(
          (project) => project.id === preselectedProjectId,
        );

        if (!found) return;

        setSelectedProject(found);
        setProjectSearch(`${found.key} - ${found.name}`);

        if (found.counterparty_id) {
          try {
            const cp = await counterpartiesApi.getById(
              found.counterparty_id,
            );

            setSelectedCounterparty(cp);
            setCounterpartySearch(
              cp.name || cp.legal_name || '',
            );
          } catch {
            // noop
          }
        }
      } catch (error) {
        console.error(
          'Failed to auto-select project:',
          error,
        );
      } finally {
        setLoadingProjects(false);
      }
    };

    run();
  }, [preselectedProjectId, canSelectCounterparty]);

  // ==========================================================================
  // AI
  // ==========================================================================

  useEffect(() => {
    if (step !== 2) {
      if (step === 1) {
        aiDoneRef.current = false;

        aiAbortRef.current?.abort();
        aiAbortRef.current = null;

        setAiTimedOut(false);
      }

      return;
    }

    if (aiDoneRef.current) return;

    const currentTitle = titleRef.current.trim();
    const currentDescription = descriptionRef.current.trim();

    if (!currentTitle || !currentDescription) return;

    aiAbortRef.current?.abort();

    const controller = new AbortController();
    aiAbortRef.current = controller;

    aiDoneRef.current = true;

    setAiLoading(true);
    setAiSuggestion(null);
    setAiTimedOut(false);

    const timeoutId = setTimeout(() => {
      if (controller.signal.aborted) return;

      setAiTimedOut(true);
      setAiLoading(false);
    }, AI_TIMEOUT_MS);

    ticketsApi
      .predict(currentTitle, currentDescription)
      .then((result) => {
        clearTimeout(timeoutId);

        if (controller.signal.aborted) return;

        setAiSuggestion(result);
        setAiSuggestedTags(result.suggested_tags || []);

        if (result.suggested_priority) {
          setPriority(result.suggested_priority);
        }

        setTags(result.suggested_tags || []);

        setAiLoading(false);
        setAiTimedOut(false);
      })
      .catch((error) => {
        clearTimeout(timeoutId);

        if (controller.signal.aborted) return;

        console.error('AI prediction failed:', error);

        setAiLoading(false);
        setAiTimedOut(true);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [step]);

  // ==========================================================================
  // API loaders
  // ==========================================================================

  async function loadCustomerCounterparty() {
    if (!user?.counterparty_id) return;

    try {
      const cp = await counterpartiesApi.getById(
        user.counterparty_id,
      );

      setCustomerCounterparty(cp);
    } catch {
      // noop
    }
  }

  async function loadCounterparties(search?: string) {
    setLoadingCounterparties(true);

    try {
      let items = (
        await counterpartiesApi.getAll(1, 50)
      ).items;

      if (search) {
        const query = search.toLowerCase();

        items = items.filter(
          (cp) =>
            cp.name?.toLowerCase().includes(query) ||
            cp.legal_name?.toLowerCase().includes(query) ||
            cp.inn?.includes(search),
        );
      }

      setCounterparties(items);

      if (
        !search &&
        preselectedCounterpartyId &&
        !selectedCounterparty
      ) {
        const found = items.find(
          (cp) => cp.id === preselectedCounterpartyId,
        );

        if (found) {
          setSelectionType('counterparty');
          setSelectedCounterparty(found);
          setCounterpartySearch(cpName(found));
        }
      }
    } catch {
      // noop
    } finally {
      setLoadingCounterparties(false);
    }
  }

  async function loadProjects(cpId: string) {
    setLoadingProjects(true);

    try {
      const response = await projectsApi.getByCounterparty(
        cpId,
        1,
        50,
      );

      setProjects(response.items);
    } catch {
      // noop
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadProjectsForAll(): Promise<Project[]> {
    setLoadingProjects(true);

    try {
      const response = await projectsApi.getAll(1, 100);

      setProjects(response.items);

      return response.items;
    } catch {
      return [];
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadUsers(cpId: string) {
    setLoadingUsers(true);

    try {
      const response = await usersApi.getCustomers(
        cpId,
        1,
        100,
      );

      const customerUsers: SimpleUser[] =
        response.items.map((customer) => ({
          id: customer.id,
          username: customer.username,
          full_name: customer.full_name,
          email: customer.email,
          role: customer.role,
        }));

      let all = [...customerUsers];

      const ownId = user?.id ?? user?.user_id;

      if (
        ownId &&
        !customerUsers.some((item) => item.id === ownId)
      ) {
        all = [
          {
            id: ownId,
            username: user?.username || '',
            full_name: user?.full_name || null,
            email: user?.email || '',
            role: user?.role,
          },
          ...all,
        ];
      }

      setUsers(all);

      // Не сбрасываем выбранного инициатора, если он ещё существует.
      setSelectedReporter((current) => {
        if (!current) return null;

        return (
          all.find((item) => item.id === current.id) || null
        );
      });
    } catch {
      // noop
    } finally {
      setLoadingUsers(false);
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  const cpName = (cp: Counterparty) =>
    cp.name || cp.legal_name || cp.inn || 'Без названия';

  const prjName = (project: Project) =>
    `${project.key} — ${project.name}`;

  const uName = (item: SimpleUser) =>
    item.full_name || item.username || item.email;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // ==========================================================================
  // Selection handlers
  // ==========================================================================

  const handleSelectionTypeChange = (next: SelectionType) => {
    setSelectionType(next);

    setSelectedCounterparty(null);
    setSelectedProject(null);
    setSelectedReporter(null);

    setCounterpartySearch('');
    setProjectSearch('');
    setReporterSearch('');

    setProjects([]);
    setUsers([]);

    setValidationErrors((current) =>
      current.filter(
        (error) =>
          error !== 'Выберите контрагента' &&
          error !== 'Выберите проект',
      ),
    );
  };

  const selectCounterparty = (cp: Counterparty) => {
    setSelectedCounterparty(cp);
    setCounterpartySearch(cpName(cp));
    setShowCounterpartyDropdown(false);

    setValidationErrors((current) =>
      current.filter(
        (error) => error !== 'Выберите контрагента',
      ),
    );
  };

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setProjectSearch(prjName(project));
    setShowProjectDropdown(false);

    setValidationErrors((current) =>
      current.filter(
        (error) => error !== 'Выберите проект',
      ),
    );

    if (project.counterparty_id) {
      try {
        const cp = await counterpartiesApi.getById(
          project.counterparty_id,
        );

        setSelectedCounterparty(cp);
        setCounterpartySearch(cpName(cp));
      } catch {
        // noop
      }
    }
  };

  // ==========================================================================
  // Tags
  // ==========================================================================

  const togglePresetTag = (tag: TicketTag) => {
    setTags((current) => {
      const exists = current.some(
        (item) => item.name === tag.name,
      );

      if (exists) {
        return current.filter(
          (item) => item.name !== tag.name,
        );
      }

      return [...current, tag];
    });
  };

  const addCustomTag = () => {
    const name = newTagInput.trim();

    if (!name) return;

    if (
      tags.some(
        (tag) =>
          tag.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return;
    }

    setTags((current) => [
      ...current,
      {
        name,
        color: '#a1a1aa',
      },
    ]);

    setNewTagInput('');
    setShowCustomTagInput(false);
  };

  const removeTag = (name: string) => {
    setTags((current) =>
      current.filter((tag) => tag.name !== name),
    );
  };

  // ==========================================================================
  // Validation / navigation
  // ==========================================================================

  const validateStep1 = () => {
    const errors: string[] = [];

    if (!title.trim()) {
      errors.push('Укажите тему заявки');
    }

    if (!hasDescription) {
      errors.push('Добавьте описание заявки');
    }

    if (
      canSelectCounterparty &&
      selectionType === 'counterparty' &&
      !selectedCounterparty
    ) {
      errors.push('Выберите контрагента');
    }

    if (
      canSelectCounterparty &&
      selectionType === 'project' &&
      !selectedProject
    ) {
      errors.push('Выберите проект');
    }

    setValidationErrors(errors);

    return errors.length === 0;
  };

  const goToNextStep = () => {
    if (step === 1 && !validateStep1()) return;

    setValidationErrors([]);

    setStep((current) => Math.min(3, current + 1));
  };

  const goToPreviousStep = () => {
    setValidationErrors([]);

    setStep((current) => Math.max(1, current - 1));
  };

  const goToTickets = () => {
    navigate('/tickets');
  };

  useEffect(() => {
    if (validationErrors.length === 0) return;

    setValidationErrors((current) =>
      current.filter((error) => {
        if (
          error === 'Укажите тему заявки' &&
          title.trim()
        ) {
          return false;
        }

        if (
          error === 'Добавьте описание заявки' &&
          hasDescription
        ) {
          return false;
        }

        if (
          error === 'Выберите контрагента' &&
          selectedCounterparty
        ) {
          return false;
        }

        if (
          error === 'Выберите проект' &&
          selectedProject
        ) {
          return false;
        }

        return true;
      }),
    );
  }, [
    title,
    descriptionBlocks,
    selectedCounterparty,
    selectedProject,
  ]);

  // ==========================================================================
  // Files
  // ==========================================================================

  const appendFiles = (files: File[]) => {
    const available = Math.max(
      0,
      MAX_FILES - generalFiles.length,
    );

    const accepted = files
      .filter((file) => file.size <= MAX_FILE_SIZE)
      .slice(0, available);

    const mapped: GeneralFile[] = accepted.map(
      (file) => ({
        id: `${file.name}_${Date.now()}_${Math.random()}`,
        file,
        preview: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
        status: 'pending',
      }),
    );

    setGeneralFiles((current) => [
      ...current,
      ...mapped,
    ]);
  };

  const handleGeneralFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    appendFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleGeneralDrop = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    appendFiles(Array.from(event.dataTransfer.files));
  };

  const removeGeneralFile = (id: string) => {
    const found = generalFiles.find(
      (file) => file.id === id,
    );

    if (found?.preview) {
      URL.revokeObjectURL(found.preview);
    }

    setGeneralFiles((current) =>
      current.filter((file) => file.id !== id),
    );
  };

  // ==========================================================================
  // Draft reset
  // ==========================================================================

  const handleClearDraft = () => {
    clearDraft(draftKey);

    setHasDraft(false);

    setStep(1);
    setTitle('');
    setDescriptionBlocks([
      { id: 'init', type: 'text', value: '' },
    ]);

    setPriority('medium');
    setType('Инцидент');
    setTags([]);
    setGeneralFiles([]);

    setSelectionType(null);

    setSelectedCounterparty(null);
    setSelectedProject(null);
    setSelectedReporter(null);

    setCounterpartySearch('');
    setProjectSearch('');
    setReporterSearch('');

    setAiSuggestion(null);
    setAiSuggestedTags([]);
    setAiTimedOut(false);

    aiDoneRef.current = false;
  };

  // ==========================================================================
  // Submit
  // ==========================================================================

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);

    try {
      const textOnlyDescription = descriptionBlocks
        .filter(
          (
            block,
          ): block is Extract<
            DescriptionBlock,
            { type: 'text' }
          > => block.type === 'text',
        )
        .map((block) => block.value.trim())
        .filter(Boolean)
        .join('\n\n');

      const data: any = {
        title: title.trim(),
        description:
          textOnlyDescription ||
          '(описание с изображениями)',
        priority,
        type,
        tags: tags.map((tag) => ({
          name: tag.name,
          color: tag.color || '#64748b',
        })),
        reporter_id: currentUserId,
      };

      if (isCustomer && customerCounterparty) {
        data.counterparty_id =
          customerCounterparty.id;
      } else if (selectedProject) {
        data.project_id = selectedProject.id;
      } else if (selectedCounterparty) {
        data.counterparty_id =
          selectedCounterparty.id;
      }

      if (
        canSelectReporter &&
        selectedReporter
      ) {
        data.reporter_id = selectedReporter.id;
      }

      const ticket = await ticketsApi.create(data);

      const imageBlocks = descriptionBlocks.filter(
        (
          block,
        ): block is Extract<
          DescriptionBlock,
          { type: 'image' }
        > =>
          block.type === 'image' &&
          Boolean(block.localFile),
      );

      const uploadMap: Record<string, string> = {};

      for (const block of imageBlocks) {
        try {
          const attachment =
            await attachmentsApi.uploadAttachment(
              block.localFile!,
              'ticket',
              ticket.id,
            );

          uploadMap[block.id] = attachment.id;
        } catch (error) {
          console.error(
            'Image upload failed:',
            block.id,
            error,
          );
        }
      }

      if (imageBlocks.length > 0) {
        let finalDescription =
          serializeBlocks(descriptionBlocks);

        for (const [
          blockId,
          attachmentId,
        ] of Object.entries(uploadMap)) {
          finalDescription =
            finalDescription.replaceAll(
              `![image](local:${blockId})`,
              `![image](media://${attachmentId})`,
            );
        }

        finalDescription = finalDescription.replace(
          /!\[image\]\(local:[a-f0-9-]+\)\n*/gi,
          '',
        );

        await ticketsApi.update(ticket.id, {
          description: finalDescription,
        });
      }

      for (const file of generalFiles.filter(
        (item) => item.status === 'pending',
      )) {
        try {
          await attachmentsApi.uploadAttachment(
            file.file,
            'ticket',
            ticket.id,
          );
        } catch (error) {
          console.error(
            'File upload failed:',
            file.file.name,
            error,
          );
        }
      }

      clearDraft(draftKey);
      setHasDraft(false);

      navigate('/tickets');
    } catch (error: any) {
      console.error(
        'Submit failed:',
        error?.response?.data || error,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================================================
  // Derived
  // ==========================================================================

  const filteredProjects = projects.filter(
    (project) => {
      if (!projectSearch) return true;

      const query = projectSearch.toLowerCase();

      return (
        project.name.toLowerCase().includes(query) ||
        project.key.toLowerCase().includes(query)
      );
    },
  );

  const filteredUsers = users.filter((item) => {
    if (!reporterSearch) return true;

    const query = reporterSearch.toLowerCase();

    return (
      item.full_name
        ?.toLowerCase()
        .includes(query) ||
      item.username
        ?.toLowerCase()
        .includes(query) ||
      item.email
        .toLowerCase()
        .includes(query)
    );
  });

  const currentPriority = PRIORITIES.find(
    (item) => item.value === priority,
  );

  const currentType = TICKET_TYPES.find(
    (item) => item.value === type,
  );

  const nextButtonDisabled =
    step === 1 &&
    (!title.trim() ||
      !hasDescription ||
      (selectionType === 'counterparty' &&
        !selectedCounterparty) ||
      (selectionType === 'project' &&
        !selectedProject));

  const backButtonLabel =
    step === 2
      ? 'Назад к описанию'
      : 'Назад к классификации';

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div
      ref={pageRef}
      className="mx-auto max-w-5xl px-4 pb-14"
    >
      {/* ================================================================== */}
      {/* Header */}
      {/* ================================================================== */}

      <header className="mb-7 pt-1">
        <button
          type="button"
          onClick={goToTickets}
          className="
            mb-5 inline-flex items-center gap-2
            text-sm font-medium
            text-[var(--text-primary)]/55
            transition-colors
            hover:text-[var(--text-primary)]
          "
        >
          <ArrowLeft className="h-4 w-4" />
          К списку заявок
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">
              Создание заявки
            </h1>

            <p className="mt-1 text-sm text-[var(--text-primary)]/45">
              Заполните информацию — перед отправкой
              заявку можно будет проверить.
            </p>
          </div>

          {hasDraft && (
            <button
              type="button"
              onClick={handleClearDraft}
              className="
                inline-flex shrink-0 items-center gap-2 self-start
                rounded-lg px-3 py-2
                text-xs font-medium
                text-[var(--text-primary)]/45
                transition-colors
                hover:bg-red-500/10 hover:text-red-400
                sm:self-auto
              "
            >
              <Trash2 className="h-4 w-4" />
              Очистить черновик
            </button>
          )}
        </div>
      </header>

      {/* ================================================================== */}
      {/* Stepper */}
      {/* ================================================================== */}

      <div
        className="
          mb-6 grid grid-cols-3 overflow-hidden rounded-xl
          border border-[var(--border-color)]
          bg-[var(--hover-1)]
        "
      >
        {[
          {
            num: 1,
            label: 'Описание',
            short: 'Данные заявки',
          },
          {
            num: 2,
            label: 'Классификация',
            short: 'Тип и приоритет',
          },
          {
            num: 3,
            label: 'Проверка',
            short: 'Перед отправкой',
          },
        ].map((item) => {
          const active = step === item.num;
          const done = step > item.num;

          return (
            <button
              key={item.num}
              type="button"
              disabled={item.num > step}
              onClick={() => {
                if (item.num < step) {
                  setStep(item.num);
                }
              }}
              className={`
                relative flex items-center gap-3 px-3 py-3.5
                text-left transition-colors
                sm:px-5
                ${active
                  ? 'bg-[var(--hover-2)]'
                  : done
                    ? 'cursor-pointer hover:bg-[var(--hover-2)]/70'
                    : 'cursor-default opacity-45'
                }
              `}
            >
              <span
                className={`
                  flex h-7 w-7 shrink-0 items-center justify-center
                  rounded-full text-xs font-semibold
                  ${active
                    ? 'bg-[var(--accent)] text-white'
                    : done
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-[var(--hover-2)] text-[var(--text-primary)]/50'
                  }
                `}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  item.num
                )}
              </span>

              <span className="min-w-0">
                <span
                  className={`
                    block truncate text-sm font-medium
                    ${active
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/65'
                    }
                  `}
                >
                  {item.label}
                </span>

                <span className="hidden truncate text-xs text-[var(--text-primary)]/35 sm:block">
                  {item.short}
                </span>
              </span>

              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* Restored draft */}
      {/* ================================================================== */}

      {hasDraft && step === 1 && title && (
        <div
          className="
            mb-5 flex items-center gap-3 rounded-xl
            border border-blue-500/20
            bg-blue-500/[0.07]
            px-4 py-3
          "
        >
          <Clock className="h-4 w-4 shrink-0 text-blue-400" />

          <p className="text-sm text-[var(--text-primary)]/65">
            Восстановлен сохранённый черновик.
          </p>
        </div>
      )}

      {/* ================================================================== */}
      {/* Main card */}
      {/* ================================================================== */}

      <main
        className="
          overflow-visible rounded-2xl
          border border-[var(--border-color)]
          bg-[var(--bg-secondary)]
          shadow-sm
        "
      >
        <div className="p-5 sm:p-7 md:p-8">
          {/* ============================================================== */}
          {/* Step 1 */}
          {/* ============================================================== */}

          {step === 1 && (
            <div className="space-y-8">
              <section>
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Основная информация
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-primary)]/45">
                    Укажите, к чему относится заявка, тему
                    и подробное описание.
                  </p>
                </div>

                {validationErrors.length > 0 && (
                  <div
                    className="
                      mb-6 rounded-xl
                      border border-red-500/25
                      bg-red-500/[0.07]
                      p-4
                    "
                  >
                    <div className="flex gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />

                      <div>
                        <p className="text-sm font-medium text-red-300">
                          Проверьте заполнение формы
                        </p>

                        <ul className="mt-1.5 space-y-1">
                          {validationErrors.map(
                            (error) => (
                              <li
                                key={error}
                                className="text-sm text-red-300/75"
                              >
                                {error}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* ======================================================== */}
                {/* Binding */}
                {/* ======================================================== */}

                {canSelectCounterparty && (
                  <div
                    className="
                      mb-7 rounded-2xl
                      border border-[var(--border-color)]
                      bg-[var(--hover-1)]/60
                      p-4 sm:p-5
                    "
                  >
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Привязка заявки
                      </h3>

                      <p className="mt-1 text-xs text-[var(--text-primary)]/40">
                        Выберите проект, контрагента или
                        оставьте заявку без привязки.
                      </p>
                    </div>

                    <div
                      className="
                        mb-5 grid grid-cols-3 gap-1
                        rounded-xl
                        bg-[var(--hover-2)]
                        p-1
                      "
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(
                            'project',
                          )
                        }
                        className={`
                          flex min-h-[42px] items-center justify-center gap-2
                          rounded-lg px-2
                          text-xs font-medium
                          transition-all sm:text-sm
                          ${selectionType === 'project'
                            ? 'bg-[var(--bg-primary)] text-amber-400 shadow-sm'
                            : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0" />

                        <span className="truncate">
                          Проект
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(
                            'counterparty',
                          )
                        }
                        className={`
                          flex min-h-[42px] items-center justify-center gap-2
                          rounded-lg px-2
                          text-xs font-medium
                          transition-all sm:text-sm
                          ${selectionType ===
                            'counterparty'
                            ? 'bg-[var(--bg-primary)] text-blue-400 shadow-sm'
                            : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        <Building2 className="h-4 w-4 shrink-0" />

                        <span className="truncate">
                          Контрагент
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(null)
                        }
                        className={`
                          flex min-h-[42px] items-center justify-center gap-2
                          rounded-lg px-2
                          text-xs font-medium
                          transition-all sm:text-sm
                          ${selectionType === null
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        <X className="h-4 w-4 shrink-0" />

                        <span className="truncate">
                          Без привязки
                        </span>
                      </button>
                    </div>

                    {/* Project */}

                    {selectionType === 'project' && (
                      <div>
                        <FieldLabel required>
                          Проект
                        </FieldLabel>

                        <div
                          ref={projectDropdownRef}
                          className="relative"
                        >
                          <SearchInput
                            value={projectSearch}
                            loading={loadingProjects}
                            placeholder="Название или код проекта"
                            onChange={(value) => {
                              setProjectSearch(value);

                              if (selectedProject) {
                                setSelectedProject(null);
                              }

                              setShowProjectDropdown(true);
                            }}
                            onFocus={() => {
                              setShowProjectDropdown(true);

                              if (!projects.length) {
                                loadProjectsForAll();
                              }
                            }}
                          />

                          {showProjectDropdown && (
                            <Dropdown>
                              {loadingProjects ? (
                                <DropdownEmpty>
                                  Загружаем проекты...
                                </DropdownEmpty>
                              ) : filteredProjects.length ===
                                0 ? (
                                <DropdownEmpty>
                                  Проекты не найдены
                                </DropdownEmpty>
                              ) : (
                                filteredProjects.map(
                                  (project) => (
                                    <button
                                      key={project.id}
                                      type="button"
                                      onClick={() =>
                                        selectProject(
                                          project,
                                        )
                                      }
                                      className="
                                        flex w-full items-center gap-3
                                        rounded-lg px-3 py-2.5
                                        text-left
                                        transition-colors
                                        hover:bg-[var(--hover-2)]
                                      "
                                    >
                                      <span
                                        className="
                                          flex h-9 w-9 shrink-0 items-center justify-center
                                          rounded-lg bg-amber-500/10
                                        "
                                      >
                                        <FolderOpen className="h-4 w-4 text-amber-400" />
                                      </span>

                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                                          {
                                            project.name
                                          }
                                        </span>

                                        <span className="block truncate text-xs text-[var(--text-primary)]/40">
                                          {
                                            project.key
                                          }
                                        </span>
                                      </span>

                                      {selectedProject?.id ===
                                        project.id && (
                                          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                                        )}
                                    </button>
                                  ),
                                )
                              )}
                            </Dropdown>
                          )}
                        </div>

                        {selectedProject && (
                          <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
                            <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                {selectedProject.name}
                              </p>

                              <p className="text-xs text-[var(--text-primary)]/40">
                                {selectedProject.key}
                              </p>
                            </div>

                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Counterparty */}

                    {selectionType ===
                      'counterparty' && (
                        <div>
                          <FieldLabel required>
                            Контрагент
                          </FieldLabel>

                          <div
                            ref={
                              counterpartyDropdownRef
                            }
                            className="relative"
                          >
                            <SearchInput
                              value={
                                counterpartySearch
                              }
                              loading={
                                loadingCounterparties
                              }
                              placeholder="Название, ИНН или юр. название"
                              onChange={(value) => {
                                setCounterpartySearch(
                                  value,
                                );

                                if (
                                  selectedCounterparty
                                ) {
                                  setSelectedCounterparty(
                                    null,
                                  );
                                }

                                setShowCounterpartyDropdown(
                                  true,
                                );

                                loadCounterparties(value);
                              }}
                              onFocus={() => {
                                setShowCounterpartyDropdown(
                                  true,
                                );

                                if (
                                  !counterparties.length
                                ) {
                                  loadCounterparties();
                                }
                              }}
                            />

                            {showCounterpartyDropdown && (
                              <Dropdown>
                                {loadingCounterparties ? (
                                  <DropdownEmpty>
                                    Загружаем
                                    контрагентов...
                                  </DropdownEmpty>
                                ) : counterparties.length ===
                                  0 ? (
                                  <DropdownEmpty>
                                    Контрагенты не найдены
                                  </DropdownEmpty>
                                ) : (
                                  counterparties.map(
                                    (cp) => (
                                      <button
                                        key={cp.id}
                                        type="button"
                                        onClick={() =>
                                          selectCounterparty(
                                            cp,
                                          )
                                        }
                                        className="
                                        flex w-full items-center gap-3
                                        rounded-lg px-3 py-2.5
                                        text-left transition-colors
                                        hover:bg-[var(--hover-2)]
                                      "
                                      >
                                        <span
                                          className="
                                          flex h-9 w-9 shrink-0 items-center justify-center
                                          rounded-lg bg-blue-500/10
                                        "
                                        >
                                          <Building2 className="h-4 w-4 text-blue-400" />
                                        </span>

                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                                            {cpName(cp)}
                                          </span>

                                          {cp.inn && (
                                            <span className="block truncate text-xs text-[var(--text-primary)]/40">
                                              ИНН {cp.inn}
                                            </span>
                                          )}
                                        </span>

                                        {selectedCounterparty?.id ===
                                          cp.id && (
                                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                                          )}
                                      </button>
                                    ),
                                  )
                                )}
                              </Dropdown>
                            )}
                          </div>

                          {selectedCounterparty && (
                            <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2.5">
                              <Building2 className="h-4 w-4 shrink-0 text-blue-400" />

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                  {cpName(
                                    selectedCounterparty,
                                  )}
                                </p>

                                {selectedCounterparty.inn && (
                                  <p className="text-xs text-[var(--text-primary)]/40">
                                    ИНН{' '}
                                    {
                                      selectedCounterparty.inn
                                    }
                                  </p>
                                )}
                              </div>

                              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                            </div>
                          )}
                        </div>
                      )}

                    {selectionType === null && (
                      <div className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)]/40 px-4 py-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-primary)]/40" />

                        <p className="text-sm text-[var(--text-primary)]/50">
                          Заявка будет создана без
                          привязки к проекту или
                          контрагенту.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer binding */}

                {isCustomer &&
                  customerCounterparty && (
                    <div className="mb-7 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                        <Building2 className="h-5 w-5 text-blue-400" />
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {cpName(
                            customerCounterparty,
                          )}
                        </p>

                        <p className="text-xs text-[var(--text-primary)]/40">
                          Ваша организация
                          {customerCounterparty.inn
                            ? ` · ИНН ${customerCounterparty.inn}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  )}

                {/* Reporter */}

                {canSelectReporter &&
                  (selectedCounterparty ||
                    selectedProject) && (
                    <div
                      className="
                        mb-7 rounded-2xl
                        border border-[var(--border-color)]
                        p-4 sm:p-5
                      "
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                          <User className="h-4 w-4 text-emerald-400" />
                        </span>

                        <div>
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            Инициатор
                          </h3>

                          <p className="text-xs text-[var(--text-primary)]/40">
                            Если не выбирать — заявка
                            будет создана от вашего имени.
                          </p>
                        </div>
                      </div>

                      <div
                        ref={reporterDropdownRef}
                        className="relative"
                      >
                        <SearchInput
                          value={reporterSearch}
                          loading={loadingUsers}
                          placeholder="Найти пользователя"
                          onChange={(value) => {
                            setReporterSearch(value);

                            if (selectedReporter) {
                              setSelectedReporter(null);
                            }

                            setShowReporterDropdown(
                              true,
                            );
                          }}
                          onFocus={() =>
                            setShowReporterDropdown(
                              true,
                            )
                          }
                        />

                        {showReporterDropdown && (
                          <Dropdown>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReporter(
                                  null,
                                );
                                setReporterSearch('');
                                setShowReporterDropdown(
                                  false,
                                );
                              }}
                              className="
                                flex w-full items-center gap-3
                                rounded-lg px-3 py-2.5
                                text-left transition-colors
                                hover:bg-[var(--hover-2)]
                              "
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                                <User className="h-4 w-4 text-emerald-400" />
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                                  {user?.full_name ||
                                    user?.username ||
                                    'Вы'}
                                </span>

                                <span className="block truncate text-xs text-[var(--text-primary)]/40">
                                  Текущий пользователь
                                </span>
                              </span>

                              {!selectedReporter && (
                                <Check className="h-4 w-4 text-emerald-400" />
                              )}
                            </button>

                            {loadingUsers ? (
                              <DropdownEmpty>
                                Загружаем
                                пользователей...
                              </DropdownEmpty>
                            ) : filteredUsers.length ===
                              0 ? (
                              <DropdownEmpty>
                                Пользователи не найдены
                              </DropdownEmpty>
                            ) : (
                              filteredUsers.map(
                                (item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedReporter(
                                        item,
                                      );
                                      setReporterSearch(
                                        uName(item),
                                      );
                                      setShowReporterDropdown(
                                        false,
                                      );
                                    }}
                                    className="
                                      flex w-full items-center gap-3
                                      rounded-lg px-3 py-2.5
                                      text-left transition-colors
                                      hover:bg-[var(--hover-2)]
                                    "
                                  >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hover-2)]">
                                      <User className="h-4 w-4 text-[var(--text-primary)]/45" />
                                    </span>

                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                                        {uName(item)}
                                      </span>

                                      <span className="block truncate text-xs text-[var(--text-primary)]/40">
                                        {item.email}
                                      </span>
                                    </span>

                                    {selectedReporter?.id ===
                                      item.id && (
                                        <Check className="h-4 w-4 text-emerald-400" />
                                      )}
                                  </button>
                                ),
                              )
                            )}
                          </Dropdown>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-primary)]/45">
                        <span>Выбран:</span>

                        <span className="font-medium text-[var(--text-primary)]/75">
                          {selectedReporter
                            ? uName(selectedReporter)
                            : user?.full_name ||
                            user?.username ||
                            'Вы'}
                        </span>
                      </div>
                    </div>
                  )}

                {/* Title */}

                <div className="mb-7">
                  <SpellCheckField
                    value={title}
                    onChange={setTitle}
                    label="Тема заявки *"
                  >
                    <input
                      type="text"
                      value={title}
                      onChange={(event) =>
                        setTitle(event.target.value)
                      }
                      placeholder="Например: не открывается отчёт по продажам"
                      className={`
                        input-field w-full py-3.5 text-base
                        ${validationErrors.includes(
                        'Укажите тему заявки',
                      )
                          ? 'border-red-500 ring-1 ring-red-500/40'
                          : ''
                        }
                      `}
                    />
                  </SpellCheckField>

                  <p className="mt-2 text-xs text-[var(--text-primary)]/35">
                    Короткая тема помогает быстрее
                    понять суть заявки.
                  </p>
                </div>

                {/* Description */}

                <div>
                  <FieldLabel required>
                    Описание
                  </FieldLabel>

                  <p className="mb-3 text-xs text-[var(--text-primary)]/40">
                    Опишите ситуацию, ожидаемый результат
                    и шаги воспроизведения, если они есть.
                  </p>

                  <div
                    className={
                      validationErrors.includes(
                        'Добавьте описание заявки',
                      )
                        ? 'rounded-2xl ring-1 ring-red-500/50'
                        : ''
                    }
                  >
                    <TicketEditor
                      blocks={descriptionBlocks}
                      onChange={setDescriptionBlocks}
                    />
                  </div>
                </div>
              </section>

              {/* ======================================================== */}
              {/* Attachments */}
              {/* ======================================================== */}

              <section className="border-t border-[var(--border-color)] pt-7">
                <div className="mb-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Upload className="h-4 w-4 text-[var(--text-primary)]/45" />
                    Дополнительные файлы
                  </h2>

                  <p className="mt-1 text-xs text-[var(--text-primary)]/40">
                    До {MAX_FILES} файлов, не более 25 МБ
                    каждый.
                  </p>
                </div>

                <div
                  onDrop={handleGeneralDrop}
                  onDragOver={(event) =>
                    event.preventDefault()
                  }
                  className="
                    rounded-xl
                    border border-dashed border-[var(--border-color)]
                    bg-[var(--hover-1)]/40
                    px-5 py-6
                    text-center
                    transition-colors
                    hover:border-[var(--text-primary)]/25
                    hover:bg-[var(--hover-1)]
                  "
                >
                  <Upload className="mx-auto mb-2 h-6 w-6 text-[var(--text-primary)]/25" />

                  <p className="text-sm text-[var(--text-primary)]/55">
                    Перетащите файлы сюда
                  </p>

                  <p className="my-1 text-xs text-[var(--text-primary)]/25">
                    или
                  </p>

                  <label className="inline-flex cursor-pointer items-center rounded-lg bg-[var(--hover-2)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-3)]">
                    Выбрать файлы

                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={
                        handleGeneralFileSelect
                      }
                    />
                  </label>
                </div>

                {generalFiles.length > 0 && (
                  <div className="mt-3 divide-y divide-[var(--border-color)] overflow-hidden rounded-xl border border-[var(--border-color)]">
                    {generalFiles.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-[var(--hover-1)]/40 px-3 py-2.5"
                      >
                        {item.preview ? (
                          <img
                            src={item.preview}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)]">
                            <File className="h-4 w-4 text-[var(--text-primary)]/40" />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[var(--text-primary)]">
                            {item.file.name}
                          </p>

                          <p className="text-xs text-[var(--text-primary)]/35">
                            {formatFileSize(
                              item.file.size,
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          aria-label="Удалить файл"
                          onClick={() =>
                            removeGeneralFile(
                              item.id,
                            )
                          }
                          className="rounded-lg p-2 text-[var(--text-primary)]/35 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* Step 2 */}
          {/* ============================================================== */}

          {step === 2 && (
            <div>
              <div className="mb-7">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Классификация заявки
                </h2>

                <p className="mt-1 text-sm text-[var(--text-primary)]/45">
                  Укажите тип, приоритет и подходящие
                  теги.
                </p>
              </div>

              {/* AI */}

              {aiLoading && !aiTimedOut && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                    <Loader2 className="absolute h-9 w-9 animate-spin text-violet-400/40" />
                  </span>

                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Анализируем заявку
                    </p>

                    <p className="text-xs text-[var(--text-primary)]/40">
                      Подбираем приоритет и теги...
                    </p>
                  </div>
                </div>
              )}

              {aiTimedOut && !aiSuggestion && (
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />

                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Автоматическая классификация
                      недоступна
                    </p>

                    <p className="mt-0.5 text-xs text-[var(--text-primary)]/40">
                      Выберите параметры вручную — это не
                      мешает созданию заявки.
                    </p>
                  </div>
                </div>
              )}

              {aiSuggestion && !aiLoading && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
                  <Zap className="h-5 w-5 shrink-0 text-violet-400" />

                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Предложения применены
                    </p>

                    <p className="text-xs text-[var(--text-primary)]/40">
                      Можно изменить любой параметр
                      вручную.
                    </p>
                  </div>
                </div>
              )}

              <div
                className={
                  aiLoading && !aiTimedOut
                    ? 'pointer-events-none opacity-50'
                    : ''
                }
              >
                {/* Type */}

                <section>
                  <FieldLabel>
                    Тип заявки
                  </FieldLabel>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {TICKET_TYPES.map((item) => {
                      const selected =
                        type === item.value;

                      const Icon = item.icon;

                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() =>
                            setType(
                              item.value as TicketType,
                            )
                          }
                          className={`
                            flex items-center gap-3 rounded-xl
                            border px-3.5 py-3
                            text-left
                            transition-all
                            ${selected
                              ? 'border-[var(--accent)]/50 bg-[var(--accent)]/[0.07] ring-1 ring-[var(--accent)]/10'
                              : 'border-[var(--border-color)] bg-[var(--hover-1)]/40 hover:bg-[var(--hover-1)]'
                            }
                          `}
                        >
                          <span
                            className={`
                              flex h-9 w-9 shrink-0 items-center justify-center
                              rounded-lg bg-[var(--hover-2)]
                              ${item.color}
                            `}
                          >
                            <Icon className="h-4 w-4" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                              {item.label}
                            </span>

                            <span className="block truncate text-xs text-[var(--text-primary)]/35">
                              {item.desc}
                            </span>
                          </span>

                          {selected && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Priority */}

                <section className="mt-8 border-t border-[var(--border-color)] pt-7">
                  <FieldLabel>
                    Приоритет
                  </FieldLabel>

                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {PRIORITIES.map((item) => {
                      const selected =
                        priority === item.value;

                      const Icon = item.icon;

                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() =>
                            setPriority(
                              item.value as TicketPriority,
                            )
                          }
                          className={`
                            rounded-xl border p-3
                            text-left transition-all
                            ${selected
                              ? item.selected
                              : 'border-[var(--border-color)] bg-[var(--hover-1)]/40 hover:bg-[var(--hover-1)]'
                            }
                          `}
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <Icon
                              className={`h-5 w-5 ${item.color}`}
                            />

                            {selected && (
                              <Check className="h-4 w-4 text-[var(--text-primary)]/60" />
                            )}
                          </div>

                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {item.label}
                          </p>

                          <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                            {item.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Tags */}

                <section className="mt-8 border-t border-[var(--border-color)] pt-7">
                  <FieldLabel hint="необязательно">
                    Теги
                  </FieldLabel>

                  {aiSuggestedTags.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs text-violet-400/80">
                        <Sparkles className="h-3.5 w-3.5" />
                        Предложено автоматически
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {aiSuggestedTags.map(
                          (tag) => {
                            const selected =
                              tags.some(
                                (item) =>
                                  item.name === tag.name,
                              );

                            return (
                              <button
                                key={tag.name}
                                type="button"
                                onClick={() =>
                                  togglePresetTag(tag)
                                }
                                className={`
                                  inline-flex items-center gap-1.5
                                  rounded-lg border
                                  px-3 py-1.5
                                  text-sm transition-all
                                  ${selected
                                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                                    : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'
                                  }
                                `}
                              >
                                {selected && (
                                  <Check className="h-3.5 w-3.5" />
                                )}

                                {tag.name}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {PRESET_TAGS.map((tag) => {
                      const selected = tags.some(
                        (item) =>
                          item.name === tag.name,
                      );

                      return (
                        <button
                          key={tag.name}
                          type="button"
                          onClick={() =>
                            togglePresetTag(tag)
                          }
                          className={`
                            inline-flex items-center gap-1.5
                            rounded-lg border
                            px-3 py-1.5
                            text-sm transition-all
                            ${selected
                              ? ''
                              : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'
                            }
                          `}
                          style={
                            selected
                              ? {
                                backgroundColor: `${tag.color}18`,
                                borderColor: `${tag.color}55`,
                                color: tag.color,
                              }
                              : undefined
                          }
                        >
                          {selected && (
                            <Check className="h-3.5 w-3.5" />
                          )}

                          {tag.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    {!showCustomTagInput ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowCustomTagInput(true)
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] transition-opacity hover:opacity-80"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Добавить свой тег
                      </button>
                    ) : (
                      <div className="flex max-w-md gap-2">
                        <input
                          value={newTagInput}
                          onChange={(event) =>
                            setNewTagInput(
                              event.target.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter'
                            ) {
                              event.preventDefault();
                              addCustomTag();
                            }
                          }}
                          placeholder="Название тега"
                          className="input-field min-w-0 flex-1 py-2.5 text-sm"
                        />

                        <button
                          type="button"
                          disabled={
                            !newTagInput.trim()
                          }
                          onClick={addCustomTag}
                          className="
                            rounded-lg bg-[var(--accent)]
                            px-4 py-2.5
                            text-sm font-medium text-white
                            transition-opacity
                            disabled:opacity-40
                          "
                        >
                          Добавить
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomTagInput(
                              false,
                            );
                            setNewTagInput('');
                          }}
                          className="rounded-lg px-3 text-[var(--text-primary)]/40 hover:bg-[var(--hover-1)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]/40 p-3">
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <span
                            key={tag.name}
                            className="
                              inline-flex items-center gap-1.5
                              rounded-lg
                              border px-2.5 py-1
                              text-xs font-medium
                            "
                            style={{
                              backgroundColor: `${tag.color ||
                                '#71717a'
                                }14`,
                              borderColor: `${tag.color ||
                                '#71717a'
                                }40`,
                              color:
                                tag.color ||
                                '#d1d5db',
                            }}
                          >
                            {tag.name}

                            <button
                              type="button"
                              aria-label={`Удалить тег ${tag.name}`}
                              onClick={() =>
                                removeTag(tag.name)
                              }
                              className="opacity-50 transition-opacity hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* Step 3 */}
          {/* ============================================================== */}

          {step === 3 && (
            <div>
              <div className="mb-7 flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </span>

                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Проверьте заявку
                  </h2>

                  <p className="mt-1 text-sm text-[var(--text-primary)]/45">
                    После отправки заявка появится в
                    общем списке.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                {/* Binding */}

                <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                    Привязка
                  </p>

                  {selectedProject ? (
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-5 w-5 shrink-0 text-amber-400" />

                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {selectedProject.name}
                        </p>

                        <p className="text-xs text-[var(--text-primary)]/40">
                          Проект ·{' '}
                          {selectedProject.key}
                        </p>
                      </div>
                    </div>
                  ) : selectedCounterparty ? (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 shrink-0 text-blue-400" />

                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {cpName(
                            selectedCounterparty,
                          )}
                        </p>

                        <p className="text-xs text-[var(--text-primary)]/40">
                          Контрагент
                        </p>
                      </div>
                    </div>
                  ) : isCustomer &&
                    customerCounterparty ? (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 shrink-0 text-blue-400" />

                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {cpName(
                            customerCounterparty,
                          )}
                        </p>

                        <p className="text-xs text-[var(--text-primary)]/40">
                          Ваша организация
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-primary)]/45">
                      Без привязки
                    </p>
                  )}
                </div>

                {/* Reporter */}

                <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                    Инициатор
                  </p>

                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 shrink-0 text-emerald-400" />

                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {selectedReporter
                          ? uName(selectedReporter)
                          : user?.full_name ||
                          user?.username ||
                          'Вы'}
                      </p>

                      <p className="text-xs text-[var(--text-primary)]/40">
                        {selectedReporter
                          ? selectedReporter.email
                          : user?.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Title */}

                <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                    Тема
                  </p>

                  <p className="break-words text-sm font-medium text-[var(--text-primary)]">
                    {title || '—'}
                  </p>
                </div>

                {/* Description */}

                <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                    Описание
                  </p>

                  <div className="space-y-3">
                    {descriptionBlocks.map(
                      (block) => {
                        if (
                          block.type === 'text'
                        ) {
                          if (!block.value.trim()) {
                            return null;
                          }

                          return (
                            <div
                              key={block.id}
                              className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-primary)]/85"
                            >
                              {renderInlineFormatting(
                                block.value,
                              )}
                            </div>
                          );
                        }

                        if (
                          block.type === 'image' &&
                          block.localPreview
                        ) {
                          return (
                            <img
                              key={block.id}
                              src={
                                block.localPreview
                              }
                              alt="Вложение"
                              className="max-h-[340px] max-w-full rounded-xl border border-[var(--border-color)] object-contain"
                            />
                          );
                        }

                        return null;
                      },
                    )}
                  </div>
                </div>

                {/* Classification */}

                <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                        Тип
                      </p>

                      {currentType && (
                        <div className="flex items-center gap-2">
                          <currentType.icon
                            className={`h-4 w-4 ${currentType.color}`}
                          />

                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {currentType.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                        Приоритет
                      </p>

                      {currentPriority && (
                        <div className="flex items-center gap-2">
                          <currentPriority.icon
                            className={`h-4 w-4 ${currentPriority.color}`}
                          />

                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {
                              currentPriority.label
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tags */}

                {tags.length > 0 && (
                  <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                      Теги
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag.name}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${tag.color ||
                              '#71717a'
                              }20`,
                            color:
                              tag.color ||
                              '#d1d5db',
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}

                {generalFiles.length > 0 && (
                  <div className="p-4 sm:p-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-primary)]/35">
                      Файлы · {generalFiles.length}
                    </p>

                    <div className="space-y-2">
                      {generalFiles.map(
                        (item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <File className="h-4 w-4 shrink-0 text-[var(--text-primary)]/35" />

                            <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]/75">
                              {item.file.name}
                            </span>

                            <span className="shrink-0 text-xs text-[var(--text-primary)]/30">
                              {formatFileSize(
                                item.file.size,
                              )}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================== */}
        {/* Bottom navigation */}
        {/* ================================================================== */}

        <footer
          className="
            flex flex-col-reverse gap-3
            border-t border-[var(--border-color)]
            bg-[var(--hover-1)]/30
            px-5 py-4
            sm:flex-row sm:items-center sm:justify-between
            sm:px-7
          "
        >
          <div>
            {step === 1 ? (
              <button
                type="button"
                onClick={goToTickets}
                className="
                  inline-flex items-center justify-center gap-2
                  rounded-xl px-4 py-2.5
                  text-sm font-medium
                  text-[var(--text-primary)]/55
                  transition-colors
                  hover:bg-[var(--hover-1)]
                  hover:text-[var(--text-primary)]
                "
              >
                <X className="h-4 w-4" />
                Отменить и вернуться к заявкам
              </button>
            ) : (
              <button
                type="button"
                onClick={goToPreviousStep}
                className="
                  inline-flex items-center justify-center gap-2
                  rounded-xl
                  border border-[var(--border-color)]
                  bg-[var(--bg-primary)]
                  px-4 py-2.5
                  text-sm font-medium
                  text-[var(--text-primary)]/70
                  transition-colors
                  hover:bg-[var(--hover-1)]
                  hover:text-[var(--text-primary)]
                "
              >
                <ArrowLeft className="h-4 w-4" />
                {backButtonLabel}
              </button>
            )}
          </div>

          {step < 3 ? (
            <button
              type="button"
              disabled={nextButtonDisabled}
              onClick={goToNextStep}
              className="
                inline-flex items-center justify-center gap-2
                rounded-xl bg-[var(--accent)]
                px-6 py-2.5
                text-sm font-semibold text-white
                shadow-sm
                transition-all
                hover:brightness-110
                disabled:cursor-not-allowed
                disabled:opacity-40
                disabled:hover:brightness-100
              "
            >
              {step === 1
                ? 'Перейти к классификации'
                : 'Проверить заявку'}

              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="
                inline-flex min-w-[170px] items-center justify-center gap-2
                rounded-xl bg-[var(--accent)]
                px-6 py-2.5
                text-sm font-semibold text-white
                shadow-sm
                transition-all
                hover:brightness-110
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Создаём...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Создать заявку
                </>
              )}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}