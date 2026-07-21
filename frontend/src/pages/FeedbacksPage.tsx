// pages/FeedbacksPage.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Search, Filter, Plus, Loader2, X, Check,
  ChevronDown, ChevronLeft, ChevronRight, RefreshCw,
  MessageSquare, Ticket, User, Calendar, Pencil,
  Trash2, Save, ArrowUpRight, TrendingUp,
  ThumbsUp, ThumbsDown, Meh, SmilePlus, Frown,
  Award, BarChart3, Quote,
} from 'lucide-react';
import { feedbacksApi, ticketsApi, usersApi } from '../api/client';
import type { Feedback, FeedbackCreateInput, FeedbackUpdateInput } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const RATING_CONFIG: Record<number, {
  label: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
  starColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  1: {
    label: 'Ужасно',
    emoji: '😠',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    starColor: 'text-red-400',
    icon: Frown,
  },
  2: {
    label: 'Плохо',
    emoji: '😕',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    starColor: 'text-orange-400',
    icon: ThumbsDown,
  },
  3: {
    label: 'Нормально',
    emoji: '😐',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    starColor: 'text-yellow-400',
    icon: Meh,
  },
  4: {
    label: 'Хорошо',
    emoji: '😊',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    starColor: 'text-emerald-400',
    icon: ThumbsUp,
  },
  5: {
    label: 'Отлично',
    emoji: '🤩',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    starColor: 'text-amber-400',
    icon: Award,
  },
};

const apiErr = (err: any) =>
  err?.response?.data?.error?.public_message ??
  err?.response?.data?.error?.message ??
  err?.response?.data?.detail?.[0]?.msg ??
  err?.message ??
  'Неизвестная ошибка';

const INPUT_CLS =
  'w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl ' +
  'text-[var(--text-primary)] text-base placeholder-[var(--text-primary)]/25 ' +
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
   STAR RATING COMPONENT
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
  size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly?: boolean;
  showLabel?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  const config = RATING_CONFIG[display] || RATING_CONFIG[3];

  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-9 h-9',
  };
  const gapMap = {
    sm: 'gap-0.5',
    md: 'gap-1',
    lg: 'gap-1.5',
    xl: 'gap-2',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center ${gapMap[size]}`}>
        {[1, 2, 3, 4, 5].map(star => {
          const filled = star <= display;
          const starConfig = RATING_CONFIG[star];

          return (
            <motion.button
              key={star}
              type="button"
              disabled={readonly}
              onClick={() => onChange?.(star)}
              onMouseEnter={() => !readonly && setHover(star)}
              onMouseLeave={() => !readonly && setHover(0)}
              whileHover={readonly ? {} : { scale: 1.2 }}
              whileTap={readonly ? {} : { scale: 0.9 }}
              className={`
                transition-all duration-200 flex-shrink-0
                ${readonly ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              <Star
                className={`
                  ${sizeMap[size]} transition-all duration-200
                  ${filled
                    ? `${starConfig.starColor} fill-current drop-shadow-[0_0_6px_currentColor]`
                    : 'text-[var(--text-primary)]/15'
                  }
                  ${!readonly && !filled ? 'hover:text-[var(--text-primary)]/30' : ''}
                `}
              />
            </motion.button>
          );
        })}
      </div>

      {showLabel && display > 0 && (
        <motion.div
          key={display}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${config.bg} ${config.border} border`}
        >
          <span className="text-lg">{config.emoji}</span>
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
        </motion.div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RATING BAR (для статистики)
   ═══════════════════════════════════════════════════════════════════ */

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const config = RATING_CONFIG[star];

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm font-medium text-[var(--text-primary)]/60 w-4 text-right">{star}</span>
      <Star className={`w-3.5 h-3.5 flex-shrink-0 ${config.starColor} fill-current`} />
      <div className="flex-1 h-2 bg-[var(--hover-2)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${config.bg.replace('/10', '/40')}`}
          style={{
            background: `linear-gradient(90deg, 
              ${star === 1 ? '#ef4444' : star === 2 ? '#f97316' : star === 3 ? '#eab308' : star === 4 ? '#10b981' : '#f59e0b'}, 
              ${star === 1 ? '#dc2626' : star === 2 ? '#ea580c' : star === 3 ? '#ca8a04' : star === 4 ? '#059669' : '#d97706'}
            )`,
          }}
        />
      </div>
      <span className="text-xs text-[var(--text-primary)]/40 w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ASYNC TICKET SELECT
   ═══════════════════════════════════════════════════════════════════ */

function TicketSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
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
      const res = await ticketsApi.getAllWithFilters(1, 20, {});
      const items = q
        ? res.items.filter(t => t.title.toLowerCase().includes(q.toLowerCase()) || String(t.number).includes(q))
        : res.items;
      setOptions(items.map(t => ({ value: t.id, label: `#${t.number} — ${t.title}` })));
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
    const found = options.find(o => o.value === value);
    if (found) { setSelectedLabel(found.label); return; }
    doLoad('').then(() => {
      // try again after load
    });
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
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск тикета..."
            className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-base text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 transition-all" />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[250px] p-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/25" /></div>}
        {!loading && options.length === 0 && (
          <div className="px-3 py-4 text-center text-base text-[var(--text-primary)]/40">
            {search ? 'Ничего не найдено' : 'Нет тикетов'}
          </div>
        )}
        {!loading && options.map(opt => (
          <div key={opt.value} role="button" tabIndex={0}
            onClick={() => { onChange(opt.value); setSelectedLabel(opt.label); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base cursor-pointer
              ${opt.value === value ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}`}>
            <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/30 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{opt.label}</span>
            {opt.value === value && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
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
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border rounded-xl text-base text-left transition-all select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'}
          ${open ? 'border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        <Ticket className="w-4 h-4 text-[var(--text-primary)]/40 flex-shrink-0" />
        <span className={`flex-1 truncate ${selectedLabel ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/25'}`}>
          {selectedLabel || 'Выберите тикет...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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
  onClose,
  onCreated,
}: {
  presetTicketId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [ticketId, setTicketId] = useState(presetTicketId ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const config = RATING_CONFIG[rating];

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
      toast({ title: 'Отзыв отправлен!', description: `Оценка: ${rating}/5 — ${RATING_CONFIG[rating].label}` });
      onCreated();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Оставить отзыв</h2>
                <p className="text-sm text-[var(--text-primary)]/40">Оцените качество обслуживания</p>
              </div>
            </div>
            <button onClick={() => !saving && onClose()}
              className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Ticket */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
              Тикет <span className="text-[var(--accent)]">*</span>
            </label>
            <TicketSelect
              value={ticketId}
              onChange={setTicketId}
              disabled={!!presetTicketId}
            />
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-3">
              Ваша оценка <span className="text-[var(--accent)]">*</span>
            </label>
            <div className="flex flex-col items-center py-4">
              <StarRating value={rating} onChange={setRating} size="xl" showLabel />

              {/* Emoji feedback */}
              <AnimatePresence mode="wait">
                {rating > 0 && (
                  <motion.div
                    key={rating}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 text-center"
                  >
                    <span className="text-4xl">{config.emoji}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
              Комментарий
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Расскажите подробнее о вашем опыте..."
              rows={3}
              className={`${INPUT_CLS} resize-none`}
            />
            <p className="mt-1 text-xs text-[var(--text-primary)]/30">
              Необязательно, но поможет нам стать лучше
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!ticketId || !rating || saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)] transition-all">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
            Отправить отзыв
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Pencil className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Редактировать отзыв</h2>
              <p className="text-sm text-[var(--text-primary)]/40">Измените оценку или комментарий</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col items-center py-2">
            <StarRating value={rating} onChange={setRating} size="lg" showLabel />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">Комментарий</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Ваш комментарий..." rows={3}
              className={`${INPUT_CLS} resize-none`} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base disabled:opacity-50">
            Отмена
          </button>
          <button onClick={submit} disabled={!rating || saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DELETE CONFIRM MODAL
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && onClose()} />
      <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="p-6 text-center">
          <Trash2 className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Удалить отзыв?</h3>
          <p className="text-sm text-[var(--text-primary)]/50">
            Отзыв с оценкой {feedback.rating}/5 будет архивирован
          </p>
        </div>
        <div className="flex border-t border-[var(--border-color)]">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 py-3 text-base text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] disabled:opacity-50">
            Отмена
          </button>
          <button onClick={confirm} disabled={deleting}
            className="flex-1 py-3 text-base font-medium text-red-400 hover:bg-red-500/10 border-l border-[var(--border-color)] disabled:opacity-50">
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
  userMap,
  currentUserId,
  isStaff,
  onEdit,
  onDelete,
}: {
  feedback: Feedback;
  userMap: Map<string, { full_name?: string; username?: string; email: string; avatar_url?: string | null }>;
  currentUserId?: string;
  isStaff: boolean;
  onEdit: (f: Feedback) => void;
  onDelete: (f: Feedback) => void;
}) {
  const config = RATING_CONFIG[feedback.rating] || RATING_CONFIG[3];
  const RIcon = config.icon;
  const author = userMap.get(feedback.author_id);
  const canManage = isStaff || feedback.author_id === currentUserId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group bg-[var(--bg-card)] border rounded-2xl p-5 transition-all hover:shadow-[var(--shadow-md)] ${config.border}`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          {author?.avatar_url ? (
            <img src={author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {initials(author?.full_name || author?.username)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {author?.full_name || author?.username || author?.email || 'Пользователь'}
            </p>
            <p className="text-xs text-[var(--text-primary)]/40 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(feedback.created_at)}
            </p>
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onEdit(feedback)}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-blue-400 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(feedback)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/40 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Stars + Badge */}
      <div className="flex items-center gap-3 mb-3">
        <StarRating value={feedback.rating} readonly size="sm" />
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}>
          <RIcon className="w-3 h-3" />
          {config.label}
        </span>
      </div>

      {/* Comment */}
      {feedback.comment && (
        <div className="relative pl-3 border-l-2 border-[var(--border-color)]">
          <Quote className="absolute -left-1.5 -top-0.5 w-3 h-3 text-[var(--text-primary)]/15 bg-[var(--bg-card)]" />
          <p className="text-sm text-[var(--text-primary)]/70 leading-relaxed">
            {feedback.comment}
          </p>
        </div>
      )}

      {/* Ticket link */}
      <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center gap-2">
        <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/25 flex-shrink-0" />
        <span className="text-xs text-[var(--text-primary)]/40 truncate">
          Тикет: {feedback.ticket_id.slice(0, 8)}...
        </span>
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

  // State
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

  // User map
  const [userMap, setUserMap] = useState<Map<string, any>>(new Map());

  // Stats
  const [stats, setStats] = useState({ avg: 0, distribution: [0, 0, 0, 0, 0] });

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

      // Calculate stats from all feedbacks (load all for stats)
      if (!silent) {
        try {
          const all = await feedbacksApi.getAll(1, 100, presetTicketId ? { ticketId: presetTicketId } : {});
          const dist = [0, 0, 0, 0, 0];
          let sum = 0;
          all.items.forEach(f => {
            dist[f.rating - 1]++;
            sum += f.rating;
          });
          setStats({
            avg: all.items.length > 0 ? sum / all.items.length : 0,
            distribution: dist,
          });
        } catch { }
      }
    } catch (e: any) {
      toast({ title: 'Ошибка загрузки', description: apiErr(e), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, filterRating, presetTicketId, toast]);

  useEffect(() => { fetchFeedbacks(); }, [fetchFeedbacks]);

  const refresh = () => fetchFeedbacks(true);

  const avgConfig = RATING_CONFIG[Math.round(stats.avg)] || RATING_CONFIG[3];
  const totalReviews = stats.distribution.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Отзывы</h1>
            {!loading && (
              <span className="px-2.5 py-0.5 rounded-lg bg-[var(--hover-3)] text-base font-medium text-[var(--text-primary)]/50 tabular-nums">
                {totalItems}
              </span>
            )}
            {refreshing && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/40" />}
          </div>
          <p className="text-base text-[var(--text-primary)]/40 mt-0.5">
            Оценки и отзывы по завершённым заявкам
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rating filter */}
          <div className="relative">
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-base font-medium transition-all
                ${filterRating
                  ? `${RATING_CONFIG[filterRating].bg} ${RATING_CONFIG[filterRating].border} ${RATING_CONFIG[filterRating].color}`
                  : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/50'
                }`}>
              <Filter className="w-3.5 h-3.5" />
              {filterRating ? `${filterRating} ★` : 'Фильтры'}
            </button>
            {showFilters && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-20 w-52 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] p-2">
                  <p className="px-2 py-1 text-[11px] uppercase tracking-widest text-[var(--text-primary)]/30">
                    По оценке
                  </p>
                  <button
                    onClick={() => { setFilterRating(null); setPage(1); setShowFilters(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                      ${!filterRating ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}
                  >
                    <span className="text-[var(--text-primary)]/25">—</span>
                    <span className="flex-1 text-left">Все оценки</span>
                    {!filterRating && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </button>
                  {[5, 4, 3, 2, 1].map(r => {
                    const rc = RATING_CONFIG[r];
                    return (
                      <button key={r}
                        onClick={() => { setFilterRating(r); setPage(1); setShowFilters(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                          ${filterRating === r ? `${rc.bg} ${rc.color}` : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${rc.starColor} fill-current`} />
                        <span className="flex-1 text-left">{r} — {rc.label}</span>
                        <span className="text-xs">{rc.emoji}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <button onClick={refresh} disabled={refreshing || loading}
            className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] transition-all disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-medium transition-colors shadow-[var(--shadow-md)]">
            <Plus className="w-4 h-4" /> Оставить отзыв
          </button>
        </div>
      </div>

      {/* Stats panel */}
      {!loading && totalReviews > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Average */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6"
            style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className={`text-5xl font-bold ${avgConfig.color}`}>
                  {stats.avg.toFixed(1)}
                </p>
                <StarRating value={Math.round(stats.avg)} readonly size="sm" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-[var(--text-primary)]/40 mb-0.5">Средняя оценка</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{avgConfig.emoji}</span>
                  <span className={`text-sm font-medium ${avgConfig.color}`}>{avgConfig.label}</span>
                </div>
                <p className="text-xs text-[var(--text-primary)]/30 mt-1">
                  На основе {totalReviews} {totalReviews === 1 ? 'отзыва' : totalReviews < 5 ? 'отзывов' : 'отзывов'}
                </p>
              </div>
            </div>
          </div>

          {/* Distribution */}
          <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6"
            style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-[var(--text-primary)]/40" />
              <p className="text-sm font-medium text-[var(--text-primary)]/60">Распределение оценок</p>
            </div>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(star => (
                <RatingBar key={star} star={star} count={stats.distribution[star - 1]} total={totalReviews} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
            <p className="text-[var(--text-primary)]/40 text-base">Загрузка отзывов...</p>
          </div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-amber-400/40" />
            </div>
            <p className="text-lg font-semibold text-[var(--text-primary)]/60 mb-1">
              {filterRating ? 'Нет отзывов с такой оценкой' : 'Пока нет отзывов'}
            </p>
            <p className="text-sm text-[var(--text-primary)]/40 mb-5">
              {filterRating
                ? 'Попробуйте выбрать другую оценку или сбросьте фильтры'
                : 'Будьте первым — оставьте отзыв о работе по вашей заявке'
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              {filterRating && (
                <button onClick={() => { setFilterRating(null); setPage(1); }}
                  className="px-4 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm">
                  Сбросить фильтр
                </button>
              )}
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow-[var(--shadow-md)]">
                <Star className="w-4 h-4" /> Оставить первый отзыв
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {feedbacks.map(f => (
                <FeedbackCard
                  key={f.id}
                  feedback={f}
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
            <div className="flex items-center justify-center gap-2 pt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-30 transition-all">
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
                    className={`w-9 h-9 rounded-xl text-sm font-medium transition-all
                      ${page === p
                        ? 'bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-3)]'
                      }`}>
                    {p}
                  </button>
                );
              })}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-30 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
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