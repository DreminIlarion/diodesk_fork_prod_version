// ── NewTicketPage — Вариант A: классическая форма ──

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, Upload, X, File, Building2,
  Plus, Search, FolderOpen, User, AlertCircle, Check,
  ChevronDown, Send,
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
  { value: 'low', label: 'Низкий', icon: <SignalLow className="w-4 h-4" />, c: 'emerald' },
  { value: 'medium', label: 'Средний', icon: <SignalMedium className="w-4 h-4" />, c: 'yellow' },
  { value: 'high', label: 'Высокий', icon: <SignalHigh className="w-4 h-4" />, c: 'orange' },
  { value: 'critical', label: 'Критический', icon: <Flame className="w-4 h-4" />, c: 'red' },
] as const;

const TYPES: TicketType[] = [
  'Инцидент', 'Запрос на услугу', 'Консультация', 'Жалоба',
  'Задача', 'Проблема', 'Запрос на изменение', 'Улучшение', 'Прочее',
];

const PRESET_TAGS: TicketTag[] = [
  { name: 'Инцидент', color: '#dc2626' }, { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' }, { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#2563eb' }, { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
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

/* ═══ Helpers ═══ */

function priClasses(color: string, active: boolean) {
  const m: Record<string, [string, string]> = {
    emerald: [
      'border-[var(--border-color)] text-emerald-400/50 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5',
      'border-emerald-400 bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/10'
    ],
    yellow: [
      'border-[var(--border-color)] text-yellow-400/50 hover:border-yellow-500/40 hover:text-yellow-400 hover:bg-yellow-500/5',
      'border-yellow-400 bg-yellow-500/15 text-yellow-300 shadow-sm shadow-yellow-500/10'
    ],
    orange: [
      'border-[var(--border-color)] text-orange-400/50 hover:border-orange-500/40 hover:text-orange-400 hover:bg-orange-500/5',
      'border-orange-400 bg-orange-500/15 text-orange-300 shadow-sm shadow-orange-500/10'
    ],
    red: [
      'border-[var(--border-color)] text-red-400/50 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5',
      'border-red-400 bg-red-500/15 text-red-300 shadow-sm shadow-red-500/10'
    ],
  };
  const [idle, act] = m[color] || m.yellow;
  return active ? act : idle;
}

function SearchDropdown({ children, show }: { children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute z-50 mt-1.5 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/50 max-h-56 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}

function DropdownItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${active ? 'bg-red-500/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]'}`}>
      {children}
    </button>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
      {children} {required && <span className="text-red-400">*</span>}
    </label>
  );
}

function formatFileSize(b: number) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/* ═══ Page ═══ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();

  const currentUserId = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const draftKey = currentUserId ? `ticket-draft-a:${currentUserId}` : 'ticket-draft-a';

  // Form
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

  const initRef = useRef(false);
  const presetRef = useRef(false);
  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

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

  /* ─── Draft ─── */

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
    presetRef.current = true;
  }, [draftData]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  // Auto-save with description
  useEffect(() => {
    const timer = setTimeout(() => {
      const descText = descriptionBlocks
        .filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.value).join('\n\n').trim();
      const hasContent = title.trim() || descText || tags.length;
      if (!hasContent) return;
      const draft: DraftData = {
        title,
        descriptionText: descText,
        priority, type, tags, selectionType,
        savedAt: Date.now(),
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

  /* ─── Close dropdowns ─── */

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node)) setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node)) setShowReporterDropdown(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) setShowTypeDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ─── API Loaders (unchanged) ─── */

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
        items = items.filter(c => c.name?.toLowerCase().includes(q) || c.legal_name?.toLowerCase().includes(q) || c.inn?.includes(search));
      }
      setCounterparties(items);
      if (!search && preselectedCounterpartyId && !selectedCounterparty) {
        const found = items.find(c => c.id === preselectedCounterpartyId);
        if (found) { setSelectionType('counterparty'); setSelectedCounterparty(found); setCounterpartySearch(found.name || found.legal_name || ''); }
      }
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
      let all = [...items];
      if (!items.find(u => u.id === user?.user_id) && user?.user_id) {
        all = [{ id: user.user_id, username: user.username || '', full_name: user.full_name || null, email: user.email || '', role: user.role }, ...items];
      }
      setUsers(all); setSelectedReporter(null); setReporterSearch('');
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
    setTags(p => [...p, { name: n, color: '#a1a1aa' }]);
    setNewTagInput('');
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

  const handleAiSuggest = async () => {
    const t = title.trim(), d = description.trim();
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
    } catch { } finally { setAiLoading(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Укажите тему заявки';
    if (!hasDescription) e.description = 'Добавьте описание';
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

  return (
    <div className="h-[calc(100vh-var(--header-height,64px))] flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tickets')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft className="w-4 h-4" /> К заявкам
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Новая заявка</h1>
          {savedAt && <span className="text-xs text-[var(--text-primary)]/30 ml-2">Черновик · {formatTime(savedAt)}</span>}
        </div>
        <button onClick={handleSubmit} disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-red-900/20">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Создаём...' : 'Создать заявку'}
        </button>
      </div>

      {/* Draft banner */}
      {showDraftBanner && draftData && (
        <div className="flex-shrink-0 px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-4">
          <span className="text-sm text-amber-300 font-medium">Черновик найден</span>
          <span className="text-sm text-[var(--text-primary)]/50">«{draftData.title || '...'}» · {formatTime(draftData.savedAt)}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={restoreDraft} className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-medium">Восстановить</button>
            <button onClick={dismissDraft} className="px-3 py-1.5 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 text-sm">Удалить</button>
          </div>
        </div>
      )}

      {/* Errors */}
      {Object.keys(errors).length > 0 && (
        <div className="flex-shrink-0 px-6 py-2 bg-red-500/8 border-b border-red-500/20 flex flex-wrap gap-x-6 gap-y-1">
          {Object.values(errors).map((e, i) => (
            <span key={i} className="text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {e}
            </span>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {/* ── Binding ── */}
          {canSelectCounterparty && (
            <div className="glass-card p-5">
              <Label>Привязка заявки</Label>
              <div className="flex gap-2 mb-3">
                {([
                  { v: null as SelectionType, l: 'Без привязки', icon: <X className="w-4 h-4" /> },
                  { v: 'counterparty' as SelectionType, l: 'Компания', icon: <Building2 className="w-4 h-4" /> },
                  { v: 'project' as SelectionType, l: 'Проект', icon: <FolderOpen className="w-4 h-4" /> },
                ]).map(b => (
                  <button key={String(b.v)} type="button" onClick={() => handleSelectionTypeChange(b.v)}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                      ${selectionType === b.v
                        ? 'border-red-500/40 bg-red-500/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]/70'}`}>
                    {b.icon} {b.l}
                  </button>
                ))}
              </div>

              {selectionType === 'counterparty' && (
                <div className="relative" ref={counterpartyDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                    <input value={counterpartySearch}
                      onChange={e => { setCounterpartySearch(e.target.value); setShowCounterpartyDropdown(true); loadCounterparties(e.target.value); }}
                      onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }}
                      placeholder="Найти компанию..." className="input-field w-full py-2.5 pl-9 text-sm" />
                  </div>
                  <SearchDropdown show={showCounterpartyDropdown}>
                    {loadingCounterparties
                      ? <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/25" /></div>
                      : counterparties.length === 0
                        ? <div className="py-4 text-center text-sm text-[var(--text-primary)]/35">Не найдено</div>
                        : counterparties.map(cp => (
                          <DropdownItem key={cp.id} active={selectedCounterparty?.id === cp.id}
                            onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}>
                            <div className="font-medium">{cpName(cp)}</div>
                            {cp.inn && <div className="text-xs text-[var(--text-primary)]/35 mt-0.5">ИНН {cp.inn}</div>}
                          </DropdownItem>
                        ))}
                  </SearchDropdown>
                  {selectedCounterparty && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
                      <Check className="w-4 h-4" /> {cpName(selectedCounterparty)}
                    </div>
                  )}
                </div>
              )}

              {selectionType === 'project' && (
                <div className="relative" ref={projectDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                    <input value={projectSearch}
                      onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                      onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }}
                      placeholder="Найти проект..." className="input-field w-full py-2.5 pl-9 text-sm" />
                  </div>
                  <SearchDropdown show={showProjectDropdown}>
                    {loadingProjects
                      ? <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/25" /></div>
                      : projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase())).length === 0
                        ? <div className="py-4 text-center text-sm text-[var(--text-primary)]/35">Не найдено</div>
                        : projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                          <DropdownItem key={p.id} active={selectedProject?.id === p.id}
                            onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}>
                            <span className="text-amber-400 font-medium">{p.key}</span> — {p.name}
                          </DropdownItem>
                        ))}
                  </SearchDropdown>
                  {selectedProject && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                      <Check className="w-4 h-4" /> {prjName(selectedProject)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isCustomer && customerCounterparty && (
            <div className="glass-card p-4 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-blue-400" />
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{customerCounterparty.name}</div>
                {customerCounterparty.inn && <div className="text-xs text-[var(--text-primary)]/40">ИНН {customerCounterparty.inn}</div>}
              </div>
            </div>
          )}

          {/* ── Reporter ── */}
          {canSelectReporter && (selectedCounterparty || selectedProject) && (
            <div className="glass-card p-5">
              <Label>Инициатор</Label>
              <div className="relative" ref={reporterDropdownRef}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                  <input value={reporterSearch}
                    onChange={e => { setReporterSearch(e.target.value); setShowReporterDropdown(true); }}
                    onFocus={() => setShowReporterDropdown(true)}
                    placeholder="Я (по умолчанию)" className="input-field w-full py-2.5 pl-9 text-sm" />
                </div>
                <SearchDropdown show={showReporterDropdown}>
                  {loadingUsers
                    ? <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/25" /></div>
                    : <>
                      <DropdownItem onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}>
                        {user?.full_name || 'Вы'} <span className="text-[var(--text-primary)]/35">(я)</span>
                      </DropdownItem>
                      {users
                        .filter(u => !reporterSearch || u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) || u.email.toLowerCase().includes(reporterSearch.toLowerCase()))
                        .map(u => (
                          <DropdownItem key={u.id} active={selectedReporter?.id === u.id}
                            onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}>
                            <div className="font-medium">{uName(u)}</div>
                            <div className="text-xs text-[var(--text-primary)]/35">{u.email}</div>
                          </DropdownItem>
                        ))}
                    </>}
                </SearchDropdown>
              </div>
              <div className="mt-2 text-xs text-[var(--text-primary)]/40">
                Инициатор: <span className="text-[var(--text-primary)]/70">{selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}</span>
              </div>
            </div>
          )}

          {/* ── Title ── */}
          <div className="glass-card p-5">
            <SpellCheckField value={title} onChange={v => { setTitle(v); clearError('title'); }} label="Тема заявки *">
              <input type="text" value={title} onChange={e => { setTitle(e.target.value); clearError('title'); }}
                placeholder="Коротко: что случилось"
                className={`input-field py-3 text-lg w-full ${errors.title ? 'border-red-500 ring-1 ring-red-500/30' : ''}`} />
            </SpellCheckField>
          </div>

          {/* ── Description ── */}
          <div className="glass-card p-5">
            <Label required>Описание проблемы</Label>
            <div className={errors.description ? 'ring-1 ring-red-500/30 rounded-2xl' : ''}>
              <TicketEditor blocks={descriptionBlocks} onChange={b => { setDescriptionBlocks(b); clearError('description'); }} />
            </div>
          </div>

          {/* ── Type + Priority row ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Type */}
            <div className="glass-card p-5">
              <Label>Категория</Label>
              <div className="relative" ref={typeDropdownRef}>
                <button type="button" onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--text-primary)]/20 text-sm text-[var(--text-primary)] transition-colors">
                  {type}
                  <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
                </button>
                <SearchDropdown show={showTypeDropdown}>
                  {TYPES.map(t => (
                    <DropdownItem key={t} active={type === t}
                      onClick={() => { setType(t); setShowTypeDropdown(false); }}>
                      {t}
                    </DropdownItem>
                  ))}
                </SearchDropdown>
              </div>
            </div>

            {/* Priority */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-2">
                <Label>Срочность</Label>
                <button type="button" onClick={handleAiSuggest} disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/15 disabled:opacity-40 transition-colors">
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  ИИ
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button"
                    onClick={() => setPriority(p.value as TicketPriority)}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${priClasses(p.c, priority === p.value)}`}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Tags ── */}
          <div className="glass-card p-5">
            <Label>Теги</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TAGS.map(t => {
                const on = tags.some(x => x.name === t.name);
                return (
                  <button key={t.name} type="button" onClick={() => togglePresetTag(t)}
                    className="px-3 py-1.5 rounded-xl border text-sm font-medium transition-all"
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
              <button type="button" onClick={() => setShowTagInput(!showTagInput)}
                className="px-3 py-1.5 rounded-xl border border-dashed border-[var(--border-color)] text-sm text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 hover:border-[var(--text-primary)]/30 transition-colors">
                <Plus className="w-4 h-4 inline mr-1" />Свой
              </button>
            </div>
            {showTagInput && (
              <div className="flex gap-2 mb-3">
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                  placeholder="Название тега..." className="input-field flex-1 py-2 text-sm" />
                <button onClick={addCustomTag} disabled={!newTagInput.trim()}
                  className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-40">
                  Добавить
                </button>
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <span key={t.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm"
                    style={{ backgroundColor: `${t.color || '#64748b'}18`, borderColor: `${t.color || '#64748b'}40`, color: t.color || '#94a3b8' }}>
                    {t.name}
                    <button type="button" onClick={() => setTags(p => p.filter(x => x.name !== t.name))}
                      className="hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Files ── */}
          <div className="glass-card p-5">
            <Label>Вложения</Label>
            <div onDrop={handleGeneralDrop} onDragOver={e => e.preventDefault()}
              className="flex items-center gap-4 px-4 py-3 rounded-xl border border-dashed border-[var(--border-color)] hover:border-[var(--text-primary)]/20 transition-colors">
              <Upload className="w-5 h-5 text-[var(--text-primary)]/20" />
              <span className="flex-1 text-sm text-[var(--text-primary)]/40">Перетащите файлы сюда или</span>
              <label className="px-4 py-2 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/60 cursor-pointer font-medium">
                <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
                Выбрать
              </label>
            </div>
            {generalFiles.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {generalFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                    {f.preview
                      ? <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      : <div className="w-10 h-10 rounded-lg bg-[var(--hover-2)] flex items-center justify-center"><File className="w-4 h-4 text-[var(--text-primary)]/30" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{f.file.name}</p>
                      <p className="text-xs text-[var(--text-primary)]/40">{formatFileSize(f.file.size)}</p>
                    </div>
                    <button onClick={() => removeGeneralFile(f.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom spacer for mobile */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}