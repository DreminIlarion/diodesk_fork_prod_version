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

// =============================================================================
// Constants
// =============================================================================

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
] as const;

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
    color: 'text-gray-400',
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
    desc: 'Корневая причина',
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
    icon: Zap,
    color: 'text-emerald-400',
  },
  {
    value: 'Прочее',
    label: 'Прочее',
    desc: 'Другая категория',
    icon: MessageSquare,
    color: 'text-gray-400',
  },
] as const;

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

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Draft helpers
// =============================================================================

function getDraftKey(userId: string | undefined): string {
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

// =============================================================================
// Small UI
// =============================================================================

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
    <div className="relative flex items-center">
      <div className="pointer-events-none absolute left-4 z-10 flex items-center">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-primary)]/45" />
        ) : (
          <Search className="h-5 w-5 text-[var(--text-primary)]/45" />
        )}
      </div>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="input-field w-full py-3.5 pl-12 pr-11 text-base"
      />

      <ChevronDown className="pointer-events-none absolute right-4 h-5 w-5 text-[var(--text-primary)]/35" />
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
        max-h-80 overflow-y-auto rounded-xl
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
    <div className="px-4 py-7 text-center text-base text-[var(--text-primary)]/40">
      {children}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const pageRef = useRef<HTMLDivElement>(null);

  const preselectedCounterpartyId =
    searchParams.get('counterparty_id');

  const preselectedProjectId =
    searchParams.get('project_id');

  const currentUserId = user?.id ?? user?.user_id;
  const draftKey = getDraftKey(currentUserId);

  const draft = useRef(loadDraft(draftKey));

  // =============================================================================
  // Main state
  // =============================================================================

  const [step, setStep] = useState(draft.current?.step || 1);

  const [title, setTitle] = useState(
    draft.current?.title || '',
  );

  const [descriptionBlocks, setDescriptionBlocks] =
    useState<DescriptionBlock[]>(
      draft.current?.descriptionBlocks?.length
        ? draft.current.descriptionBlocks
        : [
            {
              id: 'init',
              type: 'text',
              value: '',
            },
          ],
    );

  const description = serializeBlocks(descriptionBlocks);

  const [priority, setPriority] =
    useState<TicketPriority>(
      draft.current?.priority || 'medium',
    );

  const [type, setType] =
    useState<TicketType>(
      draft.current?.type || 'Инцидент',
    );

  const [tags, setTags] = useState<TicketTag[]>(
    draft.current?.tags || [],
  );

  const [generalFiles, setGeneralFiles] =
    useState<GeneralFile[]>([]);

  const [isDraggingFiles, setIsDraggingFiles] =
    useState(false);

  const [validationErrors, setValidationErrors] =
    useState<string[]>([]);

  const [hasDraft, setHasDraft] =
    useState(Boolean(draft.current));

  // =============================================================================
  // Binding state
  // =============================================================================

  const [
    customerCounterparty,
    setCustomerCounterparty,
  ] = useState<Counterparty | null>(null);

  const [selectionType, setSelectionType] =
    useState<SelectionType>(
      draft.current?.selectionType ?? null,
    );

  const [
    selectedCounterparty,
    setSelectedCounterparty,
  ] = useState<Counterparty | null>(null);

  const [counterparties, setCounterparties] =
    useState<Counterparty[]>([]);

  const [
    counterpartySearch,
    setCounterpartySearch,
  ] = useState(
    draft.current?.counterpartySearch || '',
  );

  const [
    showCounterpartyDropdown,
    setShowCounterpartyDropdown,
  ] = useState(false);

  const [
    loadingCounterparties,
    setLoadingCounterparties,
  ] = useState(false);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);

  const [projectSearch, setProjectSearch] =
    useState(
      draft.current?.projectSearch || '',
    );

  const [
    showProjectDropdown,
    setShowProjectDropdown,
  ] = useState(false);

  const [loadingProjects, setLoadingProjects] =
    useState(false);

  // =============================================================================
  // Reporter
  // =============================================================================

  const [users, setUsers] =
    useState<SimpleUser[]>([]);

  const [selectedReporter, setSelectedReporter] =
    useState<SimpleUser | null>(null);

  const [reporterSearch, setReporterSearch] =
    useState(
      draft.current?.reporterSearch || '',
    );

  const [
    showReporterDropdown,
    setShowReporterDropdown,
  ] = useState(false);

  const [loadingUsers, setLoadingUsers] =
    useState(false);

  // =============================================================================
  // AI
  // =============================================================================

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiTimedOut, setAiTimedOut] =
    useState(false);

  const [aiSuggestion, setAiSuggestion] =
    useState<any>(null);

  const [aiSuggestedTags, setAiSuggestedTags] =
    useState<TicketTag[]>([]);

  const aiDoneRef = useRef(false);

  const aiAbortRef =
    useRef<AbortController | null>(null);

  const titleRef = useRef(title);
  const descriptionRef = useRef(description);

  titleRef.current = title;
  descriptionRef.current = description;

  // =============================================================================
  // Misc
  // =============================================================================

  const [newTagInput, setNewTagInput] =
    useState('');

  const [
    showCustomTagInput,
    setShowCustomTagInput,
  ] = useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const counterpartyDropdownRef =
    useRef<HTMLDivElement>(null);

  const projectDropdownRef =
    useRef<HTMLDivElement>(null);

  const reporterDropdownRef =
    useRef<HTMLDivElement>(null);

  const isCustomer =
    user?.roles?.some(
      (role) =>
        role === 'customer' ||
        role === 'customer_admin',
    ) ?? false;

  const canSelectCounterparty =
    (!isCustomer &&
      user?.roles?.some((role) =>
        CAN_SELECT_COUNTERPARTY_ROLES.includes(
          role,
        ),
      )) ??
    false;

  const canSelectReporter = !isCustomer;

  const hasDescription =
    descriptionBlocks.some(
      (block) =>
        (block.type === 'text' &&
          block.value.trim().length > 0) ||
        (block.type === 'image' &&
          block.localFile),
    );

  // =============================================================================
  // User change
  // =============================================================================

  const prevUserIdRef =
    useRef<string | undefined>(currentUserId);

  useEffect(() => {
    if (
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== currentUserId
    ) {
      clearDraft(
        getDraftKey(prevUserIdRef.current),
      );

      draft.current = null;

      setHasDraft(false);
      setStep(1);
      setTitle('');

      setDescriptionBlocks([
        {
          id: 'init',
          type: 'text',
          value: '',
        },
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

  // =============================================================================
  // Draft autosave
  // =============================================================================

  const draftSaveTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  useEffect(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(
        draftSaveTimerRef.current,
      );
    }

    draftSaveTimerRef.current = setTimeout(
      () => {
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

            selectedCounterpartyName:
              selectedCounterparty
                ? selectedCounterparty.name ||
                  selectedCounterparty.legal_name ||
                  ''
                : null,

            selectedProjectId:
              selectedProject?.id || null,

            selectedProjectName:
              selectedProject
                ? `${selectedProject.key} - ${selectedProject.name}`
                : null,

            selectedReporterId:
              selectedReporter?.id || null,

            selectedReporterName:
              selectedReporter
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
      },
      500,
    );

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(
          draftSaveTimerRef.current,
        );
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

  // =============================================================================
  // Restore draft
  // =============================================================================

  useEffect(() => {
    if (
      !draft.current ||
      !canSelectCounterparty
    ) {
      return;
    }

    const data = draft.current;

    const restore = async () => {
      if (
        data.selectionType ===
          'counterparty' &&
        data.selectedCounterpartyId
      ) {
        try {
          const cp =
            await counterpartiesApi.getById(
              data.selectedCounterpartyId,
            );

          setSelectedCounterparty(cp);
          setCounterpartySearch(
            cp.name || cp.legal_name || '',
          );
        } catch {
          // deleted/unavailable
        }
      }

      if (
        data.selectionType === 'project' &&
        data.selectedProjectId
      ) {
        try {
          const response =
            await projectsApi.getAll(1, 100);

          const items = response.items;

          setProjects(items);

          const found = items.find(
            (project) =>
              project.id ===
              data.selectedProjectId,
          );

          if (found) {
            setSelectedProject(found);
            setProjectSearch(
              `${found.key} - ${found.name}`,
            );

            if (found.counterparty_id) {
              try {
                const cp =
                  await counterpartiesApi.getById(
                    found.counterparty_id,
                  );

                setSelectedCounterparty(cp);
                setCounterpartySearch(
                  cp.name ||
                    cp.legal_name ||
                    '',
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
        setReporterSearch(
          data.selectedReporterName || '',
        );
      }

      draft.current = null;
    };

    restore();
  }, [canSelectCounterparty]);

  // =============================================================================
  // Outside click
  // =============================================================================

  useEffect(() => {
    const handleMouseDown = (
      event: MouseEvent,
    ) => {
      const target = event.target as Node;

      if (
        counterpartyDropdownRef.current &&
        !counterpartyDropdownRef.current.contains(
          target,
        )
      ) {
        setShowCounterpartyDropdown(false);
      }

      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(
          target,
        )
      ) {
        setShowProjectDropdown(false);
      }

      if (
        reporterDropdownRef.current &&
        !reporterDropdownRef.current.contains(
          target,
        )
      ) {
        setShowReporterDropdown(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleMouseDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleMouseDown,
      );
    };
  }, []);

  // =============================================================================
  // Scroll
  // =============================================================================

  useEffect(() => {
    pageRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [step]);

  // =============================================================================
  // Initial loading
  // =============================================================================

  useEffect(() => {
    if (
      isCustomer &&
      user?.counterparty_id
    ) {
      loadCustomerCounterparty();
    }
  }, [
    isCustomer,
    user?.counterparty_id,
  ]);

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
      loadProjects(
        selectedCounterparty.id,
      );

      return;
    }

    if (selectionType === 'project') {
      loadProjectsForAll();
      return;
    }

    setProjects([]);
  }, [
    selectionType,
    selectedCounterparty?.id,
  ]);

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

  // =============================================================================
  // Preselected project
  // =============================================================================

  useEffect(() => {
    if (
      !preselectedProjectId ||
      !canSelectCounterparty
    ) {
      return;
    }

    const run = async () => {
      setSelectionType('project');
      setLoadingProjects(true);

      try {
        const response =
          await projectsApi.getAll(1, 100);

        const items = response.items;

        setProjects(items);

        const found = items.find(
          (project) =>
            project.id ===
            preselectedProjectId,
        );

        if (!found) return;

        setSelectedProject(found);

        setProjectSearch(
          `${found.key} - ${found.name}`,
        );

        if (found.counterparty_id) {
          try {
            const cp =
              await counterpartiesApi.getById(
                found.counterparty_id,
              );

            setSelectedCounterparty(cp);

            setCounterpartySearch(
              cp.name ||
                cp.legal_name ||
                '',
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
  }, [
    preselectedProjectId,
    canSelectCounterparty,
  ]);

  // =============================================================================
  // AI
  // =============================================================================

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

    if (aiDoneRef.current) {
      return;
    }

    const currentTitle =
      titleRef.current.trim();

    const currentDescription =
      descriptionRef.current.trim();

    if (
      !currentTitle ||
      !currentDescription
    ) {
      return;
    }

    aiAbortRef.current?.abort();

    const controller =
      new AbortController();

    aiAbortRef.current = controller;
    aiDoneRef.current = true;

    setAiLoading(true);
    setAiSuggestion(null);
    setAiTimedOut(false);

    const timeoutId = setTimeout(() => {
      if (controller.signal.aborted) {
        return;
      }

      setAiTimedOut(true);
      setAiLoading(false);
    }, AI_TIMEOUT_MS);

    ticketsApi
      .predict(
        currentTitle,
        currentDescription,
      )
      .then((result) => {
        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          return;
        }

        setAiSuggestion(result);

        setAiSuggestedTags(
          result.suggested_tags || [],
        );

        if (
          result.suggested_priority
        ) {
          setPriority(
            result.suggested_priority,
          );
        }

        setTags(
          result.suggested_tags || [],
        );

        setAiLoading(false);
        setAiTimedOut(false);
      })
      .catch((error) => {
        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          return;
        }

        console.error(
          'AI prediction failed:',
          error,
        );

        setAiLoading(false);
        setAiTimedOut(true);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [step]);

  // =============================================================================
  // Loaders
  // =============================================================================

  async function loadCustomerCounterparty() {
    if (!user?.counterparty_id) {
      return;
    }

    try {
      const cp =
        await counterpartiesApi.getById(
          user.counterparty_id,
        );

      setCustomerCounterparty(cp);
    } catch {
      // noop
    }
  }

  async function loadCounterparties(
    search?: string,
  ) {
    setLoadingCounterparties(true);

    try {
      let items = (
        await counterpartiesApi.getAll(
          1,
          50,
        )
      ).items;

      if (search) {
        const query =
          search.toLowerCase();

        items = items.filter(
          (cp) =>
            cp.name
              ?.toLowerCase()
              .includes(query) ||
            cp.legal_name
              ?.toLowerCase()
              .includes(query) ||
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
          (cp) =>
            cp.id ===
            preselectedCounterpartyId,
        );

        if (found) {
          setSelectionType(
            'counterparty',
          );

          setSelectedCounterparty(
            found,
          );

          setCounterpartySearch(
            cpName(found),
          );
        }
      }
    } catch {
      // noop
    } finally {
      setLoadingCounterparties(false);
    }
  }

  async function loadProjects(
    cpId: string,
  ) {
    setLoadingProjects(true);

    try {
      const response =
        await projectsApi.getByCounterparty(
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

  async function loadProjectsForAll(): Promise<
    Project[]
  > {
    setLoadingProjects(true);

    try {
      const response =
        await projectsApi.getAll(1, 100);

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
      const response =
        await usersApi.getCustomers(
          cpId,
          1,
          100,
        );

      const customerUsers: SimpleUser[] =
        response.items.map(
          (customer) => ({
            id: customer.id,
            username:
              customer.username,
            full_name:
              customer.full_name,
            email: customer.email,
            role: customer.role,
          }),
        );

      let all = [...customerUsers];

      const ownId =
        user?.id ?? user?.user_id;

      if (
        ownId &&
        !customerUsers.some(
          (item) => item.id === ownId,
        )
      ) {
        all = [
          {
            id: ownId,
            username:
              user?.username || '',
            full_name:
              user?.full_name || null,
            email:
              user?.email || '',
            role: user?.role,
          },
          ...all,
        ];
      }

      setUsers(all);

      setSelectedReporter(
        (current) => {
          if (!current) {
            return null;
          }

          return (
            all.find(
              (item) =>
                item.id === current.id,
            ) || null
          );
        },
      );
    } catch {
      // noop
    } finally {
      setLoadingUsers(false);
    }
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  const cpName = (
    cp: Counterparty,
  ) =>
    cp.name ||
    cp.legal_name ||
    cp.inn ||
    'Без названия';

  const prjName = (
    project: Project,
  ) =>
    `${project.key} — ${project.name}`;

  const uName = (
    item: SimpleUser,
  ) =>
    item.full_name ||
    item.username ||
    item.email;

  const formatFileSize = (
    bytes: number,
  ) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(1)} MB`;
  };

  // =============================================================================
  // Selection
  // =============================================================================

  const handleSelectionTypeChange = (
    next: SelectionType,
  ) => {
    setSelectionType(next);

    setSelectedCounterparty(null);
    setSelectedProject(null);
    setSelectedReporter(null);

    setCounterpartySearch('');
    setProjectSearch('');
    setReporterSearch('');

    setProjects([]);
    setUsers([]);

    setValidationErrors(
      (current) =>
        current.filter(
          (error) =>
            error !==
              'Выберите контрагента' &&
            error !==
              'Выберите проект',
        ),
    );
  };

  const selectCounterparty = (
    cp: Counterparty,
  ) => {
    setSelectedCounterparty(cp);
    setCounterpartySearch(
      cpName(cp),
    );

    setShowCounterpartyDropdown(
      false,
    );

    setValidationErrors(
      (current) =>
        current.filter(
          (error) =>
            error !==
            'Выберите контрагента',
        ),
    );
  };

  const selectProject = async (
    project: Project,
  ) => {
    setSelectedProject(project);

    setProjectSearch(
      prjName(project),
    );

    setShowProjectDropdown(false);

    setValidationErrors(
      (current) =>
        current.filter(
          (error) =>
            error !==
            'Выберите проект',
        ),
    );

    if (project.counterparty_id) {
      try {
        const cp =
          await counterpartiesApi.getById(
            project.counterparty_id,
          );

        setSelectedCounterparty(cp);

        setCounterpartySearch(
          cpName(cp),
        );
      } catch {
        // noop
      }
    }
  };

  // =============================================================================
  // Tags
  // =============================================================================

  const togglePresetTag = (
    tag: TicketTag,
  ) => {
    setTags((current) => {
      const exists = current.some(
        (item) =>
          item.name === tag.name,
      );

      if (exists) {
        return current.filter(
          (item) =>
            item.name !== tag.name,
        );
      }

      return [...current, tag];
    });
  };

  const addCustomTag = () => {
    const name =
      newTagInput.trim();

    if (!name) {
      return;
    }

    if (
      tags.some(
        (tag) =>
          tag.name.toLowerCase() ===
          name.toLowerCase(),
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

  const removeTag = (
    name: string,
  ) => {
    setTags((current) =>
      current.filter(
        (tag) =>
          tag.name !== name,
      ),
    );
  };

  // =============================================================================
  // Validation/navigation
  // =============================================================================

  const validateStep1 = () => {
    const errors: string[] = [];

    if (!title.trim()) {
      errors.push(
        'Укажите тему заявки',
      );
    }

    if (!hasDescription) {
      errors.push(
        'Добавьте описание заявки',
      );
    }

    if (
      canSelectCounterparty &&
      selectionType ===
        'counterparty' &&
      !selectedCounterparty
    ) {
      errors.push(
        'Выберите контрагента',
      );
    }

    if (
      canSelectCounterparty &&
      selectionType ===
        'project' &&
      !selectedProject
    ) {
      errors.push(
        'Выберите проект',
      );
    }

    setValidationErrors(errors);

    return errors.length === 0;
  };

  const goToNextStep = () => {
    if (
      step === 1 &&
      !validateStep1()
    ) {
      return;
    }

    setValidationErrors([]);

    setStep((current) =>
      Math.min(3, current + 1),
    );
  };

  const goToPreviousStep = () => {
    setValidationErrors([]);

    setStep((current) =>
      Math.max(1, current - 1),
    );
  };

  const goToTickets = () => {
    navigate('/tickets');
  };

  useEffect(() => {
    if (
      validationErrors.length === 0
    ) {
      return;
    }

    setValidationErrors(
      (current) =>
        current.filter((error) => {
          if (
            error ===
              'Укажите тему заявки' &&
            title.trim()
          ) {
            return false;
          }

          if (
            error ===
              'Добавьте описание заявки' &&
            hasDescription
          ) {
            return false;
          }

          if (
            error ===
              'Выберите контрагента' &&
            selectedCounterparty
          ) {
            return false;
          }

          if (
            error ===
              'Выберите проект' &&
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

  // =============================================================================
  // Files
  // =============================================================================

  const appendFiles = (
    files: File[],
  ) => {
    const available = Math.max(
      0,
      MAX_FILES -
        generalFiles.length,
    );

    const accepted = files
      .filter(
        (file) =>
          file.size <=
          MAX_FILE_SIZE,
      )
      .slice(0, available);

    const mapped: GeneralFile[] =
      accepted.map((file) => ({
        id: `${file.name}_${Date.now()}_${Math.random()}`,
        file,
        preview:
          file.type.startsWith(
            'image/',
          )
            ? URL.createObjectURL(
                file,
              )
            : undefined,
        status: 'pending',
      }));

    setGeneralFiles((current) => [
      ...current,
      ...mapped,
    ]);
  };

  const handleGeneralFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    appendFiles(
      Array.from(
        event.target.files || [],
      ),
    );

    event.target.value = '';
  };

  const handleGeneralDrop = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    setIsDraggingFiles(false);

    appendFiles(
      Array.from(
        event.dataTransfer.files,
      ),
    );
  };

  const removeGeneralFile = (
    id: string,
  ) => {
    const found =
      generalFiles.find(
        (file) => file.id === id,
      );

    if (found?.preview) {
      URL.revokeObjectURL(
        found.preview,
      );
    }

    setGeneralFiles((current) =>
      current.filter(
        (file) =>
          file.id !== id,
      ),
    );
  };

  // =============================================================================
  // Clear draft
  // =============================================================================

  const handleClearDraft = () => {
    clearDraft(draftKey);

    setHasDraft(false);
    setStep(1);
    setTitle('');

    setDescriptionBlocks([
      {
        id: 'init',
        type: 'text',
        value: '',
      },
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

  // =============================================================================
  // Submit
  // =============================================================================

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      const textOnlyDescription =
        descriptionBlocks
          .filter(
            (
              block,
            ): block is Extract<
              DescriptionBlock,
              { type: 'text' }
            > =>
              block.type ===
              'text',
          )
          .map((block) =>
            block.value.trim(),
          )
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
          color:
            tag.color ||
            '#64748b',
        })),

        reporter_id:
          currentUserId,
      };

      if (
        isCustomer &&
        customerCounterparty
      ) {
        data.counterparty_id =
          customerCounterparty.id;
      } else if (selectedProject) {
        data.project_id =
          selectedProject.id;
      } else if (
        selectedCounterparty
      ) {
        data.counterparty_id =
          selectedCounterparty.id;
      }

      if (
        canSelectReporter &&
        selectedReporter
      ) {
        data.reporter_id =
          selectedReporter.id;
      }

      const ticket =
        await ticketsApi.create(
          data,
        );

      const imageBlocks =
        descriptionBlocks.filter(
          (
            block,
          ): block is Extract<
            DescriptionBlock,
            { type: 'image' }
          > =>
            block.type ===
              'image' &&
            Boolean(
              block.localFile,
            ),
        );

      const uploadMap: Record<
        string,
        string
      > = {};

      for (const block of imageBlocks) {
        try {
          const attachment =
            await attachmentsApi.uploadAttachment(
              block.localFile!,
              'ticket',
              ticket.id,
            );

          uploadMap[block.id] =
            attachment.id;
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
          serializeBlocks(
            descriptionBlocks,
          );

        for (const [
          blockId,
          attachmentId,
        ] of Object.entries(
          uploadMap,
        )) {
          finalDescription =
            finalDescription.replaceAll(
              `![image](local:${blockId})`,
              `![image](media://${attachmentId})`,
            );
        }

        finalDescription =
          finalDescription.replace(
            /!\[image\]\(local:[a-f0-9-]+\)\n*/gi,
            '',
          );

        await ticketsApi.update(
          ticket.id,
          {
            description:
              finalDescription,
          },
        );
      }

      for (const file of generalFiles.filter(
        (item) =>
          item.status ===
          'pending',
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
        error?.response?.data ||
          error,
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =============================================================================
  // Derived
  // =============================================================================

  const filteredProjects =
    projects.filter((project) => {
      if (!projectSearch) {
        return true;
      }

      const query =
        projectSearch.toLowerCase();

      return (
        project.name
          .toLowerCase()
          .includes(query) ||
        project.key
          .toLowerCase()
          .includes(query)
      );
    });

  const filteredUsers =
    users.filter((item) => {
      if (!reporterSearch) {
        return true;
      }

      const query =
        reporterSearch.toLowerCase();

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

  const currentPriority =
    PRIORITIES.find(
      (item) =>
        item.value === priority,
    );

  const currentType =
    TICKET_TYPES.find(
      (item) =>
        item.value === type,
    );

  const nextButtonDisabled =
    step === 1 &&
    (!title.trim() ||
      !hasDescription ||
      (selectionType ===
        'counterparty' &&
        !selectedCounterparty) ||
      (selectionType ===
        'project' &&
        !selectedProject));

  const backButtonLabel =
    step === 2
      ? 'К описанию'
      : 'К классификации';

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div
      ref={pageRef}
      className="mx-auto max-w-6xl px-4 pb-14 sm:px-6"
    >
      {/* ===================================================================== */}
      {/* Header */}
      {/* ===================================================================== */}

      <header className="mb-7">
        <button
          type="button"
          onClick={goToTickets}
          className="
            mb-5 inline-flex items-center gap-2
            text-base font-medium
            text-[var(--text-primary)]/55
            transition-colors
            hover:text-[var(--text-primary)]
          "
        >
          <ArrowLeft className="h-5 w-5" />
          К заявкам
        </button>

        <div className="flex items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Новая заявка
            </h1>

            <p className="mt-1.5 text-base text-[var(--text-primary)]/50">
              Заполните информацию о заявке
            </p>
          </div>

          {hasDraft && (
            <button
              type="button"
              onClick={handleClearDraft}
              className="
                hidden items-center gap-2
                rounded-lg px-3 py-2
                text-sm
                text-[var(--text-primary)]/45
                transition
                hover:bg-red-500/10
                hover:text-red-400
                sm:flex
              "
            >
              <Trash2 className="h-4 w-4" />
              Очистить черновик
            </button>
          )}
        </div>
      </header>

      {/* ===================================================================== */}
      {/* Stepper */}
      {/* ===================================================================== */}

      <div
        className="
          mb-6 grid grid-cols-3
          overflow-hidden rounded-xl
          border border-[var(--border-color)]
          bg-[var(--hover-1)]
        "
      >
        {[
          {
            num: 1,
            label: 'Описание',
          },
          {
            num: 2,
            label: 'Классификация',
          },
          {
            num: 3,
            label: 'Проверка',
          },
        ].map((item) => {
          const active =
            step === item.num;

          const done =
            step > item.num;

          return (
            <button
              key={item.num}
              type="button"
              disabled={
                item.num > step
              }
              onClick={() => {
                if (
                  item.num < step
                ) {
                  setStep(item.num);
                }
              }}
              className={`
                relative flex items-center justify-center gap-3
                px-3 py-4
                text-base font-medium
                transition
                ${
                  active
                    ? 'bg-[var(--hover-2)] text-[var(--text-primary)]'
                    : done
                      ? 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                      : 'cursor-default text-[var(--text-primary)]/35'
                }
              `}
            >
              <span
                className={`
                  flex h-8 w-8 shrink-0 items-center justify-center
                  rounded-full text-sm font-semibold
                  ${
                    active
                      ? 'bg-[var(--accent)] text-white'
                      : done
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-[var(--hover-2)]'
                  }
                `}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  item.num
                )}
              </span>

              <span className="hidden sm:block">
                {item.label}
              </span>

              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* Draft */}
      {/* ===================================================================== */}

      {hasDraft &&
        step === 1 &&
        title && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <Clock className="h-5 w-5 shrink-0 text-blue-400" />

            <span className="text-base text-[var(--text-primary)]/65">
              Восстановлен сохранённый
              черновик
            </span>
          </div>
        )}

      {/* ===================================================================== */}
      {/* Main */}
      {/* ===================================================================== */}

      <main
        className="
          overflow-visible rounded-2xl
          border border-[var(--border-color)]
          bg-[var(--bg-secondary)]
        "
      >
        <div className="p-5 sm:p-7 md:p-8">
          {/* ================================================================= */}
          {/* STEP 1 */}
          {/* ================================================================= */}

          {step === 1 && (
            <div className="space-y-9">
              {/* Validation */}

              {validationErrors.length >
                0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />

                    <div>
                      <p className="font-medium text-red-300">
                        Проверьте заполнение
                        формы
                      </p>

                      <div className="mt-1.5 space-y-1">
                        {validationErrors.map(
                          (error) => (
                            <p
                              key={error}
                              className="text-sm text-red-300/80"
                            >
                              {error}
                            </p>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================= */}
              {/* Binding */}
              {/* ============================================================= */}

              {canSelectCounterparty && (
                <section>
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      Привязка
                    </h2>

                    <div className="inline-flex w-full rounded-xl bg-[var(--hover-1)] p-1 lg:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(
                            'project',
                          )
                        }
                        className={`
                          flex flex-1 items-center justify-center gap-2
                          rounded-lg px-4 py-2.5
                          text-sm font-medium
                          transition-colors lg:flex-none
                          ${
                            selectionType ===
                            'project'
                              ? 'bg-[var(--hover-3)] text-amber-400'
                              : 'text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        <FolderOpen className="h-4 w-4" />
                        Проект
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(
                            'counterparty',
                          )
                        }
                        className={`
                          flex flex-1 items-center justify-center gap-2
                          rounded-lg px-4 py-2.5
                          text-sm font-medium
                          transition-colors lg:flex-none
                          ${
                            selectionType ===
                            'counterparty'
                              ? 'bg-[var(--hover-3)] text-blue-400'
                              : 'text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        <Building2 className="h-4 w-4" />
                        Контрагент
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSelectionTypeChange(
                            null,
                          )
                        }
                        className={`
                          flex flex-1 items-center justify-center
                          rounded-lg px-4 py-2.5
                          text-sm font-medium
                          transition-colors lg:flex-none
                          ${
                            selectionType ===
                            null
                              ? 'bg-[var(--hover-3)] text-[var(--text-primary)]'
                              : 'text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]'
                          }
                        `}
                      >
                        Без привязки
                      </button>
                    </div>
                  </div>

                  {selectionType !== null && (
                    <div
                      className={`
                        grid gap-5
                        ${
                          canSelectReporter
                            ? 'lg:grid-cols-2'
                            : 'grid-cols-1'
                        }
                      `}
                    >
                      {/* Project */}

                      {selectionType ===
                        'project' && (
                        <div>
                          <label className="mb-2 block text-base font-medium text-[var(--text-primary)]">
                            Проект
                            <span className="ml-1 text-red-400">
                              *
                            </span>
                          </label>

                          <div
                            ref={
                              projectDropdownRef
                            }
                            className="relative"
                          >
                            <SearchInput
                              value={
                                projectSearch
                              }
                              loading={
                                loadingProjects
                              }
                              placeholder="Название или код проекта"
                              onChange={(
                                value,
                              ) => {
                                setProjectSearch(
                                  value,
                                );

                                if (
                                  selectedProject
                                ) {
                                  setSelectedProject(
                                    null,
                                  );
                                }

                                setShowProjectDropdown(
                                  true,
                                );
                              }}
                              onFocus={() => {
                                setShowProjectDropdown(
                                  true,
                                );

                                if (
                                  !projects.length
                                ) {
                                  loadProjectsForAll();
                                }
                              }}
                            />

                            {showProjectDropdown && (
                              <Dropdown>
                                {loadingProjects ? (
                                  <DropdownEmpty>
                                    Загружаем
                                    проекты...
                                  </DropdownEmpty>
                                ) : filteredProjects.length ===
                                  0 ? (
                                  <DropdownEmpty>
                                    Проекты не
                                    найдены
                                  </DropdownEmpty>
                                ) : (
                                  filteredProjects.map(
                                    (
                                      project,
                                    ) => (
                                      <button
                                        key={
                                          project.id
                                        }
                                        type="button"
                                        onClick={() =>
                                          selectProject(
                                            project,
                                          )
                                        }
                                        className="
                                          flex w-full items-center gap-3
                                          rounded-lg px-3 py-3
                                          text-left
                                          transition-colors
                                          hover:bg-[var(--hover-2)]
                                        "
                                      >
                                        <FolderOpen className="h-5 w-5 shrink-0 text-amber-400" />

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-base text-[var(--text-primary)]">
                                            {
                                              project.name
                                            }
                                          </div>

                                          <div className="mt-0.5 text-sm text-[var(--text-primary)]/45">
                                            {
                                              project.key
                                            }
                                          </div>
                                        </div>

                                        {selectedProject?.id ===
                                          project.id && (
                                          <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                                        )}
                                      </button>
                                    ),
                                  )
                                )}
                              </Dropdown>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Counterparty */}

                      {selectionType ===
                        'counterparty' && (
                        <div>
                          <label className="mb-2 block text-base font-medium text-[var(--text-primary)]">
                            Контрагент
                            <span className="ml-1 text-red-400">
                              *
                            </span>
                          </label>

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
                              placeholder="Название или ИНН"
                              onChange={(
                                value,
                              ) => {
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

                                loadCounterparties(
                                  value,
                                );
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
                                    Контрагенты
                                    не найдены
                                  </DropdownEmpty>
                                ) : (
                                  counterparties.map(
                                    (cp) => (
                                      <button
                                        key={
                                          cp.id
                                        }
                                        type="button"
                                        onClick={() =>
                                          selectCounterparty(
                                            cp,
                                          )
                                        }
                                        className="
                                          flex w-full items-center gap-3
                                          rounded-lg px-3 py-3
                                          text-left
                                          transition-colors
                                          hover:bg-[var(--hover-2)]
                                        "
                                      >
                                        <Building2 className="h-5 w-5 shrink-0 text-blue-400" />

                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-base text-[var(--text-primary)]">
                                            {cpName(
                                              cp,
                                            )}
                                          </div>

                                          {cp.inn && (
                                            <div className="mt-0.5 text-sm text-[var(--text-primary)]/45">
                                              ИНН{' '}
                                              {
                                                cp.inn
                                              }
                                            </div>
                                          )}
                                        </div>

                                        {selectedCounterparty?.id ===
                                          cp.id && (
                                          <Check className="h-5 w-5 shrink-0 text-emerald-400" />
                                        )}
                                      </button>
                                    ),
                                  )
                                )}
                              </Dropdown>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Reporter */}

                      {canSelectReporter &&
                        (selectedCounterparty ||
                          selectedProject) && (
                          <div>
                            <label className="mb-2 block text-base font-medium text-[var(--text-primary)]">
                              Инициатор
                              <span className="ml-2 text-sm font-normal text-[var(--text-primary)]/45">
                                необязательно
                              </span>
                            </label>

                            <div
                              ref={
                                reporterDropdownRef
                              }
                              className="relative"
                            >
                              <SearchInput
                                value={
                                  reporterSearch
                                }
                                loading={
                                  loadingUsers
                                }
                                placeholder={
                                  user?.full_name ||
                                  user?.username ||
                                  'Вы'
                                }
                                onChange={(
                                  value,
                                ) => {
                                  setReporterSearch(
                                    value,
                                  );

                                  if (
                                    selectedReporter
                                  ) {
                                    setSelectedReporter(
                                      null,
                                    );
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
                                      setReporterSearch(
                                        '',
                                      );
                                      setShowReporterDropdown(
                                        false,
                                      );
                                    }}
                                    className="
                                      flex w-full items-center gap-3
                                      rounded-lg px-3 py-3
                                      text-left
                                      transition-colors
                                      hover:bg-[var(--hover-2)]
                                    "
                                  >
                                    <User className="h-5 w-5 shrink-0 text-emerald-400" />

                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-base text-[var(--text-primary)]">
                                        {user?.full_name ||
                                          user?.username ||
                                          'Вы'}
                                      </div>

                                      <div className="text-sm text-[var(--text-primary)]/45">
                                        Текущий
                                        пользователь
                                      </div>
                                    </div>

                                    {!selectedReporter && (
                                      <Check className="h-5 w-5 text-emerald-400" />
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
                                      Пользователи
                                      не найдены
                                    </DropdownEmpty>
                                  ) : (
                                    filteredUsers.map(
                                      (
                                        item,
                                      ) => (
                                        <button
                                          key={
                                            item.id
                                          }
                                          type="button"
                                          onClick={() => {
                                            setSelectedReporter(
                                              item,
                                            );

                                            setReporterSearch(
                                              uName(
                                                item,
                                              ),
                                            );

                                            setShowReporterDropdown(
                                              false,
                                            );
                                          }}
                                          className="
                                            flex w-full items-center gap-3
                                            rounded-lg px-3 py-3
                                            text-left
                                            transition-colors
                                            hover:bg-[var(--hover-2)]
                                          "
                                        >
                                          <User className="h-5 w-5 shrink-0 text-[var(--text-primary)]/45" />

                                          <div className="min-w-0 flex-1">
                                            <div className="truncate text-base text-[var(--text-primary)]">
                                              {uName(
                                                item,
                                              )}
                                            </div>

                                            <div className="truncate text-sm text-[var(--text-primary)]/45">
                                              {
                                                item.email
                                              }
                                            </div>
                                          </div>

                                          {selectedReporter?.id ===
                                            item.id && (
                                            <Check className="h-5 w-5 text-emerald-400" />
                                          )}
                                        </button>
                                      ),
                                    )
                                  )}
                                </Dropdown>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </section>
              )}

              {/* Customer */}

              {isCustomer &&
                customerCounterparty && (
                  <section>
                    <label className="mb-2 block text-base font-medium text-[var(--text-primary)]">
                      Организация
                    </label>

                    <div className="flex items-center gap-3 text-base text-[var(--text-primary)]">
                      <Building2 className="h-5 w-5 text-blue-400" />

                      <span>
                        {cpName(
                          customerCounterparty,
                        )}
                      </span>

                      {customerCounterparty.inn && (
                        <span className="text-[var(--text-primary)]/45">
                          · ИНН{' '}
                          {
                            customerCounterparty.inn
                          }
                        </span>
                      )}
                    </div>
                  </section>
                )}

              {/* Title */}

              <section>
                <SpellCheckField
                  value={title}
                  onChange={setTitle}
                  label="Тема заявки *"
                >
                  <input
                    type="text"
                    value={title}
                    onChange={(
                      event,
                    ) =>
                      setTitle(
                        event.target.value,
                      )
                    }
                    placeholder="Кратко опишите проблему или задачу"
                    className={`
                      input-field w-full py-3.5 text-lg
                      ${
                        validationErrors.includes(
                          'Укажите тему заявки',
                        )
                          ? 'border-red-500'
                          : ''
                      }
                    `}
                  />
                </SpellCheckField>
              </section>

              {/* Description */}

              <section>
                <label className="mb-3 block text-lg font-semibold text-[var(--text-primary)]">
                  Описание
                  <span className="ml-1 text-red-400">
                    *
                  </span>
                </label>

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
                    blocks={
                      descriptionBlocks
                    }
                    onChange={
                      setDescriptionBlocks
                    }
                  />
                </div>
              </section>

              {/* Files */}

              <section>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <label className="text-lg font-semibold text-[var(--text-primary)]">
                    Файлы
                  </label>

                  <span className="text-sm text-[var(--text-primary)]/45">
                    До 10 файлов · 25 МБ
                  </span>
                </div>

                <div
                  onDragEnter={(
                    event,
                  ) => {
                    event.preventDefault();
                    setIsDraggingFiles(
                      true,
                    );
                  }}
                  onDragOver={(
                    event,
                  ) => {
                    event.preventDefault();

                    event.dataTransfer.dropEffect =
                      'copy';

                    setIsDraggingFiles(
                      true,
                    );
                  }}
                  onDragLeave={(
                    event,
                  ) => {
                    event.preventDefault();

                    const related =
                      event.relatedTarget as
                        | Node
                        | null;

                    if (
                      related &&
                      event.currentTarget.contains(
                        related,
                      )
                    ) {
                      return;
                    }

                    setIsDraggingFiles(
                      false,
                    );
                  }}
                  onDrop={
                    handleGeneralDrop
                  }
                  className={`
                    relative flex min-h-[135px]
                    items-center justify-center
                    rounded-2xl border-2 border-dashed
                    px-6 py-5
                    transition-all duration-150
                    ${
                      isDraggingFiles
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-[var(--border-color)] bg-[var(--hover-1)]/35 hover:bg-[var(--hover-1)]/60'
                    }
                  `}
                >
                  {isDraggingFiles && (
                    <div className="pointer-events-none absolute inset-2 rounded-xl border border-amber-400/30" />
                  )}

                  <div className="relative flex flex-col items-center text-center sm:flex-row sm:gap-4 sm:text-left">
                    <div
                      className={`
                        mb-3 flex h-12 w-12 shrink-0
                        items-center justify-center
                        rounded-xl sm:mb-0
                        ${
                          isDraggingFiles
                            ? 'bg-amber-500/20'
                            : 'bg-[var(--hover-2)]'
                        }
                      `}
                    >
                      <Upload
                        className={`
                          h-6 w-6
                          ${
                            isDraggingFiles
                              ? 'text-amber-400'
                              : 'text-[var(--text-primary)]/50'
                          }
                        `}
                      />
                    </div>

                    <div>
                      <p
                        className={`
                          text-base font-medium
                          ${
                            isDraggingFiles
                              ? 'text-amber-300'
                              : 'text-[var(--text-primary)]'
                          }
                        `}
                      >
                        {isDraggingFiles
                          ? 'Отпустите файлы здесь'
                          : 'Перетащите файлы сюда'}
                      </p>

                      {!isDraggingFiles && (
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-sm text-[var(--text-primary)]/45 sm:justify-start">
                          <span>
                            или
                          </span>

                          <label className="cursor-pointer font-medium text-amber-400 hover:text-amber-300">
                            выберите на
                            компьютере

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
                      )}
                    </div>
                  </div>
                </div>

                {generalFiles.length >
                  0 && (
                  <div className="mt-3 space-y-2">
                    {generalFiles.map(
                      (item) => (
                        <div
                          key={
                            item.id
                          }
                          className="
                            flex items-center gap-3
                            rounded-xl
                            bg-[var(--hover-1)]
                            px-3 py-3
                          "
                        >
                          {item.preview ? (
                            <img
                              src={
                                item.preview
                              }
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)]">
                              <File className="h-5 w-5 text-[var(--text-primary)]/45" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base text-[var(--text-primary)]">
                              {
                                item.file
                                  .name
                              }
                            </p>

                            <p className="text-sm text-[var(--text-primary)]/40">
                              {formatFileSize(
                                item.file
                                  .size,
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeGeneralFile(
                                item.id,
                              )
                            }
                            className="
                              rounded-lg p-2
                              text-[var(--text-primary)]/40
                              transition
                              hover:bg-red-500/10
                              hover:text-red-400
                            "
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2 */}
          {/* ================================================================= */}

          {step === 2 && (
            <div>
              <div className="mb-7">
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Классификация
                </h2>

                <p className="mt-1 text-base text-[var(--text-primary)]/50">
                  Укажите тип, приоритет
                  и подходящие теги
                </p>
              </div>

              {/* AI loading */}

              {aiLoading &&
                !aiTimedOut && (
                  <div className="mb-7 flex items-center gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                      <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                    </div>

                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        Анализируем
                        заявку
                      </p>

                      <p className="mt-0.5 text-sm text-[var(--text-primary)]/55">
                        Подбираем
                        приоритет и теги
                      </p>
                    </div>
                  </div>
                )}

              {/* AI timeout */}

              {aiTimedOut &&
                !aiSuggestion && (
                  <div className="mb-7 flex items-center gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
                    <Clock className="h-6 w-6 shrink-0 text-amber-400" />

                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        Не удалось подобрать
                        классификацию
                      </p>

                      <p className="mt-0.5 text-sm text-[var(--text-primary)]/55">
                        Выберите параметры
                        вручную
                      </p>
                    </div>
                  </div>
                )}

              {/* AI result */}

              {aiSuggestion &&
                !aiLoading && (
                  <div className="mb-7 flex items-center gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-4">
                    <Zap className="h-6 w-6 shrink-0 text-amber-400" />

                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        Классификация
                        подобрана
                      </p>

                      <p className="mt-0.5 text-sm text-[var(--text-primary)]/55">
                        Проверьте
                        предложенные
                        параметры перед
                        продолжением
                      </p>
                    </div>
                  </div>
                )}

              <div
                className={
                  aiLoading &&
                  !aiTimedOut
                    ? 'pointer-events-none opacity-50'
                    : ''
                }
              >
                {/* Type */}

                <section>
                  <label className="block text-lg font-semibold text-[var(--text-primary)]">
                    Тип заявки
                  </label>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {TICKET_TYPES.map(
                      (item) => {
                        const selected =
                          type ===
                          item.value;

                        const Icon =
                          item.icon;

                        return (
                          <button
                            key={
                              item.value
                            }
                            type="button"
                            onClick={() =>
                              setType(
                                item.value as TicketType,
                              )
                            }
                            className={`
                              flex min-h-[78px] items-center gap-4
                              rounded-xl border
                              px-4 py-3.5
                              text-left
                              transition
                              ${
                                selected
                                  ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
                                  : 'border-[var(--border-color)] bg-[var(--hover-1)]/40 hover:bg-[var(--hover-1)]'
                              }
                            `}
                          >
                            <Icon
                              className={`h-6 w-6 shrink-0 ${item.color}`}
                            />

                            <div className="min-w-0 flex-1">
                              <p className="text-base font-semibold text-[var(--text-primary)]">
                                {
                                  item.label
                                }
                              </p>

                              <p className="mt-0.5 text-sm text-[var(--text-primary)]/45">
                                {
                                  item.desc
                                }
                              </p>
                            </div>

                            {selected && (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--accent)]" />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </section>

                {/* Priority */}

                <section className="mt-9 border-t border-[var(--border-color)] pt-8">
                  <label className="block text-lg font-semibold text-[var(--text-primary)]">
                    Приоритет
                  </label>

                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {PRIORITIES.map(
                      (item) => {
                        const selected =
                          priority ===
                          item.value;

                        const Icon =
                          item.icon;

                        return (
                          <button
                            key={
                              item.value
                            }
                            type="button"
                            onClick={() =>
                              setPriority(
                                item.value as TicketPriority,
                              )
                            }
                            className={`
                              relative min-h-[145px]
                              rounded-xl border
                              px-4 py-5
                              text-center
                              transition-all
                              ${
                                selected
                                  ? item.selected
                                  : 'border-[var(--border-color)] bg-[var(--hover-1)]/40 hover:bg-[var(--hover-1)]'
                              }
                            `}
                          >
                            {selected && (
                              <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-[var(--text-primary)]/65" />
                            )}

                            <Icon
                              className={`
                                mx-auto mb-3
                                h-10 w-10
                                ${item.color}
                                ${
                                  selected
                                    ? 'opacity-100'
                                    : 'opacity-70'
                                }
                              `}
                            />

                            <p className="text-base font-semibold text-[var(--text-primary)]">
                              {
                                item.label
                              }
                            </p>

                            <p className="mt-1 text-sm text-[var(--text-primary)]/50">
                              {
                                item.desc
                              }
                            </p>
                          </button>
                        );
                      },
                    )}
                  </div>
                </section>

                {/* Tags */}

                <section className="mt-9 border-t border-[var(--border-color)] pt-8">
                  <div className="flex items-baseline gap-2">
                    <label className="text-lg font-semibold text-[var(--text-primary)]">
                      Теги
                    </label>

                    <span className="text-sm text-[var(--text-primary)]/40">
                      необязательно
                    </span>
                  </div>

                  {aiSuggestedTags.length >
                    0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-medium text-amber-400">
                        Предложенные теги
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {aiSuggestedTags.map(
                          (tag) => {
                            const selected =
                              tags.some(
                                (
                                  current,
                                ) =>
                                  current.name ===
                                  tag.name,
                              );

                            return (
                              <button
                                key={
                                  tag.name
                                }
                                type="button"
                                onClick={() =>
                                  togglePresetTag(
                                    tag,
                                  )
                                }
                                className={`
                                  inline-flex items-center gap-2
                                  rounded-lg border
                                  px-4 py-2
                                  text-base
                                  transition
                                  ${
                                    selected
                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                      : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]'
                                  }
                                `}
                              >
                                {selected && (
                                  <Check className="h-4 w-4" />
                                )}

                                {
                                  tag.name
                                }
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {PRESET_TAGS.map(
                      (tag) => {
                        const selected =
                          tags.some(
                            (current) =>
                              current.name ===
                              tag.name,
                          );

                        return (
                          <button
                            key={
                              tag.name
                            }
                            type="button"
                            onClick={() =>
                              togglePresetTag(
                                tag,
                              )
                            }
                            className={`
                              inline-flex items-center gap-2
                              rounded-lg border
                              px-4 py-2
                              text-base
                              transition
                              ${
                                selected
                                  ? ''
                                  : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]'
                              }
                            `}
                            style={
                              selected
                                ? {
                                    backgroundColor: `${tag.color}18`,
                                    borderColor: `${tag.color}55`,
                                    color:
                                      tag.color,
                                  }
                                : undefined
                            }
                          >
                            {selected && (
                              <Check className="h-4 w-4" />
                            )}

                            {
                              tag.name
                            }
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="mt-4">
                    {!showCustomTagInput ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowCustomTagInput(
                            true,
                          )
                        }
                        className="inline-flex items-center gap-2 text-base font-medium text-[var(--accent)] hover:opacity-80"
                      >
                        <Plus className="h-4 w-4" />
                        Добавить свой тег
                      </button>
                    ) : (
                      <div className="flex max-w-lg gap-2">
                        <input
                          value={
                            newTagInput
                          }
                          onChange={(
                            event,
                          ) =>
                            setNewTagInput(
                              event.target
                                .value,
                            )
                          }
                          onKeyDown={(
                            event,
                          ) => {
                            if (
                              event.key ===
                              'Enter'
                            ) {
                              event.preventDefault();
                              addCustomTag();
                            }
                          }}
                          placeholder="Название тега"
                          className="input-field min-w-0 flex-1 py-3 text-base"
                        />

                        <button
                          type="button"
                          disabled={
                            !newTagInput.trim()
                          }
                          onClick={
                            addCustomTag
                          }
                          className="
                            rounded-xl
                            bg-[var(--accent)]
                            px-5 py-3
                            text-base font-medium
                            text-white
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
                            setNewTagInput(
                              '',
                            );
                          }}
                          className="rounded-xl px-3 text-[var(--text-primary)]/40 hover:bg-[var(--hover-1)]"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {tags.map(
                        (tag) => (
                          <span
                            key={
                              tag.name
                            }
                            className="
                              inline-flex items-center gap-2
                              rounded-lg border
                              px-3 py-2
                              text-sm font-medium
                            "
                            style={{
                              backgroundColor: `${
                                tag.color ||
                                '#71717a'
                              }14`,

                              borderColor: `${
                                tag.color ||
                                '#71717a'
                              }40`,

                              color:
                                tag.color ||
                                '#d1d5db',
                            }}
                          >
                            {
                              tag.name
                            }

                            <button
                              type="button"
                              onClick={() =>
                                removeTag(
                                  tag.name,
                                )
                              }
                              className="opacity-60 hover:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3 */}
          {/* ================================================================= */}

          {step === 3 && (
            <div>
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Проверьте заявку
                </h2>

                <p className="mt-1 text-base text-[var(--text-primary)]/50">
                  Убедитесь, что всё указано
                  верно перед отправкой
                </p>
              </div>

              <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
                {/* Binding */}

                <section>
                  <p className="mb-2 text-sm font-medium text-[var(--text-primary)]/45">
                    Привязка
                  </p>

                  {selectedProject ? (
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-6 w-6 shrink-0 text-amber-400" />

                      <div>
                        <p className="text-base font-semibold text-[var(--text-primary)]">
                          {
                            selectedProject.name
                          }
                        </p>

                        <p className="text-sm text-[var(--text-primary)]/45">
                          {
                            selectedProject.key
                          }
                        </p>
                      </div>
                    </div>
                  ) : selectedCounterparty ? (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-6 w-6 shrink-0 text-blue-400" />

                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {cpName(
                          selectedCounterparty,
                        )}
                      </p>
                    </div>
                  ) : isCustomer &&
                    customerCounterparty ? (
                    <div className="flex items-center gap-3">
                      <Building2 className="h-6 w-6 shrink-0 text-blue-400" />

                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {cpName(
                          customerCounterparty,
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-base text-[var(--text-primary)]/55">
                      Без привязки
                    </p>
                  )}
                </section>

                {/* Reporter */}

                <section>
                  <p className="mb-2 text-sm font-medium text-[var(--text-primary)]/45">
                    Инициатор
                  </p>

                  <div className="flex items-center gap-3">
                    <User className="h-6 w-6 shrink-0 text-emerald-400" />

                    <div>
                      <p className="text-base font-semibold text-[var(--text-primary)]">
                        {selectedReporter
                          ? uName(
                              selectedReporter,
                            )
                          : user?.full_name ||
                            user?.username ||
                            'Вы'}
                      </p>

                      <p className="text-sm text-[var(--text-primary)]/45">
                        {selectedReporter
                          ? selectedReporter.email
                          : user?.email}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="my-8 border-t border-[var(--border-color)]" />

              {/* Title */}

              <section>
                <p className="mb-2 text-sm font-medium text-[var(--text-primary)]/45">
                  Тема
                </p>

                <p className="break-words text-xl font-semibold text-[var(--text-primary)]">
                  {title || '—'}
                </p>
              </section>

              {/* Description */}

              <section className="mt-7">
                <p className="mb-3 text-sm font-medium text-[var(--text-primary)]/45">
                  Описание
                </p>

                <div className="space-y-4">
                  {descriptionBlocks.map(
                    (block) => {
                      if (
                        block.type ===
                        'text'
                      ) {
                        if (
                          !block.value.trim()
                        ) {
                          return null;
                        }

                        return (
                          <div
                            key={
                              block.id
                            }
                            className="whitespace-pre-wrap break-words text-base leading-7 text-[var(--text-primary)]/90"
                          >
                            {renderInlineFormatting(
                              block.value,
                            )}
                          </div>
                        );
                      }

                      if (
                        block.type ===
                          'image' &&
                        block.localPreview
                      ) {
                        return (
                          <img
                            key={
                              block.id
                            }
                            src={
                              block.localPreview
                            }
                            alt="Вложение"
                            className="max-h-[420px] max-w-full rounded-xl border border-[var(--border-color)] object-contain"
                          />
                        );
                      }

                      return null;
                    },
                  )}
                </div>
              </section>

              <div className="my-8 border-t border-[var(--border-color)]" />

              {/* Classification */}

              <div className="grid gap-6 sm:grid-cols-2">
                <section>
                  <p className="mb-3 text-sm font-medium text-[var(--text-primary)]/45">
                    Тип заявки
                  </p>

                  {currentType && (
                    <div className="flex items-center gap-3">
                      <currentType.icon
                        className={`h-6 w-6 ${currentType.color}`}
                      />

                      <span className="text-base font-semibold text-[var(--text-primary)]">
                        {
                          currentType.label
                        }
                      </span>
                    </div>
                  )}
                </section>

                <section>
                  <p className="mb-3 text-sm font-medium text-[var(--text-primary)]/45">
                    Приоритет
                  </p>

                  {currentPriority && (
                    <div className="flex items-center gap-3">
                      <currentPriority.icon
                        className={`h-7 w-7 ${currentPriority.color}`}
                      />

                      <span className="text-base font-semibold text-[var(--text-primary)]">
                        {
                          currentPriority.label
                        }
                      </span>
                    </div>
                  )}
                </section>
              </div>

              {/* Tags */}

              {tags.length > 0 && (
                <section className="mt-8">
                  <p className="mb-3 text-sm font-medium text-[var(--text-primary)]/45">
                    Теги
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {tags.map(
                      (tag) => (
                        <span
                          key={
                            tag.name
                          }
                          className="rounded-lg px-3 py-1.5 text-sm font-medium"
                          style={{
                            backgroundColor: `${
                              tag.color ||
                              '#71717a'
                            }20`,
                            color:
                              tag.color ||
                              '#d1d5db',
                          }}
                        >
                          {tag.name}
                        </span>
                      ),
                    )}
                  </div>
                </section>
              )}

              {/* Files */}

              {generalFiles.length > 0 && (
                <section className="mt-8">
                  <p className="mb-3 text-sm font-medium text-[var(--text-primary)]/45">
                    Файлы ·{' '}
                    {generalFiles.length}
                  </p>

                  <div className="space-y-2">
                    {generalFiles.map(
                      (item) => (
                        <div
                          key={
                            item.id
                          }
                          className="flex items-center gap-3"
                        >
                          <File className="h-5 w-5 shrink-0 text-[var(--text-primary)]/40" />

                          <span className="min-w-0 flex-1 truncate text-base text-[var(--text-primary)]">
                            {
                              item.file
                                .name
                            }
                          </span>

                          <span className="shrink-0 text-sm text-[var(--text-primary)]/40">
                            {formatFileSize(
                              item.file
                                .size,
                            )}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* Navigation */}
        {/* ===================================================================== */}

        <footer
          className="
            flex items-center justify-between
            border-t border-[var(--border-color)]
            px-5 py-5 sm:px-7 md:px-8
          "
        >
          {step > 1 ? (
            <button
              type="button"
              onClick={
                goToPreviousStep
              }
              className="
                inline-flex items-center gap-2
                rounded-xl
                border border-[var(--border-color)]
                px-5 py-3
                text-base font-medium
                text-[var(--text-primary)]/70
                transition
                hover:bg-[var(--hover-1)]
                hover:text-[var(--text-primary)]
              "
            >
              <ArrowLeft className="h-5 w-5" />
              {backButtonLabel}
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={
                nextButtonDisabled
              }
              onClick={
                goToNextStep
              }
              className="
                ml-auto inline-flex items-center gap-2
                rounded-xl
                bg-[var(--accent)]
                px-7 py-3
                text-base font-semibold
                text-white
                transition
                hover:brightness-110
                disabled:cursor-not-allowed
                disabled:opacity-40
                disabled:hover:brightness-100
              "
            >
              {step === 1
                ? 'К классификации'
                : 'К проверке'}

              <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={
                handleSubmit
              }
              className="
                ml-auto inline-flex items-center gap-2
                rounded-xl
                bg-[var(--accent)]
                px-7 py-3
                text-base font-semibold
                text-white
                transition
                hover:brightness-110
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Создаём...
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5" />
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