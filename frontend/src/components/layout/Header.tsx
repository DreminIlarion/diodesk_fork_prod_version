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

const MIN_W = 360;
const MAX_W_RATIO = 0.9;
const HANDLE_W = 6; // ширина зоны-"ручки" для ресайза, добавляется к офсету

const DIOS_RED = '#bb252d';

/** Логотип DIOS AI — свёрстан по markup с их сайта (<span class="_logo_nsett_5">...) */
function DiosLogo({
  size = 22,
  withWordmark = true,
}: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" aria-label="DIOS AI">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill={DIOS_RED} d="M3 21V11.5A8.5 8.5 0 0 1 11.5 3H15v5.5h-3.5a3 3 0 0 0-3 3V21Z" />
        <path fill="#9a9a96" d="M15.5 9H21v6a7 7 0 0 1-7 7H9v-5.5h5a1.5 1.5 0 0 0 1.5-1.5Z" />
        <circle cx="19.5" cy="4.5" r="1.8" fill="#b5b5b0" />
      </svg>
      {withWordmark && (
        <span className="flex items-baseline gap-0.5 font-bold leading-none tracking-tight">
          <span className="text-[var(--text-primary)]">DIOS</span>
          <span style={{ color: DIOS_RED }}>AI</span>
        </span>
      )}
    </span>
  );
}

function getStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(DIOS_WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_W ? n : 560;
  } catch {
    return 560;
  }
}

/** Пишет текущий отступ основного контента в CSS-переменную на <html>.
 *  Layout ничего не знает про Header — просто читает var(--dios-panel-offset). */
function setContentOffset(px: number) {
  document.documentElement.style.setProperty('--dios-panel-offset', `${px}px`);
}

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
  const [isResizing, setIsResizing] = useState(false); // нужен только для overlay над iframe

  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef<number>(getStoredWidth());
  const resizingRef = useRef(false);

  // ── применяем ширину панели + сдвиг контента при открытии/закрытии ──
  useEffect(() => {
    if (!showDios) {
      setContentOffset(0);
      return;
    }
    if (diosExpanded) {
      // Развёрнутый режим — модальный оверлей с подложкой,
      // контент под ним и так скрыт, сдвигать не нужно.
      setContentOffset(0);
      return;
    }
    if (panelRef.current) {
      panelRef.current.style.width = `${widthRef.current}px`;
    }
    setContentOffset(widthRef.current + HANDLE_W);
  }, [showDios, diosExpanded]);

  useEffect(() => {
    try { localStorage.setItem(DIOS_STORAGE_KEY, showDios ? '1' : '0'); } catch {}
  }, [showDios]);

  // Esc
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

  // ── Resize ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showDios || diosExpanded) return;

    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current || !panelRef.current) return;
      const maxW = Math.floor(window.innerWidth * MAX_W_RATIO);
      const next = Math.min(Math.max(window.innerWidth - e.clientX, MIN_W), maxW);
      widthRef.current = next;
      panelRef.current.style.width = `${next}px`;
      setContentOffset(next + HANDLE_W); // сайт "уступает место" синхронно с драгом
      e.preventDefault();
    };

    const stop = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setIsResizing(false);
      document.documentElement.classList.remove('dios-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(DIOS_WIDTH_KEY, String(widthRef.current)); } catch {}
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('mouseleave', stop);
    window.addEventListener('blur', stop);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('mouseleave', stop);
      window.removeEventListener('blur', stop);
    };
  }, [showDios, diosExpanded]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    setIsResizing(true);
    document.documentElement.classList.add('dios-resizing');
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
          <div className="flex items-center gap-4 lg:hidden">
            <img
              src="http://80.93.62.177:8000/media/images/Logo_bez_fona_bez_teksta.width-80.height-80.png"
              alt="ДИО-Консалт"
              className="w-10 h-10 object-contain"
            />
            <span className="font-bold text-[var(--text-primary)] text-lg">DIO Desk</span>
          </div>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-2 md:gap-4">
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
              <DiosLogo size={22} withWordmark={false} />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="flex items-baseline gap-0.5 text-sm font-bold">
                  <span className="text-[var(--text-primary)]">DIOS</span>
                  <span style={{ color: DIOS_RED }}>AI</span>
                </span>
                <span className="text-[11px] text-[var(--text-muted)] mt-0.5">ИИ-агент</span>
              </div>
              <ChevronRight
                className={`hidden sm:block w-4 h-4 ml-0.5 text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)] ${
                  showDios ? 'rotate-180' : ''
                }`}
              />
            </button>

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

            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 md:gap-3 p-2 rounded-xl hover:bg-[var(--hover-1)] transition-colors"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--accent)]/20" />
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
                    <Link to="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base">
                      <User className="w-5 h-5" /> Профиль
                    </Link>
                    <Link to="/notifications" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base">
                      <Settings className="w-5 h-5" /> Настройки
                    </Link>
                    <Link to="/support" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-4 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-1)] rounded-xl transition-colors text-base">
                      <CircleHelp className="w-5 h-5" /> Поддержка
                    </Link>
                  </div>
                  <div className="pt-2 border-t border-[var(--border-color)]">
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-[var(--error)] hover:text-[var(--error)]/80 hover:bg-[var(--error)]/10 rounded-xl transition-colors text-base">
                      <LogOut className="w-5 h-5" /> Выйти
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-[var(--hover-1)] transition-colors">
              <Menu className="w-6 h-6 text-[var(--text-primary)]" />
            </button>
          </div>
        </div>
      </header>

      {/* ── DIOS AI PANEL ──────────────────────────────────────── */}
      {showDios && (
        <>
          {diosExpanded && (
            <div
              className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
              onClick={() => setDiosExpanded(false)}
            />
          )}

          <div
            className={`fixed top-0 right-0 bottom-0 z-[56] flex pointer-events-none ${
              diosExpanded ? 'w-full lg:w-[85vw]' : ''
            }`}
          >
            {!diosExpanded && (
              <div
                onMouseDown={startResize}
                title="Потяните, чтобы изменить ширину"
                className="hidden lg:flex w-1.5 cursor-col-resize bg-[var(--border-color)] hover:bg-[var(--accent)]/60 transition-colors pointer-events-auto relative"
              >
                <div className="absolute -left-1.5 -right-1.5 top-0 bottom-0" />
              </div>
            )}

            <div
              ref={panelRef}
              className={`relative flex flex-col h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-2xl pointer-events-auto ${
                diosExpanded ? 'w-full' : ''
              }`}
              style={diosExpanded ? undefined : { width: `${widthRef.current}px` }}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <DiosLogo size={24} withWordmark={false} />
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-0.5 text-sm font-bold truncate">
                      <span className="text-[var(--text-primary)]">DIOS</span>
                      <span style={{ color: DIOS_RED }}>AI</span>
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

              <div className="relative flex-1 min-h-0">
                <iframe
                  src={DIOS_URL}
                  title="DIOS AI"
                  className="w-full h-full border-0 bg-white"
                  allow="clipboard-read; clipboard-write"
                />
                {/* overlay нужен только во время драга ресайза —
                    иначе iframe перехватывает mousemove/mouseup
                    и ширина начинает "скакать" */}
                {isResizing && (
                  <div className="absolute inset-0 z-10 cursor-col-resize" />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}