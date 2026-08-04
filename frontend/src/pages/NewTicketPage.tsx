import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, Upload, X, File, Building2,
  Plus, Search, FolderOpen, User, AlertCircle, Send, Check,
  ChevronDown,
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

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */

const PRIORITIES = [
  { value: 'low', label: 'Низкий', icon: <SignalLow className="w-4 h-4" />, c: 'emerald' },
  { value: 'medium', label: 'Средний', icon: <SignalMedium className="w-4 h-4" />, c: 'yellow' },
  { value: 'high', label: 'Высокий', icon: <SignalHigh className="w-4 h-4" />, c: 'orange' },
  { value: 'critical', label: 'Критический', icon: <Flame className="w-4 h-4" />, c: 'red' },
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

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];

/* ══════════════════════════════════════════════════════════════
   Dropdown
   ══════════════════════════════════════════════════════════════ */

interface DdOption { id: string; label: string; sub?: string }

function Dropdown({ options, value, onChange, placeholder, searchPh, loading, icon, empty = 'Пусто' }: {
  options: DdOption[]; value: string; onChange: (id: string) => void;
  placeholder: string; searchPh?: string; loading?: boolean;
  icon?: JSX.Element; empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const sel = options.find(o => o.id === value);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(s) || o.sub?.toLowerCase().includes(s)
    );
  }, [options, q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm transition-all
          ${open ? 'border-red-500/40 ring-2 ring-red-500/15 bg-[var(--bg-primary)]'
            : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover-1)]'}
          ${sel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'}`}>
        {icon && <span className="text-[var(--text-primary)]/35 flex-shrink-0">{icon}</span>}
        <span className="flex-1 truncate">{sel ? sel.label : placeholder}</span>
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25 flex-shrink-0" />
          : <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
          {(searchPh || options.length > 5) && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25" />
                <input value={q} onChange={e => setQ(e.target.value)}
                  placeholder={searchPh || 'Поиск...'} autoFocus
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--hover-1)] border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none focus:ring-1 focus:ring-red-500/20" />
              </div>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" />
                <span className="text-xs text-[var(--text-primary)]/35">Загрузка...</span>
              </div>
            ) : list.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--text-primary)]/35">{empty}</div>
            ) : list.map(o => (
              <button key={o.id} type="button"
                onClick={() => { onChange(o.id); setOpen(false); setQ(''); }}
                className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm transition-colors
                  ${o.id === value ? 'bg-red-500/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]'}`}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{o.label}</span>
                  {o.sub && <span className="block text-xs text-[var(--text-primary)]/35 truncate mt-0.5">{o.sub}</span>}
                </span>
                {o.id === value && <Check className="w-4 h-4 text-red-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
          {value && (
            <div className="border-t border-[var(--border-color)]">
              <button type="button"
                onClick={() => { onChange(''); setOpen(false); setQ(''); }}
                className="w-full px-3.5 py-2 text-left text-xs text-[var(--text-primary)]/35 hover:bg-[var(--hover-1)] hover:text-red-400 transition-colors">
                Очистить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

interface GeneralFile {
  id: string; file: File; preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface SimpleUser {
  id: string; username: string; full_name: string | null; email: string; role?: string;
}

type SelectionType = 'project' | 'counterparty' | null;

interface DraftData {
  title: string;
  descriptionBlocks: DescriptionBlock[];
  priority: string;
  type: string;
  tags: TicketTag[];
  selectionType: SelectionType;
  counterpartyId: string;
  projectId: string;
  reporterId: string;
  savedAt: number;
}

/* ══════════════════════════════════════════════════════════════
   Priority classes helper
   ══════════════════════════════════════════════════════════════ */

function priClasses(color: string, active: boolean) {
  const m: Record<string, [string, string]> = {
    emerald: ['border-[var(--border-color)] text-[var(--text-primary)]/45 hover:border-emerald-500/30 hover:text-emerald-400',
              'border-emerald-400/50 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20'],
    yellow:  ['border-[var(--border-color)] text-[var(--text-primary)]/45 hover:border-yellow-500/30 hover:text-yellow-400',
              'border-yellow-400/50 bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/20'],
    orange:  ['border-[var(--border-color)] text-[var(--text-primary)]/45 hover:border-orange-500/30 hover:text-orange-400',
              'border-orange-400/50 bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/20'],
    red:     ['border-[var(--border-color)] text-[var(--text-primary)]/45 hover:border-red-500/30 hover:text-red-400',
              'border-red-400/50 bg-red-500/15 text-red-300 ring-1 ring-red-400/20'],
  };
  const [idle, act] = m[color] || m.yellow;
  return active ? act : idle;
}

/* ══════════════════════════════════════════════════════════════
   Section wrapper
   ══════════════════════════════════════════════════════════════ */

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();

  const currentUserId = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const draftKey = currentUserId ? `ticket-draft:${currentUserId}` : 'ticket-draft';

  // ── Form state ──
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

  // ── Binding state ──
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

  // ── AI ──
  const [aiLoading, setAiLoading] = useState(false);

  // ── UI ──
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initDoneRef = useRef(false);
  const presetAppliedRef = useRef(false);

  const isCustomer = user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectCounterparty = (!isCustomer && user?.roles?.some(r => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);

  const hasDescription = descriptionBlocks.some(
    b => (b.type === 'text' && b.value.trim().length > 0) || (b.type === 'image' && b.localFile)
  );

  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const prjName = (p: Project) => `${p.key} - ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;
  const formatFileSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const clearError = (f: string) => setErrors(p => { const n = { ...p }; delete n[f]; return n; });

  // ── Dropdown options ──
  const typeOptions: DdOption[] = useMemo(() => TYPES.map(t => ({ id: t.value, label: t.label })), []);

  /* ══════════════════════════════════════════════════════════════
     Draft
     ══════════════════════════════════════════════════════════════ */

  // Check on mount
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const d: DraftData = JSON.parse(raw);
      if (d.title || d.descriptionBlocks?.some(b => b.type === 'text' && b.value.trim()) || d.tags?.length) {
        setDraftData(d);
        setShowDraftBanner(true);
      }
    } catch { }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    setTitle(draftData.title || '');
    if (draftData.descriptionBlocks?.length) setDescriptionBlocks(draftData.descriptionBlocks);
    setPriority((draftData.priority || 'medium') as TicketPriority);
    setType((draftData.type || 'Инцидент') as TicketType);
    setTags(draftData.tags || []);
    setSelectionType(draftData.selectionType || null);
    setSavedAt(draftData.savedAt);
    setShowDraftBanner(false);
    presetAppliedRef.current = true;
  }, [draftData]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = title.trim() || descriptionBlocks.some(b => b.type === 'text' && b.value.trim()) || tags.length;
      if (!hasContent) return;
      const draft: DraftData = {
        title, descriptionBlocks, priority, type, tags, selectionType,
        counterpartyId: selectedCounterparty?.id || '',
        projectId: selectedProject?.id || '',
        reporterId: selectedReporter?.id || '',
        savedAt: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setSavedAt(Date.now());
    }, 800);
    return () => clearTimeout(timer);
  }, [draftKey, title, descriptionBlocks, priority, type, tags, selectionType, selectedCounterparty, selectedProject, selectedReporter]);

  // beforeunload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (title.trim() || hasDescription) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [title, hasDescription]);

  /* ══════════════════════════════════════════════════════════════
     API Loaders (from original code)
     ══════════════════════════════════════════════════════════════ */

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node)) setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node)) setShowReporterDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
    const autoSelectProject = async () => {
      setSelectionType('project');
      try {
        const items = (await projectsApi.getAll(1, 100)).items;
        setProjects(items);
        const found = items.find(p => p.id === preselectedProjectId);
        if (found) {
          setSelectedProject(found);
          setProjectSearch(`${found.key} - ${found.name}`);
          if (found.counterparty_id) {
            try {
              const cp = await counterpartiesApi.getById(found.counterparty_id);
              setSelectedCounterparty(cp);
              setCounterpartySearch(cp.name || cp.legal_name || '');
            } catch { }
          }
        }
      } catch (err) { console.error('Failed to auto-select project:', err); }
      finally { setLoadingProjects(false); }
    };
    autoSelectProject();
  }, [preselectedProjectId, canSelectCounterparty]);

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
          setCounterpartySearch(found.name || found.legal_name || '');
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

  /* ══════════════════════════════════════════════════════════════
     Handlers
     ══════════════════════════════════════════════════════════════ */

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
    setTags(p => [...p, { name: n, color: '#a1a1aa' }]);
    setNewTagInput('');
  };

  const removeTag = (name: string) => setTags(p => p.filter(t => t.name !== name));

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

  const handleAiSuggest = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      if (!t) setErrors(p => ({ ...p, title: 'Укажите тему для ИИ' }));
      if (!d) setErrors(p => ({ ...p, description: 'Опишите проблему для ИИ' }));
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
    } catch (err) { console.error('AI failed:', err); }
    finally { setAiLoading(false); }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Укажите тему заявки';
    if (!hasDescription) e.description = 'Добавьте описание';
    setErrors(e);
    return !Object.keys(e).length;
  };

  /* ══════════════════════════════════════════════════════════════
     Submit (from original code)
     ══════════════════════════════════════════════════════════════ */

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
        } catch (err) { console.error('Image upload failed:', block.id, err); }
      }
      if (imageBlocks.length > 0) {
        let finalDesc = serializeBlocks(descriptionBlocks);
        for (const [blockId, attachmentId] of Object.entries(uploadMap)) {
          finalDesc = finalDesc.replaceAll(`![image](local:${blockId})`, `![image](media://${attachmentId})`);
        }
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

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */

  return (
    <div className="h-[calc(100vh-var(--header-height,64px))] flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/tickets')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft className="w-4 h-4" /> К заявкам
          </button>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Новая заявка</h1>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-[var(--text-primary)]/30">
              Черновик · {formatTime(savedAt)}
            </span>
          )}
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-red-900/25">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Создаём...' : 'Создать заявку'}
          </button>
        </div>
      </div>

      {/* ── Draft banner ── */}
      {showDraftBanner && draftData && (
        <div className="flex-shrink-0 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-4">
          <div className="flex-1 text-sm">
            <span className="text-amber-300 font-medium">Черновик: </span>
            <span className="text-[var(--text-primary)]/50">
              «{draftData.title || 'без темы'}» · {formatTime(draftData.savedAt)}
            </span>
          </div>
          <button type="button" onClick={restoreDraft}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-medium transition-colors">
            Восстановить
          </button>
          <button type="button" onClick={dismissDraft}
            className="px-3 py-1.5 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 text-sm transition-colors">
            Удалить
          </button>
        </div>
      )}

      {/* ── Errors ── */}
      {Object.keys(errors).length > 0 && (
        <div className="flex-shrink-0 px-5 py-2 bg-red-500/8 border-b border-red-500/20 flex flex-wrap gap-x-6 gap-y-1">
          {Object.values(errors).map((e, i) => (
            <span key={i} className="text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> {e}
            </span>
          ))}
        </div>
      )}

      {/* ── Main: two columns ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ LEFT: Form ═══ */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-3xl space-y-5">

            {/* Title */}
            <div>
              <SpellCheckField value={title} onChange={(v) => { setTitle(v); clearError('title'); }} label="Тема заявки *">
                <input type="text" value={title} onChange={e => { setTitle(e.target.value); clearError('title'); }}
                  placeholder="Коротко опишите проблему..."
                  className={`input-field py-3 text-lg w-full ${errors.title ? 'border-red-500 ring-1 ring-red-500/30' : ''}`} />
              </SpellCheckField>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-2">
                Описание проблемы <span className="text-red-400">*</span>
              </label>
              <div className={errors.description ? 'ring-1 ring-red-500/30 rounded-2xl' : ''}>
                <TicketEditor blocks={descriptionBlocks} onChange={(b) => { setDescriptionBlocks(b); clearError('description'); }} />
              </div>
            </div>

            {/* Files */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-2">
                Вложения
              </label>
              <div onDrop={handleGeneralDrop} onDragOver={e => e.preventDefault()}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-dashed border-[var(--border-color)] hover:border-[var(--text-primary)]/20 bg-[var(--hover-1)]/50 transition-colors">
                <Upload className="w-5 h-5 text-[var(--text-primary)]/20 flex-shrink-0" />
                <span className="flex-1 text-sm text-[var(--text-primary)]/40">
                  Перетащите файлы сюда или
                </span>
                <label className="px-4 py-2 rounded-lg bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/60 cursor-pointer transition-colors font-medium">
                  <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
                  Выбрать файлы
                </label>
              </div>

              {generalFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {generalFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                      {f.preview
                        ? <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        : <div className="w-10 h-10 rounded-lg bg-[var(--hover-2)] flex items-center justify-center">
                          <File className="w-4 h-4 text-[var(--text-primary)]/30" />
                        </div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{f.file.name}</p>
                        <p className="text-xs text-[var(--text-primary)]/40">{formatFileSize(f.file.size)}</p>
                      </div>
                      <button onClick={() => removeGeneralFile(f.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--text-primary)]/30">До 10 файлов, до 25 МБ каждый</p>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Sidebar ═══ */}
        <div className="w-80 xl:w-[340px] flex-shrink-0 border-l border-[var(--border-color)] overflow-y-auto bg-[var(--bg-secondary)]/30">
          <div className="p-4 space-y-5">

            {/* ── Binding ── */}
            <SideSection title="Привязка">
              {isCustomer && customerCounterparty && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 mb-3">
                  <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text-primary)] font-medium truncate">{customerCounterparty.name}</div>
                    {customerCounterparty.inn && (
                      <div className="text-xs text-[var(--text-primary)]/35">ИНН {customerCounterparty.inn}</div>
                    )}
                  </div>
                </div>
              )}

              {canSelectCounterparty && (
                <div className="space-y-3">
                  {/* Tabs */}
                  <div className="flex gap-1 p-1 rounded-xl bg-[var(--hover-1)]">
                    {([
                      { v: null as SelectionType, l: 'Нет' },
                      { v: 'counterparty' as SelectionType, l: 'Компания' },
                      { v: 'project' as SelectionType, l: 'Проект' },
                    ]).map(b => (
                      <button key={String(b.v)} type="button" onClick={() => handleSelectionTypeChange(b.v)}
                        className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-all text-center
                          ${selectionType === b.v
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'}`}>
                        {b.l}
                      </button>
                    ))}
                  </div>

                  {/* Counterparty search dropdown */}
                  {selectionType === 'counterparty' && (
                    <div>
                      <div className="relative" ref={counterpartyDropdownRef}>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                          <input value={counterpartySearch}
                            onChange={e => { setCounterpartySearch(e.target.value); setShowCounterpartyDropdown(true); loadCounterparties(e.target.value); }}
                            onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }}
                            placeholder="Поиск компании..."
                            className="input-field w-full py-2.5 text-sm pl-9" />
                        </div>
                        {showCounterpartyDropdown && (
                          <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 max-h-52 overflow-y-auto">
                            {loadingCounterparties
                              ? <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[var(--text-primary)]/30" /></div>
                              : counterparties.length === 0
                                ? <div className="py-4 text-center text-sm text-[var(--text-primary)]/35">Не найдено</div>
                                : counterparties.map(cp => (
                                  <button key={cp.id}
                                    onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}
                                    className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors
                                      ${selectedCounterparty?.id === cp.id ? 'bg-red-500/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)]'}`}>
                                    <div className="font-medium">{cpName(cp)}</div>
                                    {cp.inn && <div className="text-xs text-[var(--text-primary)]/35 mt-0.5">ИНН: {cp.inn}</div>}
                                  </button>
                                ))}
                          </div>
                        )}
                      </div>
                      {selectedCounterparty && (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/20 text-sm text-blue-400">
                          <Check className="w-3.5 h-3.5" /> {cpName(selectedCounterparty)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Project search dropdown */}
                  {selectionType === 'project' && (
                    <div>
                      <div className="relative" ref={projectDropdownRef}>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                          <input value={projectSearch}
                            onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                            onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }}
                            placeholder="Поиск проекта..."
                            className="input-field w-full py-2.5 text-sm pl-9" />
                        </div>
                        {showProjectDropdown && (
                          <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 max-h-52 overflow-y-auto">
                            {loadingProjects
                              ? <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[var(--text-primary)]/30" /></div>
                              : projects
                                .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase()))
                                .length === 0
                                ? <div className="py-4 text-center text-sm text-[var(--text-primary)]/35">Не найдено</div>
                                : projects
                                  .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase()))
                                  .map(p => (
                                    <button key={p.id}
                                      onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}
                                      className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors
                                        ${selectedProject?.id === p.id ? 'bg-red-500/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)]'}`}>
                                      <span className="text-amber-400 font-medium">{p.key}</span>
                                      <span className="text-[var(--text-primary)]/60"> — {p.name}</span>
                                    </button>
                                  ))}
                          </div>
                        )}
                      </div>
                      {selectedProject && (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-sm text-amber-400">
                          <Check className="w-3.5 h-3.5" /> {prjName(selectedProject)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SideSection>

            {/* ── Reporter ── */}
            {canSelectReporter && (selectedCounterparty || selectedProject) && (
              <SideSection title="Инициатор">
                <div className="relative" ref={reporterDropdownRef}>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                    <input value={reporterSearch}
                      onChange={e => { setReporterSearch(e.target.value); setShowReporterDropdown(true); }}
                      onFocus={() => setShowReporterDropdown(true)}
                      placeholder="Я (по умолчанию)"
                      className="input-field w-full py-2.5 text-sm pl-9" />
                  </div>
                  {showReporterDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 max-h-52 overflow-y-auto">
                      {loadingUsers
                        ? <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[var(--text-primary)]/30" /></div>
                        : <>
                          <button onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}
                            className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--hover-1)] text-[var(--text-primary)]">
                            {user?.full_name || 'Вы'} <span className="text-[var(--text-primary)]/35">(я)</span>
                          </button>
                          {users
                            .filter(u => !reporterSearch ||
                              u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) ||
                              u.email.toLowerCase().includes(reporterSearch.toLowerCase()))
                            .map(u => (
                              <button key={u.id}
                                onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}
                                className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--hover-1)] text-[var(--text-primary)]/65">
                                <div className="font-medium text-[var(--text-primary)]">{uName(u)}</div>
                                <div className="text-xs text-[var(--text-primary)]/35">{u.email}</div>
                              </button>
                            ))}
                        </>}
                    </div>
                  )}
                </div>
                {selectedReporter && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/8 border border-green-500/20 text-sm text-green-400">
                    <Check className="w-3.5 h-3.5" /> {uName(selectedReporter)}
                  </div>
                )}
              </SideSection>
            )}

            <div className="h-px bg-[var(--border-color)]" />

            {/* ── Category ── */}
            <SideSection title="Категория">
              <Dropdown
                options={typeOptions}
                value={type}
                onChange={v => setType(v as TicketType)}
                placeholder="Тип заявки"
              />
            </SideSection>

            {/* ── Priority ── */}
            <SideSection title="Срочность">
              <div className="grid grid-cols-2 gap-1.5">
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button"
                    onClick={() => setPriority(p.value as TicketPriority)}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                      ${priClasses(p.c, priority === p.value)}`}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </SideSection>

            {/* ── AI button ── */}
            <button type="button" onClick={handleAiSuggest} disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-amber-500/8 border border-amber-500/15 text-amber-300/80 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 transition-colors font-medium">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              ИИ: подобрать приоритет и теги
            </button>

            <div className="h-px bg-[var(--border-color)]" />

            {/* ── Tags ── */}
            <SideSection title="Теги">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESET_TAGS.map(t => {
                  const on = tags.some(x => x.name === t.name);
                  return (
                    <button key={t.name} type="button" onClick={() => togglePresetTag(t)}
                      className="px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        backgroundColor: on ? `${t.color}20` : 'transparent',
                        borderColor: on ? `${t.color}60` : 'var(--border-color)',
                        color: on ? t.color : 'var(--text-primary)',
                        opacity: on ? 1 : 0.5,
                      }}>
                      {t.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1.5">
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                  placeholder="Свой тег..."
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none focus:border-red-500/30" />
                <button type="button" onClick={addCustomTag} disabled={!newTagInput.trim()}
                  className="px-2.5 py-2 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] disabled:opacity-25 transition-colors">
                  <Plus className="w-4 h-4 text-[var(--text-primary)]/40" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span key={t.name}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
                      style={{
                        backgroundColor: `${t.color || '#64748b'}18`,
                        borderColor: `${t.color || '#64748b'}40`,
                        color: t.color || '#94a3b8',
                      }}>
                      {t.name}
                      <button type="button" onClick={() => removeTag(t.name)}
                        className="hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </SideSection>

          </div>
        </div>
      </div>
    </div>
  );
}