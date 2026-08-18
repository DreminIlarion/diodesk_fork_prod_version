import { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, History, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, Trash2, ChevronLeft, ChevronRight, HelpCircle, Building2,
  Users, Shield, UserPlus, Search, X, Check, ChevronDown, RefreshCcw,
  User, Briefcase, HeadphonesIcon, Settings, Sparkles, ArrowRight,
} from 'lucide-react';
import { invitationsApi, counterpartiesApi } from '../api/client';
import type { Counterparty, Invitation, UserRole } from '../types';

// ─── Роли ─────────

interface RoleOption {
  value: UserRole;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  borderColor: string;
  activeBg: string;
  group: 'client' | 'staff';
}

const ROLES: RoleOption[] = [
  {
    value: 'customer',
    label: 'Клиент',
    desc: 'Создаёт и отслеживает заявки',
    icon: <User className="w-5 h-5" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/8',
    borderColor: 'border-blue-500/40',
    activeBg: 'bg-blue-500/15',
    group: 'client',
  },
  {
    value: 'customer_admin',
    label: 'Админ клиента',
    desc: 'Управляет заявками и сотрудниками контрагента',
    icon: <Briefcase className="w-5 h-5" />,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/8',
    borderColor: 'border-cyan-500/40',
    activeBg: 'bg-cyan-500/15',
    group: 'client',
  },
  {
    value: 'support_agent',
    label: 'Агент поддержки',
    desc: 'Обрабатывает входящие заявки',
    icon: <HeadphonesIcon className="w-5 h-5" />,
    color: 'text-violet-400',
    bg: 'bg-violet-500/8',
    borderColor: 'border-violet-500/40',
    activeBg: 'bg-violet-500/15',
    group: 'staff',
  },
  {
    value: 'support_manager',
    label: 'Менеджер',
    desc: 'Управляет командой и распределяет задачи',
    icon: <Settings className="w-5 h-5" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/8',
    borderColor: 'border-amber-500/40',
    activeBg: 'bg-amber-500/15',
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
          w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-sm
          transition-all duration-200 border-2
          ${open
            ? 'bg-[var(--bg-card)] border-[var(--accent)]/50 ring-2 ring-[var(--accent)]/15 shadow-lg shadow-[var(--accent)]/5'
            : value
              ? 'bg-[var(--bg-card)] border-blue-500/30 hover:border-blue-500/50 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--text-primary)]/20 hover:shadow-sm'
          }
        `}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${value ? 'bg-blue-500/15' : 'bg-[var(--hover-2)]'}`}>
          <Building2 className={`w-4.5 h-4.5 ${value ? 'text-blue-400' : 'text-[var(--text-primary)]/30'}`} />
        </div>
        {selected ? (
          <div className="flex-1 min-w-0">
            <span className="text-[var(--text-primary)] font-medium truncate block">{selected.name}</span>
            <span className="text-xs text-[var(--text-primary)]/40">ИНН: {selected.inn}</span>
          </div>
        ) : (
          <span className="text-[var(--text-primary)]/35 flex-1">Выберите контрагента...</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              className="p-1.5 rounded-lg hover:bg-[var(--accent)]/10 text-[var(--text-primary)]/25 hover:text-[var(--accent)] transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`text-[var(--text-primary)]/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div
          className={`
            absolute z-50 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl
            shadow-2xl overflow-hidden
            min-w-[280px] w-auto max-w-[calc(100vw-32px)]
            ${dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          style={{ left: 0, right: 0 }}
        >
          <div className="p-2.5 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Поиск по названию или ИНН..."
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/30 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-1 focus:ring-[var(--accent)]/10 transition-all"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-primary)]/25">
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
                      w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-all duration-150
                      ${isSelected
                        ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
                      }
                    `}
                  >
                    {isSelected
                      ? <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0"><Check size={12} className="text-white" /></div>
                      : <span className="w-5 flex-shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>{cp.name}</p>
                      <p className="text-xs text-[var(--text-primary)]/35 truncate mt-0.5">
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
  if (inv.is_used) return {
    label: 'Принято',
    cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
    Icon: CheckCircle2,
    dotCls: 'bg-emerald-400',
  };
  if (new Date(inv.expires_at) < new Date()) return {
    label: 'Истекло',
    cls: 'bg-red-500/10 text-red-400 border border-red-500/20',
    Icon: XCircle,
    dotCls: 'bg-red-400',
  };
  return {
    label: 'Ожидает',
    cls: 'bg-amber-500/12 text-amber-400 border border-amber-500/20',
    Icon: Clock,
    dotCls: 'bg-amber-400',
  };
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
      await invitationsApi.send({
        email,
        granted_roles: [role as UserRole],
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

  const stats = {
    total: invitations.length,
    pending: invitations.filter(i => !i.is_used && new Date(i.expires_at) >= new Date()).length,
    used: invitations.filter(i => i.is_used).length,
    expired: invitations.filter(i => !i.is_used && new Date(i.expires_at) < new Date()).length,
  };

  // Шаг формы — визуальный прогресс
  const formStep = !email ? 0 : !role ? 1 : (needsCounterparty && !counterpartyId) ? 2 : 3;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/60 flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">Приглашения</h1>
          </div>
          <p className="text-sm text-[var(--text-primary)]/45 ml-[52px]">Пригласите новых пользователей в систему</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'history' && (
            <button
              onClick={loadInvitations}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--text-primary)]/20 text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] text-sm font-medium transition-all hover:shadow-sm"
              title="Обновить"
            >
              <RefreshCcw className="w-4 h-4" />
              Обновить
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--hover-1)] rounded-xl border border-[var(--border-color)] w-fit">
        {[
          { id: 'send' as const, label: 'Отправить', icon: Send },
          { id: 'history' as const, label: 'История', icon: History, count: totalItems },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-md'
                : 'text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-0.5 text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === tab.id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--hover-2)] text-[var(--text-primary)]/30'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">

          {/* ═══ Вкладка «Отправить» ═══ */}
          {activeTab === 'send' && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm">

              {/* Заголовок с прогрессом */}
              <div className="p-6 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 border border-[var(--accent)]/20 flex items-center justify-center">
                    <UserPlus className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">Новое приглашение</h2>
                    <p className="text-sm text-[var(--text-primary)]/40">Заполните данные для отправки</p>
                  </div>
                </div>

                {/* Прогресс-бар */}
                <div className="flex items-center gap-2">
                  {['Email', 'Роль', needsCounterparty ? 'Контрагент' : null, 'Готово'].filter(Boolean).map((label, i) => (
                    <div key={i} className="flex items-center gap-2 flex-1">
                      <div className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${
                        i < formStep ? 'bg-[var(--accent)]' : i === formStep ? 'bg-[var(--accent)]/30' : 'bg-[var(--hover-2)]'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Уведомления */}
                {success && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Приглашение отправлено!</p>
                      <p className="text-xs text-emerald-400/60 mt-0.5">Пользователь получит письмо со ссылкой для регистрации</p>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/20 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4.5 h-4.5 text-red-400" />
                    </div>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]/70 mb-2.5">
                    <span className="w-5 h-5 rounded-md bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">1</span>
                    Email адрес
                    <span className="text-[var(--accent)]">*</span>
                  </label>
                  <div className="relative group">
                    <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${email ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/25'}`} />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="user@company.ru"
                      className={`w-full pl-12 pr-4 py-3.5 bg-[var(--bg-card)] border-2 rounded-xl text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 text-sm transition-all duration-200
                        focus:outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 focus:shadow-lg focus:shadow-[var(--accent)]/5
                        ${email ? 'border-[var(--accent)]/30' : 'border-[var(--border-color)] hover:border-[var(--text-primary)]/15'}
                      `}
                    />
                    {email && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 rounded-full bg-[var(--accent)]/15 flex items-center justify-center">
                          <Check className="w-3 h-3 text-[var(--accent)]" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Роль */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]/70 mb-3">
                    <span className="w-5 h-5 rounded-md bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">2</span>
                    Роль пользователя
                    <span className="text-[var(--accent)]">*</span>
                  </label>

                  {/* Клиентские роли */}
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/25 mb-2.5 flex items-center gap-2 font-semibold">
                      <Building2 className="w-3.5 h-3.5" />
                      Клиент
                      <span className="h-px flex-1 bg-[var(--border-color)]" />
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {clientRoles.map(r => {
                        const isSelected = role === r.value;
                        return (
                          <button
                            key={r.value}
                            onClick={() => {
                              setRole(r.value);
                              if (r.group !== 'client') setCounterpartyId('');
                            }}
                            className={`
                              relative p-4 rounded-xl border-2 text-left transition-all duration-200 group/role
                              ${isSelected
                                ? `${r.activeBg} ${r.borderColor} shadow-md`
                                : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--text-primary)]/15 hover:bg-[var(--hover-1)] hover:shadow-sm'
                              }
                            `}
                          >
                            {isSelected && (
                              <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSelected ? r.bg : 'bg-[var(--hover-2)] group-hover/role:bg-[var(--hover-3)]'}`}>
                                <span className={`transition-colors ${isSelected ? r.color : 'text-[var(--text-primary)]/30 group-hover/role:text-[var(--text-primary)]/50'}`}>{r.icon}</span>
                              </div>
                              <span className={`text-sm font-bold transition-colors ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 group-hover/role:text-[var(--text-primary)]/80'}`}>
                                {r.label}
                              </span>
                            </div>
                            <p className={`text-xs leading-relaxed transition-colors ${isSelected ? 'text-[var(--text-primary)]/60' : 'text-[var(--text-primary)]/30 group-hover/role:text-[var(--text-primary)]/40'}`}>
                              {r.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Сотрудники */}
                  <div>
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/25 mb-2.5 flex items-center gap-2 font-semibold">
                      <Shield className="w-3.5 h-3.5" />
                      Сотрудник
                      <span className="h-px flex-1 bg-[var(--border-color)]" />
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {staffRoles.map(r => {
                        const isSelected = role === r.value;
                        return (
                          <button
                            key={r.value}
                            onClick={() => {
                              setRole(r.value);
                              setCounterpartyId('');
                            }}
                            className={`
                              relative p-4 rounded-xl border-2 text-left transition-all duration-200 group/role
                              ${isSelected
                                ? `${r.activeBg} ${r.borderColor} shadow-md`
                                : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--text-primary)]/15 hover:bg-[var(--hover-1)] hover:shadow-sm'
                              }
                            `}
                          >
                            {isSelected && (
                              <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSelected ? r.bg : 'bg-[var(--hover-2)] group-hover/role:bg-[var(--hover-3)]'}`}>
                                <span className={`transition-colors ${isSelected ? r.color : 'text-[var(--text-primary)]/30 group-hover/role:text-[var(--text-primary)]/50'}`}>{r.icon}</span>
                              </div>
                              <span className={`text-sm font-bold transition-colors ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 group-hover/role:text-[var(--text-primary)]/80'}`}>
                                {r.label}
                              </span>
                            </div>
                            <p className={`text-xs leading-relaxed transition-colors ${isSelected ? 'text-[var(--text-primary)]/60' : 'text-[var(--text-primary)]/30 group-hover/role:text-[var(--text-primary)]/40'}`}>
                              {r.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Контрагент */}
                {needsCounterparty && (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]/70 mb-2.5">
                      <span className="w-5 h-5 rounded-md bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">3</span>
                      Контрагент
                      <span className="text-[var(--accent)]">*</span>
                    </label>
                    <CounterpartyDropdown
                      value={counterpartyId}
                      onChange={setCounterpartyId}
                      counterparties={counterparties}
                    />
                    {counterparties.length === 0 && (
                      <p className="mt-2.5 text-xs text-amber-400 flex items-center gap-1.5 bg-amber-500/8 px-3 py-2 rounded-lg border border-amber-500/15">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Нет контрагентов. Сначала создайте контрагента.
                      </p>
                    )}
                  </div>
                )}

                {/* Превью */}
                {isFormValid && (
                  <div className="p-4 bg-gradient-to-r from-[var(--accent)]/5 to-transparent border border-[var(--accent)]/15 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                      <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider">Готово к отправке</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium shadow-sm">{email}</span>
                      <ArrowRight className="w-4 h-4 text-[var(--accent)]/50" />
                      <span className={`px-3 py-1.5 rounded-lg border font-semibold shadow-sm ${selectedRole?.activeBg} ${selectedRole?.borderColor} ${selectedRole?.color}`}>
                        {selectedRole?.label}
                      </span>
                      {needsCounterparty && counterpartyId && (
                        <>
                          <span className="text-[var(--text-primary)]/20 font-bold">@</span>
                          <span className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium shadow-sm">
                            {counterparties.find(c => c.id === counterpartyId)?.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Кнопка */}
                <button
                  onClick={handleSend}
                  disabled={sending || !isFormValid}
                  className={`
                    w-full flex items-center justify-center gap-3 py-4 rounded-xl text-sm font-bold transition-all duration-200
                    ${isFormValid
                      ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/80 hover:from-[var(--accent)]/90 hover:to-[var(--accent)]/70 text-white shadow-lg shadow-[var(--accent)]/25 hover:shadow-xl hover:shadow-[var(--accent)]/30 hover:-translate-y-0.5 active:translate-y-0'
                      : 'bg-[var(--hover-2)] text-[var(--text-primary)]/20 cursor-not-allowed'
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0
                  `}
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Отправить приглашение
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ═══ Вкладка «История» ═══ */}
          {activeTab === 'history' && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm">

              {/* Шапка + фильтры */}
              <div className="p-5 border-b border-[var(--border-color)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">История приглашений</h2>
                  <div className="flex gap-1 p-1 bg-[var(--hover-1)] rounded-lg border border-[var(--border-color)]">
                    {[
                      { id: 'all' as const, label: 'Все', count: stats.total },
                      { id: 'pending' as const, label: 'Ожидает', count: stats.pending },
                      { id: 'used' as const, label: 'Принято', count: stats.used },
                      { id: 'expired' as const, label: 'Истекло', count: stats.expired },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                          statusFilter === f.id
                            ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/35 hover:text-[var(--text-primary)]/60'
                        }`}
                      >
                        {f.label}
                        {f.count > 0 && statusFilter === f.id && (
                          <span className="ml-1 text-[var(--accent)]">({f.count})</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Список */}
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-primary)]/30">Загрузка...</p>
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-[var(--text-primary)]/15" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]/40 mb-1">
                    {statusFilter !== 'all' ? 'Нет приглашений с таким статусом' : 'Нет приглашений'}
                  </p>
                  <p className="text-xs text-[var(--text-primary)]/25">Отправьте первое приглашение</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {filteredInvitations.map((inv, idx) => {
                    const status = getInvitationStatus(inv);
                    const roleMeta = getRoleMeta(inv.granted_roles?.[0] || inv.assigned_role);
                    const canRevoke = !inv.is_used && new Date(inv.expires_at) >= new Date();

                    return (
                      <div
                        key={inv.id}
                        className="px-5 py-4 hover:bg-[var(--hover-1)] transition-all duration-150 group/row animate-in fade-in duration-300"
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-[var(--hover-2)] group-hover/row:bg-[var(--hover-3)] flex items-center justify-center transition-colors">
                                <Mail className="w-4 h-4 text-[var(--text-primary)]/30" />
                              </div>
                              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{inv.email}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 ml-[42px]">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${roleMeta?.bg || 'bg-[var(--hover-2)]'} ${roleMeta?.color || 'text-[var(--text-primary)]/50'} border ${roleMeta?.borderColor || 'border-[var(--border-color)]'}`}>
                                {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                                {roleMeta?.label || inv.granted_roles?.[0] || inv.assigned_role}
                              </span>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${status.cls}`}>
                                <status.Icon className="w-3.5 h-3.5" />
                                {status.label}
                              </span>
                              {inv.counterparty_id && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">
                                  <Building2 className="w-3 h-3" />
                                  {counterparties.find(c => c.id === inv.counterparty_id)?.name || '...'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0 ml-[42px] sm:ml-0">
                            <div className="text-right">
                              <p className="text-xs font-medium text-[var(--text-primary)]/45">{formatDateTime(inv.created_at)}</p>
                              <p className="text-[11px] text-[var(--text-primary)]/25 mt-0.5">
                                до {formatDate(inv.expires_at)}
                              </p>
                            </div>
                            {canRevoke && (
                              <button
                                onClick={() => setRevokeTarget(inv)}
                                className="p-2.5 rounded-xl bg-transparent hover:bg-red-500/10 text-[var(--text-primary)]/20 hover:text-red-400 transition-all duration-200 opacity-0 group-hover/row:opacity-100 border border-transparent hover:border-red-500/20"
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
                <div className="px-5 py-4 border-t border-[var(--border-color)] flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]/35">
                    Страница {page} из {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 disabled:opacity-20 transition-colors border border-transparent hover:border-[var(--border-color)]"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 disabled:opacity-20 transition-colors border border-transparent hover:border-[var(--border-color)]"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar */}
        <div className="space-y-5">

          {/* Статистика */}
          {activeTab === 'history' && invitations.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5 shadow-sm">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--hover-2)] flex items-center justify-center">
                  <Users className="w-4 h-4 text-[var(--text-primary)]/40" />
                </div>
                Статистика
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Всего', value: stats.total, dot: 'bg-[var(--text-primary)]/20', valueCls: 'text-[var(--text-primary)]' },
                  { label: 'Ожидает', value: stats.pending, dot: 'bg-amber-400', valueCls: 'text-amber-400' },
                  { label: 'Принято', value: stats.used, dot: 'bg-emerald-400', valueCls: 'text-emerald-400' },
                  { label: 'Истекло', value: stats.expired, dot: 'bg-red-400', valueCls: 'text-red-400' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--hover-1)] transition-colors">
                    <span className="flex items-center gap-2.5 text-xs font-medium text-[var(--text-primary)]/45">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    <span className={`text-base font-bold ${s.valueCls}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Как это работает */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Как это работает?</h3>
            </div>
            <div className="space-y-4">
              {[
                { n: '1', title: 'Отправьте приглашение', desc: 'Укажите email, роль и контрагента', color: 'from-blue-500 to-blue-600' },
                { n: '2', title: 'Пользователь получит письмо', desc: 'Со ссылкой для регистрации', color: 'from-violet-500 to-violet-600' },
                { n: '3', title: 'Регистрация', desc: 'Создаёт аккаунт и получает доступ', color: 'from-emerald-500 to-emerald-600' },
              ].map((step, i) => (
                <div key={step.n} className="flex gap-3.5 group/step">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0`}>
                      {step.n}
                    </div>
                    {i < 2 && <div className="w-px h-full bg-[var(--border-color)] mt-1" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">{step.title}</p>
                    <p className="text-xs text-[var(--text-primary)]/35 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* О ролях */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-violet-400" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">О ролях</h3>
            </div>
            <div className="space-y-3">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--hover-1)] transition-colors group/roleinfo">
                  <div className={`w-8 h-8 rounded-lg ${r.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className={r.color}>{r.icon}</span>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${r.color}`}>{r.label}</p>
                    <p className="text-xs text-[var(--text-primary)]/35 leading-relaxed mt-0.5">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Важно */}
          <div className="bg-amber-500/5 rounded-2xl border border-amber-500/15 p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Важно</h3>
            </div>
            <p className="text-xs text-[var(--text-primary)]/45 leading-relaxed">
              Приглашение действительно <span className="text-amber-400 font-bold">7 дней</span>.
              После истечения срока необходимо отправить новое.
            </p>
          </div>
        </div>
      </div>

      {/* ── Модалка подтверждения отзыва ── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !revoking && setRevokeTarget(null)}
          />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="pt-8 flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-red-400" />
              </div>
            </div>

            <div className="px-7 pt-5 pb-2 text-center">
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Отозвать приглашение?</h2>
              <p className="text-sm text-[var(--text-primary)]/50 leading-relaxed">
                Приглашение для{' '}
                <span className="text-[var(--text-primary)] font-semibold">{revokeTarget.email}</span>{' '}
                будет отменено.
              </p>

              <div className="mt-4 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                  {(() => {
                    const roleMeta = getRoleMeta(revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role);
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${roleMeta?.bg || 'bg-[var(--hover-2)]'} ${roleMeta?.color || 'text-[var(--text-primary)]/50'} border ${roleMeta?.borderColor || 'border-[var(--border-color)]'}`}>
                        {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                        {roleMeta?.label || revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role}
                      </span>
                    );
                  })()}
                  {revokeTarget.counterparty_id && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--hover-2)] text-[var(--text-primary)]/40 border border-[var(--border-color)]">
                      <Building2 className="w-3 h-3" />
                      {counterparties.find(c => c.id === revokeTarget.counterparty_id)?.name || '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm font-semibold transition-all disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 hover:border-red-500/40 text-red-400 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {revoking ? 'Отзываем...' : 'Отозвать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}