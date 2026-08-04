import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Check, ChevronDown, ChevronRight,
  File, FolderOpen, Loader2, Plus, Search, Sparkles,
  Upload, User, X, Send,
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

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const PRIORITIES = [
  { value: 'low', label: 'Низкий', icon: <SignalLow className="w-3.5 h-3.5" />, color: 'emerald' },
  { value: 'medium', label: 'Средний', icon: <SignalMedium className="w-3.5 h-3.5" />, color: 'yellow' },
  { value: 'high', label: 'Высокий', icon: <SignalHigh className="w-3.5 h-3.5" />, color: 'orange' },
  { value: 'critical', label: 'Критический', icon: <Flame className="w-3.5 h-3.5" />, color: 'red' },
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

/* ═══════════════════════════════════════════════════════════
   Dropdown
   ═══════════════════════════════════════════════════════════ */

interface DdOption { id: string; label: string; sub?: string }

function Dd({ options, value, onChange, placeholder, search: searchLabel, loading, icon, empty = 'Пусто' }: {
  options: DdOption[]; value: string; onChange: (id: string) => void;
  placeholder: string; search?: string; loading?: boolean;
  icon?: JSX.Element; empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const sel = options.find(o => o.id === value);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.label.toLowerCase().includes(s) || o.sub?.toLowerCase().includes(s));
  }, [options, q]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all
          ${open ? 'border-red-500/40 ring-1 ring-red-500/20 bg-[var(--bg-secondary)]'
            : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--text-primary)]/20'}
          ${sel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'}`}>
        {icon && <span className="flex-shrink-0 text-[var(--text-primary)]/30">{icon}</span>}
        <span className="flex-1 truncate">{sel ? sel.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-primary)]/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-2xl shadow-black/50 overflow-hidden">
          {(searchLabel || options.length > 5) && (
            <div className="p-1.5 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25" />
                <input value={q} onChange={e => setQ(e.target.value)}
                  placeholder={searchLabel || 'Поиск...'} autoFocus
                  className="w-full pl-8 pr-2 py-1.5 rounded bg-[var(--hover-1)] border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 focus:outline-none" />
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>
            ) : list.length === 0 ? (
              <div className="py-4 text-center text-xs text-[var(--text-primary)]/30">{empty}</div>
            ) : list.map(o => (
              <button key={o.id} type="button"
                onClick={() => { onChange(o.id); setOpen(false); setQ(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors
                  ${o.id === value ? 'bg-red-500/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)]'}`}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sub && <span className="block text-xs text-[var(--text-primary)]/35 truncate">{o.sub}</span>}
                </span>
                {o.id === value && <Check className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

interface GFile { id: string; file: File; preview?: string }
interface SUser { id: string; username: string; full_name: string | null; email: string }
type Bind = 'none' | 'counterparty' | 'project';
interface Draft {
  title: string; description: string; bind: Bind;
  cpId: string; pId: string; rId: string;
  type: string; priority: string; tags: TicketTag[];
  at: number;
}

/* ═══════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════ */

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuthStore();

  const uid = (user as any)?.id ?? (user as any)?.user_id ?? '';
  const preCpId = sp.get('counterparty_id') || '';
  const prePId = sp.get('project_id') || '';

  const isCust = user?.roles?.some((r: string) => r === 'customer' || r === 'customer_admin') ?? false;
  const canSel = (!isCust && user?.roles?.some((r: string) => STAFF_ROLES.includes(r))) ?? false;
  const canRep = !isCust;

  const dk = uid ? `td:${uid}` : 'td';

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [bind, setBind] = useState<Bind>('none');
  const [cpId, setCpId] = useState('');
  const [pId, setPId] = useState('');
  const [rId, setRId] = useState('');
  const [type, setType] = useState<TicketType>('Инцидент');
  const [pri, setPri] = useState('medium');
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [tagIn, setTagIn] = useState('');
  const [files, setFiles] = useState<GFile[]>([]);

  const [custCp, setCustCp] = useState<Counterparty | null>(null);
  const [cps, setCps] = useState<Counterparty[]>([]);
  const [prs, setPrs] = useState<Project[]>([]);
  const [usrs, setUsrs] = useState<SUser[]>([]);

  const [lCp, setLCp] = useState(false);
  const [lPr, setLPr] = useState(false);
  const [lUs, setLUs] = useState(false);
  const [aiL, setAiL] = useState(false);
  const [sub, setSub] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [showDraft, setShowDraft] = useState(false);
  const [draftD, setDraftD] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const initR = useRef(false);
  const preR = useRef(false);

  const relCp = prs.find(p => p.id === pId)?.counterparty_id || cpId || custCp?.id || '';

  const cpN = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const pN = (p: Project) => `${p.key} — ${p.name}`;
  const uN = (u: SUser) => u.full_name || u.username || u.email;

  const cpOpts: DdOption[] = useMemo(() => cps.map(c => ({ id: c.id, label: cpN(c), sub: c.inn ? `ИНН ${c.inn}` : undefined })), [cps]);
  const pOpts: DdOption[] = useMemo(() => prs.map(p => ({ id: p.id, label: pN(p) })), [prs]);
  const uOpts: DdOption[] = useMemo(() => usrs.map(u => ({ id: u.id, label: uN(u), sub: u.email })), [usrs]);
  const tOpts: DdOption[] = useMemo(() => TYPES.map(t => ({ id: t.value, label: t.label })), []);

  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const fmtT = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const clrE = (f: string) => setErrs(p => { const n = { ...p }; delete n[f]; return n; });

  // ── Draft restore ──
  useEffect(() => {
    if (initR.current) return; initR.current = true;
    const raw = localStorage.getItem(dk);
    if (!raw) return;
    try {
      const d: Draft = JSON.parse(raw);
      if (d.title || d.description || d.tags?.length) { setDraftD(d); setShowDraft(true); }
    } catch { }
  }, [dk]);

  const restore = useCallback(() => {
    if (!draftD) return;
    setTitle(draftD.title || ''); setDesc(draftD.description || '');
    setBind(draftD.bind || 'none'); setCpId(draftD.cpId || '');
    setPId(draftD.pId || ''); setRId(draftD.rId || '');
    setType((draftD.type as TicketType) || 'Инцидент');
    setPri(draftD.priority || 'medium'); setTags(draftD.tags || []);
    setSaved(draftD.at); setShowDraft(false); preR.current = true;
  }, [draftD]);

  const dismiss = useCallback(() => { setShowDraft(false); localStorage.removeItem(dk); }, [dk]);

  // ── Auto-save ──
  useEffect(() => {
    const t = setTimeout(() => {
      if (!title.trim() && !desc.trim() && !tags.length) return;
      const d: Draft = { title, description: desc, bind, cpId, pId, rId, type, priority: pri, tags, at: Date.now() };
      localStorage.setItem(dk, JSON.stringify(d)); setSaved(Date.now());
    }, 800);
    return () => clearTimeout(t);
  }, [dk, title, desc, bind, cpId, pId, rId, type, pri, tags]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (title.trim() || desc.trim()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [title, desc]);

  // ── Load ──
  useEffect(() => {
    if (isCust && user?.counterparty_id)
      counterpartiesApi.getById(user.counterparty_id).then(setCustCp).catch(() => { });
  }, [isCust, user]);

  useEffect(() => {
    if (!canSel) return;
    setLCp(true); setLPr(true);
    Promise.all([counterpartiesApi.getAll(1, 200), projectsApi.getAll(1, 200)])
      .then(([c, p]) => { setCps(c.items); setPrs(p.items); })
      .catch(() => { }).finally(() => { setLCp(false); setLPr(false); });
  }, [canSel]);

  useEffect(() => {
    if (preR.current || !canSel || (!cps.length && !prs.length)) return;
    if (prePId && prs.find(p => p.id === prePId)) { setBind('project'); setPId(prePId); preR.current = true; }
    else if (preCpId && cps.find(c => c.id === preCpId)) { setBind('counterparty'); setCpId(preCpId); preR.current = true; }
  }, [canSel, cps, prs, preCpId, prePId]);

  useEffect(() => {
    if (!canRep || !relCp) { setUsrs([]); return; }
    setLUs(true);
    usersApi.getCustomers(relCp, 1, 100).then(r => {
      const items: SUser[] = r.items.map((u: any) => ({ id: u.id, username: u.username, full_name: u.full_name, email: u.email }));
      const has = items.some(u => u.id === uid);
      const me: SUser | null = uid ? { id: uid, username: (user as any)?.username || '', full_name: (user as any)?.full_name || null, email: (user as any)?.email || '' } : null;
      setUsrs(has || !me ? items : [me, ...items]);
    }).catch(() => { }).finally(() => setLUs(false));
  }, [canRep, relCp, uid, user]);

  useEffect(() => { if (rId && !usrs.some(u => u.id === rId)) setRId(''); }, [usrs, rId]);

  // ── Handlers ──
  const chBind = (v: Bind) => {
    setBind(v);
    if (v !== 'counterparty') setCpId('');
    if (v !== 'project') setPId('');
    setRId(''); clrE('counterparty'); clrE('project');
  };

  const togTag = (t: TicketTag) => setTags(p => p.some(x => x.name === t.name) ? p.filter(x => x.name !== t.name) : [...p, t]);
  const addTag = () => {
    const v = tagIn.trim();
    if (!v || tags.some(t => t.name.toLowerCase() === v.toLowerCase())) { setTagIn(''); return; }
    setTags(p => [...p, { name: v, color: '#64748b' }]); setTagIn('');
  };

  const addFiles = (fl: File[]) => {
    const n: GFile[] = fl.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    setFiles(p => [...p, ...n].slice(0, 10));
  };

  const rmFile = (id: string) => {
    const f = files.find(x => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setFiles(p => p.filter(x => x.id !== id));
  };

  const doAi = async () => {
    if (!title.trim() || !desc.trim()) {
      if (!title.trim()) setErrs(p => ({ ...p, title: 'Нужна тема' }));
      if (!desc.trim()) setErrs(p => ({ ...p, desc: 'Нужно описание' }));
      return;
    }
    setAiL(true);
    try {
      const r = await ticketsApi.predict(title.trim(), desc.trim());
      if (r?.suggested_priority) setPri(r.suggested_priority);
      if (r?.suggested_tags?.length) {
        setTags(prev => {
          const m = new Map<string, TicketTag>();
          [...prev, ...r.suggested_tags].forEach(t => m.set(t.name.toLowerCase(), t));
          return Array.from(m.values());
        });
      }
    } catch { } finally { setAiL(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Укажите тему';
    if (!desc.trim()) e.desc = 'Опишите проблему';
    if (canSel && bind === 'counterparty' && !cpId) e.counterparty = 'Выберите компанию';
    if (canSel && bind === 'project' && !pId) e.project = 'Выберите проект';
    setErrs(e); return !Object.keys(e).length;
  };

  const doSubmit = async () => {
    if (!validate()) return;
    setSub(true);
    try {
      const pay: any = {
        title: title.trim(), description: desc.trim(), priority: pri, type,
        tags: tags.map(t => ({ name: t.name, color: t.color || '#64748b' })),
        reporter_id: rId || uid,
      };
      if (isCust && custCp) pay.counterparty_id = custCp.id;
      else if (bind === 'project' && pId) pay.project_id = pId;
      else if (bind === 'counterparty' && cpId) pay.counterparty_id = cpId;

      const ticket = await ticketsApi.create(pay);
      for (const f of files) {
        try { await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id); } catch { }
      }
      localStorage.removeItem(dk);
      navigate('/tickets');
    } catch (e: any) { console.error('Fail', e?.response?.data || e); }
    finally { setSub(false); }
  };

  const priColor = (c: string, active: boolean) => {
    const map: Record<string, { bg: string; border: string; text: string; activeBg: string; activeBorder: string; activeText: string }> = {
      emerald: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400/60', activeBg: 'bg-emerald-500/20', activeBorder: 'border-emerald-400', activeText: 'text-emerald-300' },
      yellow:  { bg: 'bg-yellow-500/5',  border: 'border-yellow-500/20',  text: 'text-yellow-400/60',  activeBg: 'bg-yellow-500/20',  activeBorder: 'border-yellow-400',  activeText: 'text-yellow-300' },
      orange:  { bg: 'bg-orange-500/5',  border: 'border-orange-500/20',  text: 'text-orange-400/60',  activeBg: 'bg-orange-500/20',  activeBorder: 'border-orange-400',  activeText: 'text-orange-300' },
      red:     { bg: 'bg-red-500/5',     border: 'border-red-500/20',     text: 'text-red-400/60',     activeBg: 'bg-red-500/20',     activeBorder: 'border-red-400',     activeText: 'text-red-300' },
    };
    const m = map[c] || map.yellow;
    return active
      ? `${m.activeBg} ${m.activeBorder} ${m.activeText} ring-1 ring-current/20`
      : `${m.bg} ${m.border} ${m.text} hover:${m.text.replace('/60', '')}`;
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="h-[calc(100vh-var(--header-height,64px))] flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/tickets')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-xs text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> К заявкам
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Новая заявка</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-[var(--text-primary)]/30">черновик · {fmtT(saved)}</span>}
          <button type="button" onClick={doSubmit} disabled={sub}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors shadow-lg shadow-red-900/20">
            {sub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sub ? 'Создаём...' : 'Создать'}
          </button>
        </div>
      </div>

      {/* ── Draft banner ── */}
      {showDraft && draftD && (
        <div className="flex-shrink-0 px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="text-amber-300 font-medium">Черновик:</span>{' '}
            <span className="text-[var(--text-primary)]/60">«{draftD.title || 'без темы'}» · {fmtT(draftD.at)}</span>
          </div>
          <button type="button" onClick={restore}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors">
            Восстановить
          </button>
          <button type="button" onClick={dismiss}
            className="px-3 py-1 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 text-xs transition-colors">
            Удалить
          </button>
        </div>
      )}

      {/* ── Errors ── */}
      {Object.keys(errs).length > 0 && (
        <div className="flex-shrink-0 px-6 py-2 bg-red-500/8 border-b border-red-500/20 flex flex-wrap gap-x-4 gap-y-1">
          {Object.values(errs).map((e, i) => (
            <span key={i} className="text-xs text-red-400 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-red-400" /> {e}
            </span>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ═══ LEFT: Main form ═══ */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl space-y-4">

            {/* Title */}
            <div>
              <input value={title}
                onChange={e => { setTitle(e.target.value); clrE('title'); }}
                placeholder="Тема: что случилось"
                className={`w-full bg-transparent border-none text-xl font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none focus:ring-0 p-0
                  ${errs.title ? 'placeholder:text-red-400/40' : ''}`}
              />
              <div className="mt-1 h-px bg-[var(--border-color)]" />
            </div>

            {/* Description */}
            <div>
              <textarea value={desc}
                onChange={e => { setDesc(e.target.value); clrE('desc'); }}
                placeholder="Опишите проблему подробнее: что произошло, как воспроизвести, когда началось..."
                className={`w-full bg-transparent border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none focus:ring-0 p-0 resize-none min-h-[200px]
                  ${errs.desc ? 'placeholder:text-red-400/40' : ''}`}
                style={{ height: Math.max(200, desc.split('\n').length * 22) }}
              />
            </div>

            {/* Files */}
            <div className="pt-2">
              <div
                onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
                onDragOver={e => e.preventDefault()}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-primary)]/20 transition-colors"
              >
                <Upload className="w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0" />
                <span className="flex-1 text-xs text-[var(--text-primary)]/35">
                  {files.length ? `${files.length} файл(ов) · перетащите ещё` : 'Перетащите файлы сюда'}
                </span>
                <label className="px-2.5 py-1 rounded bg-[var(--hover-1)] hover:bg-[var(--hover-2)] text-xs text-[var(--text-primary)]/50 cursor-pointer transition-colors">
                  <input type="file" multiple onChange={e => addFiles(Array.from(e.target.files || []))} className="hidden" />
                  выбрать
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map(f => (
                    <div key={f.id} className="group relative">
                      {f.preview ? (
                        <img src={f.preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-[var(--border-color)]" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)] flex flex-col items-center justify-center">
                          <File className="w-4 h-4 text-[var(--text-primary)]/25" />
                          <span className="text-[8px] text-[var(--text-primary)]/30 mt-0.5 max-w-[50px] truncate">{f.file.name.split('.').pop()}</span>
                        </div>
                      )}
                      <button type="button" onClick={() => rmFile(f.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-1 py-0.5 text-[7px] text-white/70 truncate text-center">
                        {fmtSize(f.file.size)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Sidebar ═══ */}
        <div className="w-72 xl:w-80 flex-shrink-0 border-l border-[var(--border-color)] overflow-y-auto bg-[var(--bg-secondary)]/50">
          <div className="p-4 space-y-5">

            {/* Binding */}
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">Привязка</div>

              {isCust && custCp && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/15 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-[var(--text-primary)]">{custCp.name}</span>
                </div>
              )}

              {canSel && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[var(--hover-1)]">
                    {([
                      { v: 'none' as Bind, l: 'Нет' },
                      { v: 'counterparty' as Bind, l: 'Компания' },
                      { v: 'project' as Bind, l: 'Проект' },
                    ]).map(b => (
                      <button key={b.v} type="button" onClick={() => chBind(b.v)}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all text-center
                          ${bind === b.v
                            ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'}`}>
                        {b.l}
                      </button>
                    ))}
                  </div>

                  {bind === 'counterparty' && (
                    <Dd options={cpOpts} value={cpId}
                      onChange={v => { setCpId(v); clrE('counterparty'); setRId(''); }}
                      placeholder="Компания..." search="Название, ИНН..."
                      loading={lCp} icon={<Building2 className="w-3.5 h-3.5" />} />
                  )}

                  {bind === 'project' && (
                    <Dd options={pOpts} value={pId}
                      onChange={v => { setPId(v); clrE('project'); setRId(''); }}
                      placeholder="Проект..." search="Ключ, название..."
                      loading={lPr} icon={<FolderOpen className="w-3.5 h-3.5" />} />
                  )}
                </div>
              )}
            </div>

            {/* Reporter */}
            {canRep && relCp && (
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">Инициатор</div>
                <Dd options={uOpts} value={rId} onChange={setRId}
                  placeholder="Я (по умолчанию)" search="Имя, email..."
                  loading={lUs} icon={<User className="w-3.5 h-3.5" />} />
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-[var(--border-color)]" />

            {/* Type */}
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">Категория</div>
              <Dd options={tOpts} value={type}
                onChange={v => setType(v as TicketType)}
                placeholder="Тип заявки" />
            </div>

            {/* Priority */}
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">Срочность</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button" onClick={() => setPri(p.value)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${priColor(p.color, pri === p.value)}`}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI */}
            <button type="button" onClick={doAi} disabled={aiL}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/8 border border-amber-500/15 text-amber-300/80 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 transition-colors">
              {aiL ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              ИИ: подобрать приоритет и теги
            </button>

            {/* Divider */}
            <div className="h-px bg-[var(--border-color)]" />

            {/* Tags */}
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]/40 uppercase tracking-wider mb-2">Теги</div>

              <div className="flex flex-wrap gap-1 mb-2">
                {PRESET_TAGS.map(t => {
                  const on = tags.some(x => x.name === t.name);
                  return (
                    <button key={t.name} type="button" onClick={() => togTag(t)}
                      className="px-2 py-1 rounded text-[11px] font-medium border transition-all"
                      style={{
                        backgroundColor: on ? `${t.color}20` : 'transparent',
                        borderColor: on ? `${t.color}50` : 'var(--border-color)',
                        color: on ? t.color : 'var(--text-primary)',
                        opacity: on ? 1 : 0.45,
                      }}>
                      {t.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1">
                <input value={tagIn} onChange={e => setTagIn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Свой тег..."
                  className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/20 focus:outline-none focus:border-red-500/30" />
                <button type="button" onClick={addTag} disabled={!tagIn.trim()}
                  className="px-2 py-1.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] disabled:opacity-20 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-[var(--text-primary)]/40" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map(t => (
                    <span key={t.name}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border"
                      style={{
                        backgroundColor: `${t.color || '#64748b'}15`,
                        borderColor: `${t.color || '#64748b'}35`,
                        color: t.color || '#94a3b8',
                      }}>
                      {t.name}
                      <button type="button" onClick={() => setTags(p => p.filter(x => x.name !== t.name))}
                        className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}