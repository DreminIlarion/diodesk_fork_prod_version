// pages/ProfilePage.tsx

import {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  User,
  Camera,
  Loader2,
  Mail,
  Calendar,
  Shield,
  AtSign,
  Info,
  Check,
  Building2,
} from 'lucide-react';

import { Link } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/client';
import { useToast } from '../components/ui/use-toast';

/* ═══════════════════════════════════════════════════════════════════
   ROLES
   ═══════════════════════════════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  customer: 'Клиент',
  customer_admin: 'Администратор клиента',
  support_agent: 'Агент поддержки',
  support_manager: 'Менеджер поддержки',
  executor: 'Исполнитель',
  admin: 'Администратор системы',
  developer: 'Разработчик',
  account_manager: 'Аккаунт-менеджер',
  finance: 'Финансы',
};

const getRoleLabel = (role: string): string =>
  ROLE_LABELS[role] || role;

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function getInitials(name?: string | null): string {
  if (!name?.trim()) return '?';

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (
      parts[0][0] + parts[1][0]
    ).toUpperCase();
  }

  return parts[0].slice(0, 2).toUpperCase();
}

function formatDate(date?: string | null): string {
  if (!date) return 'Не указана';

  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INFO ROW
   ═══════════════════════════════════════════════════════════════════ */

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div
      className="
        flex items-start gap-3
        py-4
        border-b border-[var(--border-color)]
        last:border-b-0
      "
    >
      <div
        className="
          w-9 h-9
          rounded-lg
          bg-[var(--hover-2)]
          flex items-center justify-center
          shrink-0
        "
      >
        <Icon className="w-4 h-4 text-[var(--text-primary)]/45" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-primary)]/40">
          {label}
        </p>

        <div className="mt-1 text-base font-medium text-[var(--text-primary)] break-words">
          {value || 'Не указано'}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION
   ═══════════════════════════════════════════════════════════════════ */

function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="
        rounded-2xl
        border border-[var(--border-color)]
        bg-[var(--hover-1)]
        overflow-hidden
      "
    >
      <div className="px-6 py-5 border-b border-[var(--border-color)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm text-[var(--text-primary)]/40">
            {description}
          </p>
        )}
      </div>

      <div className="px-6">
        {children}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROFILE PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  const [profile, setProfile] = useState(user);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const roles: string[] = profile?.roles ?? [];

  const isCustomer =
    roles.includes('customer') ||
    roles.includes('customer_admin');

  /* ═══════════════════════════════════════════════════════════════
     LOAD PROFILE
     ═══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const data = await authApi.getMyProfile();

        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        console.error(
          'Не удалось загрузить профиль:',
          error,
        );

        if (!cancelled) {
          toast({
            title: 'Ошибка',
            description: 'Не удалось загрузить данные профиля',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  /* ═══════════════════════════════════════════════════════════════
     AVATAR UPLOAD
     ═══════════════════════════════════════════════════════════════ */

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Неверный формат',
        description: 'Выберите изображение',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Файл слишком большой',
        description: 'Максимальный размер изображения — 5 МБ',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const updatedProfile =
        await authApi.uploadAvatar(file);

      const newProfile = {
        ...profile!,
        ...updatedProfile,
      };

      setProfile(newProfile);
      setUser(newProfile);

      toast({
        title: 'Фотография обновлена',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить фотографию',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);

      // Позволяет повторно выбрать тот же файл
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     LOADING
     ═══════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  const displayName =
    profile?.full_name ||
    profile?.username ||
    'Пользователь';

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="w-full max-w-[1700px] mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          Профиль
        </h1>

        <p className="mt-1.5 text-base text-[var(--text-primary)]/45">
          Информация о вашей учётной записи
        </p>
      </div>

      {/* =========================================================
          PROFILE HERO
      ========================================================= */}
      <section
        className="
          rounded-2xl
          border border-[var(--border-color)]
          bg-[var(--hover-1)]
          p-6 sm:p-8
        "
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">

          {/* AVATAR */}
          <div className="relative shrink-0 self-start">
            <div
              className="
                w-24 h-24 sm:w-28 sm:h-28
                rounded-2xl
                overflow-hidden
                border border-[var(--border-color)]
                bg-[var(--accent)]
                flex items-center justify-center
              "
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Фотография профиля"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-semibold text-white">
                  {getInitials(displayName)}
                </span>
              )}
            </div>

            {/* UPLOAD BUTTON */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Изменить фотографию"
              className="
                absolute -bottom-2 -right-2
                w-9 h-9
                rounded-xl
                bg-[var(--accent)]
                hover:bg-[var(--accent-hover)]
                border-2 border-[var(--bg-primary)]
                flex items-center justify-center
                shadow-md
                transition-colors
                disabled:opacity-50
              "
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* USER INFO */}
          <div className="min-w-0 flex-1">

            <h2 className="text-2xl font-bold text-[var(--text-primary)] break-words">
              {displayName}
            </h2>

            {profile?.email && (
              <a
                href={`mailto:${profile.email}`}
                className="
                  mt-2
                  inline-flex items-center gap-2
                  text-base
                  text-[var(--text-primary)]/50
                  hover:text-[var(--accent)]
                  transition-colors
                  break-all
                "
              >
                <Mail className="w-4 h-4 shrink-0" />
                {profile.email}
              </a>
            )}

            {/* ROLES */}
            {roles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {roles.map(role => (
                  <span
                    key={role}
                    className="
                      inline-flex items-center
                      px-3 py-1.5
                      rounded-lg
                      bg-[var(--hover-2)]
                      border border-[var(--border-color)]
                      text-sm font-medium
                      text-[var(--text-primary)]/65
                    "
                  >
                    {getRoleLabel(role)}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="
                mt-5
                inline-flex items-center gap-2
                px-4 py-2.5
                rounded-xl
                border border-[var(--border-color)]
                bg-[var(--hover-2)]
                hover:bg-[var(--hover-3)]
                text-sm font-medium
                text-[var(--text-primary)]/70
                transition-colors
                disabled:opacity-50
              "
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}

              {uploading
                ? 'Загрузка...'
                : 'Изменить фотографию'}
            </button>
          </div>

          {/* ACCOUNT STATUS */}
          <div className="hidden lg:flex flex-col items-end self-start">
            <span
              className="
                inline-flex items-center gap-2
                px-3 py-1.5
                rounded-lg
                bg-emerald-500/10
                border border-emerald-500/20
                text-sm font-medium
                text-emerald-500
              "
            >
              <Check className="w-4 h-4" />
              Учётная запись
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================
          DETAILS GRID
      ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">

        {/* PERSONAL INFO */}
        <ProfileSection
          title="Личная информация"
          description="Основные данные пользователя"
        >
          <InfoRow
            icon={User}
            label="Полное имя"
            value={profile?.full_name}
          />

          <InfoRow
            icon={AtSign}
            label="Имя пользователя"
            value={profile?.username}
          />

          <InfoRow
            icon={Mail}
            label="Электронная почта"
            value={
              profile?.email ? (
                <a
                  href={`mailto:${profile.email}`}
                  className="hover:text-[var(--accent)] transition-colors break-all"
                >
                  {profile.email}
                </a>
              ) : undefined
            }
          />
        </ProfileSection>

        {/* ACCOUNT */}
        <div className="space-y-5">
          <ProfileSection
            title="Учётная запись"
            description="Системная информация"
          >
            <InfoRow
              icon={Calendar}
              label="Дата регистрации"
              value={formatDate(profile?.created_at)}
            />

            <InfoRow
              icon={Shield}
              label="Роли в системе"
              value={
                roles.length > 0
                  ? roles.map(getRoleLabel).join(', ')
                  : 'Не назначены'
              }
            />
          </ProfileSection>

          {/* COMPANY */}
          {isCustomer && profile?.counterparty_id && (
            <Link
              to="/my-company"
              className="
                group
                flex items-center justify-between gap-4
                rounded-2xl
                border border-[var(--border-color)]
                bg-[var(--hover-1)]
                p-5
                hover:bg-[var(--hover-2)]
                hover:border-[var(--border-hover)]
                transition-colors
              "
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--hover-2)] flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[var(--text-primary)]/50" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Моя компания
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--text-primary)]/40">
                    Перейти к данным организации
                  </p>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-[var(--text-primary)]/30 group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all" />
            </Link>
          )}

          {/* HELP */}
          <div
            className="
              flex items-start gap-3
              rounded-xl
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              p-4
            "
          >
            <Info className="w-4 h-4 text-[var(--text-primary)]/35 shrink-0 mt-0.5" />

            <p className="text-sm leading-relaxed text-[var(--text-primary)]/45">
              Для изменения личных данных или ролей обратитесь к администратору системы.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}