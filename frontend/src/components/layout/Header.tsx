import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  User,
  LogOut,
  Settings,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const getRoleLabel = (roles: string[] | undefined) => {
    if (!roles || roles.length === 0) return 'Пользователь';

    const labels: Record<string, string> = {
      customer: 'Клиент',
      customer_admin: 'Админ клиента',
      support_agent: 'Агент поддержки',
      support_manager: 'Менеджер',
      executor: 'Исполнитель',
      admin: 'Администратор',
    };

    return labels[roles[0]] || roles[0];
  };

  return (
    <header className="sticky py-3 top-0 z-30 bg-[var(--bg-sidebar)] backdrop-blur-xl border-b border-[var(--border-color)]">
      <div className="flex items-center justify-between px-6">

        {/* =========================================================
            MOBILE LOGO
        ========================================================= */}
        <div className="flex items-center gap-4 lg:hidden">
          <img
            src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
            alt="ДИО-Консалт"
            className="w-10 h-10 object-contain"
          />

          <span className="font-bold text-[var(--text-primary)] text-lg">
            ДИО Деск
          </span>
        </div>

        {/* Desktop spacer */}
        <div className="hidden lg:block" />

        {/* =========================================================
            RIGHT SIDE
        ========================================================= */}
        <div className="flex items-center gap-2 md:gap-4">

          {/* =======================================================
              DIOS AI
          ======================================================= */}
          <Link
            to="/dios-ai"
            className="
              group
              flex items-center
              gap-2.5
              px-3
              py-2
              rounded-xl

              border
              border-[var(--border-color)]

              bg-[var(--bg-card)]

              hover:bg-[var(--hover-1)]
              hover:border-[var(--accent)]/40

              transition-all
              duration-200
            "
            title="Открыть DIOS AI"
          >
            {/* Фирменный знак ДИО */}
            <div
              className="
                relative
                flex-shrink-0
                w-8
                h-8
                flex
                items-center
                justify-center
              "
            >
              <img
                src="https://storage.yandexcloud.net/b.fotovssylku.ru/2026/10/05/GLYNTEVYI-LOGOTIP-d_i-S-AI-SKEMAMI.png"
                alt=""
                className="
                  w-8
                  h-8
                  object-contain
                  transition-transform
                  duration-200
                  group-hover:scale-105
                "
              />

              
            </div>

            {/* Text */}
            <div className="hidden sm:flex flex-col leading-tight">
              <span
                className="
                  text-sm
                  font-semibold
                  text-[var(--text-primary)]
                "
              >
                DIOS <span className="text-[var(--accent)]">AI </span> 
              </span>

              <span
                className="
                  text-[11px]
                  text-[var(--text-muted)]
                  mt-0.5
                "
              >
                ИИ-агент
              </span>
            </div>

            {/* Arrow */}
            <ChevronRight
              className="
                hidden sm:block
                w-4
                h-4
                ml-0.5

                text-[var(--text-muted)]

                transition-transform
                duration-200

                group-hover:translate-x-0.5
                group-hover:text-[var(--text-primary)]
              "
            />
          </Link>

          {/* =======================================================
              THEME SWITCHER
          ======================================================= */}
          <button
            onClick={toggleTheme}
            className="
              p-2
              rounded-xl
              hover:bg-[var(--hover-1)]
              transition-colors
            "
            title={
              theme === 'dark'
                ? 'Светлая тема'
                : 'Тёмная тема'
            }
          >
            {theme === 'dark' ? (
              <Sun
                className="
                  w-6
                  h-6
                  text-[var(--text-secondary)]
                  hover:text-[var(--text-primary)]
                  transition-colors
                "
              />
            ) : (
              <Moon
                className="
                  w-6
                  h-6
                  text-[var(--text-secondary)]
                  hover:text-[var(--text-primary)]
                  transition-colors
                "
              />
            )}
          </button>

          {/* =======================================================
              USER
          ======================================================= */}
          <div
            ref={dropdownRef}
            className="relative"
          >
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="
                flex
                items-center
                gap-2
                md:gap-3
                p-2
                rounded-xl
                hover:bg-[var(--hover-1)]
                transition-colors
              "
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="
                    w-10
                    h-10
                    rounded-full
                    object-cover
                    ring-2
                    ring-[var(--accent)]/20
                  "
                />
              ) : (
                <div
                  className="
                    w-10
                    h-10
                    rounded-full
                    bg-gradient-to-br
                    from-[var(--accent)]
                    to-[var(--accent-dark)]

                    flex
                    items-center
                    justify-center
                  "
                >
                  <User className="w-5 h-5 text-white" />
                </div>
              )}

              {/* User information */}
              <div className="hidden md:block text-left">
                <p
                  className="
                    text-[var(--text-primary)]
                    font-medium
                    text-base
                  "
                >
                  {user?.full_name || user?.username}
                </p>

                <p
                  className="
                    text-sm
                    text-[var(--text-muted)]
                  "
                >
                  {getRoleLabel(user?.roles)}
                </p>
              </div>

              <ChevronDown
                className="
                  w-5
                  h-5
                  text-[var(--text-muted)]
                  hidden
                  md:block
                "
              />
            </button>

            {/* =====================================================
                USER DROPDOWN
            ===================================================== */}
            {showDropdown && (
              <div
                className="
                  absolute
                  right-0
                  top-full
                  mt-2

                  w-72

                  bg-[var(--bg-card)]

                  border
                  border-[var(--border-color)]

                  rounded-2xl

                  p-2

                  z-50

                  shadow-xl
                "
              >

                {/* User info */}
                <div
                  className="
                    px-4
                    py-3
                    border-b
                    border-[var(--border-color)]
                  "
                >
                  <p
                    className="
                      font-semibold
                      text-[var(--text-primary)]
                      text-base
                    "
                  >
                    {user?.full_name || user?.username}
                  </p>

                  <p
                    className="
                      text-sm
                      text-[var(--text-muted)]
                    "
                  >
                    {user?.email}
                  </p>
                </div>

                {/* Menu */}
                <div className="py-2">

                  <Link
                    to="/profile"
                    onClick={() => setShowDropdown(false)}
                    className="
                      flex
                      items-center
                      gap-3

                      px-4
                      py-3

                      text-[var(--text-secondary)]

                      hover:text-[var(--text-primary)]
                      hover:bg-[var(--hover-1)]

                      rounded-xl

                      transition-colors

                      text-base
                    "
                  >
                    <User className="w-5 h-5" />
                    Профиль
                  </Link>

                  <Link
                    to="/notifications"
                    onClick={() => setShowDropdown(false)}
                    className="
                      flex
                      items-center
                      gap-3

                      px-4
                      py-3

                      text-[var(--text-secondary)]

                      hover:text-[var(--text-primary)]
                      hover:bg-[var(--hover-1)]

                      rounded-xl

                      transition-colors

                      text-base
                    "
                  >
                    <Settings className="w-5 h-5" />
                    Настройки
                  </Link>

                </div>

                {/* Logout */}
                <div
                  className="
                    pt-2
                    border-t
                    border-[var(--border-color)]
                  "
                >
                  <button
                    onClick={handleLogout}
                    className="
                      w-full

                      flex
                      items-center
                      gap-3

                      px-4
                      py-3

                      text-[var(--error)]

                      hover:text-[var(--error)]/80
                      hover:bg-[var(--error)]/10

                      rounded-xl

                      transition-colors

                      text-base
                    "
                  >
                    <LogOut className="w-5 h-5" />
                    Выйти
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =======================================================
              MOBILE MENU
          ======================================================= */}
          <button
            onClick={onMenuClick}
            className="
              lg:hidden
              p-2
              rounded-xl
              hover:bg-[var(--hover-1)]
              transition-colors
            "
          >
            <Menu
              className="
                w-6
                h-6
                text-[var(--text-primary)]
              "
            />
          </button>

        </div>
      </div>
    </header>
  );
}