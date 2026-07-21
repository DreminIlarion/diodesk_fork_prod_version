// pages/FeedbacksPage.tsx
import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Filter, Plus, Loader2, X, Check,
  ChevronDown, ChevronLeft, ChevronRight, RefreshCw,
  MessageSquare, Ticket, User, Calendar, Pencil,
  Trash2, Save, ArrowUpRight, BarChart3, Search,
} from 'lucide-react';
import { feedbacksApi, ticketsApi, usersApi } from '../api/client';
import type { Feedback, FeedbackUpdateInput } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const RATING_LABELS: Record<number, string> = {
  1: 'Очень плохо',
  2: 'Плохо',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
};

const apiErr = (err: any) =>
  err?.response?.data?.error?.public_message ??
  err?.response?.data?.error?.message ??
  err?.response?.data?.detail?.[0]?.msg ??
  err?.message ??
  'Неизвестная ошибка';

const INPUT_CLS =
  'w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl ' +
  'text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/25 ' +
  'focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const initials = (n?: string | null) =>
  n ? n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';

function useDropdownPosition(
  triggerRef: React.RefObject<HTMLDivElement | HTMLButtonElement | null>,
  open: boolean
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 320;

    setStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open, triggerRef]);

  return style;
}

/* ═══════════════════════════════════════════════════════════════════
   STAR RATING
   ═══════════════════════════════════════════════════════════════════ */

function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
  showLabel = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  showLabel?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const display = readonly ? value : (hovered || value);

  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' };
  const btnSizeMap = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-10 h-10' };

  const label = display > 0 ? RATING_LABELS[display] : '';

  return (
    <div className="inline-flex flex-col items-center">
      <div className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => {
          const filled = star <= display;

          if (readonly) {
            return (
              <Star
                key={star}
                className={`${sizeMap[size]} flex-shrink-0 transition-colors ${
                  filled ? 'text-emerald-500 fill-emerald-500' : 'text-[var(--text-primary)]/15'
                }`}
              />
            );
          }

          return (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => onChange?.(star)}
              aria-label={`Оценка ${star}`}
              className={`${btnSizeMap[size]} flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-2)]`}
            >
              <Star
                className={`${sizeMap[size]} flex-shrink-0 transition-colors ${
                  filled ? 'text-emerald-500 fill-emerald-500' : 'text-[var(--text-primary)]/15'
                }`}
              />
            </button>
          );
        })}
      </div>

      {showLabel && label && (
        <span className="mt-2 text-xs font-medium text-emerald-500/75">
          {label}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RATING BAR
   ═══════════════════════════════════════════════════════════════════ */

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1 w-7 justify-end flex-shrink-0">
        <span className="text-xs font-medium text-[var(--text-primary)]/50 tabular-nums">{star}</span>
        <Star className="w-3 h-3 text-emerald-500 fill-emerald-500 flex-shrink-0" />
      </div>

      <div className="flex-1 h-1.5 bg-[var(--hover-3)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-full rounded-full bg-emerald-500/65"
        />
      </div>

      <span className="text-xs text-[var(--text-primary)]/30 w-6 text-right tabular-nums flex-shrink-0">
        {count}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TICKET SELECT (async, closed only)
   ═══════════════════════════════════════════════════════════════════ */

interface TicketOption { id: string; number: string; title: string; }

function TicketSelect({
  value, label, onChange, disabled = false, placeholder = 'Тикет',
}: {
  value: string; label?: string; onChange: (id: string, label: string) => void;
  disabled?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<TicketOption[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownStyle = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const loadClosedTickets = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await ticketsApi.getAllWithFilters(1, 100, {});
      const closed = res.items.filter((t: any) => String(t.status).toLowerCase() === 'closed');
      const filtered = q
        ? closed.filter((t: any) =>
            String(t.title || '').toLowerCase().includes(q.toLowerCase()) ||
            String(t.number || '').toLowerCase().includes(q.toLowerCase())
          )
        : closed;

      setOptions(filtered.map((t: any) => ({ id: t.id, number: String(t.number), title: String(t.title || '') })));
    } catch { setOptions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!open) { setSearch(''); return; } loadClosedTickets(''); setTimeout(() => inputRef.current?.focus(), 50); }, [open, loadClosedTickets]);
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadClosedTickets(search), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [open, search, loadClosedTickets]);

  const dropdown = open ? createPortal(
    <div ref={dropdownRef} style={dropdownStyle} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
      <div className="p-2 border-b border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по закрытым тикетам..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[260px] p-1 scrollbar-thin">
        <button onClick={() => { onChange('', ''); setOpen(false); }}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${!value ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
          <span className="flex-1 text-left">Все тикеты</span>{!value && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
        </button>
        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>}
        {!loading && options.length === 0 && (
          <div className="px-3 py-6 text-center">
            <Ticket className="w-5 h-5 text-[var(--text-primary)]/15 mx-auto mb-2" />
            <p className="text-sm text-[var(--text-primary)]/35">{search ? 'Ничего не найдено' : 'Нет закрытых тикетов'}</p>
          </div>
        )}
        {!loading && options.map(opt => {
          const optionLabel = `#${opt.number} — ${opt.title}`;
          return (
            <button key={opt.id} onClick={() => { onChange(opt.id, optionLabel); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${value === opt.id ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}>
              <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/20 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate font-mono text-xs text-[var(--text-primary)]/45">#{opt.number}</div>
                <div className="truncate text-sm text-[var(--text-primary)]/70">{opt.title}</div>
              </div>
              {value === opt.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left transition-all select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        <Ticket className="w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0" />
        <span className={`flex-1 truncate ${label ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>{label || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dropdown}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   AUTHOR SELECT (async, searchable)
   ═══════════════════════════════════════════════════════════════════ */

function AuthorSelect({ value, label, onChange }: { value: string; label?: string; onChange: (id: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownStyle = useDropdownPosition(triggerRef, open);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const loadUsers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await usersApi.getAllUsers(1, 100);
      const filtered = q
        ? res.items.filter((u: any) =>
            String(u.full_name || '').toLowerCase().includes(q.toLowerCase()) ||
            String(u.username || '').toLowerCase().includes(q.toLowerCase()) ||
            String(u.email || '').toLowerCase().includes(q.toLowerCase())
          )
        : res.items;
      setOptions(filtered);
    } catch { setOptions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!open) { setSearch(''); return; } loadUsers(''); setTimeout(() => inputRef.current?.focus(), 50); }, [open, loadUsers]);
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUsers(search), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [open, search, loadUsers]);

  const dropdown = open ? createPortal(
    <div ref={dropdownRef} style={dropdownStyle} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
      <div className="p-2 border-b border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск автора..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[260px] p-1 scrollbar-thin">
        <button onClick={() => { onChange('', ''); setOpen(false); }}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${!value ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
          <span className="flex-1 text-left">Все авторы</span>{!value && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
        </button>
        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>}
        {!loading && options.length === 0 && (
          <div className="px-3 py-6 text-center"><User className="w-5 h-5 text-[var(--text-primary)]/15 mx-auto mb-2" /><p className="text-sm text-[var(--text-primary)]/35">Ничего не найдено</p></div>
        )}
        {!loading && options.map((u: any) => {
          const userLabel = String(u.full_name || u.username || u.email);
          return (
            <button key={u.id} onClick={() => { onChange(u.id, userLabel); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${value === u.id ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}>
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">{initials(u.full_name || u.username || u.email)}</div>
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate text-sm text-[var(--text-primary)]/75">{u.full_name || u.username || u.email}</div>
                <div className="truncate text-[11px] text-[var(--text-primary)]/28">{u.email}</div>
              </div>
              {value === u.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={0} onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left transition-all select-none cursor-pointer hover:bg-[var(--hover-3)]
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        <User className="w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0" />
        <span className={`flex-1 truncate ${label ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>{label || 'Автор'}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dropdown}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE FEEDBACK MODAL
   ═══════════════════════════════════════════════════════════════════ */

function CreateFeedbackModal({ presetTicketId, presetTicketLabel, onClose, onCreated }: {
  presetTicketId?: string; presetTicketLabel?: string; onClose: () => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [ticketId, setTicketId] = useState(presetTicketId ?? '');
  const [ticketLabel, setTicketLabel] = useState(presetTicketLabel ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (presetTicketId) setTicketId(presetTicketId); }, [presetTicketId]);
  useEffect(() => { if (presetTicketLabel) setTicketLabel(presetTicketLabel); }, [presetTicketLabel]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  const submit = async () => {
    if (!ticketId || !rating) return;
    setSaving(true);
    try {
      await feedbacksApi.create({ ticket_id: ticketId, rating, comment: comment.trim() });
      toast({ title: 'Отзыв отправлен', description: `Оценка: ${rating}/5` });
      onCreated();
    } catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.15 }}
        className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between">
            <div><h2 className="text-base font-bold text-[var(--text-primary)]">Новый отзыв</h2><p className="text-xs text-[var(--text-primary)]/35 mt-0.5">Только по закрытому тикету</p></div>
            <button onClick={() => !saving && onClose()} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/55"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Тикет <span className="text-[var(--accent)]">*</span></label>
            <TicketSelect value={ticketId} label={ticketLabel} onChange={(id, l) => { setTicketId(id); setTicketLabel(l); }} disabled={!!presetTicketId} placeholder="Выберите закрытый тикет" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Оценка <span className="text-[var(--accent)]">*</span></label>
            <div className="px-4 py-4 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] flex justify-center">
              <StarRating value={rating} onChange={setRating} size="lg" showLabel />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Комментарий</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder="Комментарий к отзыву..." className={`${INPUT_CLS} resize-none`} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">Отмена</button>
          <button onClick={submit} disabled={!ticketId || !rating || saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Отправить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EDIT / DELETE MODALS (оставлены без изменений)
   ═══════════════════════════════════════════════════════════════════ */

function EditFeedbackModal({ feedback, onClose, onUpdated }: { feedback: Feedback; onClose: () => void; onUpdated: () => void }) {
  const { toast } = useToast();
  const [rating, setRating] = useState(feedback.rating);
  const [comment, setComment] = useState(feedback.comment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  const submit = async () => {
    setSaving(true);
    try {
      const data: FeedbackUpdateInput = {};
      if (rating !== feedback.rating) data.rating = rating;
      if (comment.trim() !== feedback.comment) data.comment = comment.trim();
      if (Object.keys(data).length > 0) await feedbacksApi.update(feedback.id, data);
      toast({ title: 'Отзыв обновлён' }); onUpdated();
    } catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--border-color)]"><h2 className="text-base font-bold text-[var(--text-primary)]">Редактировать отзыв</h2></div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Оценка</label>
            <div className="px-4 py-4 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] flex justify-center"><StarRating value={rating} onChange={setRating} size="lg" showLabel /></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Комментарий</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} placeholder="Комментарий к отзыву..." className={`${INPUT_CLS} resize-none`} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">Отмена</button>
          <button onClick={submit} disabled={!rating || saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DeleteFeedbackModal({ feedback, onClose, onDeleted }: { feedback: Feedback; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose(); };
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, deleting]);

  const confirm = async () => {
    setDeleting(true);
    try { await feedbacksApi.delete(feedback.id); toast({ title: 'Отзыв удалён' }); onDeleted(); }
    catch (e: any) { toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' }); }
    finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && onClose()} />
      <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3"><Trash2 className="w-5 h-5 text-red-400" /></div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Удалить отзыв?</h3>
          <p className="text-sm text-[var(--text-primary)]/40">Отзыв с оценкой {feedback.rating}/5 будет удалён</p>
        </div>
        <div className="flex border-t border-[var(--border-color)]">
          <button onClick={onClose} disabled={deleting} className="flex-1 py-3 text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] disabled:opacity-50">Отмена</button>
          <button onClick={confirm} disabled={deleting} className="flex-1 py-3 text-sm font-medium text-red-400 hover:bg-red-500/8 border-l border-[var(--border-color)] disabled:opacity-50">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FEEDBACK CARD
   ═══════════════════════════════════════════════════════════════════ */

function FeedbackCard({ feedback, ticketMap, userMap, currentUserId, isStaff, onEdit, onDelete }: {
  feedback: Feedback; ticketMap: Map<string, { number: string; title: string }>;
  userMap: Map<string, { full_name?: string; username?: string; email: string; avatar_url?: string | null }>;
  currentUserId?: string; isStaff: boolean; onEdit: (f: Feedback) => void; onDelete: (f: Feedback) => void;
}) {
  const author = userMap.get(feedback.author_id);
  const ticket = ticketMap.get(feedback.ticket_id);
  const canManage = isStaff || feedback.author_id === currentUserId;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="group bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 transition-all" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {author?.avatar_url ? <img src={author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            : <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">{initials(author?.full_name || author?.username || author?.email)}</div>}
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{author?.full_name || author?.username || author?.email || 'Пользователь'}</p>
            <p className="text-[11px] text-[var(--text-primary)]/28 flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(feedback.created_at)}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onEdit(feedback)} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/22 hover:text-[var(--text-primary)]/55"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => onDelete(feedback)} className="p-1.5 rounded-lg hover:bg-red-500/8 text-[var(--text-primary)]/22 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5 mb-2.5">
        <StarRating value={feedback.rating} readonly size="sm" />
        <span className="text-xs text-[var(--text-primary)]/38 font-medium">{RATING_LABELS[feedback.rating]}</span>
      </div>
      {feedback.comment && <p className="text-sm text-[var(--text-primary)]/62 leading-relaxed mb-3 whitespace-pre-wrap">{feedback.comment}</p>}
      <div className="pt-3 border-t border-[var(--border-color)]">
        {ticket ? (
          <Link to={`/tickets/${ticket.number}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-primary)]/35 hover:text-[var(--accent)] transition-colors">
            <Ticket className="w-3 h-3" /><span className="font-mono">#{ticket.number}</span><span className="truncate max-w-[180px]">{ticket.title}</span><ArrowUpRight className="w-3 h-3 flex-shrink-0" />
          </Link>
        ) : <span className="text-xs text-[var(--text-primary)]/20">Тикет не найден</span>}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function FeedbacksPage() {
  const [sp] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const presetTicketId = sp.get('ticket_id') ?? '';
  const isStaff = user?.roles?.some(r => ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)) ?? false;

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [filterTicketId, setFilterTicketId] = useState<string>(presetTicketId);
  const [filterTicketLabel, setFilterTicketLabel] = useState<string>('');
  const [filterAuthorId, setFilterAuthorId] = useState<string>('');
  const [filterAuthorLabel, setFilterAuthorLabel] = useState<string>('');
  const [showRatingFilter, setShowRatingFilter] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editFeedback, setEditFeedback] = useState<Feedback | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback | null>(null);

  const [userMap, setUserMap] = useState<Map<string, any>>(new Map());
  const [ticketMap, setTicketMap] = useState<Map<string, { number: string; title: string }>>(new Map());
  const [stats, setStats] = useState({ avg: 0, total: 0, distribution: [0, 0, 0, 0, 0] as [number, number, number, number, number] });

  /* Load users */
  const loadUsers = useCallback(async () => {
    try {
      const res = await usersApi.getAllUsers(1, 100);
      const map = new Map<string, any>();
      res.items.forEach((u: any) => map.set(u.id, u));
      setUserMap(map);
      if (filterAuthorId) {
        const selected = res.items.find((u: any) => u.id === filterAuthorId);
        if (selected) setFilterAuthorLabel(String(selected.full_name || selected.username || selected.email));
      }
    } catch { }
  }, [filterAuthorId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  /* Load ticket info */
  const loadTicketInfo = useCallback(async () => {
    try {
      const res = await ticketsApi.getAllWithFilters(1, 100, {});
      const map = new Map<string, { number: string; title: string }>();
      res.items.forEach((t: any) => map.set(t.id, { number: String(t.number), title: String(t.title || '') }));
      setTicketMap(map);
      if (filterTicketId) {
        const t = res.items.find((x: any) => x.id === filterTicketId);
        if (t) setFilterTicketLabel(`#${t.number} — ${t.title}`);
      }
    } catch { }
  }, [filterTicketId]);

  useEffect(() => { loadTicketInfo(); }, [loadTicketInfo]);

  /* Stats helper */
  const loadAllFeedbacksForStats = useCallback(async (filters: { ticketId?: string; author_id?: string }) => {
    let currentPage = 1; const size = 100; let allItems: Feedback[] = []; let hasNext = true;
    while (hasNext) {
      const res = await feedbacksApi.getAll(currentPage, size, filters);
      allItems = [...allItems, ...res.items];
      hasNext = res.has_next; currentPage += 1;
    }
    return allItems;
  }, []);

  /* Fetch feedbacks */
  const fetchFeedbacks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const filters: any = {};
      if (filterRating) filters.rating = filterRating;
      if (filterTicketId) filters.ticketId = filterTicketId;
      if (filterAuthorId) filters.author_id = filterAuthorId;
      const res = await feedbacksApi.getAll(page, 12, filters);
      setFeedbacks(res.items);
      setTotalItems(res.total_items);
      setTotalPages(res.total_pages);

      const statsItems = await loadAllFeedbacksForStats({
        ...(filterTicketId ? { ticketId: filterTicketId } : {}),
        ...(filterAuthorId ? { author_id: filterAuthorId } : {}),
      });
      const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      let sum = 0;
      statsItems.forEach(f => { dist[f.rating - 1] += 1; sum += f.rating; });
      setStats({ avg: statsItems.length > 0 ? sum / statsItems.length : 0, total: statsItems.length, distribution: dist });
    } catch (e: any) { toast({ title: 'Ошибка загрузки', description: apiErr(e), variant: 'destructive' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, filterRating, filterTicketId, filterAuthorId, toast, loadAllFeedbacksForStats]);

  useEffect(() => { fetchFeedbacks(); }, [fetchFeedbacks]);
  const refresh = () => fetchFeedbacks(true);
  const resetFilters = () => { setFilterRating(null); setFilterTicketId(''); setFilterTicketLabel(''); setFilterAuthorId(''); setFilterAuthorLabel(''); setPage(1); };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Отзывы</h1>
            {!loading && <span className="px-2 py-0.5 rounded-md bg-[var(--hover-3)] text-xs font-medium text-[var(--text-primary)]/40 tabular-nums">{totalItems}</span>}
            {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]/30" />}
          </div>
          <p className="text-sm text-[var(--text-primary)]/30 mt-0.5">Оценки по закрытым заявкам</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[260px]"><TicketSelect value={filterTicketId} label={filterTicketLabel} onChange={(id, l) => { setFilterTicketId(id); setFilterTicketLabel(l); setPage(1); }} placeholder="Тикет" /></div>
          <div className="w-[220px]"><AuthorSelect value={filterAuthorId} label={filterAuthorLabel} onChange={(id, l) => { setFilterAuthorId(id); setFilterAuthorLabel(l); setPage(1); }} /></div>

          <div className="relative">
            <button onClick={() => setShowRatingFilter(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-all ${filterRating ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-500' : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'}`}>
              <Filter className="w-3.5 h-3.5" />{filterRating ? `${filterRating} ★` : 'Оценка'}
            </button>
            {showRatingFilter && (<>
              <div className="fixed inset-0 z-10" onClick={() => setShowRatingFilter(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] p-1.5">
                <button onClick={() => { setFilterRating(null); setPage(1); setShowRatingFilter(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${!filterRating ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
                  <span className="flex-1 text-left min-w-0 truncate">Все оценки</span>{!filterRating && <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                </button>
                {[5, 4, 3, 2, 1].map(r => (
                  <button key={r} onClick={() => { setFilterRating(r); setPage(1); setShowRatingFilter(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${filterRating === r ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}>
                    <div className="flex items-center gap-0.5 flex-shrink-0">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`w-3 h-3 ${i < r ? 'text-emerald-500 fill-emerald-500' : 'text-[var(--text-primary)]/10'}`} />)}</div>
                    <span className="flex-1 min-w-0 truncate text-left text-xs">{RATING_LABELS[r]}</span>{filterRating === r && <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>)}
          </div>

          <button onClick={resetFilters} className="px-3 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]/65">Сбросить</button>
          <button onClick={refresh} disabled={refreshing || loading} className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/60 transition-all disabled:opacity-30">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />Отзыв
          </button>
        </div>
      </div>

      {/* Stats */}
      {!loading && stats.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-primary)]/30 mb-3">Средняя оценка</p>
            <div className="flex items-end gap-2 mb-2"><span className="text-4xl font-bold text-[var(--text-primary)] tabular-nums leading-none">{stats.avg.toFixed(1)}</span><span className="text-sm text-[var(--text-primary)]/30 mb-0.5">из 5</span></div>
            <StarRating value={Math.round(stats.avg)} readonly size="sm" />
            <p className="text-xs text-[var(--text-primary)]/25 mt-2">{stats.total} {stats.total === 1 ? 'отзыв' : stats.total < 5 ? 'отзыва' : 'отзывов'}</p>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-3.5 h-3.5 text-[var(--text-primary)]/25" /><p className="text-[11px] uppercase tracking-wider text-[var(--text-primary)]/30">Распределение</p></div>
            <div className="space-y-2">{[5, 4, 3, 2, 1].map(star => <RatingBar key={star} star={star} count={stats.distribution[star - 1]} total={stats.total} />)}</div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="text-center"><Loader2 className="w-6 h-6 text-emerald-500/50 animate-spin mx-auto mb-3" /><p className="text-sm text-[var(--text-primary)]/30">Загрузка...</p></div></div>
      ) : feedbacks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-xs">
            <div className="w-14 h-14 rounded-xl bg-[var(--hover-2)] flex items-center justify-center mx-auto mb-4"><MessageSquare className="w-6 h-6 text-[var(--text-primary)]/15" /></div>
            <p className="text-base font-medium text-[var(--text-primary)]/50 mb-1">Нет отзывов</p>
            <p className="text-sm text-[var(--text-primary)]/30 mb-4">Попробуйте изменить фильтры или оставить новый отзыв</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={resetFilters} className="px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/50 text-sm hover:bg-[var(--hover-3)]">Сбросить</button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium"><Star className="w-3.5 h-3.5" />Оставить отзыв</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {feedbacks.map(f => (
                <FeedbackCard key={f.id} feedback={f} ticketMap={ticketMap} userMap={userMap} currentUserId={user?.id} isStaff={isStaff} onEdit={setEditFeedback} onDelete={setDeleteFeedback} />
              ))}
            </AnimatePresence>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 disabled:opacity-20 transition-all"><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${page === p ? 'bg-emerald-600 text-white' : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:bg-[var(--hover-3)]'}`}>{p}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 disabled:opacity-20 transition-all"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <CreateFeedbackModal presetTicketId={presetTicketId || undefined} presetTicketLabel={presetTicketId ? filterTicketLabel : undefined} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchFeedbacks(); }} />}
      </AnimatePresence>
      {editFeedback && <EditFeedbackModal feedback={editFeedback} onClose={() => setEditFeedback(null)} onUpdated={() => { setEditFeedback(null); fetchFeedbacks(); }} />}
      {deleteFeedback && <DeleteFeedbackModal feedback={deleteFeedback} onClose={() => setDeleteFeedback(null)} onDeleted={() => { setDeleteFeedback(null); fetchFeedbacks(); }} />}
    </div>
  );
}