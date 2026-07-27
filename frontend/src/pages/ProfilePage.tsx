// pages/ProfilePage.tsx
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Camera, Loader2, Mail, Phone, MapPin,
  Hash, Briefcase, CreditCard, Calendar, Shield,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/client';
import { useToast } from '../components/ui/use-toast';

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  customer: 'Клиент',
  customer_admin: 'Администратор клиента',
  support_agent: 'Агент поддержки',
  support_manager: 'Менеджер поддержки',
  executor: 'Исполнитель',
  admin: 'Администратор системы',
};

const getRoleLabel = (role: string) => ROLE_LABELS[role] || role;

const getInitials = (name?: string | null) =>
  name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [profile, setProfile] = useState(user);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const roles: string[] = profile?.roles ?? [];
  const isCustomer = roles.includes('customer') || roles.includes('customer_admin');

  // Загружаем полный профиль через новый API
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const me = await authApi.getMyProfile();
        setProfile(me);
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

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
      const newProfile = { ...profile!, ...updatedProfile };
      setProfile(newProfile);
      setUser(newProfile);
      toast({ title: 'Успешно', description: 'Аватар обновлён' });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось загрузить аватар', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

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
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/60 text-2xl font-bold">
                      {getInitials(profile?.full_name || profile?.username)}
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
                {profile?.full_name || profile?.username || 'Пользователь'}
              </h2>
              <p className="text-sm text-[var(--text-primary)]/40">{profile?.email}</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {roles.map(role => (
                  <span key={role} className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/10">
                    {getRoleLabel(role)}
                  </span>
                ))}
              </div>
            </div>

            {/* Version */}
            <div className="mt-6 pt-4 border-t border-[var(--border-color)] text-center">
              <p className="text-xs text-[var(--text-primary)]/20">ДИО Деск v2.0.0</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Info */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Личная информация</h3>
                  <p className="text-sm text-[var(--text-primary)]/40">Данные учётной записи</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-5">
                {[
                  { label: 'Имя пользователя', value: profile?.username, icon: User },
                  { label: 'Полное имя', value: profile?.full_name, icon: User },
                  { label: 'Email', value: profile?.email, icon: Mail },
                  {
                    label: 'Роль',
                    value: roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map(role => (
                          <span key={role} className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/10">
                            {getRoleLabel(role)}
                          </span>
                        ))}
                      </div>
                    ) : '—',
                    icon: Shield,
                  },
                  { label: 'ID', value: profile?.id, icon: Hash },
                  { label: 'Зарегистрирован', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—', icon: Calendar },
                ].map(field => (
                  <div key={field.label}>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]/40 mb-1.5">
                      <field.icon className="w-3.5 h-3.5" />{field.label}
                    </label>
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
          </div>

          
        </div>
      </div>
    </div>
  );
}
