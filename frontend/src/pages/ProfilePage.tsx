// pages/ProfilePage.tsx
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Camera, Loader2, Building2, ArrowRight,
  Mail, Phone, MapPin, Hash, Briefcase, CreditCard,
  Calendar, Users, Ticket, Package, GitBranch, ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { authApi, counterpartiesApi, ticketsApi } from '../api/client';
import { useToast } from '../components/ui/use-toast';
import type { Counterparty } from '../types';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'company'>('profile');
  const [uploading, setUploading] = useState(false);
  const [myCompany, setMyCompany] = useState<Counterparty | null>(null);
  const [branches, setBranches] = useState<Counterparty[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [ticketsCount, setTicketsCount] = useState(0);
  const [employeesCount, setEmployeesCount] = useState(0);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roles: string[] = user?.roles ?? [];
  const isCustomer = roles.includes('customer') || roles.includes('customer_admin');

  useEffect(() => {
    if (isCustomer && user?.counterparty_id) {
      loadCompanyData();
    }
  }, [user]);

  const loadCompanyData = async () => {
    if (!user?.counterparty_id) return;
    setLoadingCompany(true);
    try {
      const company = await counterpartiesApi.getById(user.counterparty_id);
      setMyCompany(company);

      // Загружаем сопутствующие данные
      const [branchesRes, ticketsRes] = await Promise.all([
        counterpartiesApi.getAll(1, 100).catch(() => ({ items: [] })),
        ticketsApi.getAll(1, 100, { counterparty_id: user.counterparty_id }).catch(() => ({ items: [], total_items: 0 })),
      ]);

      setBranches(branchesRes.items.filter((b: Counterparty) => b.parent_id === company.id));
      setTicketsCount(ticketsRes.total_items ?? ticketsRes.items?.length ?? 0);

      // Продукты и сотрудники
      try {
        const products = await counterpartiesApi.getProducts(user.counterparty_id, 1, 1);
        setProductsCount(products?.total_items ?? products?.items?.length ?? 0);
      } catch { }

      try {
        const customers = await counterpartiesApi.getCustomers(user.counterparty_id);
        setEmployeesCount(Array.isArray(customers?.items) ? customers.items.length : Array.isArray(customers) ? customers.length : 0);
      } catch { }

    } catch (error) {
      console.error('Failed to load company:', error);
    } finally {
      setLoadingCompany(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Ошибка', description: 'Выберите изображение', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Ошибка', description: 'Максимальный размер 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const updatedProfile = await authApi.uploadAvatar(file);
      if (user) {
        setUser({
          ...user,
          avatar_url: updatedProfile.avatar_url,
          full_name: updatedProfile.full_name || user.full_name,
        });
      }
      toast({ title: 'Успешно', description: 'Аватар обновлён' });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить аватар', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      customer: 'Клиент',
      customer_admin: 'Администратор клиента',
      support_agent: 'Агент поддержки',
      support_manager: 'Менеджер поддержки',
      executor: 'Исполнитель',
      admin: 'Администратор системы',
    };
    return labels[role] || role;
  };

  const tabs = [
    { id: 'profile' as const, label: 'Профиль', icon: User },
    ...(isCustomer ? [{ id: 'company' as const, label: 'Моя компания', icon: Building2 }] : []),
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Профиль</h1>
        <p className="text-[var(--text-primary)]/50 mt-1">Управление аккаунтом и настройками</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6">
            {/* Avatar */}
            <div className="text-center mb-6">
              <div className="relative inline-block">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-red-800 to-red-700 mx-auto ring-4 ring-[var(--bg-primary)]">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-10 h-10 text-white/60" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center justify-center transition-colors shadow-lg"
                >
                  {uploading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <h2 className="font-semibold text-[var(--text-primary)] mt-4 text-lg">
                {user?.full_name || user?.username || 'Пользователь'}
              </h2>
              <p className="text-sm text-[var(--text-primary)]/40">{user?.email}</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {roles.map(role => (
                  <span key={role} className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/10">
                    {getRoleLabel(role)}
                  </span>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                    ${activeTab === tab.id
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)]'
                    }`}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Version */}
            <div className="mt-6 pt-4 border-t border-[var(--border-color)] text-center">
              <p className="text-xs text-[var(--text-primary)]/20">ДИО Деск v2.0.0</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Личная информация</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {[
                  { label: 'Имя пользователя', value: user?.username },
                  { label: 'Полное имя', value: user?.full_name },
                  { label: 'Email', value: user?.email },
                  { label: 'Роль', value: roles.map(r => getRoleLabel(r)).join(', ') },
                ].map(field => (
                  <div key={field.label}>
                    <label className="block text-sm font-medium text-[var(--text-primary)]/50 mb-1.5">{field.label}</label>
                    <div className="px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] text-[var(--text-primary)] text-base">
                      {field.value || '—'}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[var(--text-primary)]/30 text-sm mt-6">
                Для изменения данных профиля обратитесь к администратору системы.
              </p>
            </div>
          )}

          {/* Company Tab */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              {loadingCompany ? (
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-12 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
                </div>
              ) : myCompany ? (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { icon: Users, value: employeesCount, label: 'Сотрудников' },
                      { icon: Ticket, value: ticketsCount, label: 'Заявок' },
                      { icon: Package, value: productsCount, label: 'Продуктов' },
                      { icon: GitBranch, value: branches.length, label: 'Подразделений' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                          <stat.icon className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-[var(--text-primary)] leading-none">{stat.value}</p>
                          <p className="text-sm text-[var(--text-primary)]/40">{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Company Info */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-[var(--text-primary)]">{myCompany.name}</h3>
                          <p className="text-sm text-[var(--text-primary)]/40">{myCompany.legal_name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="grid md:grid-cols-2 gap-5">
                        {[
                          { icon: Hash, label: 'ИНН', value: myCompany.inn },
                          { icon: CreditCard, label: 'КПП', value: myCompany.kpp },
                          { icon: Briefcase, label: 'ОКПО', value: myCompany.okpo },
                          { icon: Building2, label: 'Тип', value: myCompany.counterparty_type },
                          { icon: Phone, label: 'Телефон', value: myCompany.phone },
                          { icon: Mail, label: 'Email', value: myCompany.email },
                          { icon: MapPin, label: 'Адрес', value: myCompany.address },
                          { icon: Calendar, label: 'Зарегистрирована', value: myCompany.created_at ? new Date(myCompany.created_at).toLocaleDateString('ru-RU') : null },
                        ].filter(f => f.value).map(field => (
                          <div key={field.label}>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]/40 mb-1.5">
                              <field.icon className="w-3.5 h-3.5" />{field.label}
                            </label>
                            <div className="px-4 py-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] text-[var(--text-primary)] text-base">
                              {field.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Link to full company page */}
                  <Link
                    to="/my-company"
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 text-[var(--accent)] text-base font-medium transition-all"
                  >
                    Подробнее о компании <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              ) : (
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-12 text-center">
                  <Building2 className="w-12 h-12 text-[var(--text-primary)]/15 mx-auto mb-4" />
                  <p className="text-[var(--text-primary)]/50 text-base">Компания не найдена</p>
                  <p className="text-[var(--text-primary)]/30 text-sm mt-1">Вы не привязаны ни к одной компании</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}