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

/* ═══════════════════════════════════════════════════════════════════════════
   Константы
   ═══════════════════════════════════════════════════════════════════════════ */

const DRAFT_KEY = 'new_ticket_draft';
const AI_TIMEOUT_MS = 5000;

const STEPS_META = [
  { num: 1, title: 'Описание', icon: <FileText className="w-[18px] h-[18px]" /> },
  { num: 2, title: 'Классификация', icon: <Tag className="w-[18px] h-[18px]" /> },
  { num: 3, title: 'Отправка', icon: <CheckCircle2 className="w-[18px] h-[18px]" /> },
];

const PRIORITIES = [
  { value: 'low', label: 'Низкий', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', activeColor: 'bg-emerald-500/25 text-[var(--text-primary)] border-emerald-400 ring-2 ring-emerald-500/40', icon: <SignalLow className="w-7 h-7" />, desc: 'Плановый' },
  { value: 'medium', label: 'Средний', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', activeColor: 'bg-yellow-500/25 text-[var(--text-primary)] border-yellow-400 ring-2 ring-yellow-500/40', icon: <SignalMedium className="w-7 h-7" />, desc: 'Стандартный' },
  { value: 'high', label: 'Высокий', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', activeColor: 'bg-orange-500/25 text-[var(--text-primary)] border-orange-400 ring-2 ring-orange-500/40', icon: <SignalHigh className="w-7 h-7" />, desc: 'Срочный' },
  { value: 'critical', label: 'Критический', color: 'bg-red-500/15 text-red-400 border-red-500/30', activeColor: 'bg-red-500/25 text-[var(--text-primary)] border-red-400 ring-2 ring-red-500/40', icon: <Flame className="w-7 h-7" />, desc: 'Немедленно' },
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
  { name: 'Инцидент', color: '#dc2626' }, { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' }, { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#6366f1' }, { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */

interface GeneralFile {
  id: string; file: File; preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error'; error?: string;
}
interface SimpleUser {
  id: string; username: string; full_name: string | null; email: string; role?: string;
}

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];
type SelectionType = 'project' | 'counterparty' | null;

/* ─── Draft ──────────────────────────────────────────────────────────────── */

interface DraftData {
  step: number; title: string; descriptionBlocks: DescriptionBlock[];
  priority: TicketPriority; type: TicketType; tags: TicketTag[];
  selectionType: SelectionType;
  selectedCounterpartyId: string | null; selectedCounterpartyName: string | null;
  selectedProjectId: string | null; selectedProjectName: string | null;
  selectedReporterId: string | null; selectedReporterName: string | null;
  counterpartySearch: string; projectSearch: string; reporterSearch: string;
  savedAt: number;
}

function saveDraft(data: DraftData) {
  try {
    const clean = data.descriptionBlocks.map(b =>
      b.type === 'image' ? { id: b.id, type: 'image' as const, value: b.value } : { ...b }
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, descriptionBlocks: clean }));
  } catch { }
}
function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftData;
    if (Date.now() - d.savedAt > 86400000) { localStorage.removeItem(DRAFT_KEY); return null; }
    return d;
  } catch { return null; }
}
function clearDraftStorage() { localStorage.removeItem(DRAFT_KEY); }

/* ═══════════════════════════════════════════════════════════════════════════
   Компонент
   ═══════════════════════════════════════════════════════════════════════════ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();
  const pageRef = useRef<HTMLDivElement>(null);
  const draft = useRef(loadDraft());

  /* state */
  const [step, setStep] = useState(draft.current?.step || 1);
  const [title, setTitle] = useState(draft.current?.title || '');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(!!draft.current);

  const [descriptionBlocks, setDescriptionBlocks] = useState<DescriptionBlock[]>(
    draft.current?.descriptionBlocks?.length ? draft.current.descriptionBlocks : [{ id: 'init', type: 'text', value: '' }]
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

  /* refs */
  const aiDoneRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const titleRef = useRef('');
  const descriptionRef = useRef('');
  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  titleRef.current = title;
  descriptionRef.current = description;

  /* derived */
  const isCustomer = user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectCounterparty = (!isCustomer && user?.roles?.some(r => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;
  const hasDescription = descriptionBlocks.some(b => (b.type === 'text' && b.value.trim().length > 0) || (b.type === 'image' && b.localFile));
  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const prjName = (p: Project) => `${p.key} – ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;

  /* ── Draft auto-save ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft({
        step, title, descriptionBlocks, priority, type, tags, selectionType,
        selectedCounterpartyId: selectedCounterparty?.id || null,
        selectedCounterpartyName: selectedCounterparty ? cpName(selectedCounterparty) : null,
        selectedProjectId: selectedProject?.id || null,
        selectedProjectName: selectedProject ? prjName(selectedProject) : null,
        selectedReporterId: selectedReporter?.id || null,
        selectedReporterName: selectedReporter ? uName(selectedReporter) : null,
        counterpartySearch, projectSearch, reporterSearch, savedAt: Date.now(),
      });
      setHasDraft(true);
    }, 500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [step, title, descriptionBlocks, priority, type, tags, selectionType,
    selectedCounterparty, selectedProject, selectedReporter, counterpartySearch, projectSearch, reporterSearch]);

  /* ── Draft restore ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!draft.current || !canSelectCounterparty) return;
    const d = draft.current;
    if (d.selectionType === 'counterparty' && d.selectedCounterpartyId)
      counterpartiesApi.getById(d.selectedCounterpartyId).then(cp => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); }).catch(() => { });
    if (d.selectionType === 'project' && d.selectedProjectId)
      projectsApi.getAll(1, 100).then(res => {
        setProjects(res.items);
        const f = res.items.find(p => p.id === d.selectedProjectId);
        if (f) { setSelectedProject(f); setProjectSearch(prjName(f)); if (f.counterparty_id) counterpartiesApi.getById(f.counterparty_id).then(cp => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); }).catch(() => { }); }
      }).catch(() => { });
    draft.current = null;
  }, [canSelectCounterparty]);

  /* ── Effects ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node)) setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node)) setShowReporterDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { pageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [step]);
  useEffect(() => { if (isCustomer && user?.counterparty_id) loadCustomerCounterparty(); }, [user]);
  useEffect(() => { if (canSelectCounterparty) loadCounterparties(); }, [canSelectCounterparty]);

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
        const items = (await projectsApi.getAll(1, 100)).items; setProjects(items);
        const f = items.find(p => p.id === preselectedProjectId);
        if (f) { setSelectedProject(f); setProjectSearch(prjName(f)); if (f.counterparty_id) try { const cp = await counterpartiesApi.getById(f.counterparty_id); setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); } catch { } }
      } catch { }
    })();
  }, [preselectedProjectId, canSelectCounterparty]);

  useEffect(() => {
    if (validationErrors.length > 0 && title.trim() && hasDescription) setValidationErrors([]);
  }, [title, descriptionBlocks]);

  /* ── AI ───────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (step !== 2) { if (step === 1) { aiDoneRef.current = false; aiAbortRef.current?.abort(); aiAbortRef.current = null; setAiTimedOut(false); } return; }
    if (aiDoneRef.current) return;
    const t = titleRef.current.trim(), d = descriptionRef.current.trim();
    if (!t || !d) return;
    aiAbortRef.current?.abort();
    const ctrl = new AbortController(); aiAbortRef.current = ctrl;
    aiDoneRef.current = true; setAiLoading(true); setAiSuggestion(null); setAiTimedOut(false);
    const tid = setTimeout(() => { if (!ctrl.signal.aborted) { setAiTimedOut(true); setAiLoading(false); } }, AI_TIMEOUT_MS);
    ticketsApi.predict(t, d).then(r => {
      clearTimeout(tid); if (ctrl.signal.aborted) return;
      setAiSuggestion(r); setAiSuggestedTags(r.suggested_tags || []); setPriority(r.suggested_priority); setTags(r.suggested_tags || []); setAiLoading(false); setAiTimedOut(false);
    }).catch(() => { clearTimeout(tid); if (!ctrl.signal.aborted) { setAiLoading(false); setAiTimedOut(true); } });
    return () => { clearTimeout(tid); ctrl.abort(); };
  }, [step]);

  /* ── Loaders ─────────────────────────────────────────────────────────────── */

  const loadCustomerCounterparty = async () => { if (!user?.counterparty_id) return; try { setCustomerCounterparty(await counterpartiesApi.getById(user.counterparty_id)); } catch { } };

  const loadCounterparties = async (search?: string) => {
    setLoadingCounterparties(true);
    try {
      let items = (await counterpartiesApi.getAll(1, 50)).items;
      if (search) { const q = search.toLowerCase(); items = items.filter(c => c.name?.toLowerCase().includes(q) || c.legal_name?.toLowerCase().includes(q) || c.inn?.includes(search)); }
      setCounterparties(items);
      if (!search && preselectedCounterpartyId && !selectedCounterparty) { const f = items.find(c => c.id === preselectedCounterpartyId); if (f) { setSelectionType('counterparty'); setSelectedCounterparty(f); setCounterpartySearch(cpName(f)); } }
    } catch { } finally { setLoadingCounterparties(false); }
  };

  const loadProjects = async (cpId: string) => { setLoadingProjects(true); try { setProjects((await projectsApi.getByCounterparty(cpId, 1, 50)).items); } catch { } finally { setLoadingProjects(false); } };

  const loadProjectsForAll = async (): Promise<Project[]> => {
    setLoadingProjects(true);
    try { const i = (await projectsApi.getAll(1, 100)).items; setProjects(i); return i; } catch { return []; } finally { setLoadingProjects(false); }
  };

  const loadUsers = async (cpId: string) => {
    setLoadingUsers(true);
    try {
      const items = (await usersApi.getCustomers(cpId, 1, 100)).items.map(c => ({ id: c.id, username: c.username, full_name: c.full_name, email: c.email, role: c.role }));
      let all = [...items];
      if (!items.find(u => u.id === user?.user_id) && user?.user_id) all = [{ id: user.user_id, username: user.username || '', full_name: user.full_name || null, email: user.email || '', role: user.role }, ...items];
      setUsers(all); setSelectedReporter(null); setReporterSearch('');
    } catch { } finally { setLoadingUsers(false); }
  };

  /* ── Handlers ────────────────────────────────────────────────────────────── */

  const handleSelectionTypeChange = (t: SelectionType) => { setSelectionType(t); setSelectedCounterparty(null); setSelectedProject(null); setCounterpartySearch(''); setProjectSearch(''); setProjects([]); };
  const togglePresetTag = (tag: TicketTag) => { setTags(p => p.some(t => t.name === tag.name) ? p.filter(t => t.name !== tag.name) : [...p, tag]); };
  const addCustomTag = () => { const n = newTagInput.trim(); if (!n || tags.some(t => t.name.toLowerCase() === n.toLowerCase())) return; setTags(p => [...p, { name: n, color: '#a1a1aa' }]); setNewTagInput(''); setShowCustomTagInput(false); };
  const removeTag = (name: string) => setTags(p => p.filter(t => t.name !== name));

  const validateStep1 = (): boolean => {
    const e: string[] = [];
    if (!title.trim()) e.push('Укажите тему заявки');
    if (!hasDescription) e.push('Добавьте описание заявки');
    setValidationErrors(e); return e.length === 0;
  };

  const openStep = (target: number) => {
    if (target === step) return;
    if (target < step) { setValidationErrors([]); setStep(target); return; }
    if (target === 2 && step === 1) { if (!validateStep1()) return; setValidationErrors([]); setStep(2); }
    if (target === 3 && step === 2) setStep(3);
  };

  const handleNextStep = () => { if (step === 1 && !validateStep1()) return; setValidationErrors([]); setStep(step + 1); };

  const handleClearDraft = () => {
    clearDraftStorage(); setHasDraft(false); setStep(1); setTitle('');
    setDescriptionBlocks([{ id: 'init', type: 'text', value: '' }]);
    setPriority('medium'); setType('Инцидент'); setTags([]); setGeneralFiles([]);
    setSelectionType(null); setSelectedCounterparty(null); setSelectedProject(null);
    setSelectedReporter(null); setCounterpartySearch(''); setProjectSearch(''); setReporterSearch('');
    setAiSuggestion(null); setAiSuggestedTags([]); aiDoneRef.current = false;
  };

  const handleGeneralFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setGeneralFiles(p => [...p, ...files.map(f => ({ id: `${f.name}_${Date.now()}_${Math.random()}`, file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending' as const }))].slice(0, 10));
    e.target.value = '';
  };
  const handleGeneralDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setGeneralFiles(p => [...p, ...files.map(f => ({ id: `${f.name}_${Date.now()}_${Math.random()}`, file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending' as const }))].slice(0, 10));
  };
  const removeGeneralFile = (id: string) => { const f = generalFiles.find(x => x.id === id); if (f?.preview) URL.revokeObjectURL(f.preview); setGeneralFiles(p => p.filter(x => x.id !== id)); };
  const formatFileSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  /* ── Submit ──────────────────────────────────────────────────────────────── */

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const textOnlyDesc = descriptionBlocks.filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text').map(b => b.value.trim()).filter(Boolean).join('\n\n');
      const data: any = { title, description: textOnlyDesc || '(описание с изображениями)', priority, type, tags: tags.map(t => ({ name: t.name, color: t.color || '#64748b' })), reporter_id: user?.id };
      if (isCustomer && customerCounterparty) data.counterparty_id = customerCounterparty.id;
      else if (selectedProject) data.project_id = selectedProject.id;
      else if (selectedCounterparty) data.counterparty_id = selectedCounterparty.id;
      if (canSelectReporter && selectedReporter) data.reporter_id = selectedReporter.id;

      const ticket = await ticketsApi.create(data);
      const imageBlocks = descriptionBlocks.filter((b): b is Extract<DescriptionBlock, { type: 'image' }> => b.type === 'image' && !!b.localFile);
      const uploadMap: Record<string, string> = {};
      for (const block of imageBlocks) { try { const att = await attachmentsApi.uploadAttachment(block.localFile!, 'ticket', ticket.id); uploadMap[block.id] = att.id; } catch { } }
      if (imageBlocks.length > 0) {
        let finalDesc = serializeBlocks(descriptionBlocks);
        for (const [bId, aId] of Object.entries(uploadMap)) finalDesc = finalDesc.replaceAll(`![image](local:${bId})`, `![image](media://${aId})`);
        finalDesc = finalDesc.replace(/!\[image\]\(local:[a-f0-9-]+\)\n*/gi, '');
        await ticketsApi.update(ticket.id, { description: finalDesc });
      }
      for (const f of generalFiles.filter(x => x.status === 'pending')) { try { await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id); } catch { } }
      clearDraftStorage(); setHasDraft(false); navigate('/tickets');
    } catch (err: any) { console.error('Submit failed:', err?.response?.data || err); } finally { setSubmitting(false); }
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <div ref={pageRef} className="pb-28">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 pt-2 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] transition-colors">
            <ArrowLeft className="w-4 h-4" /> Закрыть
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Новая заявка</h1>
        </div>
        {hasDraft && (
          <button onClick={handleClearDraft}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-[var(--hover-1)] hover:bg-red-500/15 text-[var(--text-primary)]/50 hover:text-red-400 border border-[var(--border-color)] hover:border-red-500/30 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Очистить черновик
          </button>
        )}
      </div>

      {/* ── Main layout: sidebar + content ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 flex gap-6">

        {/* ── Sidebar stepper (desktop) ──────────────────────────────────────── */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-6 space-y-2">
            {STEPS_META.map((s, i) => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              const isClickable = isDone || (s.num === step + 1 && step === 1 && title.trim() && hasDescription) || (s.num === step + 1 && step === 2);

              return (
                <div key={s.num}>
                  <button
                    type="button"
                    onClick={() => openStep(s.num)}
                    disabled={!isActive && !isClickable && !isDone}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all
                      ${isActive
                        ? 'bg-red-700 text-white shadow-md shadow-red-900/20'
                        : isDone
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 cursor-pointer'
                          : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 cursor-default'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-500/20' : 'bg-[var(--hover-2)]'}`}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{s.title}</div>
                      <div className={`text-[10px] ${isActive ? 'text-white/60' : isDone ? 'text-emerald-400/60' : 'text-[var(--text-primary)]/25'}`}>
                        {isDone ? 'Готово' : isActive ? `Шаг ${s.num}` : 'Далее'}
                      </div>
                    </div>
                  </button>

                  {/* connector */}
                  {i < STEPS_META.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className={`w-0.5 h-4 rounded-full ${isDone ? 'bg-emerald-500/40' : 'bg-[var(--border-color)]'}`} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Draft status */}
            <div className="mt-4 px-3 py-2.5 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]/40">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Черновик сохранён
              </div>
            </div>
          </div>
        </aside>

        {/* ── Mobile stepper ─────────────────────────────────────────────────── */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--bg-primary)]/95 backdrop-blur-lg border-b border-[var(--border-color)]">
          <div className="flex">
            {STEPS_META.map(s => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => openStep(s.num)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium border-b-2 transition-all
                    ${isActive
                      ? 'border-red-600 text-[var(--text-primary)]'
                      : isDone
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-[var(--text-primary)]/35'
                    }`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
                  {s.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 lg:mt-0 mt-12">

          {/* Draft restored notice */}
          {hasDraft && step === 1 && title && (
            <div className="mb-5 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 flex items-center gap-2.5 text-sm text-blue-300/90">
              <Clock className="w-4 h-4 flex-shrink-0" />
              Восстановлен черновик —{' '}
              <button onClick={handleClearDraft} className="underline hover:no-underline">очистить</button>
            </div>
          )}

          <div className="glass-card overflow-hidden">
            <div className="p-6 md:p-8">

              {/* ══ Step 1 ════════════════════════════════════════════════════ */}
              {step === 1 && (
                <div className="space-y-7">
                  {validationErrors.length > 0 && (
                    <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/25 space-y-2">
                      {validationErrors.map((err, i) => (
                        <div key={i} className="flex items-center gap-2 text-red-400 text-sm">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />{err}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Привязка */}
                  {canSelectCounterparty && (
                    <div>
                      <FieldLabel>Привязка заявки</FieldLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { key: 'project' as SelectionType, icon: <FolderOpen className="w-4 h-4" />, label: 'Проект', a: 'border-amber-500/60 bg-amber-500/10 text-amber-300' },
                          { key: 'counterparty' as SelectionType, icon: <Building2 className="w-4 h-4" />, label: 'Контрагент', a: 'border-blue-500/60 bg-blue-500/10 text-blue-300' },
                          { key: null, icon: <X className="w-4 h-4" />, label: 'Без привязки', a: 'border-[var(--text-primary)]/40 bg-[var(--hover-2)] text-[var(--text-primary)]' },
                        ] as const).map(o => (
                          <button key={String(o.key)} type="button" onClick={() => handleSelectionTypeChange(o.key)}
                            className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all
                              ${selectionType === o.key ? o.a : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
                            {o.icon}{o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Контрагент */}
                  {canSelectCounterparty && selectionType === 'counterparty' && (
                    <div>
                      <FieldLabel required>Контрагент</FieldLabel>
                      <div ref={counterpartyDropdownRef} className="relative">
                        <SearchInput value={counterpartySearch} placeholder="Поиск по названию или ИНН..."
                          onChange={v => { setCounterpartySearch(v); setShowCounterpartyDropdown(true); loadCounterparties(v); }}
                          onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }} />
                        {showCounterpartyDropdown && (
                          <Dropdown loading={loadingCounterparties}>
                            {counterparties.map(cp => (
                              <DropdownItem key={cp.id} onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}>
                                <div className="font-medium text-[var(--text-primary)]">{cpName(cp)}</div>
                                {cp.inn && <div className="text-xs text-[var(--text-primary)]/40 mt-0.5">ИНН: {cp.inn}</div>}
                              </DropdownItem>
                            ))}
                          </Dropdown>
                        )}
                      </div>
                      {selectedCounterparty && <SelectedBadge color="blue">{cpName(selectedCounterparty)}</SelectedBadge>}
                    </div>
                  )}

                  {/* Проект */}
                  {canSelectCounterparty && selectionType === 'project' && (
                    <div>
                      <FieldLabel required>Проект</FieldLabel>
                      <div ref={projectDropdownRef} className="relative">
                        <SearchInput value={projectSearch} placeholder="Поиск по ключу или названию..."
                          onChange={v => { setProjectSearch(v); setShowProjectDropdown(true); }}
                          onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }} />
                        {showProjectDropdown && (
                          <Dropdown loading={loadingProjects}>
                            {projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                              <DropdownItem key={p.id} onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}>
                                <span className="text-amber-400 font-medium">{p.key}</span> — {p.name}
                              </DropdownItem>
                            ))}
                          </Dropdown>
                        )}
                      </div>
                      {selectedProject && <SelectedBadge color="amber">{prjName(selectedProject)}</SelectedBadge>}
                    </div>
                  )}

                  {/* Customer counterparty */}
                  {isCustomer && customerCounterparty && (
                    <div className="px-4 py-3 rounded-xl bg-blue-500/8 border border-blue-500/25 flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{customerCounterparty.name}</p>
                        {customerCounterparty.inn && <p className="text-xs text-[var(--text-primary)]/45">ИНН: {customerCounterparty.inn}</p>}
                      </div>
                    </div>
                  )}

                  {/* Инициатор */}
                  {canSelectReporter && (selectedCounterparty || selectedProject) && (
                    <div>
                      <FieldLabel hint="по умолчанию — вы">Инициатор</FieldLabel>
                      <div ref={reporterDropdownRef} className="relative">
                        <SearchInput value={reporterSearch} placeholder="Выберите инициатора..."
                          onChange={v => { setReporterSearch(v); setShowReporterDropdown(true); }}
                          onFocus={() => setShowReporterDropdown(true)} />
                        {showReporterDropdown && (
                          <Dropdown loading={loadingUsers}>
                            <DropdownItem onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}>
                              <span className="font-medium">{user?.full_name || 'Вы'}</span>
                              <span className="text-[var(--text-primary)]/40 ml-2 text-xs">(текущий)</span>
                            </DropdownItem>
                            {users.filter(u => !reporterSearch || u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) || u.email.toLowerCase().includes(reporterSearch.toLowerCase())).map(u => (
                              <DropdownItem key={u.id} onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}>
                                <div className="font-medium">{uName(u)}</div>
                                <div className="text-xs text-[var(--text-primary)]/40">{u.email}</div>
                              </DropdownItem>
                            ))}
                          </Dropdown>
                        )}
                      </div>
                      <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/55">
                        Инициатор: <span className="text-[var(--text-primary)] font-medium">{selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}</span>
                      </div>
                    </div>
                  )}

                  {/* Тема */}
                  <SpellCheckField value={title} onChange={setTitle} label="Тема заявки *">
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="Кратко опишите проблему или задачу..."
                      className={`input-field py-3.5 text-base w-full ${validationErrors.includes('Укажите тему заявки') ? 'border-red-500/60 ring-1 ring-red-500/40' : ''}`} />
                  </SpellCheckField>

                  {/* Описание */}
                  <div>
                    <FieldLabel required>Подробное описание</FieldLabel>
                    <div className={validationErrors.includes('Добавьте описание заявки') ? 'ring-1 ring-red-500/40 rounded-2xl' : ''}>
                      <TicketEditor blocks={descriptionBlocks} onChange={setDescriptionBlocks} />
                    </div>
                  </div>

                  {/* Файлы */}
                  <div>
                    <FieldLabel hint="необязательно">
                      <Upload className="inline w-4 h-4 mr-1.5 opacity-40" />Файлы
                    </FieldLabel>
                    <div onDrop={handleGeneralDrop} onDragOver={e => e.preventDefault()}
                      className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-6 text-center hover:border-[var(--text-primary)]/20 transition-colors">
                      <Upload className="w-7 h-7 text-[var(--text-primary)]/15 mx-auto mb-2" />
                      <p className="text-sm text-[var(--text-primary)]/45 mb-3">Перетащите файлы сюда или</p>
                      <label className="inline-block">
                        <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
                        <span className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium cursor-pointer transition-colors">Выбрать</span>
                      </label>
                      <p className="mt-2 text-xs text-[var(--text-primary)]/25">До 10 файлов · макс. 25 МБ</p>
                    </div>
                    {generalFiles.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {generalFiles.map(f => (
                          <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                            {f.preview
                              ? <img src={f.preview} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-lg bg-[var(--hover-2)] flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-[var(--text-primary)]/35" /></div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--text-primary)] truncate">{f.file.name}</p>
                              <p className="text-xs text-[var(--text-primary)]/40">{formatFileSize(f.file.size)}</p>
                            </div>
                            <button onClick={() => removeGeneralFile(f.id)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-[var(--text-primary)]/35 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ Step 2 ════════════════════════════════════════════════════ */}
              {step === 2 && (
                <div className="space-y-8">
                  {/* AI statuses */}
                  {aiLoading && !aiTimedOut && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <div className="relative w-9 h-9 flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        </div>
                        <Loader2 className="w-9 h-9 text-amber-400/50 animate-spin absolute inset-0" />
                      </div>
                      <p className="text-sm text-[var(--text-primary)]">ИИ анализирует заявку…</p>
                    </div>
                  )}
                  {aiTimedOut && !aiSuggestion && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-500/8 border border-orange-500/25">
                      <Clock className="w-5 h-5 text-orange-400 flex-shrink-0" />
                      <p className="text-sm text-[var(--text-primary)]">ИИ не ответил — выберите вручную</p>
                    </div>
                  )}
                  {aiSuggestion && !aiLoading && (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                      <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <p className="text-sm text-[var(--text-primary)]">ИИ предложил классификацию — проверьте</p>
                    </div>
                  )}

                  <div className={aiLoading && !aiTimedOut ? 'opacity-40 pointer-events-none' : ''}>
                    {/* Тип */}
                    <div>
                      <FieldLabel>Тип заявки</FieldLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {TICKET_TYPES.map(t => {
                          const sel = type === t.value;
                          return (
                            <button key={t.value} onClick={() => setType(t.value as TicketType)}
                              className={`px-4 py-3 rounded-xl text-left border transition-all ${sel ? `${t.activeColor} shadow-sm` : 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)]'}`}>
                              <div className="flex items-center gap-2">
                                <span className={sel ? '' : 'opacity-40'}>{t.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{t.label}</div>
                                  <div className="text-xs opacity-55">{t.desc}</div>
                                </div>
                                {sel && <CheckCircle2 className="w-4 h-4 opacity-70 flex-shrink-0" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Приоритет */}
                    <div className="mt-8">
                      <FieldLabel>Приоритет</FieldLabel>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {PRIORITIES.map(p => {
                          const sel = priority === p.value;
                          return (
                            <button key={p.value} onClick={() => setPriority(p.value as TicketPriority)}
                              className={`px-4 py-4 rounded-xl text-center border transition-all ${sel ? `${p.activeColor} shadow-sm` : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]'}`}>
                              <div className="flex flex-col items-center gap-2">
                                <span className={sel ? '' : 'opacity-35'}>{p.icon}</span>
                                <div>
                                  <div className="font-semibold text-sm">{p.label}</div>
                                  <div className="text-xs opacity-55">{p.desc}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Теги */}
                    <div className="mt-8">
                      <FieldLabel>Теги</FieldLabel>

                      {aiSuggestedTags.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-[var(--text-primary)]/40 mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Предложено ИИ
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {aiSuggestedTags.map(t => {
                              const sel = tags.some(x => x.name === t.name);
                              return (
                                <TagButton key={t.name} selected={sel} onClick={() => togglePresetTag(t)}
                                  style={sel ? { backgroundColor: '#f59e0b18', borderColor: '#f59e0b60', color: '#fcd34d' } : undefined}>
                                  {t.name}
                                </TagButton>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mb-4">
                        {PRESET_TAGS.map(t => {
                          const sel = tags.some(x => x.name === t.name);
                          return (
                            <TagButton key={t.name} selected={sel} onClick={() => togglePresetTag(t)}
                              style={sel ? { backgroundColor: `${t.color}18`, borderColor: `${t.color}60`, color: t.color } : undefined}>
                              {t.name}
                            </TagButton>
                          );
                        })}
                      </div>

                      <button onClick={() => setShowCustomTagInput(!showCustomTagInput)}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-3">
                        <Plus className="w-3.5 h-3.5" />{showCustomTagInput ? 'Скрыть' : 'Свой тег'}
                      </button>

                      {showCustomTagInput && (
                        <div className="flex gap-2 mb-4">
                          <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                            placeholder="Название тега..." className="input-field flex-1 py-2.5 text-sm" />
                          <button onClick={addCustomTag} disabled={!newTagInput.trim()}
                            className="px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-35">Добавить</button>
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div className="p-4 bg-[var(--hover-1)]/70 rounded-xl border border-[var(--border-color)]">
                          <p className="text-xs text-[var(--text-primary)]/40 mb-2">Выбрано: {tags.length}</p>
                          <div className="flex flex-wrap gap-2">
                            {tags.map(t => (
                              <div key={t.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm"
                                style={{ backgroundColor: `${t.color || '#71717a'}18`, borderColor: `${t.color || '#71717a'}45`, color: t.color || '#d1d5db' }}>
                                {t.name}
                                <button onClick={() => removeTag(t.name)} className="opacity-50 hover:opacity-100 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ Step 3 ════════════════════════════════════════════════════ */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="text-center py-3">
                    <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Всё готово</h2>
                    <p className="text-sm text-[var(--text-primary)]/50 mt-1">Проверьте данные — при необходимости отредактируйте любой раздел</p>
                  </div>

                  {/* Section 1 */}
                  <ReviewSection step={1} title="Описание" onEdit={() => setStep(1)}>
                    <div className="space-y-3">
                      {selectedProject && <ReviewRow icon={<FolderOpen className="w-4 h-4 text-amber-400" />} label="Проект"><span className="text-amber-300 text-sm">{prjName(selectedProject)}</span></ReviewRow>}
                      {!selectedProject && selectedCounterparty && <ReviewRow icon={<Building2 className="w-4 h-4 text-blue-400" />} label="Контрагент"><span className="text-blue-300 text-sm">{cpName(selectedCounterparty)}</span></ReviewRow>}
                      {isCustomer && customerCounterparty && !selectedProject && !selectedCounterparty && <ReviewRow icon={<Building2 className="w-4 h-4 text-blue-400" />} label="Контрагент"><span className="text-blue-300 text-sm">{customerCounterparty.name}</span></ReviewRow>}
                      {canSelectCounterparty && selectionType === null && <ReviewRow icon={<X className="w-4 h-4 text-[var(--text-primary)]/40" />} label="Привязка"><span className="text-[var(--text-primary)]/50 text-sm">Без привязки</span></ReviewRow>}

                      <ReviewRow icon={<User className="w-4 h-4 text-green-400" />} label="Инициатор">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}</div>
                      </ReviewRow>

                      <ReviewRow icon={<FileText className="w-4 h-4 text-[var(--text-primary)]/40" />} label="Тема">
                        <p className="text-sm font-medium text-[var(--text-primary)] break-words">{title || '—'}</p>
                      </ReviewRow>

                      <div className="pt-1">
                        <p className="text-xs text-[var(--text-primary)]/40 mb-2">Описание</p>
                        <div className="rounded-xl bg-[var(--bg-primary)]/60 border border-[var(--border-color)] p-4 space-y-3 max-h-48 overflow-y-auto">
                          {descriptionBlocks.map(b => {
                            if (b.type === 'text' && b.value.trim()) return <TicketDescriptionContent key={b.id} text={b.value} className="text-[var(--text-primary)] text-sm leading-relaxed" />;
                            if (b.type === 'image' && b.localPreview) return <img key={b.id} src={b.localPreview} alt="" className="max-w-full max-h-40 rounded-xl object-contain" />;
                            return null;
                          })}
                          {descriptionBlocks.every(b => (b.type === 'text' && !b.value.trim()) || (b.type === 'image' && !b.localPreview)) && <p className="text-[var(--text-primary)]/35 text-sm">—</p>}
                        </div>
                      </div>

                      {generalFiles.length > 0 && (
                        <ReviewRow icon={<Upload className="w-4 h-4 text-[var(--text-primary)]/40" />} label={`Файлы (${generalFiles.length})`}>
                          <div className="flex flex-wrap gap-1.5">
                            {generalFiles.map(f => (
                              <span key={f.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]/70">
                                <File className="w-3 h-3" />{f.file.name}
                              </span>
                            ))}
                          </div>
                        </ReviewRow>
                      )}
                    </div>
                  </ReviewSection>

                  {/* Section 2 */}
                  <ReviewSection step={2} title="Классификация" onEdit={() => setStep(2)}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-[var(--text-primary)]/40 mb-2">Тип</p>
                          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${TICKET_TYPES.find(t => t.value === type)?.color || ''}`}>
                            {TICKET_TYPES.find(t => t.value === type)?.icon}{type}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-primary)]/40 mb-2">Приоритет</p>
                          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${PRIORITIES.find(p => p.value === priority)?.color || ''}`}>
                            {PRIORITIES.find(p => p.value === priority)?.icon}{PRIORITIES.find(p => p.value === priority)?.label}
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-primary)]/40 mb-2">Теги</p>
                        {tags.length > 0
                          ? <div className="flex flex-wrap gap-1.5">{tags.map(t => <span key={t.name} className="px-3 py-1 rounded-lg text-sm font-medium" style={{ backgroundColor: `${t.color || '#71717a'}25`, color: t.color || '#d1d5db' }}>{t.name}</span>)}</div>
                          : <p className="text-sm text-[var(--text-primary)]/35">Не выбраны</p>}
                      </div>
                    </div>
                  </ReviewSection>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Sticky footer ──────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 pb-4 pointer-events-auto">
          {/* offset sidebar width on lg */}
          <div className="lg:ml-[15.5rem]">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)]/92 backdrop-blur-xl px-4 py-3 shadow-[0_-4px_30px_rgba(0,0,0,0.15)] flex items-center justify-between gap-3">
              {/* Back */}
              <button
                onClick={() => { if (step === 1) navigate(-1); else setStep(step - 1); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {step === 1 ? 'Закрыть' : step === 2 ? 'Описание' : 'Классификация'}
                </span>
              </button>

              {/* Step dots (mobile visual hint) */}
              <div className="flex gap-1.5 sm:hidden">
                {STEPS_META.map(s => (
                  <div key={s.num} className={`w-2 h-2 rounded-full transition-colors ${step === s.num ? 'bg-red-500' : step > s.num ? 'bg-emerald-500' : 'bg-[var(--border-color)]'}`} />
                ))}
              </div>

              {/* Next / Submit */}
              {step < 3 ? (
                <button onClick={handleNextStep}
                  disabled={step === 1 && (!title.trim() || !hasDescription)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold shadow-lg shadow-red-900/25 transition-colors disabled:opacity-35 disabled:cursor-not-allowed">
                  <span className="hidden sm:inline">{step === 1 ? 'Классификация' : 'Проверка'}</span>
                  <span className="sm:hidden">Далее</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold shadow-lg shadow-red-900/25 transition-colors disabled:opacity-50">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><FileText className="w-4 h-4" /><span>Создать</span></>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="block mb-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{children}</span>
      {required && <span className="text-red-400 ml-1">*</span>}
      {hint && <span className="text-xs text-[var(--text-primary)]/40 ml-2">({hint})</span>}
    </label>
  );
}

function SearchInput({ value, placeholder, onChange, onFocus }: { value: string; placeholder: string; onChange: (v: string) => void; onFocus: () => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/35 pointer-events-none" />
      <input value={value} onChange={e => onChange(e.target.value)} onFocus={onFocus} placeholder={placeholder} className="input-field py-3 pl-10 text-sm w-full" />
    </div>
  );
}

function Dropdown({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
      {loading ? <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/40" /></div> : children}
    </div>
  );
}

function DropdownItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm text-[var(--text-primary)] transition-colors">
      {children}
    </button>
  );
}

function SelectedBadge({ color, children }: { color: 'blue' | 'amber'; children: React.ReactNode }) {
  const c = color === 'blue' ? 'bg-blue-500/8 border-blue-500/25 text-blue-400' : 'bg-amber-500/8 border-amber-500/25 text-amber-400';
  return (
    <div className={`mt-2 px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${c}`}>
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{children}
    </div>
  );
}

function TagButton({ selected, onClick, style, children }: { selected: boolean; onClick: () => void; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={style}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all
        ${!selected ? 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]' : ''}`}>
      {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

function ReviewSection({ step, title, onEdit, children }: { step: number; title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--hover-1)]/60 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        </div>
        <button onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--hover-2)] border border-[var(--border-color)] text-xs font-medium text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-all">
          <Edit3 className="w-3.5 h-3.5" />Изменить
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ReviewRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-[var(--hover-1)] flex items-center justify-center flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text-primary)]/40 mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}