import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu, User, LogOut, Settings, ChevronDown, ChevronRight,
  Moon, Sun, CircleHelp, X, Maximize2, Minimize2, ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';

interface HeaderProps {
  onMenuClick: () => void;
}

const DIOS_URL = 'http://10.1.50.109:18080/';
const DIOS_STORAGE_KEY = 'dios-panel-open';
const DIOS_WIDTH_KEY = 'dios-panel-width';

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── DIOS AI panel ──────────────────────────────────────────────
  const [showDios, setShowDios] = useState<boolean>(() => {
    try { return localStorage.getItem(DIOS_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [diosExpanded, setDiosExpanded] = useState(false);
  const [diosWidth, setDiosWidth] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(DIOS_WIDTH_KEY));
      return Number.isFinite(n) && n >= 320 ? n : 560;
    } catch { return 560; }
  });
  const resizingRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(DIOS_STORAGE_KEY, showDios ? '1' : '0'); } catch {}
  }, [showDios]);

  useEffect(() => {
    try { localStorage.setItem(DIOS_WIDTH_KEY, String(diosWidth)); } catch {}
  }, [diosWidth]);

  useEffect(() => {
    if (!showDios) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (diosExpanded) setDiosExpanded(false);
      else setShowDios(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDios, diosExpanded]);

  useEffect(() => {
    if (!showDios || diosExpanded) return;
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = window.innerWidth - e.clientX;
      setDiosWidth(Math.min(Math.max(next, 360), Math.floor(window.innerWidth * 0.9)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [showDios, diosExpanded]);

  const startResize = useCallback(() => {
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // ── user menu ─────────────────────────────────────────────────
  const handleLogout = () => { logout(); navigate('/login'); };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showDropdown]);

  const getRoleLabel = (roles: string[] | undefined) => {
    if (!roles || roles.length === 0) return 'Пользователь';
    const labels: Record<string, string> = {
      customer: 'Клиент', customer_admin: 'Админ клиента',
      support_agent: 'Агент поддержки', support_manager: 'Менеджер',
      executor: 'Исполнитель', admin: 'Администратор',
    };
    return labels[roles[0]] || roles[0];
  };

  return (
    <>
      <header className="sticky py-3 top-0 z-30 bg-[var(--bg-sidebar)] backdrop-blur-xl border-b border-[var(--border-color)]">
        <div className="flex items-center justify-between px-6">

          {/* MOBILE LOGO */}
          <div className="flex items-center gap-4 lg:hidden">
            <img
              src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
              alt="ДИО-Консалт"
              className="w-10 h-10 object-contain"
            />
            <span className="font-bold text-[var(--text-primary)] text-lg">DIO Desk</span>
          </div>
          <div className="hidden lg:block" />

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-2 md:gap-4">

            {/* DIOS AI — toggle panel */}
            <button
              type="button"
              onClick={() => setShowDios((v) => !v)}
              title={showDios ? 'Скрыть DIOS AI' : 'Открыть DIOS AI'}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-200 ${
                showDios
                  ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
                  : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--hover-1)] hover:border-[var(--accent)]/40'
              }`}
            >
              <div className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
                <img
                  src="https://storage.yandexcloud.net/b.fotovssylku.ru/2026/10/05/GLYNTEVYI-LOGOTIP-d_i-S-AI-SKEMAMI.png"
                  alt=""
                  className="w-8 h-8 object-contain transition-transform duration-200 group-hover:scale-105"
                />
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  DIOS <span className="text-[var(--accent)]">AI </span>
                </span>
                <span className="text-[11px] text-[var(--text-muted)] mt-0.5">ИИ-агент</span>
              </div>
              <ChevronRight
                className={`hidden sm:block w-4 h-4 ml-0.5 text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)] ${
                  showDios ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* THEME */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-[var(--hover-1)] transition-colors"
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? (
                <Sun className="w-6 h-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
              ) : (
                <Moon className="w-6 h-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
              )}
            </button>

            {/* USER */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 md:gap-3 p-2 rounded-xl hover:bg-[var(--hover-1)] transition-colors"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--accent)]/20"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <p className="text-[var(--text-primary)] font-medium text-base">
                    {user?.full_name || user?.username}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">{getRoleLabel(user?.roles)}</p>
                </div>
                <ChevronDown className="w-5 h-5 text-[var(--text-muted)] hidden md:block" />
              </button>

              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-2 z-50 shadow-xl">
                  <div className="px-4 py-3 border-b border-[var(--border-color)]">
                    <p className="font-semibold text-[var(--text-primary)] text-base">
                      {user?.full_name || user?.username}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">{user?.email}</p>
                  </div>

                  <div className="py-2">
                    <Link
                      to="/profile"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base"
                    >
                      <User className="w-5 h-5" /> Профиль
                    </Link>
                    <Link
                      to="/notifications"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base"
                    >
                      <Settings className="w-5 h-5" /> Настройки
                    </Link>
                    <Link
                      to="/support"
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base"
                    >
                      <CircleHelp className="w-5 h-5" /> Поддержка
                    </Link>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-color)]">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[var(--error)] hover:text-[var(--error)]/80 hover:bg-[var(--error)]/10 rounded-xl transition-colors text-base"
                    >
                      <LogOut className="w-5 h-5" /> Выйти
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* MOBILE MENU */}
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-xl hover:bg-[var(--hover-1)] transition-colors"
            >
              <Menu className="w-6 h-6 text-[var(--text-primary)]" />
            </button>
          </div>
        </div>
      </header>

      {/* DIOS AI SIDE PANEL */}
      {showDios && (
        <div className="fixed inset-0 z-[60] flex">
          <div
            className={`flex-1 transition-opacity duration-200 ${
              diosExpanded ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent'
            }`}
            onClick={() => {
              if (diosExpanded) setDiosExpanded(false);
              else if (window.innerWidth < 1024) setShowDios(false);
            }}
          />

          {!diosExpanded && (
            <div
              onMouseDown={startResize}
              title="Потяните, чтобы изменить ширину"
              className="hidden lg:block w-1.5 cursor-col-resize bg-[var(--border-color)] hover:bg-[var(--accent)]/50 transition-colors"
            />
          )}

          <div
            className={`flex flex-col bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-2xl transition-[width] duration-200 ease-out ${
              diosExpanded ? 'w-full lg:w-[85vw]' : 'w-full lg:w-auto'
            }`}
            style={
              !diosExpanded && window.innerWidth >= 1024
                ? { width: `${diosWidth}px` }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="https://storage.yandexcloud.net/b.fotovssylku.ru/2026/10/05/GLYNTEVYI-LOGOTIP-d_i-S-AI-SKEMAMI.png"
                  alt=""
                  className="w-7 h-7 object-contain shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    DIOS <span className="text-[var(--accent)]">AI</span>
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">ИИ-агент</p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={DIOS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть в новой вкладке"
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setDiosExpanded((v) => !v)}
                  title={diosExpanded ? 'Свернуть' : 'Развернуть'}
                  className="hidden lg:inline-flex p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {diosExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDios(false)}
                  title="Закрыть"
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <iframe
              src={DIOS_URL}
              title="DIOS AI"
              className="flex-1 w-full border-0 bg-white"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}
    </>
  );
}