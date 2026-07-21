// pages/FeedbacksPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Search, Filter, Plus, Loader2, X, Check,
  ChevronDown, ChevronLeft, ChevronRight, RefreshCw,
  MessageSquare, Ticket, User, Calendar, Pencil,
  Trash2, Save, ArrowUpRight, BarChart3, Quote,
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
  3: 'Удовлетворительно',
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

/* ═══════════════════════════════════════════════════════════════════
   STAR RATING
   ═══════════════════════════════════════════════════════════════════ */

function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const display = readonly ? value : (hovered || value);

  const sizeMap = { sm: 16, md: 22, lg: 32 };
  const gapMap = { sm: 2, md: 4, lg: 6 };
  const starSize = sizeMap[size];
  const gap = gapMap[size];

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (readonly || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const starWidth = starSize + gap;
    const starIndex = Math.min(5, Math.max(1, Math.ceil(x / starWidth)));
    setHovered(starIndex);
  }, [readonly, starSize, gap]);

  const handleClick = useCallback(() => {
    if (readonly || !hovered) return;
    onChange?.(hovered);
  }, [readonly, hovered, onChange]);

  return (
    <div className="inline-flex flex-col items-start">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => !readonly && setHovered(0)}
        onClick={handleClick}
        className={`inline-flex items-center ${readonly ? '' : 'cursor-pointer'}`}
        style={{ gap: `${gap}px` }}
      >
        {[1, 2, 3, 4, 5].map(star => {
          const filled = star <= display;
          return (
            <Star
              key={star}
              width={starSize}
              height={starSize}
              className={`flex-shrink-0 transition-colors duration-150 ${
                filled
                  ? 'text-emerald-500 fill-emerald-500'
                  : 'text-[var(--text-primary)]/15'
              }`}
            />
          );
        })}
      </div>
      {!readonly && display > 0 && (
        <span className="text-xs text-emerald-500/70 mt-1 font-medium">
          {RATING_LABELS[display]}
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
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full rounded-full bg-emerald-500/60"
        />
      </div>
      <span className="text-xs text-[var(--text-primary)]/30 w-6 text-right tabular-nums flex-shrink-0">
        {count}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TICKET SELECT (only closed tickets)
   ═══════════════════════════════════════════════════════════════════ */

interface TicketOption {
  id: string;
  number: string;
  title: string;
}

function TicketSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string, number: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<TicketOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const doLoad = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await ticketsApi.getAllWithFilters(1, 30, { status: 'closed' });
      const items = q
        ? res.items.filter(t =>
            t.title.toLowerCase().includes(q.toLowerCase()) ||
            String(t.number).toLowerCase().includes(q.toLowerCase())
          )
        : res.items;
      setOptions(items.map(t => ({ id: t.id, number: String(t.number), title: t.title })));
    } catch { setOptions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    doLoad('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, doLoad]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doLoad(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, open, doLoad]);

  useEffect(() => {
    if (!value) { setSelectedLabel(''); return; }
    const found = options.find(o => o.id === value);
    if (found) setSelectedLabel(`#${found.number} — ${found.title}`);
  }, [value, options]);

  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(spaceBelow < 300
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  const dropdown = open ? createPortal(
    <div ref={dropdownRef} style={dropStyle}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
      <div className="p-2 border-b border-[var(--border-color)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/25 pointer-events-none" />
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по закрытым тикетам..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 transition-all" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[250px] p-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" />
          </div>
        )}
        {!loading && options.length === 0 && (
          <div className="px-3 py-6 text-center">
            <Ticket className="w-5 h-5 text-[var(--text-primary)]/15 mx-auto mb-2" />
            <p className="text-sm text-[var(--text-primary)]/40">
              {search ? 'Ничего не найдено' : 'Нет закрытых тикетов'}
            </p>
          </div>
        )}
        {!loading && options.map(opt => (
          <div key={opt.id} role="button" tabIndex={0}
            onClick={() => {
              onChange(opt.id, opt.number);
              setSelectedLabel(`#${opt.number} — ${opt.title}`);
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer
              ${opt.id === value
                ? 'bg-emerald-500/8 text-[var(--text-primary)]'
                : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
              }`}>
            <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/25 flex-shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <span className="font-mono text-xs text-[var(--text-primary)]/40 mr-1.5">#{opt.number}</span>
              <span className="truncate">{opt.title}</span>
            </div>
            {opt.id === value && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <div role="button" tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left transition-all select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        <Ticket className="w-4 h-4 text-[var(--text-primary)]/30 flex-shrink-0" />
        <span className={`flex-1 truncate ${selectedLabel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/25'}`}>
          {selectedLabel || 'Выберите закрытый тикет'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dropdown}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE FEEDBACK MODAL
   ═══════════════════════════════════════════════════════════════════ */

function CreateFeedbackModal({
  presetTicketId,
  presetTicketNumber,
  onClose,
  onCreated,
}: {
  presetTicketId?: string;
  presetTicketNumber?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [ticketId, setTicketId] = useState(presetTicketId ?? '');
  const [ticketNumber, setTicketNumber] = useState(presetTicketNumber ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const submit = async () => {
    if (!ticketId || !rating) return;
    setSaving(true);
    try {
      await feedbacksApi.create({
        ticket_id: ticketId,
        rating,
        comment: comment.trim(),
      });
      toast({ title: 'Отзыв отправлен', description: `Оценка: ${rating} из 5` });
      onCreated();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Star className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">Новый отзыв</h2>
                <p className="text-xs text-[var(--text-primary)]/35">По закрытому тикету</p>
              </div>
            </div>
            <button onClick={() => !saving && onClose()}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/60">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Ticket */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">
              Тикет <span className="text-[var(--accent)]">*</span>
            </label>
            <TicketSelect
              value={ticketId}
              onChange={(id, num) => { setTicketId(id); setTicketNumber(num); }}
              disabled={!!presetTicketId}
            />
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-3">
              Оценка <span className="text-[var(--accent)]">*</span>
            </label>
            <div className="flex justify-center py-3 bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)]">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">
              Комментарий
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Поделитесь впечатлениями..."
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!ticketId || !rating || saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Отправить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EDIT FEEDBACK MODAL
   ═══════════════════════════════════════════════════════════════════ */

function EditFeedbackModal({
  feedback,
  onClose,
  onUpdated,
}: {
  feedback: Feedback;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(feedback.rating);
  const [comment, setComment] = useState(feedback.comment);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const submit = async () => {
    setSaving(true);
    try {
      const data: FeedbackUpdateInput = {};
      if (rating !== feedback.rating) data.rating = rating;
      if (comment.trim() !== feedback.comment) data.comment = comment.trim();
      if (Object.keys(data).length) {
        await feedbacksApi.update(feedback.id, data);
      }
      toast({ title: 'Отзыв обновлён' });
      onUpdated();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Редактировать отзыв</h2>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-3">Оценка</label>
            <div className="flex justify-center py-3 bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)]">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)]/50 uppercase tracking-wider mb-2">Комментарий</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Ваш комментарий..." rows={3}
              className={`${INPUT_CLS} resize-none`} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)]">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!rating || saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DELETE CONFIRM
   ═══════════════════════════════════════════════════════════════════ */

function DeleteFeedbackModal({
  feedback,
  onClose,
  onDeleted,
}: {
  feedback: Feedback;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, deleting]);

  const confirm = async () => {
    setDeleting(true);
    try {
      await feedbacksApi.delete(feedback.id);
      toast({ title: 'Отзыв удалён' });
      onDeleted();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && onClose()} />
      <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Удалить отзыв?</h3>
          <p className="text-sm text-[var(--text-primary)]/40">
            Отзыв с оценкой {feedback.rating}/5 будет удалён
          </p>
        </div>
        <div className="flex border-t border-[var(--border-color)]">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 py-3 text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] disabled:opacity-50 transition-colors">
            Отмена
          </button>
          <button onClick={confirm} disabled={deleting}
            className="flex-1 py-3 text-sm font-medium text-red-400 hover:bg-red-500/8 border-l border-[var(--border-color)] disabled:opacity-50 transition-colors">
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

function FeedbackCard({
  feedback,
  ticketMap,
  userMap,
  currentUserId,
  isStaff,
  onEdit,
  onDelete,
}: {
  feedback: Feedback;
  ticketMap: Map<string, { number: string; title: string }>;
  userMap: Map<string, { full_name?: string; username?: string; email: string; avatar_url?: string | null }>;
  currentUserId?: string;
  isStaff: boolean;
  onEdit: (f: Feedback) => void;
  onDelete: (f: Feedback) => void;
}) {
  const author = userMap.get(feedback.author_id);
  const ticket = ticketMap.get(feedback.ticket_id);
  const canManage = isStaff || feedback.author_id === currentUserId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 transition-all hover:border-[var(--border-color-hover,var(--border-color))]"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Author + Date + Actions */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {author?.avatar_url ? (
            <img src={author.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initials(author?.full_name || author?.username)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {author?.full_name || author?.username || author?.email || 'Пользователь'}
            </p>
            <p className="text-[11px] text-[var(--text-primary)]/30">
              {fmtDate(feedback.created_at)}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onEdit(feedback)}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/60 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={() => onDelete(feedback)}
              className="p-1.5 rounded-lg hover:bg-red-500/8 text-[var(--text-primary)]/25 hover:text-red-400 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Stars */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <StarRating value={feedback.rating} readonly size="sm" />
        <span className="text-xs font-medium text-[var(--text-primary)]/40">
          {RATING_LABELS[feedback.rating]}
        </span>
      </div>

      {/* Comment */}
      {feedback.comment && (
        <p className="text-sm text-[var(--text-primary)]/60 leading-relaxed mb-3">
          {feedback.comment}
        </p>
      )}

      {/* Ticket link */}
      <div className="pt-3 border-t border-[var(--border-color)]">
        {ticket ? (
          <Link
            to={`/tickets/${ticket.number}`}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-primary)]/35 hover:text-[var(--accent)] transition-colors"
          >
            <Ticket className="w-3 h-3" />
            <span className="font-mono">#{ticket.number}</span>
            <span className="truncate max-w-[160px]">{ticket.title}</span>
            <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
          </Link>
        ) : (
          <span className="text-xs text-[var(--text-primary)]/20">
            Тикет не найден
          </span>
        )}
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

  const presetTicketId = sp.get('ticket_id') ?? undefined;

  const isStaff = user?.roles?.some(r =>
    ['admin', 'support_manager', 'support_agent', 'executor'].includes(r)
  ) ?? false;

  // Data
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editFeedback, setEditFeedback] = useState<Feedback | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback | null>(null);

  // Maps
  const [userMap, setUserMap] = useState<Map<string, any>>(new Map());
  const [ticketMap, setTicketMap] = useState<Map<string, { number: string; title: string }>>(new Map());

  // Stats
  const [stats, setStats] = useState({ avg: 0, total: 0, distribution: [0, 0, 0, 0, 0] });

  // Load users
  useEffect(() => {
    (async () => {
      try {
        const res = await usersApi.getAllUsers(1, 100);
        const m = new Map<string, any>();
        res.items.forEach(u => m.set(u.id, u));
        setUserMap(m);
      } catch { }
    })();
  }, []);

  // Load ticket info for mapping
  const loadTicketInfo = useCallback(async (ticketIds: string[]) => {
    const unique = [...new Set(ticketIds)].filter(id => !ticketMap.has(id));
    if (!unique.length) return;
    try {
      // Load all tickets in batch (best effort)
      const res = await ticketsApi.getAllWithFilters(1, 100, {});
      const m = new Map(ticketMap);
      res.items.forEach(t => m.set(t.id, { number: String(t.number), title: t.title }));
      setTicketMap(m);
    } catch { }
  }, [ticketMap]);

  // Fetch feedbacks
  const fetchFeedbacks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const filters: any = {};
      if (filterRating) filters.rating = filterRating;
      if (presetTicketId) filters.ticketId = presetTicketId;
      const res = await feedbacksApi.getAll(page, 12, filters);
      setFeedbacks(res.items);
      setTotalItems(res.total_items);
      setTotalPages(res.total_pages);

      // Load ticket info
      if (res.items.length) {
        loadTicketInfo(res.items.map(f => f.ticket_id));
      }

      // Stats (all feedbacks)
      if (!silent) {
        try {
          const all = await feedbacksApi.getAll(1, 200, presetTicketId ? { ticketId: presetTicketId } : {});
          const dist = [0, 0, 0, 0, 0];
          let sum = 0;
          all.items.forEach(f => {
            dist[f.rating - 1]++;
            sum += f.rating;
          });
          setStats({
            avg: all.items.length > 0 ? sum / all.items.length : 0,
            total: all.items.length,
            distribution: dist,
          });
          // Load tickets for all
          if (all.items.length) {
            loadTicketInfo(all.items.map(f => f.ticket_id));
          }
        } catch { }
      }
    } catch (e: any) {
      toast({ title: 'Ошибка загрузки', description: apiErr(e), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, filterRating, presetTicketId, toast, loadTicketInfo]);

  useEffect(() => { fetchFeedbacks(); }, [fetchFeedbacks]);

  const refresh = () => fetchFeedbacks(true);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* ─── Header ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Отзывы</h1>
            {!loading && (
              <span className="px-2 py-0.5 rounded-md bg-[var(--hover-3)] text-xs font-medium text-[var(--text-primary)]/40 tabular-nums">
                {totalItems}
              </span>
            )}
            {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]/30" />}
          </div>
          <p className="text-sm text-[var(--text-primary)]/30 mt-0.5">
            Оценки по закрытым заявкам
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="relative">
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-all
                ${filterRating
                  ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-500'
                  : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'
                }`}>
              <Filter className="w-3.5 h-3.5" />
              {filterRating ? (
                <span className="flex items-center gap-1">
                  {filterRating} <Star className="w-3 h-3 fill-current" />
                </span>
              ) : 'Фильтр'}
            </button>
            {showFilters && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] p-1.5">
                  <button
                    onClick={() => { setFilterRating(null); setPage(1); setShowFilters(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                      ${!filterRating ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}
                  >
                    <span className="flex-1 text-left">Все</span>
                    {!filterRating && <Check className="w-3 h-3 text-emerald-500" />}
                  </button>
                  {[5, 4, 3, 2, 1].map(r => (
                    <button key={r}
                      onClick={() => { setFilterRating(r); setPage(1); setShowFilters(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                        ${filterRating === r ? 'bg-emerald-500/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'}`}
                    >
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < r ? 'text-emerald-500 fill-emerald-500' : 'text-[var(--text-primary)]/10'}`} />
                        ))}
                      </div>
                      <span className="flex-1 text-left text-xs">{RATING_LABELS[r]}</span>
                      {filterRating === r && <Check className="w-3 h-3 text-emerald-500" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button onClick={refresh} disabled={refreshing || loading}
            className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/60 transition-all disabled:opacity-30">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" /> Отзыв
          </button>
        </div>
      </div>

      {/* ─── Stats ─── */}
      {!loading && stats.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
          {/* Average card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5"
            style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-primary)]/30 mb-3">Средняя оценка</p>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                {stats.avg.toFixed(1)}
              </span>
              <span className="text-sm text-[var(--text-primary)]/30 mb-0.5">из 5</span>
            </div>
            <StarRating value={Math.round(stats.avg)} readonly size="sm" />
            <p className="text-xs text-[var(--text-primary)]/25 mt-2">
              {stats.total} {stats.total === 1 ? 'отзыв' : stats.total < 5 ? 'отзыва' : 'отзывов'}
            </p>
          </div>

          {/* Distribution */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5"
            style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-3.5 h-3.5 text-[var(--text-primary)]/25" />
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-primary)]/30">Распределение</p>
            </div>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(star => (
                <RatingBar key={star} star={star} count={stats.distribution[star - 1]} total={stats.total} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Content ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-6 h-6 text-emerald-500/50 animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-primary)]/30">Загрузка...</p>
          </div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-xs">
            <div className="w-14 h-14 rounded-xl bg-[var(--hover-2)] flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-6 h-6 text-[var(--text-primary)]/15" />
            </div>
            <p className="text-base font-medium text-[var(--text-primary)]/50 mb-1">
              {filterRating ? 'Нет отзывов с такой оценкой' : 'Пока нет отзывов'}
            </p>
            <p className="text-sm text-[var(--text-primary)]/30 mb-4">
              {filterRating
                ? 'Попробуйте другой фильтр'
                : 'Оставьте первый отзыв по закрытому тикету'
              }
            </p>
            <div className="flex items-center justify-center gap-2">
              {filterRating && (
                <button onClick={() => { setFilterRating(null); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/50 text-sm hover:bg-[var(--hover-3)]">
                  Сбросить
                </button>
              )}
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium">
                <Star className="w-3.5 h-3.5" /> Оставить отзыв
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {feedbacks.map(f => (
                <FeedbackCard
                  key={f.id}
                  feedback={f}
                  ticketMap={ticketMap}
                  userMap={userMap}
                  currentUserId={user?.id}
                  isStaff={isStaff}
                  onEdit={setEditFeedback}
                  onDelete={setDeleteFeedback}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 disabled:opacity-20 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= totalPages - 3) {
                  p = totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all
                      ${page === p
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:bg-[var(--hover-3)]'
                      }`}>
                    {p}
                  </button>
                );
              })}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 disabled:opacity-20 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Modals ─── */}
      <AnimatePresence>
        {showCreate && (
          <CreateFeedbackModal
            presetTicketId={presetTicketId}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); fetchFeedbacks(); }}
          />
        )}
      </AnimatePresence>

      {editFeedback && (
        <EditFeedbackModal
          feedback={editFeedback}
          onClose={() => setEditFeedback(null)}
          onUpdated={() => { setEditFeedback(null); fetchFeedbacks(); }}
        />
      )}

      {deleteFeedback && (
        <DeleteFeedbackModal
          feedback={deleteFeedback}
          onClose={() => setDeleteFeedback(null)}
          onDeleted={() => { setDeleteFeedback(null); fetchFeedbacks(); }}
        />
      )}
    </div>
  );
}