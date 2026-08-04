// ── NewTicketPage — JIRA-inspired design ──

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, Upload, X, File, Building2,
  Plus, Search, FolderOpen, User, AlertCircle, Check,
  ChevronDown, Send, Paperclip, Image as ImageIcon,
} from 'lucide-react';
import { SignalLow, SignalMedium, SignalHigh, Flame } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type { Counterparty, TicketTag, TicketPriority, TicketType, Project } from '../types';
import { SpellCheckField } from '../components/helpers/SpellCheckField';
import {
  TicketEditor, serializeBlocks, type DescriptionBlock,
} from '../components/helpers/TicketEditor';

/* ═══ Constants ═══ */

const PRIORITIES = [
  { value: 'low', label: 'Низкий', icon: <SignalLow className="w-4 h-4" />, color: '#00875A' },
  { value: 'medium', label: 'Средний', icon: <SignalMedium className="w-4 h-4" />, color: '#FF991F' },
  { value: 'high', label: 'Высокий', icon: <SignalHigh className="w-4 h-4" />, color: '#FF5630' },
  { value: 'critical', label: 'Критический', icon: <Flame className="w-4 h-4" />, color: '#DE350B' },
] as const;

const TYPES: TicketType[] = [
  'Инцидент', 'Запрос на услугу', 'Консультация', 'Жалоба',
  'Задача', 'Проблема', 'Запрос на изменение', 'Улучшение', 'Прочее',
];

const PRESET_TAGS: TicketTag[] = [
  { name: 'Инцидент', color: '#FF5630' },
  { name: 'Консультация', color: '#0052CC' },
  { name: 'Доработка', color: '#00875A' },
  { name: 'Ошибка', color: '#FF991F' },
  { name: 'Интеграция', color: '#6554C0' },
  { name: 'Обучение', color: '#00B8D9' },
  { name: 'Срочное', color: '#DE350B' },
];

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];

/* ═══ Types ═══ */

interface GeneralFile {
  id: string; file: File; preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

interface SimpleUser {
  id: string; username: string; full_name: string | null; email: string; role?: string;
}

type SelectionType = 'project' | 'counterparty' | null;

interface DraftData {
  title: string;
  descriptionText: string;
  priority: string;
  type: string;
  tags: TicketTag[];
  selectionType: SelectionType;
  savedAt: number;
}

/* ═══ Helper Components ═══ */

function SearchDropdown({ children, show }: { children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute z-50 mt-1 w-full bg-white dark:bg-[#1d2125] border border-[#dfe1e6] dark:border-[#373c43] rounded shadow-xl max-h-64 overflow-y-auto">
      {children}
    </div>
  );
}

function DropdownItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
        active 
          ? 'bg-[#0052CC]/10 text-[#172B4D] dark:text-white' 
          : 'text-[#172B4D] dark:text-[#b6c2cf] hover:bg-[#091e420f] dark:hover:bg-[#282e33]'
      }`}>
      {children}
    </button>
  );
}

function JiraLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-[#5e6c84] dark:text-[#9fadbc] mb-1 uppercase tracking-wide">
      {children} {required && <span className="text-[#DE350B]">*</span>}
    </label>
  );
}

function formatFileSize(b: number) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/* ═══ Main Component ═══ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();

  const currentUserId = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const draftKey = currentUserId ? `ticket-draft-a:${currentUserId}` : 'ticket-draft-a';

  // Form state
  const [title, setTitle] = useState('');
  const [descriptionBlocks, setDescriptionBlocks] = useState<DescriptionBlock[]>([
    { id: 'init', type: 'text', value: '' },
  ]);
  const description = serializeBlocks(descriptionBlocks);

  const [priority, setPriority] = useState<TicketPriority>('medium' as TicketPriority);
  const [type, setType] = useState<TicketType>('Инцидент');
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [generalFiles, setGeneralFiles] = useState<GeneralFile[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Binding
  const [customerCounterparty, setCustomerCounterparty] = useState<Counterparty | null>(null);
  const [selectionType, setSelectionType] = useState<SelectionType>(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [counterpartySearch, setCounterpartySearch] = useState('');
  const [showCounterpartyDropdown, setShowCounterpartyDropdown] = useState(false);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedReporter, setSelectedReporter] = useState<SimpleUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showReporterDropdown, setShowReporterDropdown] = useState(false);
  const [reporterSearch, setReporterSearch] = useState('');

  // UI
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  const initRef = useRef(false);
  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  const isCustomer = user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectCounterparty = (!isCustomer && user?.roles?.some(r => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const hasDescription = descriptionBlocks.some(
    b => (b.type === 'text' && b.value.trim().length > 0) || (b.type === 'image' && b.localFile)
  );

  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const prjName = (p: Project) => `${p.key} - ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;
  const clearError = (f: string) => setErrors(p => { const n = { ...p }; delete n[f]; return n; });

  /* ─── Draft logic ─── */

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const d: DraftData = JSON.parse(raw);
      if (d.title || d.descriptionText || d.tags?.length) {
        setDraftData(d);
        setShowDraftBanner(true);
      }
    } catch { }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    setTitle(draftData.title || '');
    if (draftData.descriptionText) {
      setDescriptionBlocks([{ id: 'restored', type: 'text', value: draftData.descriptionText }]);
    }
    setPriority((draftData.priority || 'medium') as TicketPriority);
    setType((draftData.type || 'Инцидент') as TicketType);
    setTags(draftData.tags || []);
    setSelectionType(draftData.selectionType || null);
    setSavedAt(draftData.savedAt);
    setShowDraftBanner(false);
  }, [draftData]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const descText = descriptionBlocks
        .filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.value).join('\n\n').trim();
      const hasContent = title.trim() || descText || tags.length;
      if (!hasContent) return;
      const draft: DraftData = {
        title, descriptionText: descText, priority, type, tags, selectionType, savedAt: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setSavedAt(Date.now());
    }, 1000);
    return () => clearTimeout(timer);
  }, [draftKey, title, descriptionBlocks, priority, type, tags, selectionType]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (title.trim() || hasDescription) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [title, hasDescription]);

  /* ─── Dropdown handlers ─── */

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node)) setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node)) setShowReporterDropdown(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) setShowTypeDropdown(false);
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) setShowPriorityDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ─── API loaders (simplified) ─── */

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
        items = items.filter(c => c.name?.toLowerCase().includes(q) || c.legal_name?.toLowerCase().includes(q) || c.inn?.includes(search));
      }
      setCounterparties(items);
    } catch { } finally { setLoadingCounterparties(false); }
  };

  const loadProjects = async (cpId: string) => {
    setLoadingProjects(true);
    try { setProjects((await projectsApi.getByCounterparty(cpId, 1, 50)).items); } catch { } finally { setLoadingProjects(false); }
  };

  const loadProjectsForAll = async () => {
    setLoadingProjects(true);
    try { setProjects((await projectsApi.getAll(1, 100)).items); } catch { } finally { setLoadingProjects(false); }
  };

  const loadUsers = async (cpId: string) => {
    setLoadingUsers(true);
    try {
      const items = (await usersApi.getCustomers(cpId, 1, 100)).items.map(c => ({
        id: c.id, username: c.username, full_name: c.full_name, email: c.email, role: c.role,
      }));
      setUsers(items);
    } catch { } finally { setLoadingUsers(false); }
  };

  /* ─── Handlers ─── */

  const handleSelectionTypeChange = (t: SelectionType) => {
    setSelectionType(t); setSelectedCounterparty(null); setSelectedProject(null);
    setCounterpartySearch(''); setProjectSearch(''); setProjects([]);
  };

  const togglePresetTag = (tag: TicketTag) => {
    setTags(p => p.some(t => t.name === tag.name) ? p.filter(t => t.name !== tag.name) : [...p, tag]);
  };

  const addCustomTag = () => {
    const n = newTagInput.trim();
    if (!n || tags.some(t => t.name.toLowerCase() === n.toLowerCase())) return;
    setTags(p => [...p, { name: n, color: '#6554C0' }]);
    setNewTagInput('');
    setShowTagInput(false);
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

  const removeGeneralFile = (id: string) => {
    const f = generalFiles.find(x => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setGeneralFiles(p => p.filter(x => x.id !== id));
  };

  const handleAiSuggest = async () => {
    const t = title.trim(), d = description.trim();
    if (!t || !d) {
      if (!t) setErrors(p => ({ ...p, title: 'Укажите тему' }));
      if (!d) setErrors(p => ({ ...p, description: 'Добавьте описание' }));
      return;
    }
    setAiLoading(true);
    try {
      const r = await ticketsApi.predict(t, d);
      if (r?.suggested_priority) setPriority(r.suggested_priority);
      if (r?.suggested_tags?.length) {
        setTags(prev => {
          const map = new Map<string, TicketTag>();
          [...prev, ...r.suggested_tags].forEach(tag => map.set(tag.name.toLowerCase(), tag));
          return Array.from(map.values());
        });
      }
    } catch { } finally { setAiLoading(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Тема обязательна';
    if (!hasDescription) e.description = 'Описание обязательно';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const textOnlyDesc = descriptionBlocks
        .filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.value.trim()).filter(Boolean).join('\n\n');

      const data: any = {
        title, description: textOnlyDesc || '(описание с изображениями)',
        priority, type,
        tags: tags.map(t => ({ name: t.name, color: t.color || '#6554C0' })),
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
        try { const att = await attachmentsApi.uploadAttachment(block.localFile!, 'ticket', ticket.id); uploadMap[block.id] = att.id; }
        catch (err) { console.error('Image upload failed:', block.id, err); }
      }
      if (imageBlocks.length > 0) {
        let finalDesc = serializeBlocks(descriptionBlocks);
        for (const [blockId, attachmentId] of Object.entries(uploadMap))
          finalDesc = finalDesc.replaceAll(`![image](local:${blockId})`, `![image](media://${attachmentId})`);
        finalDesc = finalDesc.replace(/!\[image\]\(local:[a-f0-9-]+\)\n*/gi, '');
        await ticketsApi.update(ticket.id, { description: finalDesc });
      }

      for (const f of generalFiles.filter(x => x.status === 'pending')) {
        try { await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id); }
        catch (err) { console.error('File upload failed:', f.file.name, err); }
      }

      localStorage.removeItem(draftKey);
      navigate('/tickets');
    } catch (err: any) { console.error('Submit failed:', err?.response?.data || err); }
    finally { setSubmitting(false); }
  };

  /* ─── Render ─── */

  const selectedPriority = PRIORITIES.find(p => p.value === priority);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f4f5f7] dark:bg-[#1d2125]">

      {/* ═══ Top bar (JIRA style) ═══ */}
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-6 bg-white dark:bg-[#22272b] border-b border-[#dfe1e6] dark:border-[#373c43]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/tickets')}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#42526e] dark:text-[#9fadbc] hover:bg-[#091e420f] dark:hover:bg-[#282e33] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="h-6 w-px bg-[#dfe1e6] dark:bg-[#373c43]" />
          <h1 className="text-sm font-semibold text-[#172B4D] dark:text-white">Создать заявку</h1>
          {savedAt && (
            <span className="text-xs text-[#5e6c84] dark:text-[#738496]">
              Сохранено в {formatTime(savedAt)}
            </span>
          )}
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="flex items-center gap-2 px-4 py-1.5 rounded bg-[#0052CC] hover:bg-[#0747A6] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
        </button>
      </div>

      {/* ═══ Draft banner ═══ */}
      {showDraftBanner && draftData && (
        <div className="flex-shrink-0 px-6 py-2 bg-[#FFF7D6] dark:bg-[#533F04] border-b border-[#FFD166] dark:border-[#7A5C08] flex items-center gap-4">
          <AlertCircle className="w-4 h-4 text-[#974F0C]" />
          <span className="text-sm text-[#172B4D] dark:text-white">
            Найден несохранённый черновик от {formatTime(draftData.savedAt)}
          </span>
          <button onClick={restoreDraft} className="ml-auto text-sm text-[#0052CC] hover:underline">Восстановить</button>
          <button onClick={dismissDraft} className="text-sm text-[#5e6c84] hover:underline">Отклонить</button>
        </div>
      )}

      {/* ═══ Errors ═══ */}
      {Object.keys(errors).length > 0 && (
        <div className="flex-shrink-0 px-6 py-2 bg-[#FFEBE6] dark:bg-[#42221F] border-b border-[#FF8F73] dark:border-[#5D2A2A] flex flex-wrap gap-x-4 gap-y-1">
          {Object.values(errors).map((e, i) => (
            <span key={i} className="text-sm text-[#BF2600] dark:text-[#FF8F73] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {e}
            </span>
          ))}
        </div>
      )}

      {/* ═══ Main layout ═══ */}
      <div className="flex-1 overflow-hidden flex">

        {/* ─── Left: Form (70%) ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Project / Counterparty */}
          {canSelectCounterparty && (
            <div>
              <JiraLabel>Проект *</JiraLabel>
              <div className="flex gap-2 mb-3">
                {([
                  { v: 'project' as SelectionType, l: 'Проект', icon: <FolderOpen className="w-4 h-4" /> },
                  { v: 'counterparty' as SelectionType, l: 'Компания', icon: <Building2 className="w-4 h-4" /> },
                  { v: null as SelectionType, l: 'Нет', icon: <X className="w-4 h-4" /> },
                ]).map(b => (
                  <button key={String(b.v)} type="button" onClick={() => handleSelectionTypeChange(b.v)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      selectionType === b.v
                        ? 'bg-[#0052CC] text-white'
                        : 'bg-white dark:bg-[#22272b] text-[#42526e] dark:text-[#9fadbc] hover:bg-[#091e420f] dark:hover:bg-[#282e33] border border-[#dfe1e6] dark:border-[#373c43]'
                    }`}>
                    {b.icon} {b.l}
                  </button>
                ))}
              </div>

              {selectionType === 'project' && (
                <div className="relative" ref={projectDropdownRef}>
                  <input value={projectSearch}
                    onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                    onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }}
                    placeholder="Выберите проект"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] outline-none text-[#172B4D] dark:text-white placeholder-[#5e6c84]" />
                  <SearchDropdown show={showProjectDropdown}>
                    {loadingProjects ? (
                      <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[#5e6c84]" /></div>
                    ) : projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 ? (
                      <div className="py-4 text-center text-sm text-[#5e6c84]">Проектов не найдено</div>
                    ) : (
                      projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                        <DropdownItem key={p.id} active={selectedProject?.id === p.id}
                          onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}>
                          <span className="font-semibold">{p.key}</span> · {p.name}
                        </DropdownItem>
                      ))
                    )}
                  </SearchDropdown>
                </div>
              )}

              {selectionType === 'counterparty' && (
                <div className="relative" ref={counterpartyDropdownRef}>
                  <input value={counterpartySearch}
                    onChange={e => { setCounterpartySearch(e.target.value); setShowCounterpartyDropdown(true); loadCounterparties(e.target.value); }}
                    onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }}
                    placeholder="Выберите компанию"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] outline-none text-[#172B4D] dark:text-white placeholder-[#5e6c84]" />
                  <SearchDropdown show={showCounterpartyDropdown}>
                    {loadingCounterparties ? (
                      <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[#5e6c84]" /></div>
                    ) : counterparties.length === 0 ? (
                      <div className="py-4 text-center text-sm text-[#5e6c84]">Компаний не найдено</div>
                    ) : (
                      counterparties.map(cp => (
                        <DropdownItem key={cp.id} active={selectedCounterparty?.id === cp.id}
                          onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}>
                          {cpName(cp)}
                          {cp.inn && <div className="text-xs text-[#5e6c84] mt-0.5">ИНН {cp.inn}</div>}
                        </DropdownItem>
                      ))
                    )}
                  </SearchDropdown>
                </div>
              )}
            </div>
          )}

          {isCustomer && customerCounterparty && (
            <div className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded">
              <Building2 className="w-5 h-5 text-[#0052CC]" />
              <div>
                <div className="text-sm font-medium text-[#172B4D] dark:text-white">{customerCounterparty.name}</div>
                {customerCounterparty.inn && <div className="text-xs text-[#5e6c84]">ИНН {customerCounterparty.inn}</div>}
              </div>
            </div>
          )}

          {/* Reporter */}
          {canSelectReporter && (selectedCounterparty || selectedProject) && (
            <div>
              <JiraLabel>Инициатор</JiraLabel>
              <div className="relative" ref={reporterDropdownRef}>
                <input value={reporterSearch}
                  onChange={e => { setReporterSearch(e.target.value); setShowReporterDropdown(true); }}
                  onFocus={() => setShowReporterDropdown(true)}
                  placeholder={user?.full_name || 'Вы'}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] outline-none text-[#172B4D] dark:text-white placeholder-[#5e6c84]" />
                <SearchDropdown show={showReporterDropdown}>
                  {loadingUsers ? (
                    <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[#5e6c84]" /></div>
                  ) : (
                    <>
                      <DropdownItem onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}>
                        {user?.full_name || 'Вы'} <span className="text-[#5e6c84]">(текущий пользователь)</span>
                      </DropdownItem>
                      {users.filter(u => !reporterSearch || u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) || u.email.toLowerCase().includes(reporterSearch.toLowerCase())).map(u => (
                        <DropdownItem key={u.id} active={selectedReporter?.id === u.id}
                          onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}>
                          {uName(u)}
                          <div className="text-xs text-[#5e6c84]">{u.email}</div>
                        </DropdownItem>
                      ))}
                    </>
                  )}
                </SearchDropdown>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <JiraLabel required>Тема</JiraLabel>
            <SpellCheckField value={title} onChange={v => { setTitle(v); clearError('title'); }} label="">
              <input type="text" value={title} onChange={e => { setTitle(e.target.value); clearError('title'); }}
                placeholder="Опишите проблему кратко"
                className={`w-full px-3 py-2 text-base bg-white dark:bg-[#22272b] border rounded focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC] outline-none text-[#172B4D] dark:text-white placeholder-[#5e6c84] ${
                  errors.title ? 'border-[#DE350B]' : 'border-[#dfe1e6] dark:border-[#373c43]'
                }`} />
            </SpellCheckField>
          </div>

          {/* Description */}
          <div>
            <JiraLabel required>Описание</JiraLabel>
            <div className={`bg-white dark:bg-[#22272b] border rounded ${errors.description ? 'border-[#DE350B]' : 'border-[#dfe1e6] dark:border-[#373c43]'}`}>
              <TicketEditor blocks={descriptionBlocks} onChange={b => { setDescriptionBlocks(b); clearError('description'); }} />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <JiraLabel>Вложения</JiraLabel>
            <label className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#22272b] border border-dashed border-[#dfe1e6] dark:border-[#373c43] rounded cursor-pointer hover:bg-[#fafbfc] dark:hover:bg-[#282e33] transition-colors">
              <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
              <Paperclip className="w-5 h-5 text-[#5e6c84]" />
              <span className="text-sm text-[#5e6c84]">Прикрепить файлы</span>
            </label>
            {generalFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {generalFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded">
                    {f.preview ? (
                      <img src={f.preview} alt="" className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-[#f4f5f7] dark:bg-[#282e33] flex items-center justify-center">
                        <File className="w-5 h-5 text-[#5e6c84]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#172B4D] dark:text-white truncate">{f.file.name}</p>
                      <p className="text-xs text-[#5e6c84]">{formatFileSize(f.file.size)}</p>
                    </div>
                    <button onClick={() => removeGeneralFile(f.id)}
                      className="p-1 rounded hover:bg-[#091e420f] dark:hover:bg-[#282e33] text-[#5e6c84] hover:text-[#DE350B]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ─── Right: Metadata (30%) ─── */}
        <div className="w-80 flex-shrink-0 overflow-y-auto px-6 py-6 bg-white dark:bg-[#22272b] border-l border-[#dfe1e6] dark:border-[#373c43] space-y-6">

          {/* Type */}
          <div>
            <JiraLabel>Тип заявки</JiraLabel>
            <div className="relative" ref={typeDropdownRef}>
              <button type="button" onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded hover:bg-[#fafbfc] dark:hover:bg-[#282e33] text-[#172B4D] dark:text-white transition-colors">
                {type}
                <ChevronDown className={`w-4 h-4 text-[#5e6c84] transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
              </button>
              <SearchDropdown show={showTypeDropdown}>
                {TYPES.map(t => (
                  <DropdownItem key={t} active={type === t} onClick={() => { setType(t); setShowTypeDropdown(false); }}>
                    {t}
                  </DropdownItem>
                ))}
              </SearchDropdown>
            </div>
          </div>

          {/* Priority */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <JiraLabel>Приоритет</JiraLabel>
              <button type="button" onClick={handleAiSuggest} disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#0052CC] hover:bg-[#0052CC]/10 disabled:opacity-50 transition-colors">
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                ИИ-подсказка
              </button>
            </div>
            <div className="relative" ref={priorityDropdownRef}>
              <button type="button" onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded hover:bg-[#fafbfc] dark:hover:bg-[#282e33] transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: selectedPriority?.color }} />
                  <span className="text-[#172B4D] dark:text-white">{selectedPriority?.label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#5e6c84] transition-transform ${showPriorityDropdown ? 'rotate-180' : ''}`} />
              </button>
              <SearchDropdown show={showPriorityDropdown}>
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button"
                    onClick={() => { setPriority(p.value as TicketPriority); setShowPriorityDropdown(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      priority === p.value 
                        ? 'bg-[#0052CC]/10 text-[#172B4D] dark:text-white' 
                        : 'text-[#172B4D] dark:text-[#b6c2cf] hover:bg-[#091e420f] dark:hover:bg-[#282e33]'
                    }`}>
                    <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </button>
                ))}
              </SearchDropdown>
            </div>
          </div>

          {/* Tags */}
          <div>
            <JiraLabel>Метки</JiraLabel>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TAGS.map(t => {
                const on = tags.some(x => x.name === t.name);
                return (
                  <button key={t.name} type="button" onClick={() => togglePresetTag(t)}
                    className="px-2 py-1 rounded text-xs font-medium transition-all"
                    style={{
                      backgroundColor: on ? `${t.color}15` : '#f4f5f7',
                      color: on ? t.color : '#5e6c84',
                      border: `1px solid ${on ? t.color : '#dfe1e6'}`,
                    }}>
                    {t.name}
                  </button>
                );
              })}
            </div>

            {!showTagInput ? (
              <button onClick={() => setShowTagInput(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-[#5e6c84] hover:text-[#0052CC] transition-colors">
                <Plus className="w-3 h-3" /> Создать метку
              </button>
            ) : (
              <div className="flex gap-2">
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                  placeholder="Название метки"
                  className="flex-1 px-2 py-1 text-xs bg-white dark:bg-[#22272b] border border-[#dfe1e6] dark:border-[#373c43] rounded focus:border-[#0052CC] outline-none" />
                <button onClick={addCustomTag} disabled={!newTagInput.trim()}
                  className="px-2 py-1 text-xs bg-[#0052CC] text-white rounded hover:bg-[#0747A6] disabled:opacity-50">
                  OK
                </button>
              </div>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#dfe1e6] dark:border-[#373c43]">
                {tags.map(t => (
                  <span key={t.name} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: `${t.color}15`, color: t.color }}>
                    {t.name}
                    <button type="button" onClick={() => setTags(p => p.filter(x => x.name !== t.name))}
                      className="hover:opacity-70"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}