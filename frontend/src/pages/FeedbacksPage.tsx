// pages/FeedbacksPage.tsx

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';

import { useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
  Star,
  Filter,
  Plus,
  Loader2,
  X,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  Ticket,
  User,
  Calendar,
  Pencil,
  Trash2,
  Save,
  ArrowUpRight,
  BarChart3,
  Search,
} from 'lucide-react';

import {
  feedbacksApi,
  ticketsApi,
  usersApi,
} from '../api/client';

import type {
  Feedback,
  FeedbackUpdateInput,
} from '../api/client';

import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import { ActionButton } from '../components/ui/ActionButton';

/* ==========================================================================
   CONSTANTS
   ========================================================================== */

const RATING_LABELS: Record<number, string> = {
  1: 'Очень плохо',
  2: 'Плохо',
  3: 'Нормально',
  4: 'Хорошо',
  5: 'Отлично',
};

const INPUT_CLS = `
  w-full
  px-4 py-3
  rounded-xl
  border border-[var(--border-color)]
  bg-[var(--hover-2)]
  text-base text-[var(--text-primary)]
  placeholder:text-[var(--text-primary)]/30
  focus:outline-none
  focus:border-[var(--accent)]/40
  focus:ring-2
  focus:ring-[var(--accent-ring)]
  transition-all
`;

const apiErr = (error: any): string =>
  error?.response?.data?.error?.public_message ??
  error?.response?.data?.error?.message ??
  error?.response?.data?.detail?.[0]?.msg ??
  error?.message ??
  'Неизвестная ошибка';

const fmtDate = (date: string): string =>
  new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const initials = (name?: string | null): string => {
  if (!name) return '?';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

/* ==========================================================================
   DROPDOWN POSITION
   ========================================================================== */

function useDropdownPosition(
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  open: boolean,
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const openUp =
        spaceBelow < 320 &&
        spaceAbove > spaceBelow;

      setStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        maxHeight: Math.min(
          360,
          Math.max(160, openUp ? spaceAbove - 16 : spaceBelow - 16),
        ),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, triggerRef]);

  return style;
}

/* ==========================================================================
   STAR RATING
   ========================================================================== */

function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
  showLabel = false,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly?: boolean;
  showLabel?: boolean;
}) {
  const [hovered, setHovered] = useState(0);

  const display = readonly
    ? value
    : hovered || value;

  const sizes = {
    sm: 19,
    md: 23,
    lg: 29,
    xl: 36,
  };

  const px = sizes[size];
  const label = RATING_LABELS[display] || '';

  return (
    <div className="inline-flex flex-col items-center">
      <div
        className="inline-flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= display;

          if (readonly) {
            return (
              <span
                key={star}
                className="flex items-center justify-center"
                style={{ width: px, height: px }}
              >
                <Star
                  width={px}
                  height={px}
                  className={
                    active
                      ? 'fill-emerald-500 text-emerald-500'
                      : 'text-[var(--text-primary)]/15'
                  }
                />
              </span>
            );
          }

          return (
            <button
              key={star}
              type="button"
              aria-label={`Оценка ${star}`}
              onClick={() => onChange?.(star)}
              onMouseEnter={() => setHovered(star)}
              className="flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              style={{
                width: px + 5,
                height: px + 5,
              }}
            >
              <Star
                width={px}
                height={px}
                className={`transition-colors ${
                  active
                    ? 'fill-emerald-500 text-emerald-500'
                    : 'text-[var(--text-primary)]/15'
                }`}
              />
            </button>
          );
        })}
      </div>

      {showLabel && (
        <div className="mt-3 h-6">
          <AnimatePresence mode="wait">
            {label && (
              <motion.span
                key={label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="text-base font-medium text-emerald-500"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   RATING BAR
   ========================================================================== */

function RatingBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const percent =
    total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="flex w-10 shrink-0 items-center justify-end gap-1 text-sm text-[var(--text-primary)]/65">
        {star}
        <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
      </span>

      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--hover-3)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4 }}
          className="h-full rounded-full bg-emerald-500"
        />
      </div>

      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-[var(--text-primary)]/45">
        {count}
      </span>
    </div>
  );
}

/* ==========================================================================
   SELECT TYPES
   ========================================================================== */

interface TicketOption {
  id: string;
  number: string;
  title: string;
}

interface UserOption {
  id: string;
  full_name?: string;
  username?: string;
  email: string;
  avatar_url?: string | null;
}

/* ==========================================================================
   TICKET SELECT
   ========================================================================== */

function TicketSelect({
  value,
  label,
  onChange,
  disabled = false,
  placeholder = 'Выберите заявку',
}: {
  value: string;
  label?: string;
  onChange: (id: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<TicketOption[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dropdownStyle = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;

      setOpen(false);
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);

      try {
        const response = await ticketsApi.getAllWithFilters(1, 100, {});

        const closed = response.items.filter(
          (ticket: any) => ticket.status === 'closed',
        );

        const query = search.trim().toLowerCase();

        const filtered = query
          ? closed.filter(
              (ticket: any) =>
                String(ticket.title || '').toLowerCase().includes(query) ||
                String(ticket.number || '').toLowerCase().includes(query),
            )
          : closed;

        setOptions(
          filtered.map((ticket: any) => ({
            id: ticket.id,
            number: String(ticket.number),
            title: String(ticket.title || ''),
          })),
        );
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(load, search ? 250 : 0);

    return () => clearTimeout(timer);
  }, [open, search]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }

    setSearch('');
  }, [open]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-[var(--border-color)] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-primary)]/35" />

              <input
                ref={inputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Номер или название заявки..."
                className={INPUT_CLS + ' pl-10'}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                onChange('', '');
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]"
            >
              Все заявки
              {!value && <Check className="h-4 w-4 text-emerald-500" />}
            </button>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : options.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-primary)]/40">
                Ничего не найдено
              </p>
            ) : (
              options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(
                      option.id,
                      `#${option.number} — ${option.title}`,
                    );
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--hover-2)]"
                >
                  <Ticket className="h-4 w-4 shrink-0 text-[var(--text-primary)]/35" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-[var(--text-primary)]/45">
                      #{option.number}
                    </p>

                    <p className="truncate text-sm text-[var(--text-primary)]">
                      {option.title}
                    </p>
                  </div>

                  {value === option.id && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="
          flex w-full items-center gap-3 rounded-xl
          border border-[var(--border-color)]
          bg-[var(--hover-2)] px-4 py-3
          text-left text-base
          transition-colors
          hover:bg-[var(--hover-3)]
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        <Ticket className="h-5 w-5 shrink-0 text-[var(--text-primary)]/40" />

        <span
          className={`min-w-0 flex-1 truncate ${
            label
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]/40'
          }`}
        >
          {label || placeholder}
        </span>

        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-primary)]/35" />
      </button>

      {dropdown}
    </>
  );
}

/* ==========================================================================
   AUTHOR SELECT
   ========================================================================== */

function AuthorSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label?: string;
  onChange: (id: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dropdownStyle = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;

      setOpen(false);
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);

      try {
        const response = await usersApi.getAllUsers(1, 100);
        const query = search.trim().toLowerCase();

        const filtered = query
          ? response.items.filter(
              (user: any) =>
                String(user.full_name || '').toLowerCase().includes(query) ||
                String(user.username || '').toLowerCase().includes(query) ||
                String(user.email || '').toLowerCase().includes(query),
            )
          : response.items;

        setOptions(filtered);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(load, search ? 250 : 0);

    return () => clearTimeout(timer);
  }, [open, search]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }

    setSearch('');
  }, [open]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-[var(--border-color)] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-primary)]/35" />

              <input
                ref={inputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск автора..."
                className={INPUT_CLS + ' pl-10'}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                onChange('', '');
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]"
            >
              Все авторы
              {!value && <Check className="h-4 w-4 text-emerald-500" />}
            </button>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : options.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-primary)]/40">
                Ничего не найдено
              </p>
            ) : (
              options.map((option) => {
                const name =
                  option.full_name ||
                  option.username ||
                  option.email;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id, name);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--hover-2)]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                      {initials(name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {name}
                      </p>

                      <p className="truncate text-xs text-[var(--text-primary)]/40">
                        {option.email}
                      </p>
                    </div>

                    {value === option.id && (
                      <Check className="h-4 w-4 text-emerald-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="
          flex w-full items-center gap-3 rounded-xl
          border border-[var(--border-color)]
          bg-[var(--hover-2)] px-4 py-3
          text-left text-base
          transition-colors
          hover:bg-[var(--hover-3)]
        "
      >
        <User className="h-5 w-5 shrink-0 text-[var(--text-primary)]/40" />

        <span
          className={`min-w-0 flex-1 truncate ${
            label
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]/40'
          }`}
        >
          {label || 'Выберите автора'}
        </span>

        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-primary)]/35" />
      </button>

      {dropdown}
    </>
  );
}

/* ==========================================================================
   CREATE MODAL
   ========================================================================== */

function CreateFeedbackModal({
  presetTicketId,
  presetTicketLabel,
  onClose,
  onCreated,
}: {
  presetTicketId?: string;
  presetTicketLabel?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();

  const [ticketId, setTicketId] = useState(presetTicketId ?? '');
  const [ticketLabel, setTicketLabel] = useState(presetTicketLabel ?? '');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };

    document.addEventListener('keydown', handler);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
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

      toast({
        title: 'Отзыв отправлен',
        description: `Оценка: ${rating} из 5`,
      });

      onCreated();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: apiErr(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Новый отзыв
            </h2>

            <p className="mt-1 text-sm text-[var(--text-primary)]/40">
              Оценка работы по закрытой заявке
            </p>
          </div>

          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-xl p-2 text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]/65">
              Заявка <span className="text-[var(--accent)]">*</span>
            </label>

            <TicketSelect
              value={ticketId}
              label={ticketLabel}
              onChange={(id, label) => {
                setTicketId(id);
                setTicketLabel(label);
              }}
              disabled={!!presetTicketId}
              placeholder="Выберите закрытую заявку"
            />
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-[var(--text-primary)]/65">
              Ваша оценка <span className="text-[var(--accent)]">*</span>
            </label>

            <div className="flex flex-col items-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-6">
              <StarRating
                value={rating}
                onChange={setRating}
                size="xl"
                showLabel
              />

              {!rating && (
                <p className="mt-2 text-sm text-[var(--text-primary)]/35">
                  Выберите оценку от 1 до 5
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]/65">
              Комментарий
            </label>

            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              placeholder="Расскажите о качестве работы..."
              className={`${INPUT_CLS} resize-none`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-xl bg-[var(--hover-2)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)]/65 hover:bg-[var(--hover-3)] disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={!ticketId || !rating || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}

            Отправить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ==========================================================================
   EDIT MODAL
   ========================================================================== */

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
  const [comment, setComment] = useState(feedback.comment ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };

    document.addEventListener('keydown', handler);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, saving]);

  const submit = async () => {
    setSaving(true);

    try {
      const data: FeedbackUpdateInput = {};

      if (rating !== feedback.rating) {
        data.rating = rating;
      }

      const newComment = comment.trim();
      const oldComment = (feedback.comment || '').trim();

      if (newComment !== oldComment) {
        data.comment = newComment || undefined;
      }

      if (Object.keys(data).length > 0) {
        await feedbacksApi.update(feedback.id, data);
      }

      toast({ title: 'Отзыв обновлён' });
      onUpdated();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: apiErr(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-5">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Редактировать отзыв
          </h2>

          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-xl p-2 text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <label className="mb-3 block text-sm font-medium text-[var(--text-primary)]/65">
              Оценка
            </label>

            <div className="flex flex-col items-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-6">
              <StarRating
                value={rating}
                onChange={setRating}
                size="xl"
                showLabel
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]/65">
              Комментарий
            </label>

            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-xl bg-[var(--hover-2)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)]/65 hover:bg-[var(--hover-3)] disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={!rating || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-light)] disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            Сохранить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ==========================================================================
   DELETE MODAL
   ========================================================================== */

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
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onClose();
    };

    document.addEventListener('keydown', handler);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, deleting]);

  const confirm = async () => {
    setDeleting(true);

    try {
      await feedbacksApi.delete(feedback.id);

      toast({ title: 'Отзыв удалён' });
      onDeleted();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: apiErr(error),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !deleting && onClose()}
      />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <Trash2 className="h-5 w-5 text-red-400" />
          </div>

          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            Удалить отзыв?
          </h3>

          <p className="mt-2 text-sm text-[var(--text-primary)]/50">
            Отзыв с оценкой {feedback.rating} из 5 будет удалён.
          </p>
        </div>

        <div className="flex gap-3 border-t border-[var(--border-color)] p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-xl bg-[var(--hover-2)] px-4 py-3 text-sm text-[var(--text-primary)]/70 disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}

            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   FEEDBACK CARD
   ========================================================================== */

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
  userMap: Map<string, UserOption>;
  currentUserId?: string;
  isStaff: boolean;
  onEdit: (feedback: Feedback) => void;
  onDelete: (feedback: Feedback) => void;
}) {
  const author = userMap.get(feedback.author_id);
  const ticket = ticketMap.get(feedback.ticket_id);

  const canManage =
    isStaff ||
    feedback.author_id === currentUserId;

  const authorName =
    author?.full_name ||
    author?.username ||
    author?.email ||
    'Пользователь';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="
        group flex h-full flex-col
        rounded-2xl
        border border-[var(--border-color)]
        bg-[var(--bg-card)]
        p-6
        shadow-sm
        transition-colors
        hover:border-[var(--border-hover)]
      "
    >
      {/* AUTHOR */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
              {initials(authorName)}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--text-primary)]">
              {authorName}
            </p>

            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-primary)]/40">
              <Calendar className="h-3.5 w-3.5" />
              {fmtDate(feedback.created_at)}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(feedback)}
              title="Редактировать отзыв"
              className="rounded-lg p-2 text-[var(--text-primary)]/45 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(feedback)}
              title="Удалить отзыв"
              className="rounded-lg p-2 text-[var(--text-primary)]/45 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* RATING */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <StarRating
          value={feedback.rating}
          readonly
          size="md"
        />

        <span className="text-sm font-medium text-[var(--text-primary)]/60">
          {RATING_LABELS[feedback.rating]}
        </span>
      </div>

      {/* COMMENT */}
      <div className="mt-4 flex-1">
        {feedback.comment ? (
          <p className="whitespace-pre-wrap break-words text-base leading-7 text-[var(--text-primary)]/75">
            {feedback.comment}
          </p>
        ) : (
          <p className="text-sm italic text-[var(--text-primary)]/30">
            Без комментария
          </p>
        )}
      </div>

      {/* TICKET */}
      <div className="mt-6 border-t border-[var(--border-color)] pt-4">
        {ticket ? (
          <Link
            to={`/tickets/${ticket.number}`}
            className="group/link flex items-center gap-2 text-sm text-[var(--text-primary)]/55 hover:text-[var(--accent)]"
          >
            <Ticket className="h-4 w-4 shrink-0" />

            <span className="shrink-0 font-mono">
              #{ticket.number}
            </span>

            <span className="min-w-0 flex-1 truncate">
              {ticket.title}
            </span>

            <ArrowUpRight className="h-4 w-4 shrink-0 opacity-50 transition-all group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 group-hover/link:opacity-100" />
          </Link>
        ) : (
          <span className="text-sm text-[var(--text-primary)]/30">
            Заявка не найдена
          </span>
        )}
      </div>
    </motion.article>
  );
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function FeedbacksPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const presetTicketId = searchParams.get('ticket_id') ?? '';

  const isStaff =
    user?.roles?.some((role) =>
      ['admin', 'support_manager', 'support_agent', 'executor'].includes(role),
    ) ?? false;

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [filterTicketId, setFilterTicketId] = useState(presetTicketId);
  const [filterTicketLabel, setFilterTicketLabel] = useState('');
  const [filterAuthorId, setFilterAuthorId] = useState('');
  const [filterAuthorLabel, setFilterAuthorLabel] = useState('');

  const [showRatingFilter, setShowRatingFilter] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [editFeedback, setEditFeedback] = useState<Feedback | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback | null>(null);

  const [userMap, setUserMap] = useState<Map<string, UserOption>>(new Map());
  const [ticketMap, setTicketMap] = useState<
    Map<string, { number: string; title: string }>
  >(new Map());

  const [stats, setStats] = useState({
    avg: 0,
    total: 0,
    distribution: [0, 0, 0, 0, 0] as [
      number,
      number,
      number,
      number,
      number,
    ],
  });

  /* LOAD USERS */

  const loadUsers = useCallback(async () => {
    try {
      const response = await usersApi.getAllUsers(1, 100);

      const map = new Map<string, UserOption>();

      response.items.forEach((item: any) => {
        map.set(item.id, item);
      });

      setUserMap(map);
    } catch {
      // Не блокируем загрузку отзывов
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  /* LOAD TICKET INFO */

  const loadTicketInfo = useCallback(async () => {
    try {
      const response = await ticketsApi.getAllWithFilters(1, 100, {});

      const map = new Map<string, { number: string; title: string }>();

      response.items.forEach((ticket: any) => {
        map.set(ticket.id, {
          number: String(ticket.number),
          title: String(ticket.title || ''),
        });
      });

      setTicketMap(map);
    } catch {
      // Отзывы могут отображаться без данных заявки
    }
  }, []);

  useEffect(() => {
    void loadTicketInfo();
  }, [loadTicketInfo]);

  useEffect(() => {
    if (!filterAuthorId) {
      setFilterAuthorLabel('');
      return;
    }

    const author = userMap.get(filterAuthorId);

    if (author) {
      setFilterAuthorLabel(
        author.full_name || author.username || author.email,
      );
    }
  }, [filterAuthorId, userMap]);

  useEffect(() => {
    if (!filterTicketId) {
      setFilterTicketLabel('');
      return;
    }

    const ticket = ticketMap.get(filterTicketId);

    if (ticket) {
      setFilterTicketLabel(`#${ticket.number} — ${ticket.title}`);
    }
  }, [filterTicketId, ticketMap]);

  /* STATS */

  const loadAllFeedbacksForStats = useCallback(
    async (filters: { ticketId?: string; author_id?: string }) => {
      let currentPage = 1;
      const all: Feedback[] = [];
      let hasNext = true;

      while (hasNext) {
        const response = await feedbacksApi.getAll(
          currentPage,
          100,
          filters,
        );

        all.push(...response.items);
        hasNext = response.has_next;
        currentPage += 1;
      }

      return all;
    },
    [],
  );

  /* FETCH */

  const fetchFeedbacks = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const filters: any = {};

        if (filterRating) filters.rating = filterRating;
        if (filterTicketId) filters.ticketId = filterTicketId;
        if (filterAuthorId) filters.author_id = filterAuthorId;

        const response = await feedbacksApi.getAll(page, 12, filters);

        setFeedbacks(response.items);
        setTotalItems(response.total_items);
        setTotalPages(response.total_pages);

        const statsItems = await loadAllFeedbacksForStats({
          ...(filterTicketId ? { ticketId: filterTicketId } : {}),
          ...(filterAuthorId ? { author_id: filterAuthorId } : {}),
        });

        const distribution: [
          number,
          number,
          number,
          number,
          number,
        ] = [0, 0, 0, 0, 0];

        let sum = 0;

        statsItems.forEach((feedback) => {
          if (feedback.rating >= 1 && feedback.rating <= 5) {
            distribution[feedback.rating - 1] += 1;
            sum += feedback.rating;
          }
        });

        setStats({
          avg: statsItems.length > 0 ? sum / statsItems.length : 0,
          total: statsItems.length,
          distribution,
        });
      } catch (error: any) {
        toast({
          title: 'Ошибка загрузки',
          description: apiErr(error),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      page,
      filterRating,
      filterTicketId,
      filterAuthorId,
      toast,
      loadAllFeedbacksForStats,
    ],
  );

  useEffect(() => {
    void fetchFeedbacks();
  }, [fetchFeedbacks]);

  const refresh = () => {
    void fetchFeedbacks(true);
  };

  const resetFilters = () => {
    setFilterRating(null);
    setFilterTicketId('');
    setFilterTicketLabel('');
    setFilterAuthorId('');
    setFilterAuthorLabel('');
    setPage(1);
  };

  const hasActiveFilters =
    !!filterRating ||
    !!filterTicketId ||
    !!filterAuthorId;

  const pageNumbers = (() => {
    const pages: number[] = [];
    const total = Math.min(totalPages, 7);

    for (let index = 0; index < total; index++) {
      let number: number;

      if (totalPages <= 7) {
        number = index + 1;
      } else if (page <= 4) {
        number = index + 1;
      } else if (page >= totalPages - 3) {
        number = totalPages - 6 + index;
      } else {
        number = page - 3 + index;
      }

      pages.push(number);
    }

    return pages;
  })();

  /* RENDER */

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Отзывы
            </h1>

            {!loading && (
              <span className="rounded-lg bg-[var(--hover-2)] px-2.5 py-1 text-sm font-medium tabular-nums text-[var(--text-primary)]/50">
                {totalItems}
              </span>
            )}
          </div>

          <p className="mt-2 text-base text-[var(--text-primary)]/45">
            Оценки качества работы по закрытым заявкам
          </p>
        </div>

        <ActionButton
          type="button"
          onClick={() => setShowCreate(true)}
          className="self-start px-6 py-3 text-base font-semibold"
        >
          <Plus className="h-5 w-5" />
          Оставить отзыв
        </ActionButton>
      </div>

      {/* FILTERS */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-[280px]">
            <TicketSelect
              value={filterTicketId}
              label={filterTicketLabel}
              onChange={(id, label) => {
                setFilterTicketId(id);
                setFilterTicketLabel(label);
                setPage(1);
              }}
              placeholder="Все заявки"
            />
          </div>

          {isStaff && (
            <div className="w-full sm:w-[240px]">
              <AuthorSelect
                value={filterAuthorId}
                label={filterAuthorLabel}
                onChange={(id, label) => {
                  setFilterAuthorId(id);
                  setFilterAuthorLabel(label);
                  setPage(1);
                }}
              />
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRatingFilter((prev) => !prev)}
              className={`
                flex h-[50px] items-center gap-2 rounded-xl border px-4
                text-sm font-medium transition-colors
                ${
                  filterRating
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                    : 'border-[var(--border-color)] bg-[var(--hover-2)] text-[var(--text-primary)]/65 hover:bg-[var(--hover-3)]'
                }
              `}
            >
              <Filter className="h-4 w-4" />

              {filterRating ? `${filterRating} звёзд` : 'Все оценки'}

              <ChevronDown className="h-4 w-4" />
            </button>

            {showRatingFilter && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowRatingFilter(false)}
                />

                <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterRating(null);
                      setPage(1);
                      setShowRatingFilter(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]"
                  >
                    Все оценки
                    {!filterRating && (
                      <Check className="h-4 w-4 text-emerald-500" />
                    )}
                  </button>

                  {[5, 4, 3, 2, 1].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => {
                        setFilterRating(rating);
                        setPage(1);
                        setShowRatingFilter(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--hover-2)]"
                    >
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            className={`h-3.5 w-3.5 ${
                              index < rating
                                ? 'fill-emerald-500 text-emerald-500'
                                : 'text-[var(--text-primary)]/15'
                            }`}
                          />
                        ))}
                      </span>

                      <span className="flex-1 text-xs text-[var(--text-primary)]/65">
                        {RATING_LABELS[rating]}
                      </span>

                      {filterRating === rating && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="h-[50px] rounded-xl border border-[var(--border-color)] px-4 text-sm text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Сбросить
          </button>

          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            title="Обновить"
            className="flex h-[50px] w-[50px] items-center justify-center rounded-xl border border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)] disabled:opacity-30"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* FEEDBACKS */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Список отзывов
              </h2>

              <p className="mt-1 text-sm text-[var(--text-primary)]/40">
                {totalItems} отзывов
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-[var(--border-color)] py-24">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-color)] px-6 py-20 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-[var(--text-primary)]/20" />

              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
                Отзывов пока нет
              </h3>

              <p className="mt-2 text-sm text-[var(--text-primary)]/45">
                {hasActiveFilters
                  ? 'Попробуйте изменить параметры фильтрации'
                  : 'Оставьте первый отзыв по закрытой заявке'}
              </p>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 rounded-xl bg-[var(--hover-2)] px-5 py-2.5 text-sm text-[var(--text-primary)]/65 hover:bg-[var(--hover-3)]"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {feedbacks.map((feedback) => (
                    <FeedbackCard
                      key={feedback.id}
                      feedback={feedback}
                      ticketMap={ticketMap}
                      userMap={userMap}
                      currentUserId={user?.user_id}
                      isStaff={isStaff}
                      onEdit={setEditFeedback}
                      onDelete={setDeleteFeedback}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="rounded-xl bg-[var(--hover-2)] p-2.5 text-[var(--text-primary)]/60 disabled:opacity-20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {pageNumbers.map((number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      className={`h-10 w-10 rounded-xl text-sm font-medium ${
                        page === number
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-3)]'
                      }`}
                    >
                      {number}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={page === totalPages}
                    className="rounded-xl bg-[var(--hover-2)] p-2.5 text-[var(--text-primary)]/60 disabled:opacity-20"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* STATISTICS */}
        <aside className="xl:sticky xl:top-5">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-5 w-5 text-[var(--text-primary)]/45" />

              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Статистика оценок
              </h2>
            </div>

            {stats.total > 0 ? (
              <>
                <div className="mt-7 border-b border-[var(--border-color)] pb-6">
                  <p className="text-sm text-[var(--text-primary)]/45">
                    Средняя оценка
                  </p>

                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-bold leading-none text-[var(--text-primary)] tabular-nums">
                      {stats.avg.toFixed(1)}
                    </span>

                    <span className="mb-1 text-base text-[var(--text-primary)]/40">
                      / 5
                    </span>
                  </div>

                  <div className="mt-4">
                    <StarRating
                      value={Math.round(stats.avg)}
                      readonly
                      size="md"
                    />
                  </div>

                  <p className="mt-3 text-sm text-[var(--text-primary)]/40">
                    На основе {stats.total} отзывов
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <p className="text-sm font-medium text-[var(--text-primary)]/65">
                    Распределение оценок
                  </p>

                  {[5, 4, 3, 2, 1].map((star) => (
                    <RatingBar
                      key={star}
                      star={star}
                      count={stats.distribution[star - 1]}
                      total={stats.total}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-6 text-sm text-[var(--text-primary)]/40">
                Пока нет данных для статистики
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {showCreate && (
          <CreateFeedbackModal
            presetTicketId={presetTicketId || undefined}
            presetTicketLabel={presetTicketId ? filterTicketLabel : undefined}
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              void fetchFeedbacks();
            }}
          />
        )}
      </AnimatePresence>

      {editFeedback && (
        <EditFeedbackModal
          feedback={editFeedback}
          onClose={() => setEditFeedback(null)}
          onUpdated={() => {
            setEditFeedback(null);
            void fetchFeedbacks();
          }}
        />
      )}

      {deleteFeedback && (
        <DeleteFeedbackModal
          feedback={deleteFeedback}
          onClose={() => setDeleteFeedback(null)}
          onDeleted={() => {
            setDeleteFeedback(null);
            void fetchFeedbacks();
          }}
        />
      )}
    </div>
  );
}