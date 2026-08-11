import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, FileText,
  Tag, Upload, X, CheckCircle2, File, Building2, Zap, Plus,
  Search, FolderOpen, User, AlertCircle, Clock, Trash2, Edit3,
} from 'lucide-react';
import { SignalLow, SignalMedium, SignalHigh, Flame } from 'lucide-react';
import { MessageSquare, HelpCircle, AlertTriangle, CheckCircle } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type { Counterparty, TicketTag, TicketPriority, TicketType, Project } from '../types';
import { SpellCheckField } from '../components/helpers/SpellCheckField';
import { TicketDescriptionContent } from '../components/helpers/TicketDescriptionContent';
import {
  TicketEditor, serializeBlocks, type DescriptionBlock,
} from '../components/helpers/TicketEditor';

// ─── Константы ────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'new_ticket_draft';
const AI_TIMEOUT_MS = 5000;

const STEPS = [
  {
    num: 1,
    title: 'Описание',
    long: 'Описание заявки',
    hint: 'Укажите тему, подробно опишите проблему и при необходимости прикрепите файлы.',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    num: 2,
    title: 'Классификация',
    long: 'Тип, приоритет и теги',
    hint: 'Выберите тип заявки и проверьте предложенные ИИ приоритет и теги.',
    icon: <Tag className="w-5 h-5" />,
  },
  {
    num: 3,
    title: 'Отправка',
    long: 'Проверка и отправка',
    hint: 'Проверьте все данные и создайте заявку. При необходимости отредактируйте любой раздел.',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
];

const PRIORITIES = [
  {
    value: 'low', label: 'Низкий',
    color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    activeColor: 'bg-emerald-500/25 text-[var(--text-primary)] border-emerald-400 ring-2 ring-emerald-500/40',
    icon: <SignalLow className="w-7 h-7" />, desc: 'Плановый',
  },
  {
    value: 'medium', label: 'Средний',
    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    activeColor: 'bg-yellow-500/25 text-[var(--text-primary)] border-yellow-400 ring-2 ring-yellow-500/40',
    icon: <SignalMedium className="w-7 h-7" />, desc: 'Стандартный',
  },
  {
    value: 'high', label: 'Высокий',
    color: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    activeColor: 'bg-orange-500/25 text-[var(--text-primary)] border-orange-400 ring-2 ring-orange-500/40',
    icon: <SignalHigh className="w-7 h-7" />, desc: 'Срочный',
  },
  {
    value: 'critical', label: 'Критический',
    color: 'bg-red-500/15 text-red-400 border-red-500/30',
    activeColor: 'bg-red-500/25 text-[var(--text-primary)] border-red-400 ring-2 ring-red-500/40',
    icon: <Flame className="w-7 h-7" />, desc: 'Немедленно',
  },
];

const TICKET_TYPES = [
  { value: 'Инцидент', label: 'Инцидент', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-red-500/15 text-red-400 border-red-500/30', activeColor: 'bg-red-500/25 text-[var(--text-primary)] border-red-400 ring-2 ring-red-500/40', desc: 'Сбой или ошибка' },
  { value: 'Запрос на услугу', label: 'Запрос на услугу', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', activeColor: 'bg-blue-500/25 text-[var(--text-primary)] border-blue-400 ring-2 ring-blue-500/40', desc: 'Стандартная услуга' },
  { value: 'Консультация', label: 'Консультация', icon: <HelpCircle className="w-4 h-4" />, color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', activeColor: 'bg-slate-500/25 text-[var(--text-primary)] border-slate-400 ring-2 ring-slate-500/40', desc: 'Вопрос' },
  { value: 'Жалоба', label: 'Жалоба', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', activeColor: 'bg-orange-500/25 text-[var(--text-primary)] border-orange-400 ring-2 ring-orange-500/40', desc: 'Жалоба клиента' },
  { value: 'Задача', label: 'Задача', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', activeColor: 'bg-emerald-500/25 text-[var(--text-primary)] border-emerald-400 ring-2 ring-emerald-500/40', desc: 'Плановая работа' },
  { value: 'Проблема', label: 'Проблема', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', activeColor: 'bg-yellow-500/25 text-[var(--text-primary)] border-yellow-400 ring-2 ring-yellow-500/40', desc: 'Корневая причина' },
  { value: 'Запрос на изменение', label: 'Изменение', icon: <Edit3 className="w-4 h-4" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', activeColor: 'bg-blue-500/25 text-[var(--text-primary)] border-blue-400 ring-2 ring-blue-500/40', desc: 'Изменение системы' },
  { value: 'Улучшение', label: 'Улучшение', icon: <Sparkles className="w-4 h-4" />, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', activeColor: 'bg-emerald-500/25 text-[var(--text-primary)] border-emerald-400 ring-2 ring-emerald-500/40', desc: 'Новая функция' },
  { value: 'Прочее', label: 'Прочее', icon: <MessageSquare className="w-4 h-4" />, color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', activeColor: 'bg-slate-500/25 text-[var(--text-primary)] border-slate-400 ring-2 ring-slate-500/40', desc: 'Другое' },
];

const PRESET_TAGS = [
  { name: 'Инцидент', color: '#dc2626' },
  { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' },
  { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#6366f1' },
  { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

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

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];
type SelectionType = 'project' | 'counterparty' | null;

// ─── Draft ────────────────────────────────────────────────────────────────────

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
}

function saveDraft(data: DraftData) {
  try {
    const cleanBlocks = data.descriptionBlocks.map(b =>
      b.type === 'image' ? { id: b.id, type: 'image' as const, value: b.value } : { ...b }
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, descriptionBlocks: cleanBlocks }));
  } catch { }
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DraftData;
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();
  const pageRef = useRef<HTMLDivElement>(null);

  const draft = useRef(loadDraft());

  // ── State ──────────────────────────────────────────────────────────────────

  const [step, setStep] = useState(draft.current?.step || 1);
  const [title, setTitle] = useState(draft.current?.title || '');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(!!draft.current);

  const [descriptionBlocks, setDescriptionBlocks] = useState<DescriptionBlock[]>(
    draft.current?.descriptionBlocks?.length
      ? draft.current.descriptionBlocks
      : [{ id: 'init', type: 'text', value: '' }]
  );
  const description = serializeBlocks(descriptionBlocks);

  const [priority, setPriority] = useState<TicketPriority>(draft.current?.priority || 'medium');
  const [type, setType] = useState<TicketType>(draft.current?.type || 'Инцидент');
  const [tags, setTags] = useState<TicketTag[]>(draft.current?.tags || []);
  const [generalFiles, setGeneralFiles] = useState<GeneralFile[]>([]);

  const [customerCounterparty, setCustomerCounterparty] = useState<Counterparty | null>(null);
  const [selectionType, setSelectionType] = useState<SelectionType>(draft.current?.selectionType ?? null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [counterpartySearch, setCounterpartySearch] = useState(draft.current?.counterpartySearch || '');
  const [showCounterpartyDropdown, setShowCounterpartyDropdown] = useState(false);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState(draft.current?.projectSearch || '');

  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedReporter, setSelectedReporter] = useState<SimpleUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showReporterDropdown, setShowReporterDropdown] = useState(false);
  const [reporterSearch, setReporterSearch] = useState(draft.current?.reporterSearch || '');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTimedOut, setAiTimedOut] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<TicketTag[]>([]);

  const [newTagInput, setNewTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────

  const aiDoneRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const titleRef = useRef('');
  const descriptionRef = useRef('');
  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  titleRef.current = title;
  descriptionRef.current = description;

  // ── Derived ────────────────────────────────────────────────────────────────

  const isCustomer = user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectCounterparty = (!isCustomer && user?.roles?.some(r => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const hasDescription = descriptionBlocks.some(
    b => (b.type === 'text' && b.value.trim().length > 0) || (b.type === 'image' && b.localFile)
  );

  const currentStepMeta = STEPS[step - 1];
  const progressPercent = ((step - 1) / (STEPS.length - 1)) * 100;

  const backLabel =
    step === 1 ? 'Закрыть создание' :
    step === 2 ? '← Назад к описанию' :
    '← Назад к классификации';

  const nextLabel =
    step === 1 ? 'Продолжить: классификация' :
    'Продолжить: проверка';

  const footerHint =
    step === 1 ? 'Заполните тему и описание, затем продолжите.' :
    step === 2 ? 'Выберите тип, приоритет и теги.' :
    'Проверьте данные и создайте заявку.';

  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const prjName = (p: Project) => `${p.key} – ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;

  // ── Draft auto-save ────────────────────────────────────────────────────────

  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      saveDraft({
        step, title, descriptionBlocks, priority, type, tags, selectionType,
        selectedCounterpartyId: selectedCounterparty?.id || null,
        selectedCounterpartyName: selectedCounterparty ? cpName(selectedCounterparty) : null,
        selectedProjectId: selectedProject?.id || null,
        selectedProjectName: selectedProject ? prjName(selectedProject) : null,
        selectedReporterId: selectedReporter?.id || null,
        selectedReporterName: selectedReporter ? uName(selectedReporter) : null,
        counterpartySearch, projectSearch, reporterSearch,
        savedAt: Date.now(),
      });
      setHasDraft(true);
    }, 500);
    return () => { if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current); };
  }, [step, title, descriptionBlocks, priority, type, tags, selectionType,
      selectedCounterparty, selectedProject, selectedReporter,
      counterpartySearch, projectSearch, reporterSearch]);

  // ── Restore draft ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!draft.current || !canSelectCounterparty) return;
    const d = draft.current;

    if (d.selectionType === 'counterparty' && d.selectedCounterpartyId) {
      counterpartiesApi.getById(d.selectedCounterpartyId)
        .then(cp => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); })
        .catch(() => { });
    }

    if (d.selectionType === 'project' && d.selectedProjectId) {
      projectsApi.getAll(1, 100).then(res => {
        setProjects(res.items);
        const found = res.items.find(p => p.id === d.selectedProjectId);
        if (found) {
          setSelectedProject(found);
          setProjectSearch(prjName(found));
          if (found.counterparty_id) {
            counterpartiesApi.getById(found.counterparty_id)
              .then(cp => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); })
              .catch(() => { });
          }
        }
      }).catch(() => { });
    }

    draft.current = null;
  }, [canSelectCounterparty]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node))
        setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node))
        setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node))
        setShowReporterDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    pageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  useEffect(() => {
    if (isCustomer && user?.counterparty_id) loadCustomerCounterparty();
  }, [user]);

  useEffect(() => {
    if (canSelectCounterparty) loadCounterparties();
  }, [canSelectCounterparty]);

  useEffect(() => {
    if (selectionType === 'counterparty' && selectedCounterparty) loadProjects(selectedCounterparty.id);
    else if (selectionType === 'project') loadProjectsForAll();
    else setProjects([]);
  }, [selectionType, selectedCounterparty]);

  useEffect(() => {
    if (selectedCounterparty) loadUsers(selectedCounterparty.id);
    else if (selectedProject?.counterparty_id) loadUsers(selectedProject.counterparty_id);
    else { setUsers([]); setSelectedReporter(null); setReporterSearch(''); }
  }, [selectedCounterparty, selectedProject]);

  useEffect(() => {
    if (!preselectedProjectId || !canSelectCounterparty) return;
    (async () => {
      setSelectionType('project');
      try {
        const items = (await projectsApi.getAll(1, 100)).items;
        setProjects(items);
        const found = items.find(p => p.id === preselectedProjectId);
        if (found) {
          setSelectedProject(found);
          setProjectSearch(prjName(found));
          if (found.counterparty_id) {
            try {
              const cp = await counterpartiesApi.getById(found.counterparty_id);
              setSelectedCounterparty(cp);
              setCounterpartySearch(cpName(cp));
            } catch { }
          }
        }
      } catch { }
    })();
  }, [preselectedProjectId, canSelectCounterparty]);

  // ── AI ─────────────────────────────────────────────────────────────────────

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
    const currentDesc = descriptionRef.current.trim();
    if (!currentTitle || !currentDesc) return;

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

    ticketsApi.predict(currentTitle, currentDesc)
      .then(r => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        setAiSuggestion(r);
        setAiSuggestedTags(r.suggested_tags || []);
        setPriority(r.suggested_priority);
        setTags(r.suggested_tags || []);
        setAiLoading(false);
        setAiTimedOut(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        console.error('AI prediction failed:', err);
        setAiLoading(false);
        setAiTimedOut(true);
      });

    return () => { clearTimeout(timeoutId); controller.abort(); };
  }, [step]);

  useEffect(() => {
    if (validationErrors.length > 0 && title.trim() && hasDescription) setValidationErrors([]);
  }, [title, descriptionBlocks]);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCustomerCounterparty = async () => {
    if (!user?.counterparty_id) return;
    try { setCustomerCounterparty(await counterpartiesApi.getById(user.counterparty_id)); } catch { }
  };

  const loadCounterparties = async (search?: string) => {
    setLoadingCounterparties(true);
    try {
      let items = (await counterpartiesApi.getAll(1, 50)).items;
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(c =>
          c.name?.toLowerCase().includes(q) ||
          c.legal_name?.toLowerCase().includes(q) ||
          c.inn?.includes(search)
        );
      }
      setCounterparties(items);
      if (!search && preselectedCounterpartyId && !selectedCounterparty) {
        const found = items.find(c => c.id === preselectedCounterpartyId);
        if (found) {
          setSelectionType('counterparty');
          setSelectedCounterparty(found);
          setCounterpartySearch(cpName(found));
        }
      }
    } catch { }
    finally { setLoadingCounterparties(false); }
  };

  const loadProjects = async (cpId: string) => {
    setLoadingProjects(true);
    try { setProjects((await projectsApi.getByCounterparty(cpId, 1, 50)).items); }
    catch { }
    finally { setLoadingProjects(false); }
  };

  const loadProjectsForAll = async (): Promise<Project[]> => {
    setLoadingProjects(true);
    try {
      const items = (await projectsApi.getAll(1, 100)).items;
      setProjects(items);
      return items;
    } catch { return []; }
    finally { setLoadingProjects(false); }
  };

  const loadUsers = async (cpId: string) => {
    setLoadingUsers(true);
    try {
      const items = (await usersApi.getCustomers(cpId, 1, 100)).items.map(c => ({
        id: c.id, username: c.username, full_name: c.full_name, email: c.email, role: c.role,
      }));
      let all = [...items];
      if (!items.find(u => u.id === user?.user_id) && user?.user_id) {
        all = [{ id: user.user_id, username: user.username || '', full_name: user.full_name || null, email: user.email || '', role: user.role }, ...items];
      }
      setUsers(all); setSelectedReporter(null); setReporterSearch('');
    } catch { }
    finally { setLoadingUsers(false); }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectionTypeChange = (t: SelectionType) => {
    setSelectionType(t);
    setSelectedCounterparty(null);
    setSelectedProject(null);
    setCounterpartySearch('');
    setProjectSearch('');
    setProjects([]);
  };

  const togglePresetTag = (tag: TicketTag) => {
    setTags(p => p.some(t => t.name === tag.name) ? p.filter(t => t.name !== tag.name) : [...p, tag]);
  };

  const addCustomTag = () => {
    const n = newTagInput.trim();
    if (!n || tags.some(t => t.name.toLowerCase() === n.toLowerCase())) return;
    setTags(p => [...p, { name: n, color: '#a1a1aa' }]);
    setNewTagInput('');
    setShowCustomTagInput(false);
  };

  const removeTag = (name: string) => setTags(p => p.filter(t => t.name !== name));

  const validateStep1 = (): boolean => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Укажите тему заявки');
    if (!hasDescription) errors.push('Добавьте описание заявки');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const openStep = (target: number) => {
    if (target === step) return;
    if (target < step) { setValidationErrors([]); setStep(target); return; }
    if (target === 2 && step === 1) { if (!validateStep1()) return; setValidationErrors([]); setStep(2); }
    if (target === 3 && step === 2) setStep(3);
  };

  const handleNextStep = () => {
    if (step === 1 && !validateStep1()) return;
    setValidationErrors([]);
    setStep(step + 1);
  };

  const handleClearDraft = () => {
    clearDraft();
    setHasDraft(false); setStep(1); setTitle('');
    setDescriptionBlocks([{ id: 'init', type: 'text', value: '' }]);
    setPriority('medium'); setType('Инцидент'); setTags([]); setGeneralFiles([]);
    setSelectionType(null); setSelectedCounterparty(null); setSelectedProject(null);
    setSelectedReporter(null); setCounterpartySearch(''); setProjectSearch(''); setReporterSearch('');
    setAiSuggestion(null); setAiSuggestedTags([]); aiDoneRef.current = false;
  };

  const handleGeneralFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newF: GeneralFile[] = files.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending',
    }));
    setGeneralFiles(p => [...p, ...newF].slice(0, 10));
    e.target.value = '';
  };

  const handleGeneralDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const newF: GeneralFile[] = files.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending',
    }));
    setGeneralFiles(p => [...p, ...newF].slice(0, 10));
  };

  const removeGeneralFile = (id: string) => {
    const f = generalFiles.find(x => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setGeneralFiles(p => p.filter(x => x.id !== id));
  };

  const formatFileSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const textOnlyDesc = descriptionBlocks
        .filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.value.trim()).filter(Boolean).join('\n\n');

      const data: any = {
        title,
        description: textOnlyDesc || '(описание с изображениями)',
        priority, type,
        tags: tags.map(t => ({ name: t.name, color: t.color || '#64748b' })),
        reporter_id: user?.id,
      };

      if (isCustomer && customerCounterparty) data.counterparty_id = customerCounterparty.id;
      else if (selectedProject) data.project_id = selectedProject.id;
      else if (selectedCounterparty) data.counterparty_id = selectedCounterparty.id;

      if (canSelectReporter && selectedReporter) data.reporter_id = selectedReporter.id;

      const ticket = await ticketsApi.create(data);

      const imageBlocks = descriptionBlocks.filter(
        (b): b is Extract<DescriptionBlock, { type: 'image' }> => b.type === 'image' && !!b.localFile
      );
      const uploadMap: Record<string, string> = {};
      for (const block of imageBlocks) {
        try {
          const att = await attachmentsApi.uploadAttachment(block.localFile!, 'ticket', ticket.id);
          uploadMap[block.id] = att.id;
        } catch { }
      }
      if (imageBlocks.length > 0) {
        let finalDesc = serializeBlocks(descriptionBlocks);
        for (const [blockId, attachmentId] of Object.entries(uploadMap))
          finalDesc = finalDesc.replaceAll(`![image](local:${blockId})`, `![image](media://${attachmentId})`);
        finalDesc = finalDesc.replace(/!\[image\]\(local:[a-f0-9-]+\)\n*/gi, '');
        await ticketsApi.update(ticket.id, { description: finalDesc });
      }
      for (const f of generalFiles.filter(x => x.status === 'pending')) {
        try { await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id); } catch { }
      }

      clearDraft();
      setHasDraft(false);
      navigate('/tickets');
    } catch (err: any) {
      console.error('Submit failed:', err?.response?.data || err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reusable UI pieces ─────────────────────────────────────────────────────

  /** Dropdown input with search */
  const DropdownInput = ({
    value, onChange, onFocus, placeholder, loading, show, children, ref: outerRef,
  }: {
    value: string;
    onChange: (v: string) => void;
    onFocus: () => void;
    placeholder: string;
    loading?: boolean;
    show: boolean;
    children: React.ReactNode;
    ref?: React.RefObject<HTMLDivElement>;
  }) => (
    <div className="relative" ref={outerRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/35 pointer-events-none" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="input-field py-3 pl-10 pr-4 text-sm w-full"
      />
      {show && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {loading
            ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/40" /></div>
            : children}
        </div>
      )}
    </div>
  );

  /** Field label */
  const Label = ({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) => (
    <label className="block mb-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{children}</span>
      {required && <span className="text-red-400 ml-1">*</span>}
      {hint && <span className="text-xs text-[var(--text-primary)]/40 ml-2">{hint}</span>}
    </label>
  );

  /** Section divider */
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
      {children}
    </h3>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto pb-32 px-4 lg:px-0">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6 pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-[var(--hover-1)] hover:bg-[var(--hover-2)]
                       border border-[var(--border-color)]
                       text-sm font-medium text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Закрыть
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Новая заявка</h1>
            <p className="text-xs text-[var(--text-primary)]/45">Черновик сохраняется автоматически</p>
          </div>
        </div>

        {hasDraft && (
          <button
            onClick={handleClearDraft}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm
                       bg-[var(--hover-1)] hover:bg-red-500/15 text-[var(--text-primary)]/55
                       hover:text-red-400 border border-[var(--border-color)] hover:border-red-500/35 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Очистить черновик
          </button>
        )}
      </div>

      {/* ── Stepper ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] overflow-hidden shadow-sm">
        {/* Progress bar */}
        <div className="h-1 bg-[var(--hover-1)]">
          <div
            className="h-full bg-gradient-to-r from-red-700 to-red-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step cards */}
        <div className="grid grid-cols-3 divide-x divide-[var(--border-color)]">
          {STEPS.map(s => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            const isClickable = s.num < step || (s.num === step + 1 && step === 1 && title.trim() && hasDescription);

            return (
              <button
                key={s.num}
                type="button"
                onClick={() => openStep(s.num)}
                disabled={!isClickable && !isActive && !isDone}
                className={`group relative flex flex-col items-start gap-1.5 p-4 sm:p-5 text-left transition-all duration-200
                  ${isActive
                    ? 'bg-red-700/8'
                    : isDone
                      ? 'hover:bg-emerald-500/5 cursor-pointer'
                      : isClickable
                        ? 'hover:bg-[var(--hover-1)] cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                  }`}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
                )}

                <div className="flex items-center gap-2.5 w-full">
                  {/* Icon bubble */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors
                    ${isActive
                      ? 'bg-red-700 text-white'
                      : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40'
                    }`}
                  >
                    {isDone
                      ? <CheckCircle2 className="w-4 h-4" />
                      : s.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium uppercase tracking-wider
                        ${isActive ? 'text-red-400' : isDone ? 'text-emerald-400' : 'text-[var(--text-primary)]/30'}`}
                      >
                        {isDone ? 'Готово' : isActive ? 'Сейчас' : `Шаг ${s.num}`}
                      </span>
                    </div>
                    <div className={`font-semibold text-sm mt-0.5
                      ${isActive ? 'text-[var(--text-primary)]' : isDone ? 'text-[var(--text-primary)]/80' : 'text-[var(--text-primary)]/45'}`}
                    >
                      {s.title}
                    </div>
                  </div>

                  {/* Navigation hint for done steps */}
                  {isDone && (
                    <Edit3 className="w-3.5 h-3.5 text-[var(--text-primary)]/25 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  )}
                </div>

                {/* Current step hint */}
                {isActive && (
                  <p className="text-xs text-[var(--text-primary)]/50 pl-10 leading-relaxed">
                    {s.hint}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Draft restored notice */}
      {hasDraft && step === 1 && title && (
        <div className="mb-5 p-3.5 rounded-xl bg-blue-500/8 border border-blue-500/25 flex items-center gap-3">
          <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-300/90">
            Восстановлен черновик — продолжите редактирование или{' '}
            <button onClick={handleClearDraft} className="underline hover:no-underline">очистите его</button>.
          </span>
        </div>
      )}

      {/* ── Main card ───────────────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">

        {/* Card header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]/40">
          <div className="w-10 h-10 rounded-2xl bg-red-700/15 text-red-400 flex items-center justify-center flex-shrink-0">
            {currentStepMeta.icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{currentStepMeta.long}</h2>
            <p className="text-sm text-[var(--text-primary)]/50">{currentStepMeta.hint}</p>
          </div>
        </div>

        <div className="p-6 md:p-8">

          {/* ══ Step 1 ══════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-7">

              {/* Validation */}
              {validationErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/25 space-y-2">
                  {validationErrors.map((err, i) => (
                    <div key={i} className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Привязка */}
              {canSelectCounterparty && (
                <div>
                  <Label>Привязка заявки</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'project' as SelectionType, icon: <FolderOpen className="w-4 h-4" />, label: 'К проекту', active: 'border-amber-500/60 bg-amber-500/10 text-amber-300' },
                      { key: 'counterparty' as SelectionType, icon: <Building2 className="w-4 h-4" />, label: 'К контрагенту', active: 'border-blue-500/60 bg-blue-500/10 text-blue-300' },
                      { key: null, icon: <X className="w-4 h-4" />, label: 'Без привязки', active: 'border-[var(--text-primary)]/40 bg-[var(--hover-2)] text-[var(--text-primary)]' },
                    ].map(opt => (
                      <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => handleSelectionTypeChange(opt.key)}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border text-xs font-medium transition-all
                          ${selectionType === opt.key
                            ? opt.active
                            : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'
                          }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Контрагент */}
              {canSelectCounterparty && selectionType === 'counterparty' && (
                <div>
                  <Label required>Контрагент</Label>
                  <div ref={counterpartyDropdownRef} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/35 pointer-events-none" />
                    <input
                      value={counterpartySearch}
                      onChange={e => { setCounterpartySearch(e.target.value); setShowCounterpartyDropdown(true); loadCounterparties(e.target.value); }}
                      onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }}
                      placeholder="Поиск по названию или ИНН..."
                      className="input-field py-3 pl-10 text-sm w-full"
                    />
                    {showCounterpartyDropdown && (
                      <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                        {loadingCounterparties
                          ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/40" /></div>
                          : counterparties.map(cp => (
                            <button key={cp.id}
                              onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}
                              className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm transition-colors">
                              <div className="font-medium text-[var(--text-primary)]">{cpName(cp)}</div>
                              {cp.inn && <div className="text-xs text-[var(--text-primary)]/40 mt-0.5">ИНН: {cp.inn}</div>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  {selectedCounterparty && (
                    <div className="mt-2 px-3.5 py-2.5 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-400 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      {cpName(selectedCounterparty)}
                    </div>
                  )}
                </div>
              )}

              {/* Проект */}
              {canSelectCounterparty && selectionType === 'project' && (
                <div>
                  <Label required>Проект</Label>
                  <div ref={projectDropdownRef} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/35 pointer-events-none" />
                    <input
                      value={projectSearch}
                      onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                      onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }}
                      placeholder="Поиск по ключу или названию..."
                      className="input-field py-3 pl-10 text-sm w-full"
                    />
                    {showProjectDropdown && (
                      <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                        {loadingProjects
                          ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/40" /></div>
                          : projects
                            .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase()))
                            .map(p => (
                              <button key={p.id}
                                onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}
                                className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm transition-colors">
                                <span className="text-amber-400 font-medium">{p.key}</span>
                                <span className="text-[var(--text-primary)]/80"> — {p.name}</span>
                              </button>
                            ))}
                      </div>
                    )}
                  </div>
                  {selectedProject && (
                    <div className="mt-2 px-3.5 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/25 text-amber-400 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      {prjName(selectedProject)}
                    </div>
                  )}
                </div>
              )}

              {/* Customer counterparty */}
              {isCustomer && customerCounterparty && (
                <div className="px-4 py-3.5 rounded-xl bg-blue-500/8 border border-blue-500/25 flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{customerCounterparty.name}</p>
                    {customerCounterparty.inn && <p className="text-xs text-[var(--text-primary)]/45">ИНН: {customerCounterparty.inn}</p>}
                  </div>
                </div>
              )}

              {/* Инициатор */}
              {canSelectReporter && (selectedCounterparty || selectedProject) && (
                <div>
                  <Label hint="(по умолчанию — вы)">Инициатор</Label>
                  <div ref={reporterDropdownRef} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/35 pointer-events-none" />
                    <input
                      value={reporterSearch}
                      onChange={e => { setReporterSearch(e.target.value); setShowReporterDropdown(true); }}
                      onFocus={() => setShowReporterDropdown(true)}
                      placeholder="Выберите инициатора..."
                      className="input-field py-3 pl-10 text-sm w-full"
                    />
                    {showReporterDropdown && (
                      <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                        {loadingUsers
                          ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/40" /></div>
                          : <>
                            <button onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}
                              className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] text-sm transition-colors">
                              <span className="font-medium text-[var(--text-primary)]">{user?.full_name || 'Вы'}</span>
                              <span className="text-[var(--text-primary)]/40 ml-2">(текущий пользователь)</span>
                            </button>
                            {users
                              .filter(u => !reporterSearch || u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) || u.email.toLowerCase().includes(reporterSearch.toLowerCase()))
                              .map(u => (
                                <button key={u.id}
                                  onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}
                                  className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm transition-colors">
                                  <div className="font-medium text-[var(--text-primary)]">{uName(u)}</div>
                                  <div className="text-xs text-[var(--text-primary)]/40">{u.email}</div>
                                </button>
                              ))}
                          </>}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-3.5 py-2 rounded-lg bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/55">
                    Инициатор: <span className="text-[var(--text-primary)] font-medium">{selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}</span>
                  </div>
                </div>
              )}

              {/* Тема */}
              <SpellCheckField value={title} onChange={setTitle} label="Тема заявки *">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Кратко опишите проблему или задачу..."
                  className={`input-field py-3.5 text-base w-full transition-shadow
                    ${validationErrors.includes('Укажите тему заявки') ? 'border-red-500/60 ring-1 ring-red-500/40' : ''}`}
                />
              </SpellCheckField>

              {/* Описание */}
              <div>
                <Label required>Подробное описание</Label>
                <div className={`transition-shadow ${validationErrors.includes('Добавьте описание заявки') ? 'ring-1 ring-red-500/40 rounded-2xl' : ''}`}>
                  <TicketEditor blocks={descriptionBlocks} onChange={setDescriptionBlocks} />
                </div>
              </div>

              {/* Файлы */}
              <div>
                <Label hint="необязательно">
                  <Upload className="inline w-4 h-4 mr-1.5 text-[var(--text-primary)]/40" />
                  Прикрепить файлы
                </Label>

                <div
                  onDrop={handleGeneralDrop}
                  onDragOver={e => e.preventDefault()}
                  className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-6 text-center
                             hover:border-[var(--text-primary)]/25 transition-colors cursor-default"
                >
                  <Upload className="w-7 h-7 text-[var(--text-primary)]/15 mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-primary)]/45 mb-3">Перетащите файлы сюда или</p>
                  <label className="inline-block">
                    <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
                    <span className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium cursor-pointer transition-colors">
                      Выбрать файлы
                    </span>
                  </label>
                  <p className="mt-2.5 text-xs text-[var(--text-primary)]/30">До 10 файлов · макс. 25 МБ каждый</p>
                </div>

                {generalFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {generalFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                        {f.preview
                          ? <img src={f.preview} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                          : <div className="w-9 h-9 rounded-lg bg-[var(--hover-2)] flex items-center justify-center flex-shrink-0">
                            <File className="w-4 h-4 text-[var(--text-primary)]/35" />
                          </div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-primary)] truncate">{f.file.name}</p>
                          <p className="text-xs text-[var(--text-primary)]/40">{formatFileSize(f.file.size)}</p>
                        </div>
                        <button onClick={() => removeGeneralFile(f.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/15 text-[var(--text-primary)]/35 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ Step 2 ══════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-8">

              {/* AI status */}
              {aiLoading && !aiTimedOut && (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <div className="relative flex-shrink-0 w-10 h-10">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                    </div>
                    <Loader2 className="w-10 h-10 text-amber-400/50 animate-spin absolute inset-0" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">ИИ анализирует заявку…</p>
                    <p className="text-xs text-[var(--text-primary)]/50 mt-0.5">Подбираем приоритет и теги — займёт несколько секунд</p>
                  </div>
                </div>
              )}

              {aiTimedOut && !aiSuggestion && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/8 border border-orange-500/25">
                  <Clock className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">ИИ не успел ответить</p>
                    <p className="text-xs text-[var(--text-primary)]/50 mt-0.5">
                      Выберите приоритет и теги самостоятельно.
                      {aiLoading && <span className="text-orange-400 ml-1">Ответ ещё ожидается в фоне…</span>}
                    </p>
                  </div>
                </div>
              )}

              {aiSuggestion && !aiLoading && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">ИИ предложил классификацию</p>
                    <p className="text-xs text-[var(--text-primary)]/50">Проверьте и скорректируйте при необходимости</p>
                  </div>
                </div>
              )}

              <div className={aiLoading && !aiTimedOut ? 'opacity-40 pointer-events-none' : ''}>

                {/* Тип */}
                <div>
                  <SectionTitle><Tag className="w-4 h-4 text-[var(--text-primary)]/40" />Тип заявки</SectionTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TICKET_TYPES.map(t => {
                      const isSelected = type === t.value;
                      return (
                        <button
                          key={t.value}
                          onClick={() => setType(t.value as TicketType)}
                          className={`relative px-4 py-3.5 rounded-xl text-left border transition-all duration-150
                            ${isSelected
                              ? `${t.activeColor} shadow-sm`
                              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--hover-2)]'
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`flex-shrink-0 ${isSelected ? '' : 'opacity-40'}`}>{t.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm leading-tight">{t.label}</div>
                              <div className="text-xs opacity-55 mt-0.5">{t.desc}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 flex-shrink-0 opacity-80" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Приоритет */}
                <div className="mt-8">
                  <SectionTitle><SignalHigh className="w-4 h-4 text-[var(--text-primary)]/40" />Приоритет</SectionTitle>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {PRIORITIES.map(p => {
                      const isSelected = priority === p.value;
                      return (
                        <button
                          key={p.value}
                          onClick={() => setPriority(p.value as TicketPriority)}
                          className={`px-4 py-5 rounded-xl text-center border transition-all duration-150
                            ${isSelected
                              ? `${p.activeColor} shadow-sm`
                              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'
                            }`}
                        >
                          <div className="flex flex-col items-center gap-2.5">
                            <div className={`transition-opacity ${isSelected ? 'opacity-100' : 'opacity-35'}`}>
                              {p.icon}
                            </div>
                            <div>
                              <div className="font-semibold text-sm">{p.label}</div>
                              <div className="text-xs opacity-55 mt-0.5">{p.desc}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 opacity-70" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Теги */}
                <div className="mt-8">
                  <SectionTitle><Tag className="w-4 h-4 text-[var(--text-primary)]/40" />Теги</SectionTitle>

                  {/* AI suggested */}
                  {aiSuggestedTags.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs text-[var(--text-primary)]/40 mb-2.5 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Предложено ИИ
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestedTags.map(t => {
                          const isSel = tags.some(x => x.name === t.name);
                          return (
                            <button key={t.name} onClick={() => togglePresetTag(t)}
                              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all
                                ${isSel
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'
                                }`}>
                              {isSel && <CheckCircle2 className="w-3.5 h-3.5" />}
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Preset tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {PRESET_TAGS.map(t => {
                      const isSel = tags.some(x => x.name === t.name);
                      return (
                        <button key={t.name} onClick={() => togglePresetTag(t)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all
                            ${!isSel ? 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]' : ''}`}
                          style={isSel ? {
                            backgroundColor: `${t.color}18`,
                            color: t.color,
                            borderColor: `${t.color}60`,
                          } : undefined}>
                          {isSel && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {t.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom tag */}
                  <button
                    onClick={() => setShowCustomTagInput(!showCustomTagInput)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mb-4"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showCustomTagInput ? 'Скрыть' : 'Добавить свой тег'}
                  </button>

                  {showCustomTagInput && (
                    <div className="flex gap-2 mb-4">
                      <input
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                        placeholder="Название тега..."
                        className="input-field flex-1 py-2.5 text-sm"
                      />
                      <button
                        onClick={addCustomTag}
                        disabled={!newTagInput.trim()}
                        className="px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-35 transition-colors"
                      >
                        Добавить
                      </button>
                    </div>
                  )}

                  {/* Selected tags */}
                  {tags.length > 0 && (
                    <div className="p-4 bg-[var(--hover-1)]/70 rounded-xl border border-[var(--border-color)]">
                      <p className="text-xs text-[var(--text-primary)]/40 mb-2.5">
                        Выбрано тегов: {tags.length}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {tags.map(t => (
                          <div
                            key={t.name}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm"
                            style={{
                              backgroundColor: `${t.color || '#71717a'}18`,
                              borderColor: `${t.color || '#71717a'}45`,
                              color: t.color || '#d1d5db',
                            }}
                          >
                            {t.name}
                            <button onClick={() => removeTag(t.name)} className="opacity-50 hover:opacity-100 hover:text-red-400 transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ Step 3 ══════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Всё готово к отправке</h2>
                <p className="text-sm text-[var(--text-primary)]/50 mt-1">
                  Проверьте данные — при необходимости отредактируйте любой раздел
                </p>
              </div>

              {/* ── Summary section: Step 1 ── */}
              <ReviewSection
                stepNum={1}
                title="Описание заявки"
                subtitle="Привязка, тема, описание, вложения"
                onEdit={() => setStep(1)}
              >
                <div className="space-y-3">
                  {/* Binding */}
                  {selectedProject && (
                    <ReviewRow icon={<FolderOpen className="w-4 h-4 text-amber-400" />} label="Проект">
                      <span className="text-amber-300">{prjName(selectedProject)}</span>
                    </ReviewRow>
                  )}
                  {!selectedProject && selectedCounterparty && (
                    <ReviewRow icon={<Building2 className="w-4 h-4 text-blue-400" />} label="Контрагент">
                      <span className="text-blue-300">{cpName(selectedCounterparty)}</span>
                    </ReviewRow>
                  )}
                  {isCustomer && customerCounterparty && !selectedProject && !selectedCounterparty && (
                    <ReviewRow icon={<Building2 className="w-4 h-4 text-blue-400" />} label="Контрагент">
                      <span className="text-blue-300">{customerCounterparty.name}</span>
                    </ReviewRow>
                  )}
                  {canSelectCounterparty && selectionType === null && (
                    <ReviewRow icon={<X className="w-4 h-4 text-[var(--text-primary)]/40" />} label="Привязка">
                      <span className="text-[var(--text-primary)]/50">Без привязки</span>
                    </ReviewRow>
                  )}

                  {/* Reporter */}
                  <ReviewRow icon={<User className="w-4 h-4 text-green-400" />} label="Инициатор">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}
                      </div>
                      <div className="text-xs text-[var(--text-primary)]/40">
                        {selectedReporter ? selectedReporter.email : user?.email}
                      </div>
                    </div>
                  </ReviewRow>

                  {/* Title */}
                  <ReviewRow icon={<FileText className="w-4 h-4 text-[var(--text-primary)]/40" />} label="Тема">
                    <p className="text-sm font-medium text-[var(--text-primary)] break-words">{title || '—'}</p>
                  </ReviewRow>

                  {/* Description */}
                  <div className="pt-1">
                    <p className="text-xs text-[var(--text-primary)]/40 mb-2">Описание</p>
                    <div className="rounded-xl bg-[var(--bg-primary)]/60 border border-[var(--border-color)] p-4 space-y-3 max-h-64 overflow-y-auto">
                      {descriptionBlocks.map(block => {
                        if (block.type === 'text' && block.value.trim()) {
                          return <TicketDescriptionContent key={block.id} text={block.value} className="text-[var(--text-primary)] text-sm leading-relaxed" />;
                        }
                        if (block.type === 'image' && block.localPreview) {
                          return <img key={block.id} src={block.localPreview} alt="вложение" className="max-w-full max-h-48 rounded-xl object-contain" />;
                        }
                        return null;
                      })}
                      {descriptionBlocks.every(b => (b.type === 'text' && !b.value.trim()) || (b.type === 'image' && !b.localPreview)) && (
                        <p className="text-[var(--text-primary)]/35 text-sm">—</p>
                      )}
                    </div>
                  </div>

                  {/* Files */}
                  {generalFiles.length > 0 && (
                    <ReviewRow icon={<Upload className="w-4 h-4 text-[var(--text-primary)]/40" />} label={`Файлы (${generalFiles.length})`}>
                      <div className="flex flex-wrap gap-2">
                        {generalFiles.map(f => (
                          <span key={f.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]/70">
                            <File className="w-3 h-3" /> {f.file.name}
                          </span>
                        ))}
                      </div>
                    </ReviewRow>
                  )}
                </div>
              </ReviewSection>

              {/* ── Summary section: Step 2 ── */}
              <ReviewSection
                stepNum={2}
                title="Классификация"
                subtitle="Тип, приоритет и теги"
                onEdit={() => setStep(2)}
              >
                <div className="space-y-4">
                  {/* Type + Priority side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-primary)]/40 mb-2">Тип</p>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${TICKET_TYPES.find(t => t.value === type)?.color || ''}`}>
                        {TICKET_TYPES.find(t => t.value === type)?.icon}
                        <span>{type}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-primary)]/40 mb-2">Приоритет</p>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${PRIORITIES.find(p => p.value === priority)?.color || ''}`}>
                        {PRIORITIES.find(p => p.value === priority)?.icon}
                        <span>{PRIORITIES.find(p => p.value === priority)?.label || priority}</span>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <p className="text-xs text-[var(--text-primary)]/40 mb-2">Теги</p>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => (
                          <span key={t.name} className="px-3 py-1 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: `${t.color || '#71717a'}25`, color: t.color || '#d1d5db' }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-primary)]/35">Теги не выбраны</p>
                    )}
                  </div>
                </div>
              </ReviewSection>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer navigation ─────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)]/90 backdrop-blur-xl px-5 py-4 shadow-[0_-8px_40px_rgba(0,0,0,0.2)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Hint */}
              <p className="text-sm text-[var(--text-primary)]/45 hidden sm:block">{footerHint}</p>

              {/* Buttons */}
              <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                {/* Back / Close */}
                <button
                  onClick={() => { if (step === 1) navigate(-1); else setStep(step - 1); }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl
                             bg-[var(--hover-1)] hover:bg-[var(--hover-2)]
                             border border-[var(--border-color)]
                             text-sm font-medium text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{backLabel}</span>
                </button>

                {/* Next / Submit */}
                {step < 3 ? (
                  <button
                    onClick={handleNextStep}
                    disabled={step === 1 && (!title.trim() || !hasDescription)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                               bg-red-700 hover:bg-red-600 text-white text-sm font-semibold
                               shadow-lg shadow-red-900/25 transition-colors
                               disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-red-700"
                  >
                    <span>{nextLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl
                               bg-red-700 hover:bg-red-600 text-white text-sm font-semibold
                               shadow-lg shadow-red-900/25 transition-colors disabled:opacity-50"
                  >
                    {submitting
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <><FileText className="w-4 h-4" /><span>Создать заявку</span></>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReviewSection({
  stepNum, title, subtitle, onEdit, children,
}: {
  stepNum: number;
  title: string;
  subtitle: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-[var(--hover-1)]/60 border-b border-[var(--border-color)]">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-0.5">Шаг {stepNum}</p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-primary)]/45 mt-0.5">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl
                     bg-[var(--bg-primary)] hover:bg-[var(--hover-2)]
                     border border-[var(--border-color)]
                     text-xs font-medium text-[var(--text-primary)]/70 hover:text-[var(--text-primary)]
                     transition-all flex-shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Изменить
        </button>
      </div>

      {/* Section content */}
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function ReviewRow({
  icon, label, children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-[var(--hover-1)] flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text-primary)]/40 mb-1">{label}</p>
        {children}
      </div>
    </div>
  );
}