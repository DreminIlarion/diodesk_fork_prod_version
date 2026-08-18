import { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, History, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, Trash2, ChevronLeft, ChevronRight, HelpCircle, Building2,
  Users, Shield, UserPlus, Search, X, Check, ChevronDown, RefreshCcw,
  User, Briefcase, HeadphonesIcon, Settings, Sparkles, ArrowRight,
  Calendar, Link2, Copy, CheckCheck,
} from 'lucide-react';
import { invitationsApi, counterpartiesApi } from '../api/client';
import type { Counterparty, Invitation, UserRole } from '../types';

// ─── Роли ─────────

interface RoleOption {
  value: UserRole;
  label: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  glowColor: string;
  group: 'client' | 'staff';
}

const ROLES: RoleOption[] = [
  {
    value: 'customer',
    label: 'Клиент',
    desc: 'Создаёт и отслеживает заявки',
    icon: <User className="w-5 h-5" />,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    glowColor: 'shadow-blue-500/20',
    group: 'client',
  },
  {
    value: 'customer_admin',
    label: 'Админ клиента',
    desc: 'Управляет заявками и сотрудниками',
    icon: <Briefcase className="w-5 h-5" />,
    gradient: 'from-cyan-500/20 to-teal-500/20',
    glowColor: 'shadow-cyan-500/20',
    group: 'client',
  },
  {
    value: 'support_agent',
    label: 'Агент поддержки',
    desc: 'Обрабатывает входящие заявки',
    icon: <HeadphonesIcon className="w-5 h-5" />,
    gradient: 'from-purple-500/20 to-pink-500/20',
    glowColor: 'shadow-purple-500/20',
    group: 'staff',
  },
  {
    value: 'support_manager',
    label: 'Менеджер',
    desc: 'Управляет командой и задачами',
    icon: <Settings className="w-5 h-5" />,
    gradient: 'from-orange-500/20 to-amber-500/20',
    glowColor: 'shadow-orange-500/20',
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
          w-full flex items-center gap-3 px-4 py-4 rounded-2xl text-left transition-all duration-200
          border-2 group
          ${open
            ? 'bg-white/[0.03] border-[var(--accent)]/40 shadow-lg shadow-[var(--accent)]/5'
            : value
              ? 'bg-white/[0.02] border-white/10 hover:border-white/20'
              : 'bg-white/[0.01] border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]'
          }
        `}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
          value ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20' : 'bg-white/[0.04] group-hover:bg-white/[0.06]'
        }`}>
          <Building2 className={`w-5 h-5 transition-colors ${value ? 'text-blue-400' : 'text-white/30'}`} />
        </div>
        {selected ? (
          <div className="flex-1 min-w-0">
            <span className="text-white/90 font-medium truncate block">{selected.name}</span>
            <span className="text-sm text-white/30">ИНН: {selected.inn}</span>
          </div>
        ) : (
          <span className="text-white/30 flex-1">Выберите контрагента...</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/20 hover:text-white/50 transition-all"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`text-white/20 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div
          className={`
            absolute z-50 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl 
            shadow-2xl shadow-black/40 overflow-hidden
            min-w-[280px] w-auto max-w-[calc(100vw-32px)]
            animate-in fade-in slide-in-from-top-2 duration-200
            ${dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          style={{ left: 0, right: 0, maxWidth: 'calc(100vw - 32px)' }}
        >
          <div className="p-3 border-b border-white/[0.06]">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Поиск по названию или ИНН..."
                className="w-full pl-10 pr-3 py-3 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-white/15 focus:bg-white/[0.06] transition-all"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Building2 className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-sm text-white/25">{query ? 'Ничего не найдено' : 'Нет контрагентов'}</p>
              </div>
            ) : (
              filtered.map(cp => {
                const isSelected = cp.id === value;
                return (
                  <button
                    key={cp.id}
                    onClick={() => { onChange(cp.id); setOpen(false); setQuery(''); }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm transition-all
                      ${isSelected ? 'bg-white/[0.06] text-white/90' : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'}
                    `}
                  >
                    {isSelected
                      ? <Check size={14} className="text-[var(--accent)] flex-shrink-0" />
                      : <span className="w-[14px] flex-shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{cp.name}</p>
                      <p className="text-xs text-white/25 truncate mt-0.5">
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
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dotCls: 'bg-emerald-400',
    Icon: CheckCircle2,
  };
  if (new Date(inv.expires_at) < new Date()) return {
    label: 'Истекло',
    cls: 'bg-red-500/10 text-red-400 border-red-500/20',
    dotCls: 'bg-red-400',
    Icon: XCircle,
  };
  return {
    label: 'Ожидает',
    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dotCls: 'bg-amber-400',
    Icon: Clock,
  };
}

// ─── Прогресс-бар заполнения формы ──────────────────────────────────────────

function FormProgress({ steps }: { steps: { done: boolean; label: string }[] }) {
  const completed = steps.filter(s => s.done).length;
  const progress = (completed / steps.length) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Прогресс</span>
        <span className="text-xs font-bold text-white/60">{completed}/{steps.length}</span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent)] to-pink-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
              step.done
                ? 'bg-gradient-to-br from-[var(--accent)] to-pink-500 text-white shadow-lg shadow-[var(--accent)]/20'
                : 'bg-white/[0.04] text-white/20 border border-white/[0.06]'
            }`}>
              {step.done ? <Check size={10} /> : i + 1}
            </div>
            <span className={`text-xs transition-colors ${step.done ? 'text-white/60' : 'text-white/20'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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
      setTimeout(() => setSuccess(false), 5000);
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

  const getDaysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const stats = {
    total: invitations.length,
    pending: invitations.filter(i => !i.is_used && new Date(i.expires_at) >= new Date()).length,
    used: invitations.filter(i => i.is_used).length,
    expired: invitations.filter(i => !i.is_used && new Date(i.expires_at) < new Date()).length,
  };

  const formSteps = [
    { done: !!email, label: 'Email' },
    { done: !!role, label: 'Роль' },
    { done: !needsCounterparty || !!counterpartyId, label: 'Контрагент' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* ── Hero Header ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--accent)]/10 via-purple-500/5 to-pink-500/10 border border-white/[0.06] p-8 md:p-10">
        {/* Декоративные элементы */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--accent)]/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-pink-500 flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">Приглашения</h1>
              </div>
            </div>
            <p className="text-base text-white/40 max-w-lg">
              Пригласите коллег и клиентов в систему. Выберите роль, укажите email — и готово.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {activeTab === 'history' && (
              <button
                onClick={loadInvitations}
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/40 hover:text-white/60 transition-all"
                title="Обновить"
              >
                <RefreshCcw className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ─── */}
      <div className="flex gap-1 p-1 bg-white/[0.02] border border-white/[0.06] rounded-2xl w-fit">
        {[
          { id: 'send' as const, label: 'Отправить', icon: Send },
          { id: 'history' as const, label: 'История', icon: History, count: totalItems },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-white/[0.06] text-white shadow-lg shadow-black/10 border border-white/[0.08]'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.02]'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === tab.id ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-white/[0.06] text-white/30'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">

          {/* ═══ Вкладка «Отправить» ═══ */}
          {activeTab === 'send' && (
            <div className="space-y-6">
              {/* Прогресс */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <FormProgress steps={formSteps} />
              </div>

              {/* Форма */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
                {/* Уведомления */}
                {success && (
                  <div className="m-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Приглашение отправлено!</p>
                      <p className="text-xs text-emerald-400/60">Пользователь получит письмо в течение минуты</p>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <div className="p-6 space-y-8">
                  {/* Email */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-white/60">
                      <Mail className="w-4 h-4" />
                      Email адрес
                      <span className="text-[var(--accent)]">*</span>
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/10 to-purple-500/10 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 blur-sm" />
                      <div className="relative">
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="user@company.ru"
                          className="w-full px-5 py-4 bg-white/[0.03] border-2 border-white/[0.06] rounded-2xl text-white/90 placeholder-white/20 focus:outline-none focus:border-[var(--accent)]/30 text-base transition-all duration-200"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Роль */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-white/60">
                      <Shield className="w-4 h-4" />
                      Роль пользователя
                      <span className="text-[var(--accent)]">*</span>
                    </label>

                    {/* Клиентские роли */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <Building2 className="w-3.5 h-3.5 text-blue-400/60" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-white/25">Клиент</span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                relative p-5 rounded-2xl border-2 text-left transition-all duration-200 group overflow-hidden
                                ${isSelected
                                  ? `bg-gradient-to-br ${r.gradient} border-white/15 shadow-lg ${r.glowColor}`
                                  : 'bg-white/[0.01] border-white/[0.06] hover:border-white/10 hover:bg-white/[0.03]'
                                }
                              `}
                            >
                              {isSelected && (
                                <div className="absolute top-3 right-3">
                                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                    <Check size={10} className="text-white" />
                                  </div>
                                </div>
                              )}
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.gradient} flex items-center justify-center mb-3 transition-all ${
                                isSelected ? 'scale-110' : 'group-hover:scale-105'
                              }`}>
                                <span className={isSelected ? 'text-white/90' : 'text-white/40'}>{r.icon}</span>
                              </div>
                              <p className={`text-sm font-semibold mb-1 ${isSelected ? 'text-white/90' : 'text-white/60'}`}>
                                {r.label}
                              </p>
                              <p className="text-xs text-white/30 leading-relaxed">{r.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Сотрудники */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <Shield className="w-3.5 h-3.5 text-purple-400/60" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-white/25">Сотрудник</span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                relative p-5 rounded-2xl border-2 text-left transition-all duration-200 group overflow-hidden
                                ${isSelected
                                  ? `bg-gradient-to-br ${r.gradient} border-white/15 shadow-lg ${r.glowColor}`
                                  : 'bg-white/[0.01] border-white/[0.06] hover:border-white/10 hover:bg-white/[0.03]'
                                }
                              `}
                            >
                              {isSelected && (
                                <div className="absolute top-3 right-3">
                                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                    <Check size={10} className="text-white" />
                                  </div>
                                </div>
                              )}
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.gradient} flex items-center justify-center mb-3 transition-all ${
                                isSelected ? 'scale-110' : 'group-hover:scale-105'
                              }`}>
                                <span className={isSelected ? 'text-white/90' : 'text-white/40'}>{r.icon}</span>
                              </div>
                              <p className={`text-sm font-semibold mb-1 ${isSelected ? 'text-white/90' : 'text-white/60'}`}>
                                {r.label}
                              </p>
                              <p className="text-xs text-white/30 leading-relaxed">{r.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Контрагент */}
                  {needsCounterparty && (
                    <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                      <label className="flex items-center gap-2 text-sm font-medium text-white/60">
                        <Building2 className="w-4 h-4" />
                        Контрагент
                        <span className="text-[var(--accent)]">*</span>
                      </label>
                      <CounterpartyDropdown
                        value={counterpartyId}
                        onChange={setCounterpartyId}
                        counterparties={counterparties}
                      />
                      {counterparties.length === 0 && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                          <AlertCircle className="w-4 h-4 text-amber-400/60 flex-shrink-0" />
                          <p className="text-xs text-amber-400/60">Нет контрагентов. Сначала создайте контрагента в разделе «Контрагенты».</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Превью */}
                  {isFormValid && (
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-white/[0.02] to-white/[0.04] border border-white/[0.06] animate-in fade-in duration-300">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-[var(--accent)]/60" />
                        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Предпросмотр</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/70">
                          <Mail className="w-3.5 h-3.5 text-white/30" />
                          {email}
                        </span>
                        <ArrowRight className="w-4 h-4 text-white/15" />
                        <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r ${selectedRole?.gradient || ''} border border-white/10 text-sm font-medium text-white/80`}>
                          {selectedRole?.icon}
                          {selectedRole?.label}
                        </span>
                        {needsCounterparty && counterpartyId && (
                          <>
                            <ArrowRight className="w-4 h-4 text-white/15" />
                            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/70">
                              <Building2 className="w-3.5 h-3.5 text-white/30" />
                              {counterparties.find(c => c.id === counterpartyId)?.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Кнопка отправки */}
                  <button
                    onClick={handleSend}
                    disabled={sending || !isFormValid}
                    className={`
                      w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-semibold
                      transition-all duration-200 relative overflow-hidden group
                      ${isFormValid
                        ? 'bg-gradient-to-r from-[var(--accent)] to-pink-500 hover:shadow-lg hover:shadow-[var(--accent)]/20 hover:scale-[1.01] active:scale-[0.99] text-white'
                        : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.06]'
                      }
                    `}
                  >
                    {isFormValid && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    )}
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                    ) : (
                      <>
                        <Send className="w-5 h-5 relative z-10" />
                        <span className="relative z-10">Отправить приглашение</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Вкладка «История» ═══ */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Фильтры */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                <h2 className="text-lg font-bold text-white/90">История приглашений</h2>
                <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
                  {[
                    { id: 'all' as const, label: 'Все', count: stats.total },
                    { id: 'pending' as const, label: 'Ожидает', count: stats.pending },
                    { id: 'used' as const, label: 'Принято', count: stats.used },
                    { id: 'expired' as const, label: 'Истекло', count: stats.expired },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      className={`
                        px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5
                        ${statusFilter === f.id
                          ? 'bg-white/[0.08] text-white shadow-sm'
                          : 'text-white/30 hover:text-white/50 hover:bg-white/[0.03]'
                        }
                      `}
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          statusFilter === f.id ? 'bg-white/10 text-white/70' : 'bg-white/[0.04] text-white/20'
                        }`}>
                          {f.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Список */}
              {loading ? (
                <div className="py-20 text-center bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                  <Loader2 className="w-8 h-8 text-[var(--accent)]/60 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-white/30">Загрузка...</p>
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="py-20 text-center bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                  <div className="w-20 h-20 rounded-3xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-10 h-10 text-white/10" />
                  </div>
                  <p className="text-base text-white/40 font-medium mb-1">
                    {statusFilter !== 'all' ? 'Нет приглашений с таким статусом' : 'Пока нет приглашений'}
                  </p>
                  <p className="text-sm text-white/20">
                    {statusFilter !== 'all' ? 'Попробуйте другой фильтр' : 'Отправьте первое приглашение'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInvitations.map((inv, index) => {
                    const status = getInvitationStatus(inv);
                    const roleMeta = getRoleMeta(inv.granted_roles?.[0] || inv.assigned_role);
                    const canRevoke = !inv.is_used && new Date(inv.expires_at) >= new Date();
                    const daysLeft = getDaysLeft(inv.expires_at);

                    return (
                      <div
                        key={inv.id}
                        className="group p-5 bg-white/[0.02] border border-white/[0.06] rounded-2xl hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-200"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          {/* Левая часть */}
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            {/* Аватар с инициалами */}
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${roleMeta?.gradient || 'from-white/5 to-white/10'} flex items-center justify-center flex-shrink-0`}>
                              {roleMeta?.icon || <User className="w-5 h-5 text-white/30" />}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <p className="text-sm font-semibold text-white/80 truncate">{inv.email}</p>
                                {/* Статус-бейдж */}
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.cls}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${status.dotCls} ${status.label === 'Ожидает' ? 'animate-pulse' : ''}`} />
                                  {status.label}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {roleMeta && (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-white/30">
                                    <span className="text-white/20">{roleMeta.icon}</span>
                                    {roleMeta.label}
                                  </span>
                                )}
                                {inv.counterparty_id && (
                                  <>
                                    <span className="text-white/10">·</span>
                                    <span className="inline-flex items-center gap-1 text-xs text-white/30">
                                      <Building2 className="w-3 h-3" />
                                      {counterparties.find(c => c.id === inv.counterparty_id)?.name || '...'}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Правая часть */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-white/30">{formatDateTime(inv.created_at)}</p>
                              {canRevoke && (
                                <p className="text-[10px] text-amber-400/50 mt-0.5">
                                  осталось {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}
                                </p>
                              )}
                            </div>
                            {canRevoke && (
                              <button
                                onClick={() => setRevokeTarget(inv)}
                                className="p-2.5 rounded-xl bg-red-500/5 hover:bg-red-500/15 border border-red-500/10 hover:border-red-500/20 text-red-400/40 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
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
                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                  <span className="text-xs text-white/30">
                    Стр. {page} из {totalPages} · {totalItems} приглашений
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-white/[0.06] text-white/30 disabled:opacity-20 transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                            page === pageNum
                              ? 'bg-white/[0.08] text-white'
                              : 'text-white/30 hover:bg-white/[0.04] hover:text-white/50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-white/[0.06] text-white/30 disabled:opacity-20 transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ─── */}
        <div className="space-y-5">

          {/* Статистика */}
          {activeTab === 'history' && invitations.length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-5">
              <h3 className="text-sm font-semibold text-white/60 flex items-center gap-2">
                <Users className="w-4 h-4 text-white/30" />
                Статистика
              </h3>
              
              {/* Визуальный прогресс-бар */}
              {stats.total > 0 && (
                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden flex">
                  {stats.used > 0 && (
                    <div className="h-full bg-emerald-400/60 transition-all duration-500" style={{ width: `${(stats.used / stats.total) * 100}%` }} />
                  )}
                  {stats.pending > 0 && (
                    <div className="h-full bg-amber-400/60 transition-all duration-500" style={{ width: `${(stats.pending / stats.total) * 100}%` }} />
                  )}
                  {stats.expired > 0 && (
                    <div className="h-full bg-red-400/60 transition-all duration-500" style={{ width: `${(stats.expired / stats.total) * 100}%` }} />
                  )}
                </div>
              )}

              <div className="space-y-3">
                {[
                  { label: 'Всего', value: stats.total, color: 'text-white/80', dot: 'bg-white/30' },
                  { label: 'Ожидает', value: stats.pending, color: 'text-amber-400', dot: 'bg-amber-400' },
                  { label: 'Принято', value: stats.used, color: 'text-emerald-400', dot: 'bg-emerald-400' },
                  { label: 'Истекло', value: stats.expired, color: 'text-red-400', dot: 'bg-red-400' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-1">
                    <span className="flex items-center gap-2.5 text-xs text-white/40">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Как это работает */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-blue-400/70" />
              </div>
              <h3 className="text-sm font-bold text-white/70">Как это работает</h3>
            </div>
            <div className="space-y-4">
              {[
                { n: '1', title: 'Заполните форму', desc: 'Email, роль и контрагент' },
                { n: '2', title: 'Отправка письма', desc: 'Пользователь получит ссылку' },
                { n: '3', title: 'Регистрация', desc: 'Доступ активируется автоматически' },
              ].map((step, i) => (
                <div key={step.n} className="flex gap-3.5">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)]/20 to-pink-500/20 flex items-center justify-center text-xs font-bold text-[var(--accent)]/80">
                      {step.n}
                    </div>
                    {i < 2 && <div className="absolute top-8 left-1/2 -translate-x-1/2 w-px h-4 bg-white/[0.06]" />}
                  </div>
                  <div className="pt-0.5">
                    <p className="text-xs font-semibold text-white/60">{step.title}</p>
                    <p className="text-xs text-white/25 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* О ролях */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-purple-400/70" />
              </div>
              <h3 className="text-sm font-bold text-white/70">О ролях</h3>
            </div>
            <div className="space-y-3">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.02] transition-colors">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${r.gradient} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white/60">{r.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/60">{r.label}</p>
                    <p className="text-[11px] text-white/25 truncate">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Важно */}
          <div className="bg-amber-500/[0.03] rounded-2xl border border-amber-500/10 p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-400/70" />
              </div>
              <h3 className="text-sm font-bold text-white/70">Срок действия</h3>
            </div>
            <p className="text-xs text-white/35 leading-relaxed">
              Приглашение действительно <span className="text-amber-400/70 font-semibold">7 дней</span>.
              После истечения срока необходимо отправить новое приглашение.
            </p>
          </div>
        </div>
      </div>

      {/* ── Модалка подтверждения отзыва ──────────────────────────────── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !revoking && setRevokeTarget(null)}
          />
          <div className="relative w-full max-w-md bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200">
            {/* Градиентная полоска сверху */}
            <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
            
            {/* Иконка */}
            <div className="pt-8 flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-400/80" />
              </div>
            </div>

            {/* Текст */}
            <div className="px-7 pt-5 pb-2 text-center">
              <h2 className="text-xl font-bold text-white/90 mb-2">Отозвать приглашение?</h2>
              <p className="text-sm text-white/40 leading-relaxed">
                Приглашение для{' '}
                <span className="text-white/70 font-semibold">{revokeTarget.email}</span>{' '}
                будет отменено. Пользователь не сможет зарегистрироваться.
              </p>

              {/* Детали */}
              <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  {(() => {
                    const roleMeta = getRoleMeta(revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role);
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r ${roleMeta?.gradient || 'from-white/5 to-white/10'} border border-white/10 font-medium text-white/60`}>
                        {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                        {roleMeta?.label || revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role}
                      </span>
                    );
                  })()}
                  {revokeTarget.counterparty_id && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40">
                      <Building2 className="w-3 h-3" />
                      {counterparties.find(c => c.id === revokeTarget.counterparty_id)?.name || '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-3 p-6 pt-4">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/50 text-sm font-medium transition-all disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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