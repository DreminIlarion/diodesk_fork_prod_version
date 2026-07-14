import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, AlertCircle, Loader2, Mail, Lock, CheckCircle, X, ArrowRight, Shield } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import React from 'react';

export default function LoginPageV2() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Заполните все поля');
      return;
    }

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    }
  };

  const handleForgotPassword = () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    setTimeout(() => {
      setForgotLoading(false);
      setForgotSent(true);
    }, 1500);
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotSent(false);
    setForgotEmail('');
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <div className="w-full h-full flex flex-col justify-between p-12 relative z-10">
          {/* Top */}
          <div>
            <div className="flex items-center gap-3 mb-12">
              <img
                src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
                alt="ДИО-Консалт"
                className="w-12 h-12 object-contain"
              />
              <span className="text-2xl font-bold text-[var(--text-primary)]">ДИО Деск</span>
            </div>

            <div className="max-w-md">
              <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4 leading-tight">
                Добро пожаловать<br />в систему
              </h1>
              <p className="text-lg text-[var(--text-primary)]/70 leading-relaxed">
                Платформа для управления заявками, проектами и задачами вашей команды
              </p>
            </div>
          </div>

          {/* Bottom - Features */}
          <div className="space-y-4">
            <FeatureItem icon={<Shield />} text="Удобная работа с обращениями" />
            <FeatureItem icon={<CheckCircle />} text="Прозрачность на каждом этапе" />
            <FeatureItem icon={<Mail />} text="Вся информация под рукой" />
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--primary)] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <img
                src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
                alt="ДИО-Консалт"
                className="w-16 h-16 object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">ДИО Деск</h1>
            <p className="text-sm text-[var(--text-primary)]/60">Система управления заявками</p>
          </div>

          {/* Login Card */}
          <div className="glass-card-static p-8 lg:p-10 space-y-6">
            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Вход в ДИО Деск</h2>
              <p className="text-sm text-[var(--text-primary)]/60">
                Используйте учётные данные, выданные администратором
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3 animate-[shake_0.4s_ease-in-out]">
                <div className="w-8 h-8 rounded-full bg-[var(--error)]/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-[var(--error)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--error)]">{error}</p>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                  <Mail className="w-4 h-4 text-[var(--text-primary)]/60" />
                  Email адрес
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Введите вашу почту"
                    className={`input-field transition-all ${
                      focusedField === 'email' ? 'ring-2 ring-[var(--primary)]/30 border-[var(--primary)]/50' : ''
                    }`}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                    <Lock className="w-4 h-4 text-[var(--text-primary)]/60" />
                    Пароль
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-xs text-[var(--accent)] hover:underline transition-colors"
                  >
                    Забыли?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Введите ваш пароль"
                    className={`input-field pr-12 transition-all ${
                      focusedField === 'password' ? 'ring-2 ring-[var(--primary)]/30 border-[var(--primary)]/50' : ''
                    }`}
                    autoComplete="current-password"
                  />
                 
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full btn-primary py-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all group mt-6"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Выполняется вход...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2 font-medium">
                    Войти 
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border-color)]"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                
              </div>
            </div>

            {/* Help Text */}
            <div className="text-center">
              <p className="text-sm text-[var(--text-primary)]/60">
                Нет аккаунта?{' '}
                <button className="text-[var(--primary)] font-medium">
                  Обратитесь к администратору для получения приглашения
                </button>
              </p>
            </div>
          </div>

          {/* Copyright */}
          <p className="text-center text-[var(--text-primary)]/40 mt-6 text-xs">
            © 2026 ДИО-Консалт. Все права защищены.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" 
            onClick={closeForgotModal} 
          />
          
          <div className="glass-card-static p-8 w-full max-w-md relative z-10 animate-[slideUp_0.3s_ease-out]">
            <button
              onClick={closeForgotModal}
              className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!forgotSent ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--primary)]/10 to-[var(--accent)]/10 flex items-center justify-center">
                    <Mail className="w-7 h-7 text-[var(--primary)]" />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    Восстановление пароля
                  </h3>
                  <p className="text-sm text-[var(--text-primary)]/60">
                    Мы отправим инструкции на указанный email
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] mb-2">
                      <Mail className="w-4 h-4 text-[var(--text-primary)]/60" />
                      Email адрес
                    </label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="Введите вашу почту"
                      className="input-field"
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3">
                    <button
                      onClick={closeForgotModal}
                      className="flex-1 py-3 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-1)] text-[var(--text-primary)] transition-colors font-medium"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleForgotPassword}
                      disabled={!forgotEmail || forgotLoading}
                      className="flex-1 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {forgotLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      ) : (
                        'Отправить письмо'
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--success)]/10 to-[var(--success)]/5 flex items-center justify-center animate-[scale-in_0.5s_ease-out]">
                  <CheckCircle className="w-8 h-8 text-[var(--success)]" />
                </div>
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                  Письмо отправлено!
                </h3>
                <p className="text-sm text-[var(--text-primary)]/60 mb-1">
                  Проверьте почту
                </p>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-6">
                  {forgotEmail}
                </p>
                <button
                  onClick={closeForgotModal}
                  className="btn-primary py-3 px-8 mx-auto"
                >
                  Вернуться ко входу
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FeatureItem = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="flex items-center gap-3 text-[var(--text-primary)]/70">
    <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
      {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4 text-[var(--primary)]' })}
    </div>
    <span className="text-sm">{text}</span>
  </div>
);