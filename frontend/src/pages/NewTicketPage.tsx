import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Check, ChevronDown, File,
  FolderOpen, Loader2, Plus, Search, Sparkles,
  Upload, User, X,
} from 'lucide-react';
import { Flame, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import {
  ticketsApi, counterpartiesApi, projectsApi, usersApi,
} from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type {
  Counterparty, Project, TicketPriority, TicketTag, TicketType,
} from '../types';

/* ════════════════════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════════════════════ */

const PRIORITIES: {
  value: string; label: string; icon: JSX.Element;
  border: string; bg: string; activeBorder: string; activeBg: string; activeText: string;
}[] = [
  { value: 'low',      label: 'Низкий',       icon: <SignalLow className="w-4 h-4" />,    border: 'border-emerald-500/20', bg: 'bg-emerald-500/5',  activeBorder: 'border-emerald-400', activeBg: 'bg-emerald-500/20', activeText: 'text-emerald-300' },
  { value: 'medium',   label: 'Средний',      icon: <SignalMedium className="w-4 h-4" />, border: 'border-yellow-500/20',  bg: 'bg-yellow-500/5',   activeBorder: 'border-yellow-400',  activeBg: 'bg-yellow-500/20',  activeText: 'text-yellow-300' },
  { value: 'high',     label: 'Высокий',      icon: <SignalHigh className="w-4 h-4" />,   border: 'border-orange-500/20',  bg: 'bg-orange-500/5',   activeBorder: 'border-orange-400',  activeBg: 'bg-orange-500/20',  activeText: 'text-orange-300' },
  { value: 'critical', label: 'Критический',  icon: <Flame className="w-4 h-4" />,        border: 'border-red-500/20',     bg: 'bg-red-500/5',      activeBorder: 'border-red-400',     activeBg: 'bg-red-500/20',     activeText: 'text-red-300' },
];

const TICKET_TYPES: { value: TicketType; label: string }[] = [
  { value: 'Инцидент',              label: 'Инцидент' },
  { value: 'Запрос на услугу',      label: 'Запрос на услугу' },
  { value: 'Консультация',          label: 'Консультация' },
  { value: 'Жалоба',                label: 'Жалоба' },
  { value: 'Задача',                label: 'Задача' },
  { value: 'Проблема',              label: 'Проблема' },
  { value: 'Запрос на изменение',   label: 'Запрос на изменение' },
  { value: 'Улучшение',             label: 'Улучшение' },
  { value: 'Прочее',                label: 'Прочее' },
];

const PRESET_TAGS: TicketTag[] = [
  { name: 'Инцидент',     color: '#dc2626' },
  { name: 'Консультация',  color: '#2563eb' },
  { name: 'Доработка',     color: '#059669' },
  { name: 'Ошибка',        color: '#ea580c' },
  { name: 'Интеграция',    color: '#2563eb' },
  { name: 'Обучение',      color: '#059669' },
  { name: 'Срочное',       color: '#dc2626' },
];

const CAN_SELECT_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];

/* ════════════════════════════════════════════════════════════════
   Custom Dropdown
   ════════════════════════════════════════════════════════════════ */

interface DropdownOption {
  id: string;
  label: string;
  sub?: string;
}

function Dropdown({
  options, value, onChange, placeholder, searchPlaceholder, loading, icon,
  emptyText = 'Ничего не найдено',
}: {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  loading?: boolean;
  icon?: JSX.Element;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sub && o.sub.toLowerCase().includes(q))
    );
  }, [options, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
          ${open
            ? 'border-red-500/50 bg-[var(--bg-secondary)] ring-1 ring-red-500/20'
            : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--text-primary)]/30'
          }
          ${!selected ? 'text-[var(--text-primary)]/40' : 'text-[var(--text-primary)]'}
        `}
      >
        {icon && <span className="text-[var(--text-primary)]/40 flex-shrink-0">{icon}</span>}
        <span className="flex-1 truncate text-sm">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {(searchPlaceholder || options.length > 5) && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={searchPlaceholder || 'Поиск...'}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--hover-1)] border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/30 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/30" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--text-primary)]/40">
                {emptyText}
              </div>
            ) : (
              filtered.map(option => {
                const isSelected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { onChange(option.id); setOpen(false); setSearch(''); }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors
                      ${isSelected
                        ? 'bg-red-500/10 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/80 hover:bg-[var(--hover-1)]'
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{option.label}</div>
                      {option.sub && (
                        <div className="text-xs text-[var(--text-primary)]/40 truncate mt-0.5">
                          {option.sub}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

interface GeneralFile {
  id: string; file: File; preview?: string;
}

interface SimpleUser {
  id: string; username: string; full_name: string | null; email: string;
}

type BindingType = 'none' | 'counterparty' | 'project';

interface DraftData {
  title: string; description: string; bindingType: BindingType;
  counterpartyId: string; projectId: string; reporterId: string;
  type: string; priority: string; tags: TicketTag[];
  savedAt: number;
}

/* ════════════════════════════════════════════════════════════════
   Component
   ════════════════════════════════════════════════════════════════ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const uid = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const preCounterpartyId = searchParams.get('counterparty_id') || '';
  const preProjectId = searchParams.get('project_id') || '';

  const isCustomer = user?.roles?.some((r: string) => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelect = (!isCustomer && user?.roles?.some((r: string) => CAN_SELECT_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const draftKey = uid ? `ticket-draft:${uid}` : 'ticket-draft';

  // ── State ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bindingType, setBindingType] = useState<BindingType>('none');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [reporterId, setReporterId] = useState('');
  const [type, setType] = useState<TicketType>('Инцидент');
  const [priority, setPriority] = useState<string>('medium');
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [files, setFiles] = useState<GeneralFile[]>([]);

  const [customerCp, setCustomerCp] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);

  const [loadingCp, setLoadingCp] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initRef = useRef(false);
  const presetRef = useRef(false);

  // ── Derived ──
  const selectedCp = counterparties.find(c => c.id === counterpartyId) || null;
  const selectedProject = projects.find(p => p.id === projectId) || null;
  const selectedReporter = users.find(u => u.id === reporterId) || null;

  const relatedCpId = selectedProject?.counterparty_id || counterpartyId || customerCp?.id || '';

  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const pName = (p: Project) => `${p.key} — ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;

  const cpOptions: DropdownOption[] = useMemo(() =>
    counterparties.map(c => ({ id: c.id, label: cpName(c), sub: c.inn ? `ИНН ${c.inn}` : undefined })),
    [counterparties]
  );

  const projectOptions: DropdownOption[] = useMemo(() =>
    projects.map(p => ({ id: p.id, label: pName(p) })),
    [projects]
  );

  const userOptions: DropdownOption[] = useMemo(() =>
    users.map(u => ({ id: u.id, label: uName(u), sub: u.email })),
    [users]
  );

  const typeOptions: DropdownOption[] = useMemo(() =>
    TICKET_TYPES.map(t => ({ id: t.value, label: t.label })),
    []
  );

  const formatSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // ── Draft: check on mount ──
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const raw = localStorage.getItem(draftKey);
    if (!raw) return;

    try {
      const data: DraftData = JSON.parse(raw);
      if (data.title || data.description || data.tags?.length) {
        setDraftData(data);
        setShowDraftBanner(true);
      }
    } catch { /* ignore */ }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    setTitle(draftData.title || '');
    setDescription(draftData.description || '');
    setBindingType(draftData.bindingType || 'none');
    setCounterpartyId(draftData.counterpartyId || '');
    setProjectId(draftData.projectId || '');
    setReporterId(draftData.reporterId || '');
    setType((draftData.type as TicketType) || 'Инцидент');
    setPriority(draftData.priority || 'medium');
    setTags(draftData.tags || []);
    setSavedAt(draftData.savedAt);
    setShowDraftBanner(false);
    presetRef.current = true;
  }, [draftData]);

  const dismissDraft = useCallback(() => {
    setShowDraftBanner(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  // ── Draft: auto-save ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!title.trim() && !description.trim() && !tags.length) return;

      const draft: DraftData = {
        title, description, bindingType,
        counterpartyId, projectId, reporterId,
        type, priority, tags,
        savedAt: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setSavedAt(Date.now());
    }, 800);
    return () => clearTimeout(timer);
  }, [draftKey, title, description, bindingType, counterpartyId, projectId, reporterId, type, priority, tags]);

  // ── beforeunload ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (title.trim() || description.trim()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [title, description]);

  // ── Load data ──
  useEffect(() => {
    if (isCustomer && user?.counterparty_id) {
      counterpartiesApi.getById(user.counterparty_id).then(setCustomerCp).catch(() => {});
    }
  }, [isCustomer, user]);

  useEffect(() => {
    if (!canSelect) return;
    setLoadingCp(true);
    setLoadingProjects(true);
    Promise.all([
      counterpartiesApi.getAll(1, 200),
      projectsApi.getAll(1, 200),
    ]).then(([cpRes, pRes]) => {
      setCounterparties(cpRes.items);
      setProjects(pRes.items);
    }).catch(() => {}).finally(() => {
      setLoadingCp(false);
      setLoadingProjects(false);
    });
  }, [canSelect]);

  // presets from URL
  useEffect(() => {
    if (presetRef.current || !canSelect) return;
    if (!counterparties.length && !projects.length) return;

    if (preProjectId && projects.find(p => p.id === preProjectId)) {
      setBindingType('project');
      setProjectId(preProjectId);
      presetRef.current = true;
    } else if (preCounterpartyId && counterparties.find(c => c.id === preCounterpartyId)) {
      setBindingType('counterparty');
      setCounterpartyId(preCounterpartyId);
      presetRef.current = true;
    }
  }, [canSelect, counterparties, projects, preCounterpartyId, preProjectId]);

  // load users
  useEffect(() => {
    if (!canSelectReporter || !relatedCpId) { setUsers([]); return; }
    setLoadingUsers(true);
    usersApi.getCustomers(relatedCpId, 1, 100).then(res => {
      const items: SimpleUser[] = res.items.map((u: any) => ({
        id: u.id, username: u.username, full_name: u.full_name, email: u.email,
      }));
      const has = items.some(u => u.id === uid);
      const me: SimpleUser | null = uid ? {
        id: uid, username: (user as any)?.username || '',
        full_name: (user as any)?.full_name || null, email: (user as any)?.email || '',
      } : null;
      setUsers(has || !me ? items : [me, ...items]);
    }).catch(() => {}).finally(() => setLoadingUsers(false));
  }, [canSelectReporter, relatedCpId, uid, user]);

  useEffect(() => {
    if (reporterId && !users.some(u => u.id === reporterId)) setReporterId('');
  }, [users, reporterId]);

  // ── Handlers ──
  const clearError = (f: string) => setErrors(p => { const n = { ...p }; delete n[f]; return n; });

  const handleBindingType = (v: BindingType) => {
    setBindingType(v);
    if (v !== 'counterparty') { setCounterpartyId(''); }
    if (v !== 'project') { setProjectId(''); }
    setReporterId('');
    clearError('counterparty');
    clearError('project');
  };

  const toggleTag = (tag: TicketTag) => {
    setTags(prev =>
      prev.some(t => t.name === tag.name)
        ? prev.filter(t => t.name !== tag.name)
        : [...prev, tag]
    );
  };

  const addTag = () => {
    const v = newTagInput.trim();
    if (!v || tags.some(t => t.name.toLowerCase() === v.toLowerCase())) { setNewTagInput(''); return; }
    setTags(p => [...p, { name: v, color: '#64748b' }]);
    setNewTagInput('');
  };

  const handleFiles = (fileList: File[]) => {
    const next: GeneralFile[] = fileList.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    setFiles(p => [...p, ...next].slice(0, 10));
  };

  const removeFile = (id: string) => {
    const f = files.find(x => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setFiles(p => p.filter(x => x.id !== id));
  };

  const handleAi = async () => {
    if (!title.trim() || !description.trim()) {
      if (!title.trim()) setErrors(p => ({ ...p, title: 'Заполните тему для анализа' }));
      if (!description.trim()) setErrors(p => ({ ...p, description: 'Заполните описание для анализа' }));
      return;
    }
    setAiLoading(true);
    try {
      const r = await ticketsApi.predict(title.trim(), description.trim());
      if (r?.suggested_priority) setPriority(r.suggested_priority);
      if (r?.suggested_tags?.length) {
        setTags(prev => {
          const map = new Map<string, TicketTag>();
          [...prev, ...r.suggested_tags].forEach(t => map.set(t.name.toLowerCase(), t));
          return Array.from(map.values());
        });
      }
    } catch { }
    finally { setAiLoading(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Укажите тему';
    if (!description.trim()) e.description = 'Опишите проблему';
    if (canSelect && bindingType === 'counterparty' && !counterpartyId) e.counterparty = 'Выберите компанию';
    if (canSelect && bindingType === 'project' && !projectId) e.project = 'Выберите проект';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: any = {
        title: title.trim(), description: description.trim(),
        priority, type,
        tags: tags.map(t => ({ name: t.name, color: t.color || '#64748b' })),
        reporter_id: reporterId || uid,
      };

      if (isCustomer && customerCp) payload.counterparty_id = customerCp.id;
      else if (bindingType === 'project' && projectId) payload.project_id = projectId;
      else if (bindingType === 'counterparty' && counterpartyId) payload.counterparty_id = counterpartyId;

      const ticket = await ticketsApi.create(payload);

      for (const f of files) {
        try { await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id); } catch { }
      }

      localStorage.removeItem(draftKey);
      navigate('/tickets');
    } catch (err: any) {
      console.error('Submit failed', err?.response?.data || err);
    } finally { setSubmitting(false); }
  };

  // ── Render ──
  return (
    <div className="max-w-4xl mx-auto pb-28">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => navigate('/tickets')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft className="w-4 h-4" /> К заявкам
        </button>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Новая заявка</h1>
        {savedAt && (
          <span className="ml-auto text-xs text-[var(--text-primary)]/40">
            черновик · {formatTime(savedAt)}
          </span>
        )}
      </div>

      {/* Draft banner */}
      {showDraftBanner && draftData && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-300">Найден черновик</div>
            <div className="text-xs text-[var(--text-primary)]/50 mt-1">
              «{draftData.title || 'без темы'}» · сохранён {formatTime(draftData.savedAt)}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={restoreDraft}
              className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-medium transition-colors">
              Восстановить
            </button>
            <button type="button" onClick={dismissDraft}
              className="px-4 py-2 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-[var(--text-primary)]/60 text-sm transition-colors">
              Не нужно
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {Object.keys(errors).length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/8 space-y-1">
          {Object.values(errors).map((err, i) => (
            <div key={i} className="text-sm text-red-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ─── Section: What happened ─── */}
        <section className="glass-card p-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                Тема <span className="text-red-400">*</span>
              </label>
              <input value={title}
                onChange={e => { setTitle(e.target.value); clearError('title'); }}
                placeholder="Коротко: что случилось"
                className={`input-field w-full ${errors.title ? 'border-red-500 ring-1 ring-red-500/30' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                Описание <span className="text-red-400">*</span>
              </label>
              <textarea rows={6} value={description}
                onChange={e => { setDescription(e.target.value); clearError('description'); }}
                placeholder="Что произошло, как повторить, когда началось..."
                className={`input-field w-full resize-y min-h-[140px] ${errors.description ? 'border-red-500 ring-1 ring-red-500/30' : ''}`}
              />
            </div>

            {/* Files */}
            <div>
              <div
                onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
                onDragOver={e => e.preventDefault()}
                className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-[var(--border-color)] hover:border-[var(--text-primary)]/30 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[var(--text-primary)]/30 flex-shrink-0" />
                <span className="text-sm text-[var(--text-primary)]/50 flex-1">
                  {files.length > 0 ? `${files.length} файл(ов)` : 'Перетащите или'}
                </span>
                <label className="px-3 py-1.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-xs text-[var(--text-primary)]/70 cursor-pointer transition-colors">
                  <input type="file" multiple onChange={e => handleFiles(Array.from(e.target.files || []))} className="hidden" />
                  выбрать файлы
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hover-1)]">
                      {f.preview
                        ? <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover" />
                        : <File className="w-4 h-4 text-[var(--text-primary)]/30" />
                      }
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{f.file.name}</span>
                      <span className="text-xs text-[var(--text-primary)]/40">{formatSize(f.file.size)}</span>
                      <button type="button" onClick={() => removeFile(f.id)}
                        className="p-1 rounded hover:bg-[var(--hover-2)] text-[var(--text-primary)]/30 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── Section: Binding ─── */}
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]/70 mb-3 uppercase tracking-wider">
            Привязка
          </h2>

          <div className="space-y-3">
            {isCustomer && customerCp && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/8 border border-blue-500/20">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-[var(--text-primary)]">{customerCp.name}</span>
                {customerCp.inn && (
                  <span className="text-xs text-[var(--text-primary)]/40">ИНН {customerCp.inn}</span>
                )}
              </div>
            )}

            {canSelect && (
              <>
                <div className="flex gap-2">
                  {([
                    { v: 'none' as BindingType, label: 'Без привязки', icon: <X className="w-3.5 h-3.5" /> },
                    { v: 'counterparty' as BindingType, label: 'Компания', icon: <Building2 className="w-3.5 h-3.5" /> },
                    { v: 'project' as BindingType, label: 'Проект', icon: <FolderOpen className="w-3.5 h-3.5" /> },
                  ]).map(item => (
                    <button key={item.v} type="button" onClick={() => handleBindingType(item.v)}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        bindingType === item.v
                          ? 'border-red-500/40 bg-red-500/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]/70'
                      }`}>
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>

                {bindingType === 'counterparty' && (
                  <Dropdown
                    options={cpOptions}
                    value={counterpartyId}
                    onChange={v => { setCounterpartyId(v); clearError('counterparty'); setReporterId(''); }}
                    placeholder="Выберите компанию"
                    searchPlaceholder="Название, ИНН..."
                    loading={loadingCp}
                    icon={<Building2 className="w-4 h-4" />}
                    emptyText="Компании не найдены"
                  />
                )}

                {bindingType === 'project' && (
                  <Dropdown
                    options={projectOptions}
                    value={projectId}
                    onChange={v => { setProjectId(v); clearError('project'); setReporterId(''); }}
                    placeholder="Выберите проект"
                    searchPlaceholder="Ключ или название..."
                    loading={loadingProjects}
                    icon={<FolderOpen className="w-4 h-4" />}
                    emptyText="Проекты не найдены"
                  />
                )}
              </>
            )}

            {canSelectReporter && relatedCpId && (
              <Dropdown
                options={userOptions}
                value={reporterId}
                onChange={setReporterId}
                placeholder="Инициатор — я"
                searchPlaceholder="Имя, email..."
                loading={loadingUsers}
                icon={<User className="w-4 h-4" />}
                emptyText="Пользователи не найдены"
              />
            )}
          </div>
        </section>

        {/* ─── Section: Params ─── */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]/70 uppercase tracking-wider">
              Параметры
            </h2>
            <button type="button" onClick={handleAi} disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/15 disabled:opacity-50 transition-colors">
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              ИИ-подсказка
            </button>
          </div>

          <div className="space-y-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Категория</label>
              <Dropdown
                options={typeOptions}
                value={type}
                onChange={v => setType(v as TicketType)}
                placeholder="Тип заявки"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Срочность</label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map(p => {
                  const active = priority === p.value;
                  return (
                    <button key={p.value} type="button"
                      onClick={() => setPriority(p.value)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                        active
                          ? `${p.activeBorder} ${p.activeBg} ${p.activeText} ring-1 ring-current/20`
                          : `${p.border} ${p.bg} text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70`
                      }`}>
                      {p.icon} {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Теги</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_TAGS.map(tag => {
                  const active = tags.some(t => t.name === tag.name);
                  return (
                    <button key={tag.name} type="button" onClick={() => toggleTag(tag)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? `${tag.color}20` : 'transparent',
                        borderColor: active ? `${tag.color}60` : 'var(--border-color)',
                        color: active ? tag.color : 'var(--text-primary)',
                        opacity: active ? 1 : 0.6,
                      }}>
                      {tag.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Свой тег..."
                  className="input-field flex-1 text-sm" />
                <button type="button" onClick={addTag} disabled={!newTagInput.trim()}
                  className="px-3 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] disabled:opacity-30 transition-colors">
                  <Plus className="w-4 h-4 text-[var(--text-primary)]/60" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <span key={tag.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
                      style={{
                        backgroundColor: `${tag.color || '#64748b'}18`,
                        borderColor: `${tag.color || '#64748b'}40`,
                        color: tag.color || '#94a3b8',
                      }}>
                      {tag.name}
                      <button type="button" onClick={() => setTags(p => p.filter(t => t.name !== tag.name))}
                        className="hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </form>

      {/* ─── Sticky footer ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <span className="text-xs text-[var(--text-primary)]/40 hidden sm:inline">
            {savedAt ? `Черновик · ${formatTime(savedAt)}` : 'Автосохранение'}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => navigate('/tickets')}
              className="px-4 py-2 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-sm text-[var(--text-primary)]/70 transition-colors">
              Отмена
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-red-900/20">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Создаём...' : 'Создать заявку'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}