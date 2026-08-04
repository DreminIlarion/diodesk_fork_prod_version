import { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, History, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, Trash2, ChevronLeft, ChevronRight, HelpCircle, Building2,
  Users, Shield, UserPlus, Search, X, Check, ChevronDown, RefreshCcw,
  User, Briefcase, HeadphonesIcon, Settings, ExternalLink, Copy,
} from 'lucide-react';
import { invitationsApi, counterpartiesApi } from '../api/client';
import type { Counterparty, Invitation, UserRole } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   ROLES CONFIG
   ═══════════════════════════════════════════════════════════════════ */

interface RoleOption {
  value: UserRole;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  borderColor: string;
  group: 'client' | 'staff';
}

const ROLES: RoleOption[] = [
  {
    value: 'customer',
    label: 'Клиент',
    desc: 'Создаёт и отслеживает заявки',
    icon: <User className="w-5 h-5" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    borderColor: 'border-blue-500/40',
    group: 'client',
  },
  {
    value: 'customer_admin',
    label: 'Админ клиента',
    desc: 'Управляет заявками и сотрудниками контрагента',
    icon: <Briefcase className="w-5 h-5" />,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/40',
    group: 'client',
  },
  {
    value: 'support_agent',
    label: 'Агент поддержки',
    desc: 'Обрабатывает входящие заявки',
    icon: <HeadphonesIcon className="w-5 h-5" />,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    borderColor: 'border-violet-500/40',
    group: 'staff',
  },
  {
    value: 'support_manager',
    label: 'Менеджер',
    desc: 'Управляет командой и распределяет задачи',
    icon: <Settings className="w-5 h-5" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    borderColor: 'border-amber-500/40',
    group: 'staff',
  },
];

const getRoleMeta = (v: string) => ROLES.find(r => r.value === v);

/* ═══════════════════════════════════════════════════════════════════
   COUNTERPARTY DROPDOWN
   ═══════════════════════════════════════════════════════════════════ */

function CounterpartyDropdown({
  value, onChange, counterparties,
}: {
  value: string;
  onChange: (v: string) => void;
  counterparties: Counterparty[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
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
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setQuery('');
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
        onClick={() => setOpen(!open)}
        className={[
          'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all border',
          open
            ? 'bg-[var(--hover-2)] border-[var(--accent)]/30 ring-2 ring-[var(--accent-ring)]'
            : value
              ? 'bg-[var(--hover-2)] border-[var(--border-color)] hover:border-[var(--accent)]/20'
              : 'bg-[var(--hover-2)] border-[var(--border-color)] hover:bg-[var(--hover-3)]',
        ].join(' ')}
      >
        <Building2 className="w-5 h-5 text-[var(--text-primary)]/35 shrink-0" />
        {selected ? (
          <div className="flex-1 min-w-0">
            <span className="text-[14px] text-[var(--text-primary)] truncate block font-medium">{selected.name}</span>
            <span className="text-[12px] text-[var(--text-primary)]/35">ИНН: {selected.inn}</span>
          </div>
        ) : (
          <span className="text-[14px] text-[var(--text-primary)]/35 flex-1">Выберите контрагента...</span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              className="p-1 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/25 hover:text-[var(--text-primary)]/50 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/25 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
          <div className="p-2.5 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/25" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Поиск по названию или ИНН..."
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-lg text-[14px] text-[var(--text-primary)] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 transition-all"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[14px] text-[var(--text-primary)]/25">
                {query ? 'Ничего не найдено' : 'Нет контрагентов'}
              </div>
            ) : (
              filtered.map(cp => {
                const isSelected = cp.id === value;
                return (
                  <button
                    key={cp.id}
                    onClick={() => { onChange(cp.id); setOpen(false); setQuery(''); }}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'bg-[var(--accent)]/8 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]',
                    ].join(' ')}
                  >
                    {isSelected
                      ? <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      : <span className="w-4 shrink-0" />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[14px]">{cp.name}</p>
                      <p className="text-[12px] text-[var(--text-primary)]/35 truncate">
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

/* ═══════════════════════════════════════════════════════════════════
   INVITATION STATUS
   ═══════════════════════════════════════════════════════════════════ */

function getInvitationStatus(inv: Invitation) {
  if (inv.is_used) return {
    label: 'Принято',
    cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    Icon: CheckCircle2,
    dot: 'bg-emerald-400',
  };
  if (new Date(inv.expires_at) < new Date()) return {
    label: 'Истекло',
    cls: 'bg-red-500/10 text-red-400 border border-red-500/20',
    Icon: XCircle,
    dot: 'bg-red-400',
  };
  return {
    label: 'Ожидает',
    cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    Icon: Clock,
    dot: 'bg-amber-400',
  };
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const timeAgo = (d: string) => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`;
  return formatDate(d);
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function InvitationsPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  // Form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // History
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
  const isFormValid = email && role && (!needsCounterparty || counterpartyId);

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
    } catch (e) { console.error(e); }
    finally { setRevoking(false); }
  };

  const filteredInvitations = invitations.filter(inv => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'used') return inv.is_used;
    if (statusFilter === 'expired') return !inv.is_used && new Date(inv.expires_at) < new Date();
    if (statusFilter === 'pending') return !inv.is_used && new Date(inv.expires_at) >= new Date();
    return true;
  });

  const stats = {
    total: invitations.length,
    pending: invitations.filter(i => !i.is_used && new Date(i.expires_at) >= new Date()).length,
    used: invitations.filter(i => i.is_used).length,
    expired: invitations.filter(i => !i.is_used && new Date(i.expires_at) < new Date()).length,
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
              <Mail className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Приглашения</h1>
          </div>
          <p className="text-[14px] text-[var(--text-primary)]/40 ml-[52px]">
            Пригласите новых пользователей в систему по email
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'history' && (
            <button onClick={loadInvitations}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] text-[14px] font-medium transition-colors">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-[var(--hover-2)] rounded-xl border border-[var(--border-color)] w-fit">
        {[
          { id: 'send' as const, label: 'Отправить', icon: Send },
          { id: 'history' as const, label: 'История', icon: History, count: totalItems },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]/70',
            ].join(' ')}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={[
                'px-1.5 py-0.5 rounded-md text-[11px] font-semibold',
                activeTab === tab.id
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'bg-[var(--hover-3)] text-[var(--text-primary)]/35',
              ].join(' ')}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">

          {/* ═══ TAB: Send ═══ */}
          {activeTab === 'send' && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">

              {/* Form header */}
              <div className="px-6 py-5 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Новое приглашение</h2>
                    <p className="text-[12px] text-[var(--text-primary)]/35 mt-0.5">Заполните данные для отправки</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">

                {/* Alerts */}
                {success && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-emerald-400">Приглашение отправлено!</p>
                      <p className="text-[12px] text-emerald-400/60 mt-0.5">Пользователь получит письмо со ссылкой для регистрации</p>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                    <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-[14px] text-red-400">{error}</p>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--text-primary)]/55 mb-2">
                    Email адрес <span className="text-[var(--accent)]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[var(--text-primary)]/30" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="user@company.ru"
                      className="w-full pl-12 pr-4 py-3.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[14px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
                    />
                  </div>
                </div>

                {/* Role selection */}
                <div>
                  <label className="block text-[14px] font-medium text-[var(--text-primary)]/55 mb-3">
                    Роль пользователя <span className="text-[var(--accent)]">*</span>
                  </label>

                  {/* Client roles */}
                  <div className="mb-4">
                    <p className="text-[11px] uppercase tracking-widest text-[var(--text-primary)]/25 mb-2.5 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      Клиентские роли
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {clientRoles.map(r => {
                        const isSelected = role === r.value;
                        return (
                          <button
                            key={r.value}
                            onClick={() => { setRole(r.value); if (r.group !== 'client') setCounterpartyId(''); }}
                            className={[
                              'p-4 rounded-xl border-2 text-left transition-all',
                              isSelected
                                ? `${r.bg} ${r.borderColor}`
                                : 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)] hover:border-[var(--border-color)]',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <span className={isSelected ? r.color : 'text-[var(--text-primary)]/30'}>{r.icon}</span>
                              <span className={`text-[14px] font-semibold ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60'}`}>
                                {r.label}
                              </span>
                            </div>
                            <p className="text-[12px] text-[var(--text-primary)]/35 leading-relaxed">{r.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Staff roles */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-[var(--text-primary)]/25 mb-2.5 flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" />
                      Сотрудники
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {staffRoles.map(r => {
                        const isSelected = role === r.value;
                        return (
                          <button
                            key={r.value}
                            onClick={() => { setRole(r.value); setCounterpartyId(''); }}
                            className={[
                              'p-4 rounded-xl border-2 text-left transition-all',
                              isSelected
                                ? `${r.bg} ${r.borderColor}`
                                : 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)] hover:border-[var(--border-color)]',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <span className={isSelected ? r.color : 'text-[var(--text-primary)]/30'}>{r.icon}</span>
                              <span className={`text-[14px] font-semibold ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60'}`}>
                                {r.label}
                              </span>
                            </div>
                            <p className="text-[12px] text-[var(--text-primary)]/35 leading-relaxed">{r.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Counterparty */}
                {needsCounterparty && (
                  <div>
                    <label className="block text-[14px] font-medium text-[var(--text-primary)]/55 mb-2">
                      Контрагент <span className="text-[var(--accent)]">*</span>
                    </label>
                    <CounterpartyDropdown
                      value={counterpartyId}
                      onChange={setCounterpartyId}
                      counterparties={counterparties}
                    />
                    {counterparties.length === 0 && (
                      <p className="mt-2 text-[12px] text-amber-400/70 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Нет контрагентов. Сначала создайте контрагента.
                      </p>
                    )}
                  </div>
                )}

                {/* Preview */}
                {isFormValid && (
                  <div className="p-4 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-xl">
                    <p className="text-[12px] text-[var(--text-primary)]/35 mb-2.5 uppercase tracking-wider font-medium">Превью приглашения</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1.5 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)] text-[14px] text-[var(--text-primary)]/70 font-mono">
                        {email}
                      </span>
                      <span className="text-[var(--text-primary)]/15">→</span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[14px] font-medium ${selectedRole?.bg} ${selectedRole?.color} ${selectedRole?.borderColor}`}>
                        {selectedRole?.icon}
                        {selectedRole?.label}
                      </span>
                      {needsCounterparty && counterpartyId && (
                        <>
                          <span className="text-[var(--text-primary)]/15">@</span>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)] text-[14px] text-[var(--text-primary)]/60">
                            <Building2 className="w-3.5 h-3.5" />
                            {counterparties.find(c => c.id === counterpartyId)?.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSend}
                  disabled={sending || !isFormValid}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-[14px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[var(--shadow-md)]"
                >
                  {sending ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4.5 h-4.5" />
                      Отправить приглашение
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ═══ TAB: History ═══ */}
          {activeTab === 'history' && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">

              {/* Header + filters */}
              <div className="px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-[16px] font-bold text-[var(--text-primary)]">История приглашений</h2>
                  <div className="flex gap-1 p-1 bg-[var(--hover-2)] rounded-lg">
                    {[
                      { id: 'all' as const, label: 'Все' },
                      { id: 'pending' as const, label: 'Ожидает' },
                      { id: 'used' as const, label: 'Принято' },
                      { id: 'expired' as const, label: 'Истекло' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setStatusFilter(f.id)}
                        className={[
                          'px-3 py-1.5 rounded-md text-[12px] font-medium transition-all',
                          statusFilter === f.id
                            ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-primary)]/35 hover:text-[var(--text-primary)]/55',
                        ].join(' ')}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin mx-auto mb-3" />
                  <p className="text-[14px] text-[var(--text-primary)]/30">Загрузка...</p>
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="py-20 text-center">
                  <Mail className="w-12 h-12 text-[var(--text-primary)]/10 mx-auto mb-3" />
                  <p className="text-[14px] font-medium text-[var(--text-primary)]/40 mb-1">
                    {statusFilter !== 'all' ? 'Нет приглашений с таким статусом' : 'Нет приглашений'}
                  </p>
                  <p className="text-[12px] text-[var(--text-primary)]/25">Отправьте первое приглашение</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {filteredInvitations.map(inv => {
                    const status = getInvitationStatus(inv);
                    const roleMeta = getRoleMeta(inv.granted_roles?.[0] || inv.assigned_role);
                    const canRevoke = !inv.is_used && new Date(inv.expires_at) >= new Date();

                    return (
                      <div key={inv.id} className="px-6 py-4 hover:bg-[var(--hover-1)] transition-colors group">
                        <div className="flex items-center justify-between gap-4">
                          {/* Left */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{inv.email}</p>
                              <span className="text-[12px] text-[var(--text-primary)]/20 shrink-0">·</span>
                              <span className="text-[12px] text-[var(--text-primary)]/30 shrink-0">{timeAgo(inv.created_at)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Role chip */}
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium ${roleMeta?.bg || 'bg-[var(--hover-2)]'} ${roleMeta?.color || 'text-[var(--text-primary)]/45'}`}>
                                {roleMeta?.icon || <User className="w-3 h-3" />}
                                {roleMeta?.label || inv.granted_roles?.[0] || inv.assigned_role}
                              </span>
                              {/* Status chip */}
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium ${status.cls}`}>
                                <status.Icon className="w-3 h-3" />
                                {status.label}
                              </span>
                              {/* Counterparty */}
                              {inv.counterparty_id && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] bg-[var(--hover-2)] text-[var(--text-primary)]/35">
                                  <Building2 className="w-3 h-3" />
                                  {counterparties.find(c => c.id === inv.counterparty_id)?.name || '...'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right hidden sm:block">
                              <p className="text-[12px] text-[var(--text-primary)]/25">
                                до {formatDate(inv.expires_at)}
                              </p>
                            </div>
                            {canRevoke && (
                              <button
                                onClick={() => setRevokeTarget(inv)}
                                className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--text-primary)]/25 hover:text-red-400 transition-all"
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-3.5 border-t border-[var(--border-color)] flex items-center justify-between">
                  <span className="text-[12px] text-[var(--text-primary)]/30">
                    Страница {page} из {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/35 disabled:opacity-20 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/35 disabled:opacity-20 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* Stats */}
          {activeTab === 'history' && invitations.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--text-primary)]/40" />
                Статистика
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Всего', value: stats.total, color: 'text-[var(--text-primary)]', dot: 'bg-[var(--text-primary)]/20' },
                  { label: 'Ожидает', value: stats.pending, color: 'text-amber-400', dot: 'bg-amber-400' },
                  { label: 'Принято', value: stats.used, color: 'text-emerald-400', dot: 'bg-emerald-400' },
                  { label: 'Истекло', value: stats.expired, color: 'text-red-400', dot: 'bg-red-400' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-1">
                    <span className="flex items-center gap-2.5 text-[14px] text-[var(--text-primary)]/45">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    <span className={`text-[16px] font-bold tabular-nums ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <HelpCircle className="w-4.5 h-4.5 text-blue-400" />
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Как это работает?</h3>
            </div>
            <div className="space-y-4">
              {[
                { n: '1', title: 'Отправьте приглашение', desc: 'Укажите email, роль и контрагента' },
                { n: '2', title: 'Пользователь получит письмо', desc: 'Со ссылкой для регистрации' },
                { n: '3', title: 'Регистрация', desc: 'Создаёт аккаунт и получает доступ' },
              ].map(step => (
                <div key={step.n} className="flex gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)]/15 flex items-center justify-center text-[12px] font-bold text-[var(--accent)] shrink-0">
                    {step.n}
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-[var(--text-primary)] leading-5">{step.title}</p>
                    <p className="text-[12px] text-[var(--text-primary)]/35 leading-4 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Roles info */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <Shield className="w-4.5 h-4.5 text-violet-400" />
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">О ролях</h3>
            </div>
            <div className="space-y-3.5">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${r.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className={r.color}>{r.icon}</span>
                  </div>
                  <div>
                    <p className={`text-[14px] font-medium ${r.color} leading-5`}>{r.label}</p>
                    <p className="text-[12px] text-[var(--text-primary)]/35 leading-4">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notice */}
          <div className="bg-amber-500/5 rounded-2xl border border-amber-500/15 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">Важно</h3>
                <p className="text-[12px] text-[var(--text-primary)]/40 leading-5">
                  Приглашение действительно <span className="text-[var(--text-primary)] font-medium">7 дней</span>.
                  После истечения срока необходимо отправить новое.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Revoke modal ── */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !revoking && setRevokeTarget(null)} />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }}>

            <div className="pt-8 flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-400" />
              </div>
            </div>

            <div className="px-7 pt-5 pb-2 text-center">
              <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">Отозвать приглашение?</h2>
              <p className="text-[14px] text-[var(--text-primary)]/50 leading-relaxed">
                Приглашение для{' '}
                <span className="text-[var(--text-primary)] font-semibold">{revokeTarget.email}</span>{' '}
                будет отменено.
              </p>

              <div className="mt-4 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(() => {
                    const roleMeta = getRoleMeta(revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role);
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium ${roleMeta?.bg || 'bg-[var(--hover-2)]'} ${roleMeta?.color || 'text-[var(--text-primary)]/45'}`}>
                        {roleMeta?.icon || <User className="w-3.5 h-3.5" />}
                        {roleMeta?.label || revokeTarget.granted_roles?.[0] || revokeTarget.assigned_role}
                      </span>
                    );
                  })()}
                  {revokeTarget.counterparty_id && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] bg-[var(--hover-2)] text-[var(--text-primary)]/35">
                      <Building2 className="w-3 h-3" />
                      {counterparties.find(c => c.id === revokeTarget.counterparty_id)?.name || '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6">
              <button onClick={() => setRevokeTarget(null)} disabled={revoking}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/65 text-[14px] font-medium transition-colors disabled:opacity-50">
                Отмена
              </button>
              <button onClick={handleRevoke} disabled={revoking}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 text-[14px] font-medium transition-all disabled:opacity-50">
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