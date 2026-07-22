// pages/MyCompanyPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Phone, Mail, MapPin, Users,
  Calendar, User, MessageSquare, Loader2, AlertCircle,
  ExternalLink, Crown, GitBranch, Ticket,
  ChevronRight, Settings, Plus,
  Globe, X, CheckCircle2, UserPlus, Trash2,
  ChevronLeft, Package, Layers,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { counterpartiesApi, usersApi, ticketsApi, productsApi } from '@/api/client';
import type { Counterparty, CounterpartyCustomer, TicketListItem } from '@/types';

/* ═══════════════════════════════════════════════════════════════════
   РОЛИ
   ═══════════════════════════════════════════════════════════════════ */

function useRoles() {
  const { user } = useAuthStore();
  const roles: string[] = user?.roles ?? [];
  const isCustomer      = roles.includes('customer');
  const isCustomerAdmin = roles.includes('customer_admin');
  return { roles, isCustomer, isCustomerAdmin, isClientUser: isCustomer || isCustomerAdmin };
}

/* ═══════════════════════════════════════════════════════════════════
   СТАТУСЫ / ПРИОРИТЕТЫ (перевод с английского)
   ═══════════════════════════════════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new:              { label: 'Новый',           color: 'status-new' },
  pending_approval: { label: 'На согласовании', color: 'status-agreement' },
  open:             { label: 'Открыт',          color: 'status-open' },
  in_progress:      { label: 'В работе',        color: 'status-progress' },
  waiting:          { label: 'Ожидает ответа',  color: 'status-waiting' },
  resolved:         { label: 'Решён',           color: 'status-resolved' },
  closed:           { label: 'Закрыт',          color: 'status-closed' },
  reopened:         { label: 'Переоткрыт',      color: 'status-reopened' },
  rejected:         { label: 'Отклонён',        color: 'status-rejected' },
  cancelled:        { label: 'Отменён',         color: 'status-closed' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low:      { label: 'Низкий',      color: 'priority-low' },
  medium:   { label: 'Средний',     color: 'priority-medium' },
  high:     { label: 'Высокий',     color: 'priority-high' },
  critical: { label: 'Критический', color: 'priority-critical' },
};

const getStatusLabel  = (s: string) => STATUS_MAP[s]?.label  ?? s;
const getStatusColor  = (s: string) => STATUS_MAP[s]?.color  ?? 'status-closed';
const getPriorityLabel = (p: string) => PRIORITY_MAP[p]?.label ?? p;
const getPriorityColor = (p: string) => PRIORITY_MAP[p]?.color ?? 'priority-medium';

/* ═══════════════════════════════════════════════════════════════════
   PHONE MASK
   ═══════════════════════════════════════════════════════════════════ */

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
  if (digits.startsWith('7')) return '8' + digits.slice(1);
  return digits;
}

function PhoneInput({ value, onChange, placeholder = '+7 (999) 123-45-67', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input type="tel" value={value}
      onChange={e => { const digits = e.target.value.replace(/\D/g, ''); onChange(formatPhone(digits)); }}
      onKeyDown={e => {
        if (e.key === 'Backspace') {
          const digits = value.replace(/\D/g, '');
          if (digits.length > 0) { onChange(digits.length <= 1 ? '' : formatPhone(digits.slice(0, -1))); e.preventDefault(); }
        }
      }}
      placeholder={placeholder} className={className}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base' }[size];
  return (
    <div className={`${cls} rounded-full bg-gradient-to-br from-red-800 to-red-700
                    flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}>
      {getInitials(name)}
    </div>
  );
}

const fmtDate     = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (d: string) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const getEmployeeRoleInfo = (role: string) => {
  const roles: Record<string, { label: string; icon: JSX.Element; color: string }> = {
    customer_admin: { label: 'Администратор', icon: <Crown className="w-3.5 h-3.5" />,  color: 'status-reopened' },
    customer:       { label: 'Сотрудник',     icon: <User className="w-3.5 h-3.5" />,   color: 'status-closed' },
  };
  return roles[role] ?? { label: 'Пользователь', icon: <User className="w-3.5 h-3.5" />, color: 'status-closed' };
};

const inputCls = `w-full px-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
  text-[var(--text-primary)] text-base placeholder-white/25
  focus:outline-none focus:border-red-500/30 focus:ring-2 focus:ring-red-500/20 transition-all`;

const inputWithIconCls = `w-full pl-10 pr-4 py-3 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl
  text-[var(--text-primary)] text-base placeholder-white/25
  focus:outline-none focus:border-red-500/30 focus:ring-2 focus:ring-red-500/20 transition-all`;

/* ═══════════════════════════════════════════════════════════════════
   ВКЛАДКИ
   ═══════════════════════════════════════════════════════════════════ */

type TabType = 'info' | 'contacts' | 'products' | 'branches' | 'employees' | 'tickets';

/* ═══════════════════════════════════════════════════════════════════
   ОСНОВНОЙ КОМПОНЕНТ
   ═══════════════════════════════════════════════════════════════════ */

export default function MyCompanyPage() {
  const { user } = useAuthStore();
  const { isCustomer, isCustomerAdmin } = useRoles();

  /* ── Права по ролям ── */
  // customer        → Информация, Контакты, Продукты, Подразделения, Заявки
  // customer_admin  → + Сотрудники
  const canViewEmployees = isCustomerAdmin;
  const canEditContacts  = isCustomerAdmin;

  /* ── State ── */
  const [company,    setCompany]    = useState<Counterparty | null>(null);
  const [branches,   setBranches]   = useState<Counterparty[]>([]);
  const [employees,  setEmployees]  = useState<CounterpartyCustomer[]>([]);
  const [products,   setProducts]   = useState<any[]>([]);
  const [tickets,    setTickets]    = useState<TicketListItem[]>([]);

  const [ticketsPage,       setTicketsPage]       = useState(1);
  const [ticketsTotalPages, setTicketsTotalPages] = useState(1);
  const [ticketsTotalItems, setTicketsTotalItems] = useState(0);

  const [loading,          setLoading]          = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingTickets,   setLoadingTickets]   = useState(false);
  const [loadingProducts,  setLoadingProducts]  = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [activeTab,        setActiveTab]        = useState<TabType>('info');

  /* ── Форма контактного лица ── */
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({
    last_name: '', first_name: '', middle_name: '',
    phone: '', email: '', telegram: '', vk: '',
  });
  const [savingContact,  setSavingContact]  = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState<any | null>(null);
  const [deletingContact,setDeletingContact]= useState(false);

  /* ═══════════════════════════════════════════════════════════════════
     ЗАГРУЗКА КОМПАНИИ
     ═══════════════════════════════════════════════════════════════════ */

  const loadCompany = useCallback(async () => {
    if (!user?.counterparty_id) { setError('Вы не привязаны к компании'); setLoading(false); return; }
    try {
      setLoading(true);
      const companyData = await counterpartiesApi.getById(user.counterparty_id);
      setCompany(companyData);
      try {
        const all = await counterpartiesApi.getAll(1, 100);
        setBranches(all.items.filter((cp: Counterparty) => cp.parent_id === companyData.id));
      } catch { setBranches([]); }
      setError(null);
    } catch { setError('Не удалось загрузить данные компании'); }
    finally { setLoading(false); }
  }, [user?.counterparty_id]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  /* ═══════════════════════════════════════════════════════════════════
     ЗАГРУЗКА СОТРУДНИКОВ (только customer_admin)
     ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!canViewEmployees || !company?.id) return;
    setLoadingEmployees(true);
    usersApi.getCustomers(company.id, 1, 100)
      .then(res => setEmployees(res.items ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, [canViewEmployees, company?.id]);

  /* ═══════════════════════════════════════════════════════════════════
     ЗАГРУЗКА ПРОДУКТОВ
     ═══════════════════════════════════════════════════════════════════ */

  const loadProducts = useCallback(async () => {
    if (!company?.id) return;
    setLoadingProducts(true);
    try {
      const res = await counterpartiesApi.getProducts(company.id, 1, 50);
      setProducts(res.items ?? []);
    } catch { setProducts([]); }
    finally { setLoadingProducts(false); }
  }, [company?.id]);

  useEffect(() => {
    if (company?.id) loadProducts();
  }, [company?.id, loadProducts]);

  /* ═══════════════════════════════════════════════════════════════════
     ЗАГРУЗКА ЗАЯВОК
     ═══════════════════════════════════════════════════════════════════ */

  const TICKETS_PER_PAGE = 10;

  const loadTickets = useCallback(async (page = 1) => {
    if (!company?.id) return;
    setLoadingTickets(true);
    try {
      // ticketsApi.getAll с фильтром по проектам компании (бэкенд фильтрует по контрагенту)
      const res = await ticketsApi.getAll(page, TICKETS_PER_PAGE, {});
      setTickets(res.items ?? []);
      setTicketsPage(res.page ?? page);
      setTicketsTotalPages(res.total_pages ?? 1);
      setTicketsTotalItems(res.total_items ?? 0);
    } catch {
      setTickets([]);
      setTicketsTotalItems(0);
      setTicketsTotalPages(1);
    } finally { setLoadingTickets(false); }
  }, [company?.id]);

  useEffect(() => { if (company?.id) loadTickets(1); }, [company?.id, loadTickets]);

  /* ═══════════════════════════════════════════════════════════════════
     КОНТАКТНЫЕ ЛИЦА
     ═══════════════════════════════════════════════════════════════════ */

  const setContactField = (f: string) => (v: string) =>
    setContactForm(p => ({ ...p, [f]: v }));

  const resetContactForm = () => {
    setContactForm({ last_name: '', first_name: '', middle_name: '', phone: '', email: '', telegram: '', vk: '' });
    setShowContactForm(false);
  };

  const handleSaveContact = async () => {
    if (!contactForm.last_name.trim() || !contactForm.first_name.trim() || !company?.id) return;
    setSavingContact(true);
    try {
      const messengers: Record<string, string> = {};
      if (contactForm.telegram.trim()) messengers.telegram = contactForm.telegram.trim().replace('@', '');
      if (contactForm.vk.trim())       messengers.vk       = contactForm.vk.trim();
      await counterpartiesApi.updateContactPerson(company.id, {
        first_name:  contactForm.first_name.trim(),
        last_name:   contactForm.last_name.trim(),
        middle_name: contactForm.middle_name.trim() || undefined,
        phone:       contactForm.phone.trim() ? phoneToApi(contactForm.phone) : undefined,
        email:       contactForm.email.trim() || undefined,
        messengers:  Object.keys(messengers).length > 0 ? messengers : undefined,
      });
      resetContactForm();
      loadCompany();
    } catch (e) { console.error(e); }
    finally { setSavingContact(false); }
  };

  const handleDeleteContact = async (person: any) => {
    if ((!person.phone && !person.email) || !company?.id) return;
    setDeletingContact(true);
    try {
      await counterpartiesApi.deleteContactPerson(company.id, { phone: person.phone, email: person.email });
      setConfirmDelete(null);
      loadCompany();
    } catch (e) { console.error(e); }
    finally { setDeletingContact(false); }
  };

  /* ═══════════════════════════════════════════════════════════════════
     ВКЛАДКИ
     customer        → info, contacts, products, branches, tickets
     customer_admin  → + employees
     ═══════════════════════════════════════════════════════════════════ */

  const tabs: { id: TabType; label: string; icon: any; count?: number }[] = [
    { id: 'info',      label: 'Информация',    icon: Building2 },
    { id: 'contacts',  label: 'Контакты',      icon: User,     count: company?.contact_persons?.length ?? 0 },
    { id: 'products',  label: 'Продукты',      icon: Package,  count: products.length },
    ...(branches.length > 0
      ? [{ id: 'branches' as TabType, label: 'Подразделения', icon: GitBranch, count: branches.length }]
      : []),
    ...(canViewEmployees
      ? [{ id: 'employees' as TabType, label: 'Сотрудники', icon: Users, count: employees.length }]
      : []),
    { id: 'tickets', label: 'Заявки', icon: Ticket, count: ticketsTotalItems },
  ];

  /* ═══════════════════════════════════════════════════════════════════
     LOADING / ERROR
     ═══════════════════════════════════════════════════════════════════ */

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
    </div>
  );

  if (error || !company) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Компания не найдена</h2>
        <p className="text-base text-[var(--text-primary)]/50">{error ?? 'Вы не привязаны ни к одной компании'}</p>
      </div>
    </div>
  );

  const persons = company.contact_persons ?? [];

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0">
            {company.avatar_url
              ? <img src={company.avatar_url} alt={company.name} className="w-16 h-16 rounded-2xl object-cover" />
              : <Building2 className="w-8 h-8 text-[var(--text-primary)]" />
            }
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{company.name}</h1>
              <span className={`px-3 py-1 rounded-lg text-base font-medium border ${company.is_active ? 'status-resolved' : 'status-closed'}`}>
                {company.is_active ? 'Активен' : 'Неактивен'}
              </span>
              {branches.length > 0 && (
                <span className="px-3 py-1 rounded-lg text-base font-medium status-waiting">Головная компания</span>
              )}
            </div>
            <p className="text-[var(--text-primary)]/50 text-base">{company.legal_name}</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 border-b border-[var(--border-color)] overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl transition-all whitespace-nowrap
              ${activeTab === tab.id
                ? 'bg-red-800/50 text-white border-b-2 border-red-500'
                : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)]'
              }`}>
            <tab.icon className="w-4 h-4" />
            <span className="text-base font-medium">{tab.label}</span>
            {(tab.count ?? 0) > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">

          {/* ═══ Информация ═══ */}
          {activeTab === 'info' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { label: 'ИНН',   value: company.inn },
                  { label: 'КПП',   value: company.kpp },
                  { label: 'ОКПО',  value: company.okpo },
                  { label: 'Тип',   value: company.counterparty_type },
                ].map(field => (
                  <div key={field.label} className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                    <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-2">{field.label}</p>
                    <p className="text-base font-semibold text-[var(--text-primary)]">{field.value || '—'}</p>
                  </div>
                ))}
              </div>

              {company.address && (
                <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                  <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-2 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Адрес
                  </p>
                  <p className="text-base text-[var(--text-primary)]">{company.address}</p>
                </div>
              )}

              <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
                <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-2 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Дата регистрации
                </p>
                <p className="text-base text-[var(--text-primary)] font-medium">{fmtDateTime(company.created_at)}</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: GitBranch, value: branches.length,      label: 'Подразделений' },
                  { icon: Ticket,    value: ticketsTotalItems,     label: 'Заявок' },
                  { icon: Package,   value: products.length,       label: 'Продуктов' },
                ].map(s => (
                  <div key={s.label} className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5 text-center">
                    <s.icon className="w-5 h-5 text-[var(--text-primary)]/40 mx-auto mb-3" />
                    <p className="text-3xl font-bold text-[var(--text-primary)] mb-1">{s.value}</p>
                    <p className="text-sm text-[var(--text-primary)]/40">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Контакты ═══ */}
          {activeTab === 'contacts' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <User className="w-5 h-5 text-[var(--text-primary)]/40" /> Контактные лица
                  {persons.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">{persons.length}</span>
                  )}
                </h2>
                {canEditContacts && (
                  <button
                    onClick={() => showContactForm ? resetContactForm() : setShowContactForm(true)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-base font-medium transition-all
                      ${showContactForm ? 'bg-[var(--hover-2)] text-[var(--text-primary)]/70' : 'bg-red-700 text-white shadow-md'}`}>
                    {showContactForm ? <X size={16} /> : <Plus size={16} />}
                    {showContactForm ? 'Отмена' : 'Добавить'}
                  </button>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* Форма добавления */}
                {showContactForm && (
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-5 space-y-4">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <UserPlus size={16} className="text-red-400" /> Новое контактное лицо
                    </h3>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Фамилия <span className="text-red-400">*</span></label>
                        <input value={contactForm.last_name} onChange={e => setContactField('last_name')(e.target.value)} placeholder="Иванов" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Имя <span className="text-red-400">*</span></label>
                        <input value={contactForm.first_name} onChange={e => setContactField('first_name')(e.target.value)} placeholder="Иван" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Отчество</label>
                        <input value={contactForm.middle_name} onChange={e => setContactField('middle_name')(e.target.value)} placeholder="Иванович" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Телефон</label>
                        <div className="relative">
                          <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none" />
                          <PhoneInput value={contactForm.phone} onChange={setContactField('phone')} className={inputWithIconCls} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Email</label>
                        <div className="relative">
                          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none" />
                          <input type="email" value={contactForm.email} onChange={e => setContactField('email')(e.target.value)}
                            placeholder="contact@company.ru" className={inputWithIconCls} />
                        </div>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">Telegram</label>
                        <div className="relative">
                          <MessageSquare size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none" />
                          <input value={contactForm.telegram} onChange={e => setContactField('telegram')(e.target.value)}
                            placeholder="username" className={inputWithIconCls} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-primary)]/50 mb-1.5">ВКонтакте</label>
                        <div className="relative">
                          <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25 pointer-events-none" />
                          <input value={contactForm.vk} onChange={e => setContactField('vk')(e.target.value)}
                            placeholder="id или username" className={inputWithIconCls} />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={resetContactForm} disabled={savingContact}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base font-medium transition-colors disabled:opacity-50">
                        Отмена
                      </button>
                      <button onClick={handleSaveContact}
                        disabled={savingContact || !contactForm.last_name.trim() || !contactForm.first_name.trim()}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 text-white text-base font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md">
                        {savingContact ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {savingContact ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Подтверждение удаления */}
                {confirmDelete && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Удалить контактное лицо?</p>
                        <p className="text-sm text-[var(--text-primary)]/60 mb-4">
                          <span className="font-medium text-[var(--text-primary)]">{confirmDelete.full_name}</span> будет удалён.
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmDelete(null)}
                            className="flex-1 px-3 py-2 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm font-medium transition-colors">
                            Отмена
                          </button>
                          <button onClick={() => handleDeleteContact(confirmDelete)} disabled={deletingContact}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-sm font-medium transition-colors disabled:opacity-50">
                            {deletingContact ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Список контактных лиц */}
                {persons.length === 0 && !showContactForm ? (
                  <div className="text-center py-16">
                    <User size={36} className="text-[var(--text-primary)]/15 mx-auto mb-4" />
                    <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Контактные лица не указаны</p>
                    <p className="text-[var(--text-primary)]/40 text-sm mb-5">Добавьте контактное лицо для связи</p>
                    {canEditContacts && (
                      <button onClick={() => setShowContactForm(true)} className="text-red-400 hover:text-red-300 transition-colors text-base">
                        Добавить контактное лицо →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {persons.map((person: any, i: number) => (
                      <div key={i} className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
                        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)]">
                          <div className="flex items-center gap-3">
                            <Avatar name={person.full_name} size="md" />
                            <div>
                              <p className="text-base font-semibold text-[var(--text-primary)]">{person.full_name}</p>
                              <p className="text-sm text-[var(--text-primary)]/40">Контактное лицо</p>
                            </div>
                          </div>
                          {canEditContacts && (
                            <button onClick={() => setConfirmDelete(confirmDelete?.full_name === person.full_name ? null : person)}
                              className="p-2 rounded-xl hover:bg-red-500/10 text-[var(--text-primary)]/40 hover:text-red-400 transition-colors flex-shrink-0" title="Удалить">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="p-4 grid md:grid-cols-2 gap-3">
                          {person.phone && (
                            <div className="flex items-start gap-3 p-3.5">
                              <Phone size={15} className="text-[var(--text-primary)]/40 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-[var(--text-primary)]/40 mb-0.5">Телефон</p>
                                <a href={`tel:${person.phone}`} className="text-sm text-[var(--text-primary)] hover:text-red-400 transition-colors">{person.phone}</a>
                              </div>
                            </div>
                          )}
                          {person.email && (
                            <div className="flex items-start gap-3 p-3.5">
                              <Mail size={15} className="text-[var(--text-primary)]/40 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-[var(--text-primary)]/40 mb-0.5">Email</p>
                                <a href={`mailto:${person.email}`} className="text-sm text-[var(--text-primary)] hover:text-red-400 transition-colors break-all">{person.email}</a>
                              </div>
                            </div>
                          )}
                          {person.messengers?.telegram && (
                            <div className="flex items-start gap-3 p-3.5">
                              <MessageSquare size={15} className="text-[var(--text-primary)]/40 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-[var(--text-primary)]/40 mb-0.5">Telegram</p>
                                <a href={`https://t.me/${person.messengers.telegram.replace('@', '')}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-sm text-[var(--text-primary)] hover:text-red-400 transition-colors flex items-center gap-1.5">
                                  @{person.messengers.telegram.replace('@', '')}
                                  <ExternalLink size={12} className="text-[var(--text-primary)]/40" />
                                </a>
                              </div>
                            </div>
                          )}
                          {person.messengers?.vk && (
                            <div className="flex items-start gap-3 p-3.5">
                              <Globe size={15} className="text-[var(--text-primary)]/40 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-[var(--text-primary)]/40 mb-0.5">ВКонтакте</p>
                                <a href={`https://vk.com/${person.messengers.vk}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-sm text-[var(--text-primary)] hover:text-red-400 transition-colors flex items-center gap-1.5">
                                  {person.messengers.vk}
                                  <ExternalLink size={12} className="text-[var(--text-primary)]/40" />
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Продукты ═══ */}
          {activeTab === 'products' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-[var(--text-primary)]/40" /> Продукты
                  {products.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">{products.length}</span>
                  )}
                </h2>
              </div>
              <div className="p-6">
                {loadingProducts ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]/20" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-16">
                    <Package size={36} className="text-[var(--text-primary)]/15 mx-auto mb-4" />
                    <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Нет привязанных продуктов</p>
                    <p className="text-[var(--text-primary)]/40 text-sm">Продукты появятся после привязки вашим менеджером</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {products.map((product: any) => (
                      <div key={product.id} className="flex items-center gap-4 py-4 px-2">
                        <div className="w-10 h-10 rounded-xl bg-[var(--hover-1)] flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-[var(--text-primary)]/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-[var(--text-primary)] truncate">
                            {product.display_name || product.name}
                          </p>
                          <p className="text-sm text-[var(--text-primary)]/40 truncate">{product.vendor}</p>
                        </div>
                        {product.environment && (
                          <span className="px-2.5 py-1 rounded-lg text-sm font-medium bg-[var(--hover-1)] border border-[var(--border-color)] text-[var(--text-primary)]/60 flex-shrink-0">
                            {product.environment}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Подразделения ═══ */}
          {activeTab === 'branches' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <GitBranch className="w-5 h-5 text-amber-400" /> Подразделения
                  <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">{branches.length}</span>
                </h2>
              </div>
              <div className="p-6">
                {branches.length === 0 ? (
                  <div className="text-center py-16">
                    <GitBranch className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                    <p className="text-[var(--text-primary)]/50 text-base">Нет подразделений</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {branches.map(branch => (
                      <div key={branch.id} className="flex items-center gap-4 py-4 px-2">
                        <div className="w-10 h-10 rounded-xl bg-[var(--status-waiting-bg)] flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-[var(--status-waiting-text)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--text-primary)] font-semibold text-base truncate">{branch.name}</p>
                          <p className="text-[var(--text-primary)]/40 text-sm truncate">{branch.legal_name}</p>
                        </div>
                        <div className="text-right text-sm text-[var(--text-primary)]/40 flex-shrink-0">
                          {branch.inn && <p>ИНН {branch.inn}</p>}
                          {branch.kpp && <p>КПП {branch.kpp}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Сотрудники (только customer_admin) ═══ */}
          {activeTab === 'employees' && canViewEmployees && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-[var(--text-primary)]/40" /> Сотрудники
                  {employees.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">{employees.length}</span>
                  )}
                </h2>
              </div>
              <div className="p-6">
                {loadingEmployees ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]/20" />
                  </div>
                ) : employees.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                    <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Пока нет сотрудников</p>
                    <p className="text-[var(--text-primary)]/40 text-sm">Вы можете пригласить коллег через раздел «Приглашения»</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {employees.map(emp => {
                      const roleInfo = getEmployeeRoleInfo(emp.role);
                      const isMe = emp.id === user?.user_id;
                      return (
                        <div key={emp.id} className={`flex items-center gap-4 py-4 px-2 rounded-xl ${isMe ? 'bg-red-500/[0.04]' : ''}`}>
                          <Avatar name={emp.full_name || emp.username} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[var(--text-primary)] font-semibold text-base truncate">
                                {emp.full_name || emp.username}
                              </span>
                              {isMe && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-[var(--text-primary)]/50">Вы</span>
                              )}
                            </div>
                            <p className="text-[var(--text-primary)]/40 text-sm truncate">{emp.email}</p>
                          </div>
                          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border flex-shrink-0 ${roleInfo.color}`}>
                            {roleInfo.icon}{roleInfo.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ Заявки ═══ */}
          {activeTab === 'tickets' && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--hover-1)]">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                  <Ticket className="w-5 h-5 text-[var(--text-primary)]/40" /> Заявки
                  {ticketsTotalItems > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--hover-3)] text-sm text-[var(--text-primary)]/50">
                      {ticketsTotalItems}
                    </span>
                  )}
                </h2>
                <Link to="/tickets/new"
                  className="btn-primary flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-base font-medium shadow-md">
                  <Plus className="w-4 h-4" /> Создать
                </Link>
              </div>

              <div className="p-6">
                {loadingTickets ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]/20" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-20">
                    <Ticket className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
                    <p className="text-[var(--text-primary)]/50 text-base font-semibold mb-1">Нет заявок</p>
                    <p className="text-[var(--text-primary)]/40 text-sm mb-5">У вашей компании пока нет заявок</p>
                    <Link to="/tickets/new" className="text-[var(--accent-light)] hover:text-[var(--accent)] transition-colors text-base font-medium">
                      Создать первую заявку →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {tickets.map(ticket => (
                      <Link key={ticket.id} to={`/tickets/${ticket.number}`}
                        className="flex items-start justify-between gap-4 py-4 px-2 hover:bg-[var(--hover-1)] rounded-xl transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {/* Номер */}
                            <span className="text-red-400 font-mono text-sm bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg">
                              #{ticket.number}
                            </span>
                            {/* Статус — переводим с английского */}
                            <span className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${getStatusColor(ticket.status)}`}>
                              {getStatusLabel(ticket.status)}
                            </span>
                            {/* Приоритет — переводим с английского */}
                            <span className={`px-2.5 py-0.5 rounded-lg text-sm font-medium border ${getPriorityColor(ticket.priority)}`}>
                              {getPriorityLabel(ticket.priority)}
                            </span>
                          </div>
                          <p className="text-[var(--text-primary)] font-medium text-base group-hover:text-red-400 transition-colors truncate">
                            {ticket.title}
                          </p>
                          <p className="text-[var(--text-primary)]/40 text-sm mt-1">{fmtDate(ticket.created_at)}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                      </Link>
                    ))}
                  </div>
                )}

                {/* Пагинация */}
                {ticketsTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-6 border-t border-[var(--border-color)]">
                    <button
                      onClick={() => { const p = Math.max(1, ticketsPage - 1); setTicketsPage(p); loadTickets(p); }}
                      disabled={ticketsPage === 1}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]
                                 hover:bg-[var(--hover-3)] disabled:opacity-40 disabled:cursor-not-allowed
                                 text-[var(--text-primary)] text-base transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Назад
                    </button>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: Math.min(5, ticketsTotalPages) }, (_, i) => {
                        const pageNum = Math.max(1, Math.min(ticketsPage - 2, ticketsTotalPages - 4)) + i;
                        if (pageNum > ticketsTotalPages) return null;
                        return (
                          <button key={pageNum}
                            onClick={() => { setTicketsPage(pageNum); loadTickets(pageNum); }}
                            className={`w-10 h-10 rounded-xl text-base font-medium transition-colors
                              ${pageNum === ticketsPage
                                ? 'bg-red-700 text-white'
                                : 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 border border-[var(--border-color)] hover:bg-[var(--hover-3)]'
                              }`}>
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => { const p = Math.min(ticketsTotalPages, ticketsPage + 1); setTicketsPage(p); loadTickets(p); }}
                      disabled={ticketsPage === ticketsTotalPages}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]
                                 hover:bg-[var(--hover-3)] disabled:opacity-40 disabled:cursor-not-allowed
                                 text-[var(--text-primary)] text-base transition-colors">
                      Вперёд <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">
          <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-5 flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" /> Информация
            </p>
            <div className="divide-y divide-white/[0.06]">
              {[
                {
                  label: 'Тип',
                  value: <span className="text-[var(--text-primary)]/80">{company.counterparty_type}</span>,
                },
                {
                  label: 'Статус',
                  value: (
                    <span className={`text-sm px-2.5 py-1 rounded-lg font-medium border
                      ${company.is_active
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]'}`}>
                      {company.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  ),
                },
                { label: 'Подразделений', value: <span className="text-[var(--text-primary)] font-bold">{branches.length}</span> },
                { label: 'Продуктов',     value: <span className="text-[var(--text-primary)] font-bold">{products.length}</span> },
                { label: 'Заявок',        value: <span className="text-[var(--text-primary)] font-bold">{ticketsTotalItems}</span> },
                ...(canViewEmployees
                  ? [{ label: 'Сотрудников', value: <span className="text-[var(--text-primary)] font-bold">{employees.length}</span> }]
                  : []),
                {
                  label: 'Зарегистрирован',
                  value: <span className="text-[var(--text-primary)]/70 text-sm">{fmtDate(company.created_at)}</span>,
                },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-3">
                  <span className="text-[var(--text-primary)]/40 text-base">{row.label}</span>
                  {row.value}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
            <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" /> Контакты
            </p>
            <div className="space-y-3">
              {company.phone ? (
                <a href={`tel:${company.phone}`}
                  className="flex items-center gap-2 text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 transition-colors text-base">
                  <Phone className="w-4 h-4" /> {company.phone}
                </a>
              ) : (
                <p className="text-[var(--text-primary)]/20 text-base">Телефон не указан</p>
              )}
              {company.email ? (
                <a href={`mailto:${company.email}`}
                  className="flex items-center gap-2 text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70 transition-colors text-base break-all">
                  <Mail className="w-4 h-4" /> {company.email}
                </a>
              ) : (
                <p className="text-[var(--text-primary)]/20 text-base">Email не указан</p>
              )}
            </div>
          </div>

          {company.inn && (
            <div className="bg-[var(--hover-2)] rounded-2xl border border-[var(--border-color)] p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--text-primary)]/40 mb-4">Реквизиты</p>
              <div className="space-y-2 text-sm">
                <p className="text-[var(--text-primary)]/40">
                  ИНН <span className="text-[var(--text-primary)] font-mono">{company.inn}</span>
                </p>
                {company.kpp  && <p className="text-[var(--text-primary)]/40">КПП  <span className="text-[var(--text-primary)] font-mono">{company.kpp}</span></p>}
                {company.okpo && <p className="text-[var(--text-primary)]/40">ОКПО <span className="text-[var(--text-primary)] font-mono">{company.okpo}</span></p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}