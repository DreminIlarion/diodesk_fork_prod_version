import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, Phone, Mail, Users, FileText, Clock,
  Edit, Trash2, Plus, User, MessageSquare, Loader2, ExternalLink, Calendar,
  Hash, CheckCircle2, Briefcase, CreditCard, MapPinned, AtSign,
  PhoneCall, UserPlus, Ticket, History, Info, UserCheck,
  Package, Server, Globe, Smartphone, Monitor, Cpu, Code, HelpCircle,
  X, Tag, Link2, Layers, RefreshCcw, AlertTriangle,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, GitBranch, AlertCircle,
  FolderOpen,
} from 'lucide-react';
import {
  counterpartiesApi,
  ticketsApi,
  productsApi,
  projectsApi,
  contractsApi,
} from '../api/client';
import type {
  Counterparty,
  CounterpartyCustomer,
  TicketListItem,
  Project,
} from '../types';

// ─── Phone mask ───────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  let d = digits;

  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;

  d = d.slice(0, 11);

  let out = '+7';

  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length >= 4) out += ') ' + d.slice(4, 7);
  if (d.length >= 7) out += '-' + d.slice(7, 9);
  if (d.length >= 9) out += '-' + d.slice(9, 11);

  return out;
}

function phoneToApi(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');

  if (!digits) return '';

  if (digits.startsWith('7')) {
    return '8' + digits.slice(1);
  }

  return digits;
}

function PhoneInput({
  value,
  onChange,
  placeholder = '+7 (999) 123-45-67',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="tel"
      value={value}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(formatPhone(digits));
      }}
      onKeyDown={e => {
        if (e.key === 'Backspace') {
          const digits = value.replace(/\D/g, '');

          if (digits.length > 0) {
            onChange(
              digits.length <= 1
                ? ''
                : formatPhone(digits.slice(0, -1)),
            );
            e.preventDefault();
          }
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function Avatar({
  name,
  size = 'md',
}: {
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  return (
    <div
      className={`${cls} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}
    >
      {getInitials(name)}
    </div>
  );
}

const shouldShowKpp = (type?: string) =>
  type === 'Юридическое лицо' ||
  type === 'Обособленное подразделение';

const inputCls = `
  w-full px-4 py-3
  bg-[var(--hover-2)]
  border border-[var(--border-color)]
  rounded-xl
  text-[var(--text-primary)] text-base
  placeholder-white/25
  focus:outline-none
  focus:border-[var(--accent)]/30
  focus:ring-2
  focus:ring-[var(--accent-ring)]
  transition-all
`;

const inputWithIconCls = `
  w-full pl-10 pr-4 py-3
  bg-[var(--hover-2)]
  border border-[var(--border-color)]
  rounded-xl
  text-[var(--text-primary)] text-base
  placeholder-white/25
  focus:outline-none
  focus:border-[var(--accent)]/30
  focus:ring-2
  focus:ring-[var(--accent-ring)]
  transition-all
`;

// ─── Продукты: константы ──────────────────────────────────────────────────────

const PRODUCT_CATEGORIES = [
  {
    value: 'ERP',
    label: 'ERP',
    icon: Server,
    color: 'text-[var(--warning)]',
    bg: 'bg-orange-500/10',
  },
  {
    value: 'WEB',
    label: 'Web',
    icon: Globe,
    color: 'text-[var(--info)]',
    bg: 'bg-blue-500/10',
  },
  {
    value: 'MOBILE',
    label: 'Mobile',
    icon: Smartphone,
    color: 'text-[var(--success)]',
    bg: 'bg-[var(--success)]/8',
  },
  {
    value: 'API',
    label: 'API',
    icon: Code,
    color: 'text-[var(--info)]',
    bg: 'bg-violet-500/10',
  },
  {
    value: 'DESKTOP',
    label: 'Desktop',
    icon: Monitor,
    color: 'text-[var(--info)]',
    bg: 'bg-cyan-500/10',
  },
  {
    value: 'HARDWARE',
    label: 'Hardware',
    icon: Cpu,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    value: 'OTHER',
    label: 'Прочее',
    icon: HelpCircle,
    color: 'text-[var(--text-primary)]/50',
    bg: 'bg-[var(--hover-2)]',
  },
] as const;

const ENVIRONMENTS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'testing', label: 'Testing' },
  { value: 'development', label: 'Development' },
] as const;

const PRODUCT_STATUSES = [
  {
    value: 'active',
    label: 'Активный',
    dot: 'bg-emerald-400',
    color: 'text-emerald-400',
  },
  {
    value: 'beta',
    label: 'Бета',
    dot: 'bg-blue-400',
    color: 'text-[var(--info)]',
  },
  {
    value: 'deprecated',
    label: 'Устаревший',
    dot: 'bg-[var(--hover-1)]',
    color: 'text-[var(--text-primary)]/40',
  },
] as const;

const catMeta = (v: string) =>
  PRODUCT_CATEGORIES.find(c => c.value === v);

const statusMeta = (v: string) =>
  PRODUCT_STATUSES.find(s => s.value === v);

const statusLabel = (v: string) =>
  statusMeta(v)?.label ?? v;

const statusDot = (s: string) =>
  statusMeta(s)?.dot ?? 'bg-[var(--hover-1)]';

const envLabel = (v: string) =>
  ENVIRONMENTS.find(e => e.value === v)?.label ?? v;

const envBadgeClass = (e: string) => {
  if (e === 'production') {
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }

  if (e === 'staging') {
    return 'bg-yellow-500/10 text-[var(--warning)] border border-[var(--warning)]/15';
  }

  if (e === 'testing') {
    return 'bg-blue-500/10 text-[var(--info)] border border-blue-500/20';
  }

  if (e === 'development') {
    return 'bg-purple-500/10 text-[var(--info)] border border-[var(--info)]/15';
  }

  return 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border border-white/10';
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  license_type: 'Лицензия',
  environment: 'Среда',
  db_connection_ref: 'БД',
  modules_enabled: 'Модули',
  max_concurrent_users: 'Макс. пользователей',
  base_url: 'URL',
  admin_url: 'Админ',
  hosting_provider: 'Хостинг',
  tech_stack: 'Стек',
  ssl_expiry_date: 'SSL до',
  cdn_enabled: 'CDN',
  platform: 'Платформа',
  auth_method: 'Авторизация',
};

const getAttrLabel = (k: string) =>
  ATTRIBUTE_LABELS[k] || k.replace(/_/g, ' ');

const formatAttrValue = (v: any): string => {
  if (v === true) return 'Да';
  if (v === false) return 'Нет';
  if (Array.isArray(v)) return v.join(', ');

  return String(v);
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  pending_approval: 'На согласовании',
  open: 'Открыт',
  in_progress: 'В работе',
  waiting: 'Ожидает ответа',
  resolved: 'Решён',
  closed: 'Закрыт',
  reopened: 'Переоткрыт',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
};

const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

// ─── Модалка удаления ─────────────────────────────────────────────────────────

function DeleteModal({
  title,
  name,
  loading,
  onConfirm,
  onClose,
}: {
  title?: string;
  name: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      <div
        className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="pt-8 flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/15 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-[var(--accent)]" />
          </div>
        </div>

        <div className="px-7 pt-5 pb-2 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">
            {title || 'Удалить?'}
          </h2>

          <p className="text-base text-[var(--text-primary)]/60 leading-relaxed">
            <span className="text-[var(--text-primary)] font-semibold">
              «{name}»
            </span>{' '}
            будет удалён. Это действие нельзя отменить.
          </p>
        </div>

        <div className="flex gap-3 p-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/30 text-[var(--accent)] text-base font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}

            {loading ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Модалка редактирования контрагента ──────────────────────────────────────

function EditCounterpartyModal({
  counterparty,
  onSave,
  onClose,
}: {
  counterparty: Counterparty;
  onSave: (data: Counterparty) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: counterparty.name || '',
    legal_name: counterparty.legal_name || '',
    okpo: counterparty.okpo || '',
    phone: counterparty.phone
      ? formatPhone(counterparty.phone.replace(/\D/g, ''))
      : '',
    email: counterparty.email || '',
    address: counterparty.address || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };

    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const set = (f: string) => (v: string) =>
    setForm(p => ({
      ...p,
      [f]: v,
    }));

  const handleSave = async () => {
    if (
      !form.last_name.trim() ||
      !form.first_name.trim()
    ) {
      return;
    }

    setSaving(true);

    try {
      const messengers: Record<string, string> = {};

      if (form.telegram.trim()) {
        messengers.telegram = form.telegram
          .trim()
          .replace('@', '');
      }

      if (form.vk.trim()) {
        messengers.vk = form.vk.trim();
      }

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name:
          form.middle_name.trim() || undefined,
        phone: form.phone.trim()
          ? phoneToApi(form.phone)
          : undefined,
        extension:
          form.extension.trim() || undefined,
        position:
          form.position.trim() || undefined,
        email:
          form.email.trim() || undefined,
        messengers:
          Object.keys(messengers).length > 0
            ? messengers
            : undefined,
      };

      console.group('📤 [ContactsTab] POST /contact-persons');
      console.log('counterpartyId:', counterpartyId);
      console.log('form state:', form);
      console.log('payload (will be sent):', payload);
      console.log('payload JSON:', JSON.stringify(payload));
      console.groupEnd();

      const res = await counterpartiesApi.updateContactPerson(
        counterpartyId,
        payload,
      );

      console.group('📥 [ContactsTab] response from /contact-persons');
      console.log('response:', res);
      console.groupEnd();

      resetForm();
      onRefresh();
    } catch (e: any) {
      console.group('❌ [ContactsTab] error on /contact-persons');
      console.error('error:', e);
      console.log('status:', e?.response?.status);
      console.log('response data:', e?.response?.data);
      console.log(
        'response data (stringified):',
        JSON.stringify(e?.response?.data, null, 2),
      );
      console.groupEnd();
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

      <div
        className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
            <Edit
              size={18}
              className="text-[var(--accent)]"
            />
            Редактировать контрагента
          </h2>

          <button
            onClick={() => !saving && onClose()}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl text-sm text-[var(--accent)] flex items-center gap-2">
              <AlertTriangle
                size={15}
                className="flex-shrink-0"
              />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Название{' '}
              <span className="text-[var(--accent)]">*</span>
            </label>

            <input
              value={form.name}
              onChange={e => set('name')(e.target.value)}
              placeholder="Название"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Полное наименование
            </label>

            <input
              value={form.legal_name}
              onChange={e => set('legal_name')(e.target.value)}
              placeholder="ООО «Название»"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              ОКПО
            </label>

            <input
              value={form.okpo}
              onChange={e =>
                set('okpo')(
                  e.target.value
                    .replace(/\D/g, '')
                    .slice(0, 10),
                )
              }
              placeholder="12345678"
              className={inputCls}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                Телефон
              </label>

              <div className="relative">
                <Phone
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                />

                <PhoneInput
                  value={form.phone}
                  onChange={set('phone')}
                  className={inputWithIconCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                Email
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                />

                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email')(e.target.value)}
                  placeholder="email@company.ru"
                  className={inputWithIconCls}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Адрес
            </label>

            <div className="relative">
              <MapPinned
                size={16}
                className="absolute left-3.5 top-3.5 text-[var(--text-primary)]/25 pointer-events-none"
              />

              <textarea
                value={form.address}
                onChange={e => set('address')(e.target.value)}
                placeholder="г. Москва, ..."
                rows={2}
                className="w-full pl-10 pr-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-white/25 resize-none focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-5 border-t border-[var(--border-color)]">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-white text-base font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {saving ? (
              <Loader2
                size={16}
                className="animate-spin"
              />
            ) : (
              <CheckCircle2 size={16} />
            )}

            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Вкладка контактных лиц ───────────────────────────────────────────────────

function ContactsTab({
  counterpartyId,
  persons,
  onRefresh,
}: {
  counterpartyId: string;
  persons: any[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    last_name: '',
    first_name: '',
    middle_name: '',
    phone: '',
    extension: '',
    position: '',
    email: '',
    telegram: '',
    vk: '',
  });

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = (f: string) => (v: string) =>
    setForm(p => ({
      ...p,
      [f]: v,
    }));

  const resetForm = () => {
    setForm({
      last_name: '',
      first_name: '',
      middle_name: '',
      phone: '',
      extension: '',
      position: '',
      email: '',
      telegram: '',
      vk: '',
    });

    setShowForm(false);
  };

  const handleSave = async () => {
    if (
      !form.last_name.trim() ||
      !form.first_name.trim()
    ) {
      return;
    }

    setSaving(true);

    try {
      const messengers: Record<string, string> = {};

      if (form.telegram.trim()) {
        messengers.telegram = form.telegram
          .trim()
          .replace('@', '');
      }

      if (form.vk.trim()) {
        messengers.vk = form.vk.trim();
      }

      await counterpartiesApi.updateContactPerson(
        counterpartyId,
        {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          middle_name:
            form.middle_name.trim() || undefined,
          phone: form.phone.trim()
            ? phoneToApi(form.phone)
            : undefined,
          extension:
            form.extension.trim() || undefined,
          position:
            form.position.trim() || undefined,
          email:
            form.email.trim() || undefined,
          messengers:
            Object.keys(messengers).length > 0
              ? messengers
              : undefined,
        },
      );

      resetForm();
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (person: any) => {
    if (!person.phone && !person.email) return;

    setDeleting(true);

    try {
      await counterpartiesApi.deleteContactPerson(
        counterpartyId,
        {
          phone: person.phone,
          email: person.email,
        },
      );

      setConfirmDelete(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">

      {/* ============================================================
        HEADER
    ============================================================ */}
      <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserCheck
            size={18}
            className="text-[var(--text-primary)]/40 shrink-0"
          />

          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Контактные лица
          </h2>

          {persons.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
              {persons.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setConfirmDelete(null);
              setShowForm(true);
            }
          }}
          className={`
          flex items-center gap-2
          px-3.5 py-2
          rounded-xl
          text-sm font-medium
          transition-colors
          shrink-0

          ${showForm
              ? 'bg-[var(--hover-2)] text-[var(--text-primary)]/70 hover:bg-[var(--hover-3)]'
              : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 shadow-md'
            }
        `}
        >
          {showForm ? (
            <X size={16} />
          ) : (
            <Plus size={16} />
          )}

          <span className="hidden sm:inline">
            {showForm ? 'Отмена' : 'Добавить'}
          </span>
        </button>
      </div>

      {/* ============================================================
        CONTENT
    ============================================================ */}
      <div className="p-4 sm:p-6">

        {/* ==========================================================
          ADD FORM
      ========================================================== */}
        {showForm && (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5 sm:p-6 mb-6">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                <UserPlus
                  size={17}
                  className="text-[var(--accent)]"
                />
              </div>

              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Новое контактное лицо
                </h3>

                <p className="text-xs text-[var(--text-primary)]/35 mt-0.5">
                  Укажите данные сотрудника
                </p>
              </div>
            </div>

            <div className="space-y-5">

              {/* ФИО */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                      Фамилия{' '}
                      <span className="text-[var(--accent)]">*</span>
                    </label>

                    <input
                      value={form.last_name}
                      onChange={(e) =>
                        set('last_name')(e.target.value)
                      }
                      placeholder="Иванов"
                      autoComplete="family-name"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                      Имя{' '}
                      <span className="text-[var(--accent)]">*</span>
                    </label>

                    <input
                      value={form.first_name}
                      onChange={(e) =>
                        set('first_name')(e.target.value)
                      }
                      placeholder="Иван"
                      autoComplete="given-name"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                      Отчество
                    </label>

                    <input
                      value={form.middle_name}
                      onChange={(e) =>
                        set('middle_name')(e.target.value)
                      }
                      placeholder="Иванович"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* Должность */}
              <div>
                <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                  Должность
                </label>

                <input
                  value={form.position}
                  onChange={(e) =>
                    set('position')(e.target.value)
                  }
                  placeholder="Главный бухгалтер"
                  autoComplete="organization-title"
                  className={inputCls}
                />
              </div>

              {/* Телефон + добавочный */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_170px] gap-3">
                <div>
                  <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                    Телефон
                  </label>

                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                    />

                    <PhoneInput
                      value={form.phone}
                      onChange={set('phone')}
                      className={inputWithIconCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                    Добавочный
                  </label>

                  <input
                    value={form.extension}
                    onChange={(e) =>
                      set('extension')(
                        e.target.value.replace(/\D/g, ''),
                      )
                    }
                    placeholder="1234"
                    inputMode="numeric"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                  Email
                </label>

                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                  />

                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      set('email')(e.target.value)
                    }
                    placeholder="contact@company.ru"
                    autoComplete="email"
                    className={inputWithIconCls}
                  />
                </div>
              </div>

              {/* Мессенджеры */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                    Telegram
                  </label>

                  <div className="relative">
                    <MessageSquare
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                    />

                    <input
                      value={form.telegram}
                      onChange={(e) =>
                        set('telegram')(e.target.value)
                      }
                      placeholder="username"
                      className={inputWithIconCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                    ВКонтакте
                  </label>

                  <div className="relative">
                    <Globe
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                    />

                    <input
                      value={form.vk}
                      onChange={(e) =>
                        set('vk')(e.target.value)
                      }
                      placeholder="id или username"
                      className={inputWithIconCls}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="
                px-5 py-2.5
                rounded-xl
                bg-[var(--hover-2)]
                hover:bg-[var(--hover-3)]
                text-[var(--text-primary)]/70
                text-sm font-medium
                transition-colors
                disabled:opacity-50
              "
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  !form.last_name.trim() ||
                  !form.first_name.trim()
                }
                className="
                min-w-[135px]
                flex items-center justify-center gap-2
                px-5 py-2.5
                rounded-xl
                bg-[var(--accent)]
                hover:bg-[var(--accent)]/90
                text-white
                text-sm font-medium
                transition-colors
                disabled:opacity-40
                disabled:cursor-not-allowed
                shadow-md
              "
              >
                {saving ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <CheckCircle2 size={16} />
                )}

                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}

        {/* ==========================================================
          EMPTY
      ========================================================== */}
        {persons.length === 0 && !showForm ? (
          <div className="text-center py-14 sm:py-16">
            <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center">
              <User
                size={23}
                className="text-[var(--text-primary)]/20"
              />
            </div>

            <p className="text-[var(--text-primary)]/60 text-base font-semibold">
              Контактных лиц пока нет
            </p>

            <p className="text-[var(--text-primary)]/35 text-sm mt-1 mb-5">
              Добавьте сотрудника для связи с контрагентом
            </p>

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors text-sm font-medium"
            >
              <Plus size={15} />
              Добавить контакт
            </button>
          </div>
        ) : (
          /* ========================================================
              CONTACT LIST
          ======================================================== */
          persons.length > 0 && (
            <div className="space-y-3">
              {persons.map((person, i) => {
                const telegram =
                  person.messengers?.telegram?.replace('@', '');

                const isConfirmingDelete =
                  confirmDelete === person;

                return (
                  <div
                    key={person.id || `${person.full_name}-${i}`}
                    className="
                    rounded-2xl
                    border border-[var(--border-color)]
                    bg-[var(--hover-1)]
                    overflow-hidden
                  "
                  >
                    {/* -----------------------------------------------
                      Person header
                  ----------------------------------------------- */}
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <Avatar
                          name={person.full_name}
                          size="md"
                        />

                        <div className="min-w-0 pt-0.5">
                          <p className="text-base font-semibold text-[var(--text-primary)] break-words">
                            {person.full_name}
                          </p>


                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete(
                            isConfirmingDelete
                              ? null
                              : person,
                          )
                        }
                        disabled={deleting}
                        className="
                        p-2
                        rounded-xl
                        text-[var(--text-primary)]/30
                        hover:text-[var(--accent)]
                        hover:bg-[var(--accent)]/10
                        transition-colors
                        disabled:opacity-40
                        shrink-0
                      "
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* -----------------------------------------------
                      Delete confirmation
                  ----------------------------------------------- */}
                    {isConfirmingDelete && (
                      <div className="mx-4 mb-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            size={18}
                            className="text-[var(--accent)] mt-0.5 shrink-0"
                          />

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              Удалить контактное лицо?
                            </p>

                            <p className="text-xs text-[var(--text-primary)]/45 mt-1">
                              {person.full_name} будет удалён из списка контактов.
                            </p>

                            <div className="flex items-center gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDelete(null)
                                }
                                disabled={deleting}
                                className="
                                px-3 py-2
                                rounded-lg
                                bg-[var(--hover-2)]
                                hover:bg-[var(--hover-3)]
                                text-xs font-medium
                                text-[var(--text-primary)]/65
                                disabled:opacity-50
                              "
                              >
                                Отмена
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete(person)
                                }
                                disabled={deleting}
                                className="
                                inline-flex items-center gap-1.5
                                px-3 py-2
                                rounded-lg
                                bg-[var(--accent)]/15
                                hover:bg-[var(--accent)]/25
                                text-xs font-medium
                                text-[var(--accent)]
                                disabled:opacity-50
                              "
                              >
                                {deleting ? (
                                  <Loader2
                                    size={13}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                                Удалить
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* -----------------------------------------------
                      Contact details
                  ----------------------------------------------- */}
                    <div className="border-t border-[var(--border-color)] px-5 py-2">


                      {/* Position */}
                      {person.position && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[48px] py-2">
                          <div className="flex items-center gap-2 sm:w-32 shrink-0">
                            <UserCheck
                              size={15}
                              className="text-[var(--text-primary)]/35"
                            />

                            <span className="text-sm text-[var(--text-primary)]/40">
                              Должность
                            </span>
                          </div>

                          <div className="sm:pl-0 pl-[23px] min-w-0">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {person.position}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Phone */}
                      {person.phone && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[48px] py-2">
                          <div className="flex items-center gap-2 sm:w-32 shrink-0">
                            <Phone
                              size={15}
                              className="text-[var(--text-primary)]/35"
                            />

                            <span className="text-sm text-[var(--text-primary)]/40">
                              Телефон
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap sm:pl-0 pl-[23px] min-w-0">
                            <a
                              href={`tel:${person.phone}`}
                              className="
                              text-sm font-medium
                              text-[var(--text-primary)]
                              hover:text-[var(--accent)]
                              transition-colors
                            "
                            >
                              {person.phone}
                            </a>

                            {person.extension && (
                              <span
                                className="
                                inline-flex items-center
                                px-2 py-0.5
                                rounded-md
                                border border-[var(--border-color)]
                                bg-[var(--hover-3)]
                                text-xs font-semibold
                                text-[var(--text-primary)]/85
                              "
                              >
                                доб. {person.extension}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Email */}
                      {person.email && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[48px] py-2">
                          <div className="flex items-center gap-2 sm:w-32 shrink-0">
                            <Mail
                              size={15}
                              className="text-[var(--text-primary)]/35"
                            />

                            <span className="text-sm text-[var(--text-primary)]/40">
                              Email
                            </span>
                          </div>

                          <div className="sm:pl-0 pl-[23px] min-w-0">
                            <a
                              href={`mailto:${person.email}`}
                              className="
                              text-sm font-medium
                              text-[var(--text-primary)]
                              hover:text-[var(--accent)]
                              transition-colors
                              break-all
                            "
                            >
                              {person.email}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Telegram */}
                      {telegram && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[48px] py-2">
                          <div className="flex items-center gap-2 sm:w-32 shrink-0">
                            <MessageSquare
                              size={15}
                              className="text-[var(--text-primary)]/35"
                            />

                            <span className="text-sm text-[var(--text-primary)]/40">
                              Telegram
                            </span>
                          </div>

                          <div className="sm:pl-0 pl-[23px] min-w-0">
                            <a
                              href={`https://t.me/${telegram}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="
                              inline-flex items-center gap-1.5
                              text-sm font-medium
                              text-[var(--text-primary)]
                              hover:text-[var(--accent)]
                              transition-colors
                            "
                            >
                              @{telegram}

                              <ExternalLink
                                size={12}
                                className="text-[var(--text-primary)]/30"
                              />
                            </a>
                          </div>
                        </div>
                      )}

                      {/* VK */}
                      {person.messengers?.vk && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[48px] py-2">
                          <div className="flex items-center gap-2 sm:w-32 shrink-0">
                            <Globe
                              size={15}
                              className="text-[var(--text-primary)]/35"
                            />

                            <span className="text-sm text-[var(--text-primary)]/40">
                              ВКонтакте
                            </span>
                          </div>

                          <div className="sm:pl-0 pl-[23px] min-w-0">
                            <a
                              href={`https://vk.com/${person.messengers.vk}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="
                              inline-flex items-center gap-1.5
                              text-sm font-medium
                              text-[var(--text-primary)]
                              hover:text-[var(--accent)]
                              transition-colors
                              break-all
                            "
                            >
                              {person.messengers.vk}

                              <ExternalLink
                                size={12}
                                className="text-[var(--text-primary)]/30"
                              />
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Если вообще нет способов связи */}
                      {!person.phone &&
                        !person.email &&
                        !telegram &&
                        !person.messengers?.vk && (
                          <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-primary)]/30">
                            <AlertCircle size={15} />
                            Контактные данные не указаны
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Вкладка подразделений ───────────────────────────────────────────────────

function BranchesTab({
  counterpartyId,
  counterpartyName,
}: {
  counterpartyId: string;
  counterpartyName: string;
}) {
  const navigate = useNavigate();

  const [branches, setBranches] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    kpp: '',
    okpo: '',
    phone: '',
    email: '',
    address: '',
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res =
        await counterpartiesApi.getBranches(counterpartyId);

      setBranches(res);
    } catch {
      setError('Не удалось загрузить подразделения');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (f: string) => (v: string) =>
    setForm(p => ({
      ...p,
      [f]: v,
    }));

  const resetForm = () => {
    setForm({
      name: '',
      legal_name: '',
      kpp: '',
      okpo: '',
      phone: '',
      email: '',
      address: '',
    });

    setShowForm(false);
    setFormError(null);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;

    setSaving(true);
    setFormError(null);

    try {
      const payload: any = {
        name: form.name.trim(),
      };

      if (form.legal_name.trim()) {
        payload.legal_name = form.legal_name.trim();
      }

      if (form.kpp.trim()) {
        payload.kpp = form.kpp.trim();
      }

      if (form.okpo.trim()) {
        payload.okpo = form.okpo.trim();
      }

      if (form.phone.trim()) {
        payload.phone = phoneToApi(form.phone);
      }

      if (form.email.trim()) {
        payload.email = form.email.trim();
      }

      if (form.address.trim()) {
        payload.address = form.address.trim();
      }

      await counterpartiesApi.createBranch(
        counterpartyId,
        payload,
      );

      resetForm();
      load();
    } catch (e: any) {
      setFormError(
        typeof e?.response?.data?.detail === 'string'
          ? e.response.data.detail
          : 'Не удалось создать подразделение',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
          <GitBranch
            size={18}
            className="text-[var(--text-primary)]/40"
          />

          Подразделения

          {branches.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
              {branches.length}
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 transition-colors"
          >
            <RefreshCcw size={16} />
          </button>

          <button
            onClick={() =>
              showForm
                ? resetForm()
                : setShowForm(true)
            }
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-base font-medium transition-all ${showForm
              ? 'bg-[var(--hover-2)] text-[var(--text-primary)]/70'
              : 'bg-[var(--accent)] text-white shadow-md'
              }`}
          >
            {showForm ? (
              <X size={16} />
            ) : (
              <Plus size={16} />
            )}

            {showForm ? 'Отмена' : 'Добавить'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border-b border-[var(--border-color)] bg-[var(--hover-1)] p-6 space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <GitBranch
              size={16}
              className="text-[var(--accent)]"
            />
            Новое подразделение
          </h3>

          <p className="text-sm text-[var(--text-primary)]/40 -mt-2">
            К: {counterpartyName}
          </p>

          {formError && (
            <div className="p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl text-sm text-[var(--accent)] flex items-center gap-2">
              <AlertTriangle
                size={15}
                className="flex-shrink-0"
              />
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Название{' '}
              <span className="text-[var(--accent)]">*</span>
            </label>

            <input
              value={form.name}
              onChange={e =>
                set('name')(e.target.value)
              }
              placeholder="Подразделение в г. Казань"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Полное наименование
            </label>

            <input
              value={form.legal_name}
              onChange={e =>
                set('legal_name')(e.target.value)
              }
              placeholder="ООО «Название»"
              className={inputCls}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                КПП
              </label>

              <input
                value={form.kpp}
                onChange={e =>
                  set('kpp')(
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 9),
                  )
                }
                placeholder="770101001"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                ОКПО
              </label>

              <input
                value={form.okpo}
                onChange={e =>
                  set('okpo')(
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 10),
                  )
                }
                placeholder="12345678"
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                Телефон
              </label>

              <div className="relative">
                <Phone
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                />

                <PhoneInput
                  value={form.phone}
                  onChange={set('phone')}
                  className={inputWithIconCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
                Email
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none"
                />

                <input
                  type="email"
                  value={form.email}
                  onChange={e =>
                    set('email')(e.target.value)
                  }
                  placeholder="branch@company.ru"
                  className={inputWithIconCls}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">
              Адрес
            </label>

            <div className="relative">
              <MapPinned
                size={16}
                className="absolute left-3.5 top-3.5 text-[var(--text-primary)]/25 pointer-events-none"
              />

              <textarea
                value={form.address}
                onChange={e =>
                  set('address')(e.target.value)
                }
                placeholder="г. Казань, ул. Примерная, д. 1"
                rows={2}
                className="w-full pl-10 pr-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-white/25 resize-none focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={resetForm}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50"
            >
              Отмена
            </button>

            <button
              onClick={handleCreate}
              disabled={
                saving || !form.name.trim()
              }
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-white text-base font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {saving ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <GitBranch size={16} />
              )}

              {saving ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--border-color)]">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2
              size={24}
              className="text-[var(--accent)]/40 animate-spin"
            />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-base text-[var(--accent)]">
            {error}
          </div>
        ) : branches.length === 0 && !showForm ? (
          <div className="flex flex-col items-center py-20 text-center px-6">
            <GitBranch
              size={36}
              className="text-[var(--text-primary)]/15 mb-4"
            />

            <p className="text-[var(--text-primary)]/60 text-base font-semibold mb-1">
              Нет подразделений
            </p>

            <p className="text-[var(--text-primary)]/40 text-sm mb-5">
              Добавьте обособленное подразделение
            </p>

            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/15 text-[var(--accent)] text-base font-medium transition-colors"
            >
              <Plus size={16} />
              Добавить подразделение
            </button>
          </div>
        ) : (
          branches.map(branch => (
            <button
              key={branch.id}
              onClick={() =>
                navigate(
                  `/counterparties/${branch.id}`,
                )
              }
              className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-[var(--hover-1)] transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] flex-shrink-0 group-hover:scale-105 transition-transform">
                <Building2 size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                    {branch.name}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0 ${branch.is_active
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border border-[var(--border-color)]'
                      }`}
                  >
                    {branch.is_active
                      ? 'Активен'
                      : 'Неактивен'}
                  </span>
                </div>

                <p className="text-sm text-[var(--text-primary)]/40 truncate">
                  {branch.legal_name || '—'}
                </p>

                <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--text-primary)]/40">
                  {branch.inn && (
                    <span className="font-mono">
                      ИНН {branch.inn}
                    </span>
                  )}

                  {branch.kpp && (
                    <span className="font-mono">
                      КПП {branch.kpp}
                    </span>
                  )}

                  {branch.address && (
                    <span className="flex items-center gap-1 truncate max-w-[200px]">
                      <MapPinned size={11} />
                      {branch.address}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {branch.phone && (
                  <span className="hidden sm:flex items-center gap-1.5 text-sm text-[var(--text-primary)]/40">
                    <Phone size={13} />
                    {branch.phone}
                  </span>
                )}

                <ChevronRight
                  size={18}
                  className="text-[var(--text-primary)]/20 group-hover:text-[var(--accent)] transition-colors"
                />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Вкладка продуктов ────────────────────────────────────────────────────────
function ProductsTab({
  counterpartyId,
  onCountChange,
}: {
  counterpartyId: string;
  onCountChange?: (n: number) => void;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [expandedId, setExpandedId] =
    useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedProduct, setSelectedProduct] =
    useState<any | null>(null);

  const [serialNumber, setSerialNumber] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [unlinkingProduct, setUnlinkingProduct] = useState<any | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const [editingSerialFor, setEditingSerialFor] = useState<string | null>(null);
  const [serialDraft, setSerialDraft] = useState('');
  const [savingSerial, setSavingSerial] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
const res =
  await counterpartiesApi.getProducts(
    counterpartyId,
    page,
    10,
  );

setProducts(
  res.items.map((it: any) => ({
    ...it.product,
    id: it.id,
    link_id: it.id,
    product_id: it.product_id,
    serial_number: it.serial_number,
    counterparty_id: it.counterparty_id,
  })),
);
setTotalPages(res.total_pages);
setTotalItems(res.total_items);
onCountChange?.(res.total_items);
    } catch {
      setError('Не удалось загрузить продукты');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showForm) return;

    let cancelled = false;

    (async () => {
      setLoadingAll(true);

      try {
        const res = await productsApi.getProducts({
          page: 1,
          size: 100,
        });

        if (!cancelled) {
          setAllProducts(res.items);
        }
      } catch {
        // noop
      } finally {
        if (!cancelled) {
          setLoadingAll(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showForm]);

  const filtered = filterQuery.trim()
    ? allProducts.filter(
      p =>
        (p.display_name || p.name || '')
          .toLowerCase()
          .includes(filterQuery.toLowerCase()) ||
        (p.vendor || '')
          .toLowerCase()
          .includes(filterQuery.toLowerCase()),
    )
    : allProducts;

    const handleLink = async () => {
    if (!selectedProduct) return;
    setLinking(true);
    setLinkError(null);
    try {
      await counterpartiesApi.linkProduct(counterpartyId, {
        product_id: selectedProduct.id,
        serial_number: serialNumber.trim() || undefined,
      });
      setSelectedProduct(null);
      setFilterQuery('');
      setSerialNumber('');
      setShowForm(false);
      setPage(1);
      load();
    } catch (err: any) {
      setLinkError(
        typeof err?.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Не удалось привязать продукт',
      );
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (product: any) => {
    setUnlinking(true);

    try {
      await counterpartiesApi.unlinkProduct(
        counterpartyId,
        product.id,
      );

      setUnlinkingProduct(null);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setUnlinking(false);
    }
  };

    const closeForm = () => {
    setShowForm(false);
    setSelectedProduct(null);
    setFilterQuery('');
    setSerialNumber('');
    setLinkError(null);
  };

  return (
    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-[var(--text-primary)]/40" />

          Продукты

          {totalItems > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
              {totalItems}
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 transition-colors"
          >
            <RefreshCcw size={16} />
          </button>

          <button
            onClick={() =>
              showForm
                ? closeForm()
                : setShowForm(true)
            }
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-base font-medium transition-all ${showForm
              ? 'bg-[var(--hover-2)] text-[var(--text-primary)]/70'
              : 'bg-[var(--accent)] text-white shadow-md'
              }`}
          >
            {showForm ? (
              <X size={16} />
            ) : (
              <Link2 size={16} />
            )}

            {showForm ? 'Отмена' : 'Привязать'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border-b border-[var(--border-color)] bg-[var(--hover-1)] p-6 space-y-5">
          {linkError && (
            <div className="p-3 bg-[var(--accent)]/30 border border-red-700/50 rounded-xl text-base text-[var(--accent-hover)] flex items-start gap-2">
              <X
                size={16}
                className="mt-0.5 flex-shrink-0"
              />
              {linkError}
            </div>
          )}

          <div>
            <label className="block text-base text-[var(--text-primary)]/60 mb-2">
              Выберите продукт{' '}
              <span className="text-[var(--accent)]">*</span>
            </label>

            {selectedProduct ? (
              <div className="flex items-center gap-3 p-4 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl">
                {(() => {
                  const c = catMeta(
                    selectedProduct.category,
                  );

                  const I = c?.icon || Package;

                  return (
                    <div
                      className={`w-11 h-11 rounded-xl ${c?.bg || 'bg-[var(--hover-2)]'
                        } flex items-center justify-center ${c?.color ||
                        'text-[var(--text-primary)]/40'
                        } flex-shrink-0`}
                    >
                      <I size={20} />
                    </div>
                  );
                })()}

                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-[var(--text-primary)] truncate">
                    {selectedProduct.display_name ||
                      selectedProduct.name}
                  </p>

                  <p className="text-sm text-[var(--text-primary)]/40">
                    {selectedProduct.vendor}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setFilterQuery('');
                  }}
                  className="p-1.5 rounded-lg text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 pointer-events-none"
                  />

                  <input
                    value={filterQuery}
                    onChange={e =>
                      setFilterQuery(e.target.value)
                    }
                    placeholder="Фильтр по названию..."
                    className="w-full pl-10 pr-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] divide-y divide-[var(--border-color)]">
                  {loadingAll ? (
                    <div className="flex justify-center py-10">
                      <Loader2
                        size={20}
                        className="text-[var(--text-primary)]/20 animate-spin"
                      />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-10 text-center">
                      <Package
                        size={32}
                        className="mx-auto mb-2 text-[var(--text-primary)]/15"
                      />

                      <p className="text-base text-[var(--text-primary)]/40">
                        {filterQuery
                          ? 'Ничего не найдено'
                          : 'Нет продуктов'}
                      </p>
                    </div>
                  ) : (
                    filtered.map(p => {
                      const c = catMeta(p.category);
                      const I = c?.icon || Package;

                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedProduct(p);
                            setFilterQuery('');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--hover-2)] transition-colors"
                        >
                          <div
                            className={`w-10 h-10 rounded-lg ${c?.bg ||
                              'bg-[var(--hover-2)]'
                              } flex items-center justify-center ${c?.color ||
                              'text-[var(--text-primary)]/40'
                              } flex-shrink-0`}
                          >
                            <I size={18} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-base text-[var(--text-primary)] truncate">
                              {p.display_name || p.name}
                            </p>

                            <p className="text-sm text-[var(--text-primary)]/40">
                              {p.vendor}
                            </p>
                          </div>

                          <div
                            className={`w-2 h-2 rounded-full ${statusDot(
                              p.status,
                            )} flex-shrink-0`}
                          />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

                    {selectedProduct && (
            <>
              <div>
                <label className="block text-base text-[var(--text-primary)]/60 mb-2">
                  Серийный номер
                </label>
                <input
                  value={serialNumber}
                  onChange={e => setSerialNumber(e.target.value)}
                  placeholder="Например, SN-123456789"
                  className="w-full px-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-base text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
                />
                <p className="mt-2 text-sm text-[var(--text-primary)]/40">
                  Необязательно. Можно указать позже.
                </p>
              </div>

             <button
  onClick={handleLink}
  disabled={linking}
  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] text-white text-base font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
>
  {linking ? (
    <Loader2 size={18} className="animate-spin" />
  ) : (
    <Link2 size={18} />
  )}
  Привязать продукт
</button>
            </>
          )}
        </div>
      )}

      <div className="divide-y divide-[var(--border-color)]">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2
              size={24}
              className="text-[var(--accent)]/40 animate-spin"
            />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-base text-[var(--accent)]">
            {error}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center px-6">
            <Package
              size={36}
              className="text-[var(--text-primary)]/15 mb-4"
            />

            <p className="text-[var(--text-primary)]/60 text-base font-semibold mb-1">
              Нет привязанных продуктов
            </p>

            <p className="text-[var(--text-primary)]/40 text-sm mb-5">
              Привяжите продукты к контрагенту
            </p>

            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/15 text-[var(--accent)] text-base font-medium transition-colors"
              >
                <Link2 size={16} />
                Привязать
              </button>
            )}
          </div>
        ) : (
          products.map(product => {
            const cat = catMeta(product.category);
            const Icon = cat?.icon || Package;
            const sInfo = statusMeta(product.status);
            const isExpanded =
              expandedId === product.id;

            const attrs = Object.entries(
              product.attributes || {},
            ).filter(
              ([, v]) =>
                v !== null &&
                v !== '' &&
                !(
                  Array.isArray(v) &&
                  (v as any[]).length === 0
                ),
            );

            return (
              <div
                key={product.id}
                className={
                  isExpanded
                    ? 'bg-[var(--hover-1)]'
                    : ''
                }
              >
                <button
                  onClick={() =>
                    setExpandedId(
                      isExpanded
                        ? null
                        : product.id,
                    )
                  }
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-[var(--hover-1)] transition-colors group"
                >
                  <div
                    className={`w-11 h-11 rounded-xl ${cat?.bg ||
                      'bg-[var(--hover-2)]'
                      } flex items-center justify-center ${cat?.color ||
                      'text-[var(--text-primary)]/40'
                      } group-hover:scale-105 transition-transform flex-shrink-0`}
                  >
                    <Icon size={20} />
                  </div>

                                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-semibold text-[var(--text-primary)] truncate">
                        {product.display_name || product.name}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)]/40">
                      {product.vendor}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${statusDot(product.status)}`} />
                      <span className={`text-sm hidden sm:block ${sInfo?.color || 'text-[var(--text-primary)]/40'}`}>
                        {statusLabel(product.status)}
                      </span>
                    </div>
                    {isExpanded ? (
  <ChevronUp size={18} className="text-[var(--text-primary)]/40" />
) : (
  <ChevronDown size={18} className="text-[var(--text-primary)]/20" />
)}
                  </div>

                 
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 pl-20 space-y-5 border-t border-[var(--border-color)]">
                    <div className="flex flex-wrap gap-2.5 pt-4">
                      <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-2)] text-base text-[var(--text-primary)]/60 border border-[var(--border-color)]">
                        <Building2
                          size={16}
                          className="text-[var(--text-primary)]/40"
                        />
                        {product.vendor}
                      </span>

                      {product.version && (
                        <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-2)] text-base text-[var(--text-primary)]/60 border border-[var(--border-color)] font-mono">
                          <Tag
                            size={16}
                            className="text-[var(--text-primary)]/40"
                          />
                          v{product.version}
                        </span>
                      )}
                    </div>

                    {product.description && (
                      <div>
                        <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-2 font-semibold">
                          Описание
                        </p>

                        <p className="text-base text-[var(--text-primary)]/70 leading-relaxed whitespace-pre-wrap">
                          {product.description}
                        </p>
                      </div>
                    )}


                                        {/* Серийный номер */}
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-2 font-semibold">
                        Серийный номер
                      </p>

                      {editingSerialFor === product.id ? (
                        <div className="flex gap-2 flex-wrap">
                          <input
                            value={serialDraft}
                            onChange={e => setSerialDraft(e.target.value)}
                            placeholder="SN-..."
                            className="flex-1 min-w-[200px] px-3 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/30"
                          />
                          <button
                            type="button"
                            disabled={savingSerial}
                            onClick={async () => {
                              setSavingSerial(true);
                              try {
                                await counterpartiesApi.updateProductLink(
                                  counterpartyId,
                                  product.id,
                                  { serial_number: serialDraft.trim() || null },
                                );
                                setEditingSerialFor(null);
                                load();
                              } catch (e) {
                                console.error(e);
                              } finally {
                                setSavingSerial(false);
                              }
                            }}
                            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50"
                          >
                            {savingSerial ? <Loader2 size={14} className="animate-spin" /> : 'Сохранить'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSerialFor(null)}
                            className="px-4 py-2 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--hover-2)] text-base text-[var(--text-primary)]/80 border border-[var(--border-color)] font-mono">
                            <Hash size={16} className="text-[var(--text-primary)]/40" />
                            {product.serial_number || '—'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSerialFor(product.id);
                              setSerialDraft(product.serial_number ?? '');
                            }}
                            className="px-3 py-2 rounded-lg bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/60 text-sm font-medium"
                          >
                            {product.serial_number ? 'Изменить' : 'Указать'}
                          </button>
                        </div>
                      )}
                    </div>

                    {attrs.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-3 font-semibold">
                          Характеристики
                        </p>

                        <div className="rounded-xl border border-[var(--border-color)] divide-y divide-white/[0.06] bg-[var(--hover-1)]">
                          {attrs.map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-start gap-4 px-5 py-3.5"
                              >
                                <span className="text-base text-[var(--text-primary)]/40 w-[140px] flex-shrink-0">
                                  {getAttrLabel(key)}
                                </span>

                                <span className="text-base text-[var(--text-primary)]/80 break-words min-w-0">
                                  {formatAttrValue(
                                    value,
                                  )}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {unlinkingProduct?.id ===
                      product.id ? (
                      <div className="px-4 py-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
                        <p className="text-sm text-[var(--text-primary)] mb-3">
                          Отвязать{' '}
                          <span className="font-semibold">
                            {product.display_name ||
                              product.name}
                          </span>
                          ?
                        </p>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setUnlinkingProduct(
                                null,
                              )
                            }
                            className="flex-1 px-3 py-2 rounded-lg bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm font-medium transition-colors"
                          >
                            Отмена
                          </button>

                          <button
                            onClick={() =>
                              handleUnlink(product)
                            }
                            disabled={unlinking}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/30 text-[var(--accent)] text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {unlinking ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2
                                size={14}
                              />
                            )}

                            Отвязать
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setUnlinkingProduct(
                            product,
                          )
                        }
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 text-[var(--accent)] text-sm font-medium transition-colors"
                      >
                        <Trash2 size={16} />
                        Отвязать
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)]">
          <span className="text-base text-[var(--text-primary)]/40">
            Стр. {page} из {totalPages}
          </span>

          <div className="flex gap-1.5">
            <button
              onClick={() =>
                setPage(p => Math.max(1, p - 1))
              }
              disabled={page <= 1}
              className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 disabled:opacity-20"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              onClick={() =>
                setPage(p =>
                  Math.min(totalPages, p + 1),
                )
              }
              disabled={page >= totalPages}
              className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 disabled:opacity-20"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Вкладка договоров ────────────────────────────────────────────────────────

const CONTRACT_TYPES = ['ИТС', 'СП', 'С', 'В', 'ВН'] as const;
const CONTRACT_PERIODS = ['Месяц', 'Квартал', 'Полугодие', 'Год'] as const;

const EMPTY_RATE: ContractRateInput = {
  type_rate: 'фиксированная',
  rate: 0,
  unit_measurement_rate: 'часы',
  hours_subscription: null,
  hours_its: null,
};
tsx
function ContractSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выберите значение',
  required = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Если в договоре сохранилось старое значение, которого уже нет в списке,
  // показываем его, а не теряем при редактировании.
  const optionList =
    value && !options.includes(value)
      ? [value, ...options]
      : [...options];

  const selectedIndex = optionList.indexOf(value);
  const selectedLabel =
    selectedIndex >= 0 ? optionList[selectedIndex] : placeholder;

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [open]);

  const focusOption = (index: number) => {
    if (!optionList.length) return;

    const nextIndex = (index + optionList.length) % optionList.length;
    setActiveIndex(nextIndex);

    window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });
  };

  const openAt = (index: number) => {
    if (!optionList.length) return;

    const nextIndex = Math.max(0, Math.min(index, optionList.length - 1));
    setActiveIndex(nextIndex);
    setOpen(true);

    window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });
  };

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseOption = (option: string) => {
    onChange(option);
    closeMenu();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="mb-1.5 text-sm text-[var(--text-primary)]/55">
        {label}
        {required && <span className="ml-1 text-[var(--accent)]">*</span>}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openAt(selectedIndex >= 0 ? selectedIndex : 0);
          }
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            closeMenu();
            return;
          }

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();

            const direction = event.key === 'ArrowDown' ? 1 : -1;

            if (open) {
              focusOption(activeIndex + direction);
            } else {
              const startIndex =
                selectedIndex >= 0
                  ? selectedIndex
                  : direction > 0
                    ? 0
                    : optionList.length - 1;

              openAt(startIndex);
            }

            return;
          }

          if (
            open &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();

            const option = optionList[activeIndex];
            if (option !== undefined) chooseOption(option);
          }
        }}
        className={`
          flex min-h-[48px] w-full items-center justify-between gap-3
          rounded-xl border px-4 py-3 text-left text-base transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]
          ${
            open
              ? 'border-[var(--accent)]/40 bg-[var(--hover-2)]'
              : 'border-[var(--border-color)] bg-[var(--hover-2)] hover:border-[var(--accent)]/35'
          }
        `}
      >
        <span
          className={`min-w-0 flex-1 whitespace-normal break-words leading-snug ${
            value
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]/40'
          }`}
          style={{ overflowWrap: 'anywhere' }}
        >
          {selectedLabel}
        </span>

        <ChevronDown
          size={17}
          className={`flex-shrink-0 text-[var(--text-primary)]/45 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-[100] mt-2 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="max-h-[280px] overflow-y-auto overscroll-contain">
            {optionList.map((option, index) => {
              const selected = option === value;

              return (
                <button
                  key={`${option}-${index}`}
                  ref={element => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => chooseOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeMenu();
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusOption(index + 1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      focusOption(index - 1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      focusOption(0);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      focusOption(optionList.length - 1);
                    } else if (
                      event.key === 'Enter' ||
                      event.key === ' '
                    ) {
                      event.preventDefault();
                      chooseOption(option);
                    }
                  }}
                  className={`
                    flex w-full items-center gap-3 rounded-lg px-3.5 py-3
                    text-left text-sm transition-colors
                    ${
                      selected
                        ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/75 hover:bg-[var(--hover-2)]'
                    }
                    ${
                      activeIndex === index
                        ? 'ring-1 ring-[var(--accent)]/25'
                        : ''
                    }
                  `}
                >
                  <span
                    className="min-w-0 flex-1 whitespace-normal break-words leading-snug"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {option}
                  </span>

                  {selected && (
                    <CheckCircle2
                      size={16}
                      className="flex-shrink-0 text-[var(--accent)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractsTab({
  counterpartyId,
  onCountChange,
}: {
  counterpartyId: string;
  onCountChange?: (n: number) => void;
}) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: '',
    date_start: '',
    date_end: '',
    status: 'Договор оформлен и подписан',
    type: 'ИТС' as string,
    period: 'Год' as string,
    sum: '',
  });

  const [rates, setRates] = useState<ContractRateInput[]>([
    { ...EMPTY_RATE },
  ]);

  const fieldCls = `
    mt-1.5 w-full min-h-[46px] rounded-xl border
    border-[var(--border-color)] bg-[var(--hover-2)]
    px-3.5 py-3 text-base text-[var(--text-primary)]
    placeholder-[var(--text-muted)]
    transition-all
    focus:outline-none focus:border-[var(--accent)]/40
    focus:ring-2 focus:ring-[var(--accent-ring)]
  `;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await contractsApi.list({
        counterparty_id: counterpartyId,
        page,
        size: 10,
      });

      const items = res.items ?? [];
      const count = Number(res.total_items ?? 0);

      setContracts(items);
      setTotalPages(Math.max(1, Number(res.total_pages) || 1));
      setTotalItems(count);
      onCountChange?.(count);
    } catch {
      setError('Не удалось загрузить договоры');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId, page, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setForm({
      name: '',
      date_start: '',
      date_end: '',
      status: 'Договор оформлен и подписан',
      type: 'ИТС',
      period: 'Год',
      sum: '',
    });

    setRates([{ ...EMPTY_RATE }]);
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  };

  const scrollToForm = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
    scrollToForm();
  };

  const startEdit = (contract: Contract) => {
    const contractRates = Array.isArray(contract.rates)
      ? contract.rates
      : [];

    setEditingId(contract.id);
    setForm({
      name: contract.name,
      date_start: contract.date_start,
      date_end: contract.date_end ?? '',
      status: contract.status,
      type: contract.type,
      period: contract.period ?? 'Год',
      sum:
        contract.sum === null || contract.sum === undefined
          ? ''
          : String(contract.sum),
    });

    setRates(
      contractRates.length
        ? contractRates.map(rate => ({
            type_rate: rate.type_rate,
            rate: Number(rate.rate),
            unit_measurement_rate: rate.unit_measurement_rate,
            hours_subscription: rate.hours_subscription ?? null,
            hours_its: rate.hours_its ?? null,
          }))
        : [{ ...EMPTY_RATE }],
    );

    setFormError(null);
    setShowForm(true);
    setExpandedId(null);
    setConfirmDeleteId(null);
    scrollToForm();
  };

  const handleSave = async () => {
    if (
      !form.name.trim() ||
      !form.date_start ||
      !form.status.trim() ||
      !form.type.trim()
    ) {
      setFormError(
        'Заполните обязательные поля: наименование, дата начала, статус и вид договора.',
      );
      return;
    }

    setSaving(true);
    setFormError(null);

    const payloadBase = {
      name: form.name.trim(),
      date_start: form.date_start,
      date_end: form.date_end || null,
      status: form.status.trim(),
      type: form.type.trim(),
      period: form.period.trim() || null,
      sum: form.sum.trim() ? Number(form.sum) : null,
      rates: rates.map(rate => ({
        type_rate: rate.type_rate.trim(),
        rate: Number(rate.rate),
        unit_measurement_rate: rate.unit_measurement_rate.trim(),
        hours_subscription:
          rate.hours_subscription === null ||
          rate.hours_subscription === undefined
            ? null
            : Number(rate.hours_subscription),
        hours_its:
          rate.hours_its === null || rate.hours_its === undefined
            ? null
            : Number(rate.hours_its),
      })),
    };

    try {
      if (editingId) {
        await contractsApi.update(editingId, payloadBase);
      } else {
        await contractsApi.create({
          counterparty_id: counterpartyId,
          ...payloadBase,
        });
      }

      resetForm();
      await load();
    } catch (e: any) {
      setFormError(
        typeof e?.response?.data?.error?.message === 'string'
          ? e.response.data.error.message
          : typeof e?.response?.data?.detail === 'string'
            ? e.response.data.detail
            : 'Не удалось сохранить договор',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);

    try {
      await contractsApi.remove(id);
      setConfirmDeleteId(null);

      // Если удалили последний договор на странице, возвращаемся на предыдущую.
      if (contracts.length === 1 && page > 1) {
        setPage(currentPage => Math.max(1, currentPage - 1));
      } else {
        await load();
      }
    } catch {
      setDeleteError('Не удалось удалить договор. Попробуйте ещё раз.');
    } finally {
      setDeletingId(null);
    }
  };

  const setRate = (
    index: number,
    patch: Partial<ContractRateInput>,
  ) => {
    setRates(current =>
      current.map((rate, rateIndex) =>
        rateIndex === index ? { ...rate, ...patch } : rate,
      ),
    );
  };

  const addRate = () => {
    setRates(current => [...current, { ...EMPTY_RATE }]);
  };

  const removeRate = (index: number) => {
    setRates(current => current.filter((_, rateIndex) => rateIndex !== index));
  };

  const fmtDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return '—';

    const dateString = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T00:00:00`
      : dateValue;

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return dateValue;

    return date.toLocaleDateString('ru-RU');
  };

  const formatMoney = (value: any): string | null => {
    if (value === null || value === undefined || value === '') return null;

    const amount = Number(value);

    return Number.isFinite(amount)
      ? `${amount.toLocaleString('ru-RU')} ₽`
      : `${value} ₽`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      {/* Заголовок вкладки */}
      <div className="flex flex-col gap-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <FileText size={21} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Договоры
              </h2>
              <span className="rounded-full border border-[var(--border-color)] bg-[var(--hover-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-primary)]/55">
                {totalItems}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-primary)]/45">
              Сроки, условия и ставки по договорам
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Обновить список"
            aria-label="Обновить список договоров"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/50 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => (showForm ? resetForm() : startCreate())}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              showForm
                ? 'border border-[var(--border-color)] bg-[var(--hover-2)] text-[var(--text-primary)]/75 hover:bg-[var(--hover-3)]'
                : 'bg-[var(--accent)] text-white shadow-sm hover:brightness-110'
            }`}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Закрыть форму' : 'Добавить договор'}
          </button>
        </div>
      </div>

      {/* Создание / редактирование */}
      {showForm && (
        <div
          ref={formRef}
          className="scroll-mt-6 border-b border-[var(--border-color)] bg-[var(--hover-1)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                {editingId ? <Edit size={17} /> : <Plus size={18} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {editingId ? 'Редактирование' : 'Новый договор'}
                </p>
                <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                  {editingId ? 'Изменить условия договора' : 'Добавить договор'}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-primary)]/45">
                  Заполните основные данные и при необходимости добавьте ставки.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              aria-label="Закрыть форму"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <form
            onSubmit={event => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="space-y-4 p-4 sm:p-6">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]"
                >
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Основные данные */}
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-bold text-[var(--text-primary)]/50">
                    1
                  </span>
                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)]">
                      Основные данные
                    </h4>
                    <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
                      Наименование, вид договора и сроки действия
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block min-w-0 md:col-span-2">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Наименование
                      <span className="ml-1 text-[var(--accent)]">*</span>
                    </span>
                    <input
                      value={form.name}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Например: Договор на 1С:ИТС №123"
                      className={fieldCls}
                    />
                  </label>

                  <ContractSelect
                    label="Вид договора"
                    required
                    value={form.type}
                    onChange={type =>
                      setForm(current => ({ ...current, type }))
                    }
                    options={CONTRACT_TYPES}
                    placeholder="Выберите вид договора"
                  />

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Статус
                      <span className="ml-1 text-[var(--accent)]">*</span>
                    </span>
                    <input
                      value={form.status}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                      placeholder="Например: Договор оформлен и подписан"
                      className={fieldCls}
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Дата начала
                      <span className="ml-1 text-[var(--accent)]">*</span>
                    </span>
                    <input
                      type="date"
                      value={form.date_start}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          date_start: event.target.value,
                        }))
                      }
                      className={fieldCls}
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Дата окончания
                    </span>
                    <input
                      type="date"
                      value={form.date_end}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          date_end: event.target.value,
                        }))
                      }
                      className={fieldCls}
                    />
                  </label>

                  <ContractSelect
                    label="Период оплаты"
                    value={form.period}
                    onChange={period =>
                      setForm(current => ({ ...current, period }))
                    }
                    options={CONTRACT_PERIODS}
                    placeholder="Выберите период оплаты"
                  />

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Сумма договора
                    </span>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.sum}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            sum: event.target.value,
                          }))
                        }
                        placeholder="120000"
                        className={`${fieldCls} pr-12`}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-primary)]/35">
                        ₽
                      </span>
                    </div>
                  </label>
                </div>
              </section>

              {/* Ставки */}
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-bold text-[var(--text-primary)]/50">
                      2
                    </span>
                    <div>
                      <h4 className="font-semibold text-[var(--text-primary)]">
                        Ставки
                      </h4>
                      <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
                        Тарифы и часы по договору
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addRate}
                    className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15 sm:self-auto"
                  >
                    <Plus size={15} />
                    Добавить ставку
                  </button>
                </div>

                <div className="space-y-3">
                  {rates.map((rate, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-semibold text-[var(--text-primary)]/55">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            Ставка
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRate(index)}
                          disabled={rates.length <= 1}
                          title={
                            rates.length <= 1
                              ? 'Должна остаться хотя бы одна ставка'
                              : 'Удалить ставку'
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Trash2 size={14} />
                          Удалить
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Вид ставки
                          </span>
                          <input
                            value={rate.type_rate}
                            onChange={event =>
                              setRate(index, {
                                type_rate: event.target.value,
                              })
                            }
                            placeholder="Фиксированная"
                            className={fieldCls}
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Размер ставки
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={rate.rate}
                            onChange={event =>
                              setRate(index, {
                                rate:
                                  event.target.value === ''
                                    ? 0
                                    : Number(event.target.value),
                              })
                            }
                            placeholder="0"
                            className={fieldCls}
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Единица измерения
                          </span>
                          <input
                            value={rate.unit_measurement_rate}
                            onChange={event =>
                              setRate(index, {
                                unit_measurement_rate: event.target.value,
                              })
                            }
                            placeholder="Часы"
                            className={fieldCls}
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Абонентские часы
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={rate.hours_subscription ?? ''}
                            onChange={event =>
                              setRate(index, {
                                hours_subscription:
                                  event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            placeholder="Не указано"
                            className={fieldCls}
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Часы ИТС
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={rate.hours_its ?? ''}
                            onChange={event =>
                              setRate(index, {
                                hours_its:
                                  event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            placeholder="Не указано"
                            className={fieldCls}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Кнопки формы */}
            <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-[var(--text-primary)]/40">
                Поля, отмеченные звёздочкой, обязательны.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)] disabled:opacity-50 sm:flex-none"
                >
                  Отмена
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {saving
                    ? 'Сохранение…'
                    : editingId
                      ? 'Сохранить изменения'
                      : 'Создать договор'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Список договоров */}
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-4 sm:px-6">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              Список договоров
            </h3>
            <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
              Всего: {totalItems}
            </p>
          </div>

          {totalPages > 1 && (
            <span className="text-xs text-[var(--text-primary)]/40">
              Страница {page} из {totalPages}
            </span>
          )}
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2
                size={24}
                className="animate-spin text-[var(--accent)]"
              />
              <p className="text-sm text-[var(--text-primary)]/40">
                Загружаем договоры…
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/5 px-5 py-12 text-center"
            >
              <AlertTriangle
                size={28}
                className="mb-3 text-[var(--accent)]"
              />
              <p className="font-medium text-[var(--text-primary)]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 py-2 text-sm text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)]"
              >
                <RefreshCcw size={14} />
                Попробовать снова
              </button>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] px-5 py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--hover-1)] text-[var(--text-primary)]/35">
                <FileText size={25} />
              </div>
              <p className="font-semibold text-[var(--text-primary)]">
                Договоров пока нет
              </p>
              <p className="mt-1 max-w-sm text-sm text-[var(--text-primary)]/40">
                Добавьте договор, чтобы сохранить сроки, сумму и условия обслуживания.
              </p>
              {!showForm && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
                >
                  <Plus size={16} />
                  Добавить договор
                </button>
              )}
            </div>
          ) : (
            contracts.map(contract => {
              const isExpanded = expandedId === contract.id;
              const isConfirming = confirmDeleteId === contract.id;
              const contractRates = Array.isArray(contract.rates)
                ? contract.rates
                : [];
              const amount = formatMoney(contract.sum);

              return (
                <article
                  key={contract.id}
                  className={`overflow-hidden rounded-2xl border bg-[var(--bg-card)] transition-colors ${
                    isExpanded
                      ? 'border-[var(--accent)]/25'
                      : 'border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : contract.id)
                    }
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--hover-1)] sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                      <FileText size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="min-w-0 whitespace-normal break-words font-semibold text-[var(--text-primary)]"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {contract.name}
                        </span>

                        <span className="rounded-lg border border-[var(--border-color)] bg-[var(--hover-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-primary)]/60">
                          {contract.type}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hover-1)] px-2.5 py-1 text-xs text-[var(--text-primary)]/65">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                          <span
                            className="whitespace-normal break-words"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {contract.status || 'Без статуса'}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-primary)]/45">
                          <Calendar size={13} className="flex-shrink-0" />
                          {contract.date_end
                            ? `${fmtDate(contract.date_start)} — ${fmtDate(contract.date_end)}`
                            : `С ${fmtDate(contract.date_start)}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2 pt-0.5">
                      {amount && (
                        <span className="max-w-[115px] break-words text-right text-xs font-semibold text-[var(--text-primary)]/70 sm:max-w-none sm:text-sm">
                          {amount}
                        </span>
                      )}

                      {isExpanded ? (
                        <ChevronUp
                          size={17}
                          className="text-[var(--text-primary)]/40"
                        />
                      ) : (
                        <ChevronDown
                          size={17}
                          className="text-[var(--text-primary)]/35"
                        />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border-color)] px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Calendar
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Срок действия
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {fmtDate(contract.date_start)}
                              {' — '}
                              {fmtDate(contract.date_end)}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Clock
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Период оплаты
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {contract.period || 'Не указан'}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Hash
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Сумма договора
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {amount || 'Не указана'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                              Ставки
                            </h4>
                            <p className="mt-0.5 text-xs text-[var(--text-primary)]/40">
                              {contractRates.length
                                ? `Указано ставок: ${contractRates.length}`
                                : 'Ставки не добавлены'}
                            </p>
                          </div>
                        </div>

                        {contractRates.length > 0 && (
                          <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                            {contractRates.map((rate, index) => {
                              const numericRate = Number(rate.rate);
                              const rateText = Number.isFinite(numericRate)
                                ? numericRate.toLocaleString('ru-RU')
                                : String(rate.rate ?? '—');

                              const hours = [
                                rate.hours_subscription != null
                                  ? `Абонентские: ${rate.hours_subscription} ч`
                                  : null,
                                rate.hours_its != null
                                  ? `ИТС: ${rate.hours_its} ч`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ');

                              return (
                                <div
                                  key={rate.id ?? `${rate.type_rate}-${index}`}
                                  className={`grid grid-cols-1 gap-3 bg-[var(--hover-1)] p-4 sm:grid-cols-3 ${
                                    index > 0
                                      ? 'border-t border-[var(--border-color)]'
                                      : ''
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Вид ставки
                                    </p>
                                    <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                                      {rate.type_rate || `Ставка ${index + 1}`}
                                    </p>
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Размер
                                    </p>
                                    <p className="mt-1 break-words text-sm text-[var(--text-primary)]/75">
                                      {rateText}
                                      {rate.unit_measurement_rate
                                        ? ` за ${rate.unit_measurement_rate}`
                                        : ''}
                                    </p>
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Часы
                                    </p>
                                    <p className="mt-1 break-words text-sm text-[var(--text-primary)]/75">
                                      {hours || 'Не указаны'}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 border-t border-[var(--border-color)] pt-4">
                        {isConfirming ? (
                          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle
                                size={18}
                                className="mt-0.5 flex-shrink-0 text-[var(--accent)]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  Удалить этот договор?
                                </p>
                                <p
                                  className="mt-1 break-words text-sm text-[var(--text-primary)]/55"
                                  style={{ overflowWrap: 'anywhere' }}
                                >
                                  {contract.name}. Это действие нельзя отменить.
                                </p>
                              </div>
                            </div>

                            {deleteError && (
                              <p
                                role="alert"
                                className="mt-3 text-sm text-[var(--accent)]"
                              >
                                {deleteError}
                              </p>
                            )}

                            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setDeleteError(null);
                                }}
                                disabled={deletingId === contract.id}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)] disabled:opacity-50"
                              >
                                Оставить договор
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDelete(contract.id)}
                                disabled={deletingId === contract.id}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingId === contract.id ? (
                                  <Loader2
                                    size={15}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2 size={15} />
                                )}
                                Удалить договор
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-[var(--text-primary)]/40">
                              Можно изменить условия или удалить договор.
                            </p>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(contract)}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--hover-1)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)]/75 transition-colors hover:bg-[var(--hover-2)]"
                              >
                                <Edit size={15} />
                                Изменить
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmDeleteId(contract.id);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                              >
                                <Trash2 size={15} />
                                Удалить
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {!loading && !error && contracts.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)] px-4 py-4 sm:px-6">
            <span className="text-sm text-[var(--text-primary)]/45">
              Страница {page} из {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPage(currentPage => Math.max(1, currentPage - 1))
                }
                disabled={page <= 1}
                aria-label="Предыдущая страница"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/65 transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                type="button"
                onClick={() =>
                  setPage(currentPage =>
                    Math.min(totalPages, currentPage + 1),
                  )
                }
                disabled={page >= totalPages}
                aria-label="Следующая страница"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/65 transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Типы вкладок ─────────────────────────────────────────────────────────────

type TabType =
  | 'info'
  | 'contact'
  | 'products'
  | 'projects'
  | 'branches'
  | 'contracts'
  | 'customers'
  | 'tickets'
  | 'history';

// ─── Основная страница ────────────────────────────────────────────────────────

export default function CounterpartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [counterparty, setCounterparty] =
    useState<Counterparty | null>(null);

  const [customers, setCustomers] =
    useState<CounterpartyCustomer[]>([]);

  const [tickets, setTickets] =
    useState<TicketListItem[]>([]);

  // ── Проекты
  const [projects, setProjects] =
    useState<Project[]>([]);

  const [projectsCount, setProjectsCount] =
    useState(0);

  const [productsCount, setProductsCount] = useState(0);  
  const [contractsCount, setContractsCount] = useState(0);

  const [branches, setBranches] =
    useState<Counterparty[]>([]);

  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<TabType>('info');

  const [showDeleteModal, setShowDeleteModal] =
    useState(false);

  const [deleting, setDeleting] = useState(false);

  const [showEditModal, setShowEditModal] =
    useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const cp =
        await counterpartiesApi.getById(id!);

      setCounterparty(cp);

      try {
        const r =
          await counterpartiesApi.getCustomers(id!);

        setCustomers(
          Array.isArray(r?.items)
            ? r.items
            : Array.isArray(r)
              ? r
              : [],
        );
      } catch {
        setCustomers([]);
      }

      try {
        const r =
          await ticketsApi.getAllWithFilters(
            1,
            100,
            {
              counterparty_id: id,
            },
          );

        setTickets(
          Array.isArray(r?.items)
            ? r.items
            : [],
        );
      } catch {
        setTickets([]);
      }

      // ── Проекты контрагента
      try {
        const r =
          await projectsApi.getByCounterparty(
            id!,
            1,
            100,
          );

        setProjects(
          Array.isArray(r?.items)
            ? r.items
            : [],
        );

        setProjectsCount(
          typeof r?.total_items === 'number'
            ? r.total_items
            : Array.isArray(r?.items)
              ? r.items.length
              : 0,
        );
      } catch {
        setProjects([]);
        setProjectsCount(0);
      }

      try {
  const r = await counterpartiesApi.getProducts(id!, 1, 1);
  setProductsCount(
    typeof r?.total_items === 'number' ? r.total_items : 0,
  );
} catch {
  setProductsCount(0);
}

try {
  const r = await contractsApi.list({ counterparty_id: id!, page: 1, size: 1 });
  setContractsCount(
    typeof r?.total_items === 'number' ? r.total_items : 0,
  );
} catch {
  setContractsCount(0);
}

      try {
        const r =
          await counterpartiesApi.getBranches(id!);

        setBranches(r);
      } catch {
        setBranches([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      await counterpartiesApi.delete(id!);
      navigate('/counterparties');
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const canAddBranch =
    counterparty?.counterparty_type ===
    'Юридическое лицо';

  const statusClr = (s: string) =>
    ({
      new: 'bg-blue-500/15 text-[var(--info)] border-blue-500/30',
      pending_approval:
        'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
      open: 'bg-cyan-500/15 text-[var(--info)] border-cyan-500/30',
      in_progress:
        'bg-yellow-500/15 text-[var(--warning)] border-yellow-500/30',
      waiting:
        'bg-purple-500/15 text-[var(--info)] border-purple-500/30',
      resolved:
        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      closed:
        'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
      reopened:
        'bg-orange-500/15 text-[var(--warning)] border-orange-500/30',
      rejected:
        'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
      cancelled:
        'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15',
    })[s] ??
    'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15';

  const priorityClr = (p: string) =>
    ({
      low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      medium:
        'bg-yellow-500/15 text-[var(--warning)] border-yellow-500/30',
      high: 'bg-orange-500/15 text-[var(--warning)] border-orange-500/30',
      critical:
        'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/15',
    })[p] ??
    'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15';

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const fmtDateShort = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const tabs: {
    id: TabType;
    label: string;
    icon: any;
    count?: number;
    hidden?: boolean;
  }[] = [
      {
        id: 'info',
        label: 'Информация',
        icon: Info,
      },
      {
        id: 'contact',
        label: 'Контакты',
        icon: UserCheck,
        count:
          counterparty?.contact_persons?.length,
      },
      {
        id: 'products',
        label: 'Продукты',
        icon: Layers,
        count: productsCount,
      },
      {
  id: 'contracts',
  label: 'Договоры',
  icon: FileText,
  count: contractsCount,
},
      {
        id: 'projects',
        label: 'Проекты',
        icon: FolderOpen,
        count: projectsCount,
      },
      {
        id: 'branches',
        label: 'Подразделения',
        icon: GitBranch,
        count: branches.length,
        hidden: !canAddBranch,
      },
      {
        id: 'customers',
        label: 'Сотрудники',
        icon: Users,
        count: customers.length,
      },
      {
        id: 'tickets',
        label: 'Заявки',
        icon: Ticket,
        count: tickets.length,
      },
      {
        id: 'history',
        label: 'История',
        icon: History,
      },
    ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  if (!counterparty) {
    return (
      <div className="bg-[var(--hover-2)] border border-[var(--border-color)] rounded-2xl p-16 text-center">
        <Building2 className="w-20 h-20 text-[var(--text-primary)]/15 mx-auto mb-5" />

        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
          Контрагент не найден
        </h2>

        <button
          onClick={() =>
            navigate('/counterparties')
          }
          className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-base font-medium transition-colors"
        >
          Вернуться к списку
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() =>
              navigate('/counterparties')
            }
            className="p-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] border border-[var(--border-color)] text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-all mt-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-10 h-10 text-[var(--text-primary)]" />
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-3xl font-bold text-[var(--text-primary)]">
                  {counterparty.name}
                </h1>

                <span
                  className={`px-3 py-1 rounded-lg text-base font-medium border ${counterparty.is_active
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]'
                    }`}
                >
                  {counterparty.is_active
                    ? 'Активен'
                    : 'Неактивен'}
                </span>
              </div>

              <p className="text-[var(--text-primary)]/60 text-base">
                {counterparty.legal_name}
              </p>

              <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--hover-2)] text-[var(--text-primary)]/70 border border-[var(--border-color)]">
                  {counterparty.counterparty_type}
                </span>

                <span className="text-[var(--text-primary)]/40 text-sm font-mono">
                  ИНН {counterparty.inn}
                </span>

                {counterparty.parent_id && (
                  <Link
                    to={`/counterparties/${counterparty.parent_id}`}
                    className="flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                  >
                    <ArrowLeft size={12} />
                    К головному контрагенту
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 flex-shrink-0 flex-wrap">
          <button
            onClick={() =>
              setShowEditModal(true)
            }
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-base bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-colors"
          >
            <Edit size={16} />
            Редактировать
          </button>

          <button
            onClick={() =>
              setShowDeleteModal(true)
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)]/15 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/15 text-[var(--accent)] text-base font-medium transition-colors"
          >
            <Trash2 size={16} />
            Удалить
          </button>
        </div>
      </div>

      {/* Tabs */}

      <div className="flex gap-1.5 border-b border-[var(--border-color)] overflow-x-auto">
        {tabs
          .filter(t => !t.hidden)
          .map(tab => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(tab.id)
              }
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'bg-[var(--accent)]/50 text-white border-b-2 border-red-500'
                : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                }`}
            >
              <tab.icon size={16} />

              <span className="text-base font-medium">
                {tab.label}
              </span>

              {tab.count !== undefined &&
                tab.count > 0 && (
                  <span className="ml-0.5 px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm">
                    {tab.count}
                  </span>
                )}
            </button>
          ))}
      </div>

      {/* Content */}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* Информация */}

          {activeTab === 'info' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                  <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5" />
                    ИНН
                  </p>

                  <p className="text-[var(--text-primary)] text-base font-mono">
                    {counterparty.inn || '—'}
                  </p>
                </div>

                {shouldShowKpp(
                  counterparty.counterparty_type,
                ) &&
                  counterparty.kpp && (
                    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                      <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5" />
                        КПП
                      </p>

                      <p className="text-[var(--text-primary)] text-base font-mono">
                        {counterparty.kpp}
                      </p>
                    </div>
                  )}

                {counterparty.okpo &&
                  counterparty.okpo !== 'None' && (
                    <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                      <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5" />
                        ОКПО
                      </p>

                      <p className="text-[var(--text-primary)] text-base font-mono">
                        {counterparty.okpo}
                      </p>
                    </div>
                  )}

                {counterparty.phone && (
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                      <PhoneCall className="w-3.5 h-3.5" />
                      Телефон
                    </p>

                    <a
                      href={`tel:${counterparty.phone}`}
                      className="text-[var(--text-primary)] text-base hover:text-[var(--accent)] transition-colors"
                    >
                      {counterparty.phone}
                    </a>
                  </div>
                )}

                {counterparty.email && (
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                      <AtSign className="w-3.5 h-3.5" />
                      Email
                    </p>

                    <a
                      href={`mailto:${counterparty.email}`}
                      className="text-[var(--text-primary)] text-base hover:text-[var(--accent)] transition-colors break-all"
                    >
                      {counterparty.email}
                    </a>
                  </div>
                )}

                {counterparty.address && (
                  <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                      <MapPinned className="w-3.5 h-3.5" />
                      Адрес
                    </p>

                    <p className="text-[var(--text-primary)] text-base leading-relaxed">
                      {counterparty.address}
                    </p>
                  </div>
                )}

                <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                  <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Создан
                  </p>

                  <p className="text-[var(--text-primary)] text-base">
                    {fmtDate(
                      counterparty.created_at,
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Контактные лица */}

          {activeTab === 'contact' && (
            <ContactsTab
              counterpartyId={id!}
              persons={
                counterparty.contact_persons ||
                []
              }
              onRefresh={loadData}
            />
          )}

          {/* Продукты */}

          {activeTab === 'products' && (
  <ProductsTab
    counterpartyId={id!}
    onCountChange={setProductsCount}
  />
)}

{activeTab === 'contracts' && (
  <ContractsTab
    counterpartyId={id!}
    onCountChange={setContractsCount}
  />
)}

          {/* Проекты */}

          {activeTab === 'projects' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <FolderOpen
                    size={18}
                    className="text-[var(--text-primary)]/40"
                  />

                  Проекты

                  {projectsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
                      {projectsCount}
                    </span>
                  )}
                </h2>

                <Link
                  to={`/projects/new?counterparty_id=${id}`}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-md hover:bg-[var(--accent-light)] transition-colors"
                >
                  <Plus size={16} />
                  Создать
                </Link>
              </div>

              <div className="p-6">
                {projects.length === 0 ? (
                  <div className="text-center py-16">
                    <FolderOpen
                      size={40}
                      className="text-[var(--text-primary)]/15 mx-auto mb-4"
                    />

                    <p className="text-[var(--text-primary)]/60 text-base font-semibold mb-1">
                      Нет проектов
                    </p>

                    <p className="text-[var(--text-primary)]/40 text-sm mb-5">
                      У контрагента пока нет
                      связанных проектов
                    </p>

                    <Link
                      to={`/projects/new?counterparty_id=${id}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-base font-medium transition-colors"
                    >
                      <Plus size={16} />
                      Создать проект
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {projects.map(project => (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}`}
                        className="flex items-start justify-between gap-4 py-4 px-2 hover:bg-[var(--hover-1)] rounded-xl transition-colors group"
                      >
                        <div className="flex gap-4 min-w-0 flex-1">
                          <div className="w-11 h-11 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
                            <FolderOpen
                              size={20}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {project.key && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-sm">
                                  {project.key}
                                </span>
                              )}

                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${project.status ===
                                  'active'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-neutral-500/15 text-[var(--text-muted)] border-[var(--text-muted)]/15'
                                  }`}
                              >
                                {project.status ===
                                  'active'
                                  ? 'Активен'
                                  : 'Архив'}
                              </span>
                            </div>

                            <p className="text-base font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                              {project.name}
                            </p>

                            {project.description && (
                              <p className="text-sm text-[var(--text-primary)]/40 mt-1 line-clamp-2">
                                {
                                  project.description
                                }
                              </p>
                            )}
                          </div>
                        </div>

                        <ChevronRight className="w-5 h-5 text-[var(--text-primary)]/20 group-hover:text-[var(--accent)] flex-shrink-0 mt-3 transition-colors" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Подразделения */}

          {activeTab === 'branches' &&
            canAddBranch && (
              <BranchesTab
                counterpartyId={id!}
                counterpartyName={
                  counterparty.name
                }
              />
            )}

          {/* Сотрудники */}

          {activeTab === 'customers' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <Users
                    size={18}
                    className="text-[var(--text-primary)]/40"
                  />
                  Сотрудники

                  {customers.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
                      {customers.length}
                    </span>
                  )}
                </h2>

                <button
                  onClick={() =>
                    navigate('/invitations')
                  }
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-md hover:bg-[var(--accent-light)] transition-all"
                >
                  <UserPlus size={16} />
                  Пригласить
                </button>
              </div>

              <div className="p-6">
                {customers.length === 0 ? (
                  <div className="text-center py-16">
                    <Users
                      size={36}
                      className="text-[var(--text-primary)]/15 mx-auto mb-4"
                    />

                    <p className="text-[var(--text-primary)]/50 text-base">
                      Нет сотрудников
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {customers.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center gap-4 py-4 px-2"
                      >
                        {c.avatar_url ? (
                          <img
                            src={c.avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)]"
                          />
                        ) : (
                          <Avatar
                            name={
                              c.full_name ||
                              c.username
                            }
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-[var(--text-primary)] truncate">
                            {c.full_name ||
                              c.username ||
                              'Без имени'}
                          </p>

                          <p className="text-sm text-[var(--text-primary)]/40 truncate">
                            {c.email}
                          </p>
                        </div>

                        <span
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex-shrink-0 ${c.is_active
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                            : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]'
                            }`}
                        >
                          {c.is_active
                            ? 'Активен'
                            : 'Неактивен'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Заявки */}

          {activeTab === 'tickets' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <Ticket
                    size={18}
                    className="text-[var(--text-primary)]/40"
                  />
                  Заявки
                </h2>

                <Link
                  to={`/tickets/new?counterparty_id=${id}`}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-white text-base font-medium shadow-md"
                >
                  <Plus size={16} />
                  Создать
                </Link>
              </div>

              <div className="p-6">
                {tickets.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText
                      size={36}
                      className="text-[var(--text-primary)]/15 mx-auto mb-4"
                    />

                    <p className="text-[var(--text-primary)]/50 text-base">
                      Нет заявок
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {tickets.map(ticket => (
                      <Link
                        key={ticket.id}
                        to={`/tickets/${ticket.number}`}
                        className="flex items-start justify-between gap-4 py-4 px-2 hover:bg-[var(--hover-1)] rounded-xl transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[var(--accent)] font-mono text-sm bg-[var(--accent-soft)] border border-[var(--accent)]/15 px-2 py-0.5 rounded-lg">
                              #{ticket.number}
                            </span>

                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${statusClr(
                                ticket.status,
                              )}`}
                            >
                              {TICKET_STATUS_LABELS[
                                ticket.status
                              ] || ticket.status}
                            </span>

                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${priorityClr(
                                ticket.priority,
                              )}`}
                            >
                              {TICKET_PRIORITY_LABELS[
                                ticket.priority
                              ] ||
                                ticket.priority}
                            </span>
                          </div>

                          <p className="text-base font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                            {ticket.title}
                          </p>

                          <p className="text-sm text-[var(--text-primary)]/40 mt-1">
                            {fmtDateShort(
                              ticket.created_at,
                            )}
                          </p>
                        </div>

                        <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 group-hover:text-[var(--accent)] flex-shrink-0 mt-1" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* История */}

          {activeTab === 'history' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <History
                    size={18}
                    className="text-[var(--text-primary)]/40"
                  />
                  История
                </h2>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2
                      size={20}
                      className="text-emerald-400"
                    />
                  </div>

                  <div>
                    <p className="text-[var(--text-primary)] font-semibold text-base">
                      Контрагент создан
                    </p>

                    <p className="text-[var(--text-primary)]/50 text-sm mt-1">
                      {fmtDate(
                        counterparty.created_at,
                      )}
                    </p>
                  </div>
                </div>

                {counterparty.updated_at !==
                  counterparty.created_at && (
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                        <Clock
                          size={20}
                          className="text-[var(--info)]"
                        />
                      </div>

                      <div>
                        <p className="text-[var(--text-primary)] font-semibold text-base">
                          Данные обновлены
                        </p>

                        <p className="text-[var(--text-primary)]/50 text-sm mt-1">
                          {fmtDate(
                            counterparty.updated_at,
                          )}
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}

        <div className="space-y-5">
          <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-5 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Сводка
            </p>

            <div className="divide-y divide-white/[0.06]">
              {[
                {
                  label: 'Тип',
                  value: (
                    <span className="text-[var(--text-primary)]/80 text-sm">
                      {
                        counterparty.counterparty_type
                      }
                    </span>
                  ),
                },
                {
                  label: 'ИНН',
                  value: (
                    <span className="font-mono text-[var(--text-primary)]/80">
                      {counterparty.inn}
                    </span>
                  ),
                },
                {
                  label: 'Контактов',
                  value: (
                    <span className="text-[var(--text-primary)] font-bold">
                      {counterparty
                        .contact_persons
                        ?.length ?? 0}
                    </span>
                  ),
                },
                ...(canAddBranch
                  ? [
                    {
                      label:
                        'Подразделений',
                      value: (
                        <span className="text-[var(--text-primary)] font-bold">
                          {branches.length}
                        </span>
                      ),
                    },
                  ]
                  : []),
                {
                  label: 'Сотрудников',
                  value: (
                    <span className="text-[var(--text-primary)] font-bold">
                      {customers.length}
                    </span>
                  ),
                },

                // ── Проекты
                {
                  label: 'Проектов',
                  value: (
                    <span className="text-[var(--text-primary)] font-bold">
                      {projectsCount}
                    </span>
                  ),
                },

                {
                  label: 'Заявок',
                  value: (
                    <span className="text-[var(--text-primary)] font-bold">
                      {tickets.length}
                    </span>
                  ),
                },
                {
                  label: 'Активных',
                  value: (
                    <span className="text-[var(--text-primary)] font-bold">
                      {
                        tickets.filter(
                          t =>
                            t.status !==
                            'closed' &&
                            t.status !==
                            'resolved',
                        ).length
                      }
                    </span>
                  ),
                },
                {
                  label: 'Создан',
                  value: (
                    <span className="text-[var(--text-primary)]/70 text-sm">
                      {fmtDateShort(
                        counterparty.created_at,
                      )}
                    </span>
                  ),
                },
              ].map(row => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-3"
                >
                  <span className="text-[var(--text-primary)]/40 text-base">
                    {row.label}
                  </span>

                  {row.value}
                </div>
              ))}
            </div>
          </div>

          {/* Быстрые действия */}

          <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4">
              Действия
            </p>

            <div className="space-y-1">
              <button
                onClick={() =>
                  setShowEditModal(true)
                }
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] text-sm font-medium transition-colors text-left"
              >
                <Edit
                  size={15}
                  className="text-[var(--text-primary)]/40"
                />
                Редактировать данные
              </button>

              <button
                onClick={() =>
                  setActiveTab('contact')
                }
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] text-sm font-medium transition-colors text-left"
              >
                <UserPlus
                  size={15}
                  className="text-[var(--text-primary)]/40"
                />
                Добавить контакт
              </button>

              {/* Проекты */}
              <button
                onClick={() =>
                  setActiveTab('projects')
                }
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] text-sm font-medium transition-colors text-left"
              >
                <FolderOpen
                  size={15}
                  className="text-[var(--text-primary)]/40"
                />
                Проекты
              </button>

              {canAddBranch && (
                <button
                  onClick={() =>
                    setActiveTab('branches')
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] text-sm font-medium transition-colors text-left"
                >
                  <GitBranch
                    size={15}
                    className="text-[var(--text-primary)]/40"
                  />
                  Подразделения
                </button>
              )}

              <Link
                to={`/tickets/new?counterparty_id=${id}`}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] text-sm font-medium transition-colors"
              >
                <Ticket
                  size={15}
                  className="text-[var(--text-primary)]/40"
                />
                Создать заявку
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Модалки */}

      {showDeleteModal && (
        <DeleteModal
          title="Удалить контрагента?"
          name={counterparty.name}
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() =>
            setShowDeleteModal(false)
          }
        />
      )}

      {showEditModal && (
        <EditCounterpartyModal
          counterparty={counterparty}
          onSave={updated => {
            setCounterparty(updated);
            setShowEditModal(false);
          }}
          onClose={() =>
            setShowEditModal(false)
          }
        />
      )}
    </div>
  );
}