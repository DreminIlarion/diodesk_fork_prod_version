import { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, History, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, Trash2, ChevronLeft, ChevronRight, HelpCircle, Building2,
  Users, Shield, UserPlus, Search, X, Check, ChevronDown, RefreshCcw,
  User, Briefcase, HeadphonesIcon, Settings,
} from 'lucide-react';
import { invitationsApi, counterpartiesApi } from '../api/client';

import { ActionButton } from '../components/ui/ActionButton';
import type { Counterparty, Invitation, UserRole } from '../types';

// ─── Роли ─────────

interface RoleOption {
  value: UserRole;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  group: 'client' | 'staff';
}

const ROLES: RoleOption[] = [
  {
    value: 'customer',
    label: 'Клиент',
    desc: 'Создаёт и отслеживает заявки',
    icon: <User className="w-5 h-5" />,
    color: 'text-[var(--info)]',
    borderColor: 'border-blue-500/40',
    group: 'client',
  },
  {
    value: 'customer_admin',
    label: 'Админ клиента',
    desc: 'Управляет заявками и сотрудниками контрагента',
    icon: <Briefcase className="w-5 h-5" />,
    color: 'text-[var(--info)]',
    borderColor: 'border-cyan-500/40',
    group: 'client',
  },
  {
    value: 'support_agent',
    label: 'Агент поддержки',
    desc: 'Обрабатывает входящие заявки',
    icon: <HeadphonesIcon className="w-5 h-5" />,
    color: 'text-[var(--info)]',
    borderColor: 'border-purple-500/40',
    group: 'staff',
  },
  {
    value: 'support_manager',
    label: 'Менеджер',
    desc: 'Управляет командой и распределяет задачи',
    icon: <Settings className="w-5 h-5" />,
    color: 'text-[var(--warning)]',
    borderColor: 'border-orange-500/40',
    group: 'staff',
  },
];

const getRoleMeta = (v: string) => ROLES.find(r => r.value === v);

// ─── Кастомный dropdown для контрагентов ──────────────────────────────────────

function CounterpartyDropdown({
  value,
  onChange,
  counterparties,
}: {
  value: string;
  onChange: (v: string) => void;
  counterparties: Counterparty[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down');
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 320;

      if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
        setDropDirection('up');
      } else {
        setDropDirection('down');
      }

      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const selected = counterparties.find(c => c.id === value);

  const filtered = query
    ? counterparties.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.inn && c.inn.includes(query)) ||
      (c.legal_name && c.legal_name.toLowerCase().includes(query.toLowerCase()))
    )
    : counterparties;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => { setOpen(!open); setQuery(''); }}
        className={`
          w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left text-base
          transition-all duration-150 border
          ${open
            ? 'bg-[var(--hover-2)] border-[var(--accent)]/30 ring-2 ring-red-500/10'
            : value
              ? 'bg-[var(--hover-2)] border-[var(--border-color)] hover:border-[var(--border-color)]'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)]'
          }
        `}
      >
        <Building2 className="w-5 h-5 text-[var(--text-primary)]/40 flex-shrink-0" />
        {selected ? (
          <div className="flex-1 min-w-0">
            <span className="text-[var(--text-primary)] truncate block">{selected.name}</span>
            <span className="text-l text-[var(--text-primary)]/40">ИНН: {selected.inn}</span>
          </div>
        ) : (
          <span className="text-[var(--text-primary)]/40 flex-1">Выберите контрагента...</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              className="p-1 rounded hover:bg-[var(--hover-1)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/50"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`text-[var(--text-primary)]/25 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div
          className={`
            absolute z-50 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl 
            shadow-[var(--shadow-lg)] overflow-hidden
            min-w-[280px] w-auto max-w-[calc(100vw-32px)]
            ${dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          style={{
            left: 0,
            right: 0,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <div className="p-2.5 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Поиск по названию или ИНН..."
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-lg text-l text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-color)]"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-l text-[var(--text-primary)]/25">
                {query ? 'Ничего не найдено' : 'Нет контрагентов'}
              </div>
            ) : (
              filtered.map(cp => {
                const isSelected = cp.id === value;
                return (
                  <button
                    key={cp.id}
                    onClick={() => { onChange(cp.id); setOpen(false); setQuery(''); }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left text-l transition-colors
                      ${isSelected ? 'bg-[var(--hover-2)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'}
                    `}
                  >
                    {isSelected
                      ? <Check size={14} className="text-[var(--accent)] flex-shrink-0" />
                      : <span className="w-[14px] flex-shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{cp.name}</p>
                      <p className="text-l text-[var(--text-primary)]/40 truncate">
                        {cp.legal_name} · ИНН: {cp.inn}
                      </p>
                    </div>
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

// ─── Статус приглашения ──────────────────────────────────────────────────────

function getInvitationStatus(inv: Invitation) {
  if (inv.is_used) return { label: 'Принято', cls: 'bg-green-500/15 text-[var(--success)] border border-green-500/20', Icon: CheckCircle2 };
  if (new Date(inv.expires_at) < new Date()) return { label: 'Истекло', cls: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15', Icon: XCircle };
  return { label: 'Ожидает', cls: 'bg-yellow-500/15 text-[var(--warning)] border border-yellow-500/20', Icon: Clock };
}

// ─── Основной компонент ──────────────────────────────────────────────────────

export default function InvitationsPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  // Форма
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // История
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'used' | 'expired'>('all');

  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [revoking, setRevoking] = useState(false);

  const selectedRole = ROLES.find(r => r.value === role);
  const needsCounterparty = selectedRole?.group === 'client';
  const clientRoles = ROLES.filter(r => r.group === 'client');
  const staffRoles = ROLES.filter(r => r.group === 'staff');

  useEffect(() => { loadCounterparties(); }, []);

  useEffect(() => {
    if (activeTab === 'history') loadInvitations();
  }, [activeTab, page]);

  const loadCounterparties = async () => {
    try {
      const res = await counterpartiesApi.getAll(1, 100);
      setCounterparties(res.items);
    } catch (e) { console.error(e); }
  };

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const res = await invitationsApi.getAll(page, 15);
      setInvitations(res.items);
      setTotalPages(res.total_pages);
      setTotalItems(res.total_items);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!email || !role) return;
    if (needsCounterparty && !counterpartyId) return;

    setSending(true);
    setError('');
    setSuccess(false);

    try {
      // 🔥 Исправлено: отправляем массив ролей
      await invitationsApi.send({
        email,
        granted_roles: [role as UserRole],  // 👈 Массив с одной ролью
        counterparty_id: needsCounterparty ? counterpartyId : undefined,
      });
      setSuccess(true);
      setEmail('');
      setRole('');
      setCounterpartyId('');
      setTimeout(() => setSuccess(false), 4000);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка отправки приглашения');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await invitationsApi.delete(revokeTarget.id);
      setRevokeTarget(null);
      loadInvitations();
    } catch (e) {
      console.error(e);
    } finally {
      setRevoking(false);
    }
  };

  // Фильтрация истории на клиенте
  const filteredInvitations = invitations.filter(inv => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'used') return inv.is_used;
    if (statusFilter === 'expired') return !inv.is_used && new Date(inv.expires_at) < new Date();
    if (statusFilter === 'pending') return !inv.is_used && new Date(inv.expires_at) >= new Date();
    return true;
  });

  const isFormValid = email && role && (!needsCounterparty || counterpartyId);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Статистика
  const stats = {
    total: invitations.length,
    pending: invitations.filter(i => !i.is_used && new Date(i.expires_at) >= new Date()).length,
    used: invitations.filter(i => i.is_used).length,
    expired: invitations.filter(i => !i.is_used && new Date(i.expires_at) < new Date()).length,
  };

  return (
    <div className="space-y-8">

      {/* ── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-2">Приглашения</h1>
          <p className="text-base text-[var(--text-primary)]/50">Пригласите новых пользователей в систему</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'history' && (
            <button
              onClick={loadInvitations}
              className="p-3 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 transition-colors"
              title="Обновить"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs  */}
      <div className="flex gap-2 border-b border-white/10">
        {[
          { id: 'send' as const, label: 'Новое приглашение', icon: Send },
          { id: 'history' as const, label: 'История', icon: History, count: totalItems },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-t-xl text-base font-medium transition-all ${activeTab === tab.id
              ? 'bg-[var(--accent)]/50 text-white border-b-2 border-red-500'
              : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)]'
              }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-l px-2 py-0.5 rounded-full bg-[var(--hover-1)]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">

          {/* ═══ Вкладка «Отправить» ═══ */}
          {activeTab === 'send' && (
            <div className="bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)] overflow-hidden">

              {/* Header */}
              <div className="px-6 py-5 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-[var(--accent)]" />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      Новое приглашение
                    </h2>

                    <p className="text-sm text-[var(--text-primary)]/40 mt-0.5">
                      Заполните данные пользователя и выберите права доступа
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">

                {/* Alerts */}
                {success && (
                  <div className="mb-6 p-4 rounded-xl bg-[var(--success)]/8 border border-green-500/20 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />

                    <p className="text-sm text-[var(--success)]">
                      Приглашение успешно отправлено
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/15 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-[var(--accent)] shrink-0" />

                    <p className="text-sm text-[var(--accent)]">
                      {error}
                    </p>
                  </div>
                )}

                {/* =====================================================
          STEP 1
      ===================================================== */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="
              w-7 h-7
              rounded-full
              bg-[var(--accent)]/10
              text-[var(--accent)]
              flex items-center justify-center
              text-xs font-bold
            "
                    >
                      1
                    </span>

                    <div>
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        Получатель
                      </h3>

                      <p className="text-xs text-[var(--text-primary)]/35">
                        На этот адрес будет отправлено приглашение
                      </p>
                    </div>
                  </div>

                  <div className="pl-0 sm:pl-10">
                    <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-2">
                      Email адрес
                      <span className="text-[var(--accent)] ml-1">*</span>
                    </label>

                    <div className="relative">
                      <Mail
                        className="
                absolute left-4 top-1/2 -translate-y-1/2
                w-5 h-5
                text-[var(--text-primary)]/30
                pointer-events-none
              "
                      />

                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="user@company.ru"
                        className="
                w-full
                pl-12 pr-4 py-3.5
                bg-[var(--bg-card)]
                border border-[var(--border-color)]
                rounded-xl
                text-[var(--text-primary)]
                placeholder-[var(--text-muted)]
                focus:outline-none
                focus:border-[var(--accent)]/50
                focus:ring-2
                focus:ring-[var(--accent-ring)]
                text-base
                transition-all
              "
                      />
                    </div>
                  </div>
                </section>

                <div className="my-7 border-t border-[var(--border-color)]" />

                {/* =====================================================
          STEP 2
      ===================================================== */}
                <section>
                  <div className="flex items-center gap-3 mb-5">
                    <span
                      className="
              w-7 h-7
              rounded-full
              bg-[var(--accent)]/10
              text-[var(--accent)]
              flex items-center justify-center
              text-xs font-bold
            "
                    >
                      2
                    </span>

                    <div>
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        Права доступа
                      </h3>

                      <p className="text-xs text-[var(--text-primary)]/35">
                        Выберите роль пользователя в системе
                      </p>
                    </div>
                  </div>

                  <div className="pl-0 sm:pl-10 space-y-6">

                    {/* Client roles */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-[var(--text-primary)]/35" />

                        <span className="text-sm font-medium text-[var(--text-primary)]/50">
                          Клиенты
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {clientRoles.map(r => {
                          const isSelected = role === r.value;

                          return (
                            <button
                              key={r.value}
                              type="button"
                              onClick={() => {
                                setRole(r.value);
                              }}
                              className={`
                      relative
                      p-4
                      min-h-[100px]
                      rounded-xl
                      border
                      text-left
                      transition-all

                      ${isSelected
                                  ? `
                            bg-[var(--accent)]/[0.06]
                            border-[var(--accent)]/50
                            ring-1 ring-[var(--accent)]/10
                          `
                                  : `
                            bg-[var(--bg-card)]
                            border-[var(--border-color)]
                            hover:bg-[var(--hover-2)]
                            hover:border-[var(--border-hover)]
                          `
                                }
                    `}
                            >
                              {isSelected && (
                                <div
                                  className="
                          absolute top-3 right-3
                          w-5 h-5
                          rounded-full
                          bg-[var(--accent)]
                          flex items-center justify-center
                        "
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}

                              <div className="flex items-center gap-2.5 mb-2 pr-7">
                                <span
                                  className={
                                    isSelected
                                      ? r.color
                                      : 'text-[var(--text-primary)]/40'
                                  }
                                >
                                  {r.icon}
                                </span>

                                <span className="text-sm font-semibold text-[var(--text-primary)]">
                                  {r.label}
                                </span>
                              </div>

                              <p className="text-sm leading-5 text-[var(--text-primary)]/40">
                                {r.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Staff roles */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-[var(--text-primary)]/35" />

                        <span className="text-sm font-medium text-[var(--text-primary)]/50">
                          Сотрудники
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {staffRoles.map(r => {
                          const isSelected = role === r.value;

                          return (
                            <button
                              key={r.value}
                              type="button"
                              onClick={() => {
                                setRole(r.value);
                                setCounterpartyId('');
                              }}
                              className={`
                      relative
                      p-4
                      min-h-[100px]
                      rounded-xl
                      border
                      text-left
                      transition-all

                      ${isSelected
                                  ? `
                            bg-[var(--accent)]/[0.06]
                            border-[var(--accent)]/50
                            ring-1 ring-[var(--accent)]/10
                          `
                                  : `
                            bg-[var(--bg-card)]
                            border-[var(--border-color)]
                            hover:bg-[var(--hover-2)]
                            hover:border-[var(--border-hover)]
                          `
                                }
                    `}
                            >
                              {isSelected && (
                                <div
                                  className="
                          absolute top-3 right-3
                          w-5 h-5
                          rounded-full
                          bg-[var(--accent)]
                          flex items-center justify-center
                        "
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}

                              <div className="flex items-center gap-2.5 mb-2 pr-7">
                                <span
                                  className={
                                    isSelected
                                      ? r.color
                                      : 'text-[var(--text-primary)]/40'
                                  }
                                >
                                  {r.icon}
                                </span>

                                <span className="text-sm font-semibold text-[var(--text-primary)]">
                                  {r.label}
                                </span>
                              </div>

                              <p className="text-sm leading-5 text-[var(--text-primary)]/40">
                                {r.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                {/* =====================================================
          STEP 3 — только клиент
      ===================================================== */}
                {needsCounterparty && (
                  <>
                    <div className="my-7 border-t border-[var(--border-color)]" />

                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <span
                          className="
                  w-7 h-7
                  rounded-full
                  bg-[var(--accent)]/10
                  text-[var(--accent)]
                  flex items-center justify-center
                  text-xs font-bold
                "
                        >
                          3
                        </span>

                        <div>
                          <h3 className="text-base font-semibold text-[var(--text-primary)]">
                            Контрагент
                          </h3>

                          <p className="text-xs text-[var(--text-primary)]/35">
                            К какой организации относится пользователь
                          </p>
                        </div>
                      </div>

                      <div className="pl-0 sm:pl-10">
                        <CounterpartyDropdown
                          value={counterpartyId}
                          onChange={setCounterpartyId}
                          counterparties={counterparties}
                        />

                        {counterparties.length === 0 && (
                          <p className="mt-2 text-sm text-[var(--warning)]/70 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Нет контрагентов. Сначала создайте контрагента.
                          </p>
                        )}
                      </div>
                    </section>
                  </>
                )}

                {/* =====================================================
          FOOTER / SEND
      ===================================================== */}
                <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
                  {isFormValid && (
                    <div className="mb-5 flex items-center gap-3 text-sm text-[var(--text-primary)]/50">
                      <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />

                      <span>
                        Приглашение будет отправлено на{' '}
                        <strong className="font-medium text-[var(--text-primary)]">
                          {email}
                        </strong>
                      </span>
                    </div>
                  )}

                  <ActionButton
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !isFormValid}
                    className="
            w-full
            py-4 px-6
            text-base font-semibold
          "
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Отправляем...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Отправить приглашение
                      </>
                    )}
                  </ActionButton>

                  {!isFormValid && (
                    <p className="mt-3 text-center text-xs text-[var(--text-primary)]/30">
                      Заполните обязательные поля, чтобы отправить приглашение
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Вкладка «История» ═══ */}
          {activeTab === 'history' && (
            <div className="bg-[var(--hover-1)] backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">

              {/* Шапка + фильтры */}
              <div className="p-6 border-b border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">История приглашений</h2>
                  <div className="flex gap-1.5 bg-[var(--hover-1)] rounded-lg p-0.5">
                    {[
                      { id: 'all' as const, label: 'Все' },
                      { id: 'pending' as const, label: 'Ожидает' },
                      { id: 'used' as const, label: 'Принято' },
                      { id: 'expired' as const, label: 'Истекло' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-md text-l font-medium transition-colors ${statusFilter === f.id
                          ? 'bg-[var(--accent)]/60 text-white'
                          : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60'
                          }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Список */}
              {loading ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto" />
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="py-16 text-center">
                  <Mail className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                  <p className="text-base text-[var(--text-primary)]/40">
                    {statusFilter !== 'all' ? 'Нет приглашений с таким статусом' : 'Нет приглашений'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {filteredInvitations.map(inv => {
                    const status = getInvitationStatus(inv);
                    const roleMeta = getRoleMeta(inv.granted_roles?.[0] || inv.assigned_role);
                    const canRevoke = !inv.is_used && new Date(inv.expires_at) >= new Date();

                    return (
                      <div
                        key={inv.id}
                        className="px-6 py-5 hover:bg-[var(--hover-1)] transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Инфо */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-base font-medium text-[var(--text-primary)] truncate">{inv.email}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Роль */}
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-l font-medium bg-[var(--hover-1)] ${roleMeta?.color || 'text-[var(--text-primary)]/50'}`}>
                                {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                                {roleMeta?.label || inv.granted_roles?.[0] || inv.assigned_role}
                              </span>
                              {/* Статус */}
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-l font-medium ${status.cls}`}>
                                <status.Icon className="w-3.5 h-3.5" />
                                {status.label}
                              </span>
                              {/* Контрагент */}
                              {inv.counterparty_id && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-l bg-[var(--hover-1)] text-[var(--text-primary)]/40">
                                  <Building2 className="w-3 h-3" />
                                  {counterparties.find(c => c.id === inv.counterparty_id)?.name || '...'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Даты + действия */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-l text-[var(--text-primary)]/40">{formatDateTime(inv.created_at)}</p>
                              <p className="text-[14px] text-[var(--text-primary)]/20 mt-0.5">
                                до {formatDate(inv.expires_at)}
                              </p>
                            </div>
                            {canRevoke && (
                              <button
                                onClick={() => setRevokeTarget(inv)}
                                className="p-2.5 rounded-xl bg-[var(--accent)]/30 hover:bg-[var(--accent)]/50 text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors"
                                title="Отозвать"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Пагинация */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-l text-[var(--text-primary)]/40">
                    Страница {page} из {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">

          {/* =========================================================
      Вкладка: Новое приглашение
  ========================================================= */}
          {activeTab === 'send' && (
            <>
              {/* Как это работает */}
              <div className="bg-[var(--hover-1)] backdrop-blur-sm rounded-xl border border-[var(--border-color)] p-5">
                <div className="flex items-center gap-2.5 mb-5">
                  <HelpCircle className="w-5 h-5 text-[var(--info)]" />

                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Как это работает?
                  </h3>
                </div>

                <div className="space-y-5">
                  {[
                    {
                      n: '1',
                      title: 'Заполните данные',
                      desc: 'Укажите email и выберите права доступа.',
                    },
                    {
                      n: '2',
                      title: 'Отправьте приглашение',
                      desc: 'Пользователь получит письмо со ссылкой.',
                    },
                    {
                      n: '3',
                      title: 'Пользователь зарегистрируется',
                      desc: 'После регистрации ему будут назначены выбранные права.',
                    },
                  ].map((step) => (
                    <div key={step.n} className="flex gap-3">
                      <div
                        className="
                  w-7 h-7 rounded-full shrink-0
                  bg-[var(--accent)]/10
                  text-[var(--accent)]
                  flex items-center justify-center
                  text-xs font-bold
                "
                      >
                        {step.n}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {step.title}
                        </p>

                        <p className="mt-0.5 text-sm leading-5 text-[var(--text-primary)]/40">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Срок действия */}
              <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <Clock className="w-5 h-5 text-[var(--warning)]" />

                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Срок действия приглашения
                  </h3>
                </div>

                <p className="text-sm leading-6 text-[var(--text-primary)]/50">
                  Ссылка в письме действует{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    7 дней
                  </span>
                  . После истечения срока нужно отправить новое приглашение.
                </p>
              </div>
            </>
          )}

          {/* =========================================================
      Вкладка: История
  ========================================================= */}
          {activeTab === 'history' && invitations.length > 0 && (
            <div className="bg-[var(--hover-1)] backdrop-blur-sm rounded-xl border border-[var(--border-color)] p-5">
              <div className="flex items-center gap-2.5 mb-5">
                <Users className="w-5 h-5 text-[var(--text-primary)]/50" />

                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Статистика
                </h3>
              </div>

              <div className="space-y-1">
                {[
                  {
                    label: 'Всего',
                    value: stats.total,
                    color: 'text-[var(--text-primary)]',
                    dot: 'bg-[var(--text-primary)]/35',
                  },
                  {
                    label: 'Ожидает',
                    value: stats.pending,
                    color: 'text-[var(--warning)]',
                    dot: 'bg-yellow-400',
                  },
                  {
                    label: 'Принято',
                    value: stats.used,
                    color: 'text-[var(--success)]',
                    dot: 'bg-green-400',
                  },
                  {
                    label: 'Истекло',
                    value: stats.expired,
                    color: 'text-[var(--accent)]',
                    dot: 'bg-red-400',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2.5 border-b border-[var(--border-color)] last:border-b-0"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]/55">
                      <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                      {item.label}
                    </span>

                    <span className={`text-base font-semibold ${item.color}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Пустая история */}
          {activeTab === 'history' && invitations.length === 0 && !loading && (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5">
              <p className="text-sm text-[var(--text-primary)]/40">
                Здесь будет отображаться статистика после отправки приглашений.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* ── Модалка подтверждения отзыва ──────────────────────────────── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !revoking && setRevokeTarget(null)}
          />
          <div
            className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {/* Иконка */}
            <div className="pt-8 flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/15
                              flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-[var(--accent)]" />
              </div>
            </div>

            {/* Текст */}
            <div className="px-7 pt-5 pb-2 text-center">
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Отозвать приглашение?</h2>
              <p className="text-base text-[var(--text-primary)]/60 leading-relaxed">
                Приглашение для{' '}
                <span className="text-[var(--text-primary)] font-semibold">{revokeTarget.email}</span>{' '}
                будет отменено. Пользователь больше не сможет зарегистрироваться по этой ссылке.
              </p>

              {/* Детали приглашения */}
              <div className="mt-4 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  {(() => {
                    const roleMeta = getRoleMeta(revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role);
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--hover-1)] font-medium ${roleMeta?.color || 'text-[var(--text-primary)]/50'}`}>
                        {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                        {roleMeta?.label || revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role}
                      </span>
                    );
                  })()}
                  {revokeTarget.counterparty_id && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--hover-1)] text-[var(--text-primary)]/40">
                      <Building2 className="w-3 h-3" />
                      {counterparties.find(c => c.id === revokeTarget.counterparty_id)?.name || '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 p-6">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)]
                           text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                           bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 border border-[var(--accent)]/30
                           text-[var(--accent)] text-base font-medium transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revoking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                {revoking ? 'Отзываем...' : 'Отозвать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}