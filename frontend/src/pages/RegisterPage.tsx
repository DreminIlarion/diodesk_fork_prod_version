// pages/RegisterPage.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle, Shield, AlertCircle, Pencil, Sparkles } from 'lucide-react';
import { authApi } from '../api/client';
import { useToast } from '../components/ui/use-toast';

/* ─────────────── транслитерация ─────────────── */

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT_MAP[ch] ?? ch)
    .join('');
}

/**
 * Генерирует username из ФИО.
 *
 * «Дремин Иларион Алексеевич» → «dreminia»
 *   фамилия (транслит) + первая буква имени (транслит) + первая буква отчества (транслит)
 *
 * «Иванов Пётр» → «ivanovp»
 * «Анна» → «anna»
 */
function generateUsername(fullName: string): string {
  const parts = fullName
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);

  if (parts.length === 0) return '';

  const surname = transliterate(parts[0]);

  if (parts.length === 1) return surname;

  const initials = parts
    .slice(1)
    .map((p) => transliterate(p.charAt(0)))
    .join('');

  return `${surname}${initials}`.replace(/[^a-z0-9_]/g, '');
}

/* ─────────────── оценка пароля ─────────────── */

const calculatePasswordStrength = (password: string) => {
  let strength = 0;
  const checks = {
    length: password.length >= 8,
    hasLower: /[a-zа-яё]/.test(password),
    hasUpper: /[A-ZА-ЯЁ]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  if (checks.length) strength += 20;
  if (checks.hasLower) strength += 20;
  if (checks.hasUpper) strength += 20;
  if (checks.hasNumber) strength += 20;
  if (checks.hasSpecial) strength += 20;
  if (password.length >= 12) strength += 10;
  if (password.length >= 16) strength += 10;

  return { strength: Math.min(100, strength), checks };
};

/* ─────────────── компоненты ─────────────── */

const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const { strength, checks } = useMemo(() => calculatePasswordStrength(password), [password]);

  const getStrengthLabel = () => {
    if (strength === 0) return { label: 'Нет пароля', color: 'var(--text-primary)/20' };
    if (strength < 40) return { label: 'Слабый', color: '#ef4444' };
    if (strength < 60) return { label: 'Средний', color: '#f59e0b' };
    if (strength < 80) return { label: 'Хороший', color: '#3b82f6' };
    return { label: 'Отличный', color: '#10b981' };
  };

  const { label, color } = getStrengthLabel();

  if (!password) return null;

  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--text-primary)]/60">Сложность пароля</span>
          <span className="text-xs font-medium" style={{ color }}>
            {label}
          </span>
        </div>
        <div className="h-1.5 bg-[var(--text-primary)]/5 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${strength}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <RequirementItem met={checks.length} text="Минимум 8 символов" />
        <RequirementItem met={checks.hasNumber} text="Содержит цифры" />
        <RequirementItem met={checks.hasLower} text="Строчные буквы" />
        <RequirementItem met={checks.hasUpper} text="Заглавные буквы" />
      </div>
    </div>
  );
};

const RequirementItem = ({ met, text }: { met: boolean; text: string }) => (
  <div className="flex items-center gap-1.5">
    <div
      className={`w-1.5 h-1.5 rounded-full transition-colors ${
        met ? 'bg-[var(--success)]' : 'bg-[var(--text-primary)]/20'
      }`}
    />
    <span
      className={`transition-colors ${
        met ? 'text-[var(--success)]' : 'text-[var(--text-primary)]/40'
      }`}
    >
      {text}
    </span>
  </div>
);

/* ─────────────── страница ─────────────── */

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Флаг: пользователь вручную менял username
  const [usernameManual, setUsernameManual] = useState(false);
  // Показать анимацию генерации
  const [usernameJustGenerated, setUsernameJustGenerated] = useState(false);
  const genTimer = useRef<ReturnType<typeof setTimeout>>();

  /* авто-генерация username из ФИО */
  useEffect(() => {
    if (usernameManual) return;

    const generated = generateUsername(formData.fullName);
    setFormData((prev) => ({ ...prev, username: generated }));

    if (generated) {
      setUsernameJustGenerated(true);
      if (genTimer.current) clearTimeout(genTimer.current);
      genTimer.current = setTimeout(() => setUsernameJustGenerated(false), 800);
    }

    return () => {
      if (genTimer.current) clearTimeout(genTimer.current);
    };
  }, [formData.fullName, usernameManual]);

  const passwordMatch =
    formData.password &&
    formData.confirmPassword &&
    formData.password === formData.confirmPassword;

  const passwordMismatch =
    formData.confirmPassword && formData.password !== formData.confirmPassword;

  const handleChange =
    (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (field === 'username') {
        // Если пользователь что-то печатает в поле username — он берёт контроль
        setUsernameManual(true);
        setFormData((prev) => ({
          ...prev,
          username: value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        }));
        return;
      }

      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const resetUsernameToAuto = () => {
    setUsernameManual(false);
    const generated = generateUsername(formData.fullName);
    setFormData((prev) => ({ ...prev, username: generated }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast({
        title: 'Ошибка',
        description: 'Недействительная ссылка приглашения',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Ошибка',
        description: 'Пароли не совпадают',
        variant: 'destructive',
      });
      return;
    }

    const { strength } = calculatePasswordStrength(formData.password);
    if (strength < 40) {
      toast({
        title: 'Ошибка',
        description: 'Пароль слишком слабый. Используйте более сложный пароль.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await authApi.register(token, {
        username: formData.username,
        full_name: formData.fullName,
        password: formData.password,
      });

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast({
        title: 'Ошибка регистрации',
        description: err.response?.data?.detail || 'Не удалось зарегистрироваться',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /* ─── экраны ошибок / успеха ─── */

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
        <div className="glass-card-static p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--error)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-[var(--error)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Недействительная ссылка
          </h2>
          <p className="text-[var(--text-primary)]/50 mb-6">
            Ссылка приглашения недействительна или истекла.
          </p>
          <button onClick={() => navigate('/login')} className="btn-primary w-full">
            Перейти к входу
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
        <div className="glass-card-static p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto mb-4 animate-[scale-in_0.5s_ease-out]">
            <CheckCircle className="w-8 h-8 text-[var(--success)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Регистрация завершена!
          </h2>
          <p className="text-[var(--text-primary)]/50">Переход на страницу входа...</p>
        </div>
      </div>
    );
  }

  const isFormValid =
    formData.username && formData.fullName && formData.password && passwordMatch;

  return (
    <div className="min-h-screen flex items-center justify-center p-10 bg-[var(--bg-primary)]">
      <div className="w-full max-w-xl">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-[var(--shadow-md)]">
          {/* Header */}
          <div className="p-8 pb-0 text-center">
            <div className="flex justify-center mb-4">
              <img
                src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
                alt="ДИО-Консалт"
                className="h-15 w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Регистрация в ДИО Деск
            </h1>
            <p className="text-sm text-[var(--text-primary)]/50 mt-1">
              Создайте аккаунт для работы с заявками и проектами
            </p>
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className="p-8 pt-6 space-y-5">
            <div className="space-y-4">
              {/* ──── ШАГ 1: ФИО (первым!) ──── */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Ваше ФИО
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange('fullName')}
                  onFocus={() => setFocusedField('fullName')}
                  onBlur={() => setFocusedField(null)}
                  className={`input-field transition-all ${
                    focusedField === 'fullName' ? 'ring-2 ring-[var(--primary)]/20' : ''
                  }`}
                  placeholder="Например: Дремин Иларион Алексеевич"
                  required
                  autoComplete="name"
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-[var(--text-primary)]/40">
                  Фамилия Имя Отчество — из них автоматически сформируется логин
                </p>
              </div>

              {/* ──── ШАГ 2: Username (авто или ручной) ──── */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Имя пользователя (логин)
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={formData.username}
                    onChange={handleChange('username')}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    className={`input-field pr-10 transition-all font-mono ${
                      focusedField === 'username' ? 'ring-2 ring-[var(--primary)]/20' : ''
                    } ${
                      usernameJustGenerated
                        ? 'ring-2 ring-[var(--success)]/30 bg-[var(--success)]/5'
                        : ''
                    }`}
                    placeholder="username"
                    required
                    autoComplete="username"
                  />

                  {/* Иконка: карандаш если manual, sparkles если авто */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameManual ? (
                      <button
                        type="button"
                        onClick={resetUsernameToAuto}
                        title="Вернуть автоматический логин"
                        className="p-1 rounded-md hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--primary)] transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                    ) : (
                      <Sparkles
                        className={`w-4 h-4 transition-colors ${
                          usernameJustGenerated
                            ? 'text-[var(--success)]'
                            : 'text-[var(--text-primary)]/25'
                        }`}
                      />
                    )}
                  </div>
                </div>

                {/* Подсказка */}
                {formData.username && !usernameManual && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/10">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--primary)] mt-0.5 shrink-0" />
                    <div className="text-xs text-[var(--text-primary)]/60 leading-relaxed">
                      Логин{' '}
                      <span className="font-mono font-semibold text-[var(--primary)]">
                        {formData.username}
                      </span>{' '}
                      сформирован автоматически из ФИО.
                      <br />
                      Можете отредактировать вручную, если нужно.
                    </div>
                  </div>
                )}

                {usernameManual && formData.username && (
                  <div className="mt-2 flex items-center gap-2">
                    <Pencil className="w-3 h-3 text-[var(--text-primary)]/30" />
                    <span className="text-xs text-[var(--text-primary)]/40">
                      Логин задан вручную.{' '}
                      <button
                        type="button"
                        onClick={resetUsernameToAuto}
                        className="text-[var(--primary)] hover:underline font-medium"
                      >
                        Сгенерировать из ФИО
                      </button>
                    </span>
                  </div>
                )}
              </div>

              {/* ──── Пароль ──── */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Пароль
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange('password')}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className={`input-field pr-12 transition-all ${
                      focusedField === 'password' ? 'ring-2 ring-[var(--primary)]/20' : ''
                    }`}
                    placeholder="Создайте надёжный пароль"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <PasswordStrengthIndicator password={formData.password} />
              </div>

              {/* ──── Подтверждение пароля ──── */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Подтверждение пароля
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange('confirmPassword')}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    className={`input-field pr-12 transition-all ${
                      focusedField === 'confirmPassword'
                        ? 'ring-2 ring-[var(--primary)]/20'
                        : ''
                    } ${passwordMatch ? 'ring-2 ring-[var(--success)]/20' : ''} ${
                      passwordMismatch ? 'ring-2 ring-[var(--error)]/20' : ''
                    }`}
                    placeholder="Повторите пароль"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {passwordMatch && (
                  <p className="mt-2 text-xs text-[var(--success)] flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Пароли совпадают
                  </p>
                )}
                {passwordMismatch && (
                  <p className="mt-2 text-xs text-[var(--error)] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Пароли не совпадают
                  </p>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Создание аккаунта...
                </span>
              ) : (
                'Создать аккаунт'
              )}
            </button>
          </form>
        </div>

        {/* Copyright */}
        <p className="text-center text-[var(--text-primary)]/30 mt-6 text-xs">
          © 2026 ДИО-Консалт. Все права защищены.
        </p>
      </div>
    </div>
  );
}