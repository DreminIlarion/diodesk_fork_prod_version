// pages/ProductsPage.tsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  Globe,
  Server,
  Smartphone,
  Monitor,
  Cpu,
  Code,
  HelpCircle,
  X,
  Building2,
  Tag,
  ChevronDown,
  Check,
  Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productsApi } from '../api/client';
import { ActionButton } from '../components/ui/ActionButton';

/* ──────────────────────────────────────────────────────────────
   Справочники
────────────────────────────────────────────────────────────── */

const CATEGORIES = [
  {
    value: 'ERP',
    label: 'ERP',
    icon: Server,
    color: 'text-[var(--warning)]',
    bg: 'bg-orange-500/10',
  },
  {
    value: 'WEB',
    label: 'Web',
    icon: Globe,
    color: 'text-[var(--info)]',
    bg: 'bg-blue-500/10',
  },
  {
    value: 'MOBILE',
    label: 'Mobile',
    icon: Smartphone,
    color: 'text-[var(--success)]',
    bg: 'bg-[var(--success)]/10',
  },
  {
    value: 'API',
    label: 'API',
    icon: Code,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    value: 'DESKTOP',
    label: 'Desktop',
    icon: Monitor,
    color: 'text-[var(--info)]',
    bg: 'bg-cyan-500/10',
  },
  {
    value: 'HARDWARE',
    label: 'Hardware',
    icon: Cpu,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    value: 'OTHER',
    label: 'Прочее',
    icon: HelpCircle,
    color: 'text-[var(--text-primary)]/50',
    bg: 'bg-[var(--hover-2)]',
  },
] as const;

const STATUSES = [
  {
    value: 'active',
    label: 'Активный',
    dot: 'bg-emerald-400',
    color: 'text-[var(--success)]',
  },
  {
    value: 'beta',
    label: 'Бета',
    dot: 'bg-blue-400',
    color: 'text-[var(--info)]',
  },
  {
    value: 'deprecated',
    label: 'Устаревший',
    dot: 'bg-[var(--text-primary)]/30',
    color: 'text-[var(--text-primary)]/50',
  },
] as const;

const ATTRIBUTE_LABELS: Record<string, string> = {
  license_type: 'Лицензия',
  environment: 'Среда',
  db_connection_ref: 'Подключение к БД',
  modules_enabled: 'Модули',
  max_concurrent_users: 'Макс. пользователей',
  integration_points: 'Интеграции',
  backup_policy_ref: 'Политика бэкапов',
  base_url: 'URL',
  admin_url: 'Админ-панель',
  hosting_provider: 'Хостинг',
  tech_stack: 'Стек',
  ssl_expiry_date: 'SSL до',
  cdn_enabled: 'CDN',
  cms_or_platform: 'Платформа',
  platform: 'Платформа',
  app_store_url: 'App Store',
  google_play_url: 'Google Play',
  min_os_version: 'Мин. ОС',
  sdk_framework: 'Фреймворк',
  push_provider: 'Push',
  backend_api_version: 'API версия',
  swagger_url: 'Swagger',
  auth_method: 'Авторизация',
  rate_limit: 'Rate Limit',
  versioning_strategy: 'Версионирование',
  webhook_endpoints: 'Webhooks',
  health_check_url: 'Health Check',
  data_format: 'Формат',
  os_compatibility: 'ОС',
  architecture: 'Архитектура',
  default_install_path: 'Путь установки',
  runtime_dependencies: 'Зависимости',
  auto_update_enabled: 'Автообновление',
  distribution_method: 'Дистрибуция',
  model_sku: 'Модель',
  firmware_version: 'Прошивка',
  network_config: 'Сеть',
  physical_location: 'Расположение',
  warranty_expiry: 'Гарантия до',
  maintenance_contract_ref: 'Договор ТО',
  monitoring_agent: 'Мониторинг',
  serial_prefix_pattern: 'Серийный №',
  notes: 'Заметки',
  support_group: 'Поддержка',
};

const getCategoryMeta = (value: string) =>
  CATEGORIES.find((category) => category.value === value);

const getStatusMeta = (value: string) =>
  STATUSES.find((status) => status.value === value);

const getStatusLabel = (value: string) =>
  getStatusMeta(value)?.label ?? value;

const getStatusDot = (value: string) =>
  getStatusMeta(value)?.dot ?? 'bg-[var(--text-primary)]/25';

const getAttributeLabel = (key: string) =>
  ATTRIBUTE_LABELS[key] ?? key.replace(/_/g, ' ');

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value === true) return 'Да';
  if (value === false) return 'Нет';

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/* ──────────────────────────────────────────────────────────────
   Выпадающий фильтр
────────────────────────────────────────────────────────────── */

interface FilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  dot?: string;
}

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder: string;
  icon: React.ReactNode;
}

function FilterDropdown({
  value,
  onChange,
  options,
  placeholder,
  icon,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      setOpenUp(window.innerHeight - rect.bottom < 300);
      setAlignRight(window.innerWidth - rect.left < 280);
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <div className="flex gap-1.5">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={[
            'flex min-w-0 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors sm:w-auto sm:min-w-[160px]',
            open
              ? 'border-[var(--accent)]/40 bg-[var(--hover-2)] text-[var(--text-primary)]'
              : value
                ? 'border-[var(--border-color)] bg-[var(--hover-2)] text-[var(--text-primary)]'
                : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[var(--accent)]">{icon}</span>
            <span className="min-w-0 truncate">
              {selectedOption?.label ?? placeholder}
            </span>
          </span>

          <ChevronDown
            size={16}
            className={`shrink-0 text-[var(--text-primary)]/40 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {value && (
          <button
            type="button"
            aria-label={`Сбросить фильтр «${selectedOption?.label ?? placeholder}»`}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="flex shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-2.5 text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div
          className={[
            'absolute z-[100] w-64 min-w-[200px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]',
            openUp ? 'bottom-full mb-2' : 'top-full mt-2',
            alignRight ? 'right-0' : 'left-0',
          ].join(' ')}
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="max-h-[min(60vh,320px)] overflow-y-auto py-1.5">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={[
                'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
                !value
                  ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)]',
              ].join(' ')}
            >
              {!value ? (
                <Check size={16} className="shrink-0 text-[var(--accent)]" />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="min-w-0 whitespace-normal break-words">
                {placeholder}
              </span>
            </button>

            <div className="mx-3 my-1 h-px bg-[var(--border-color)]" />

            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)]',
                  ].join(' ')}
                >
                  {isSelected ? (
                    <Check size={16} className="shrink-0 text-[var(--accent)]" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  <span className="flex min-w-0 items-center gap-2.5 whitespace-normal break-words">
                    {option.dot && (
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.dot}`} />
                    )}
                    {option.icon}
                    <span>{option.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Выбранные фильтры
────────────────────────────────────────────────────────────── */

interface ActiveFiltersProps {
  category: string;
  status: string;
  onClearCategory: () => void;
  onClearStatus: () => void;
  onClearAll: () => void;
}

function ActiveFilters({
  category,
  status,
  onClearCategory,
  onClearStatus,
  onClearAll,
}: ActiveFiltersProps) {
  if (!category && !status) return null;

  const categoryMeta = getCategoryMeta(category);
  const statusInfo = getStatusMeta(status);
  const CategoryIcon = categoryMeta?.icon;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-primary)]/45">
        <Filter size={14} />
        Фильтры:
      </span>

      {categoryMeta && (
        <span
          className={`inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm ${categoryMeta.bg} ${categoryMeta.color}`}
        >
          {CategoryIcon && <CategoryIcon size={14} className="shrink-0" />}
          <span>{categoryMeta.label}</span>
          <button
            type="button"
            aria-label="Убрать фильтр категории"
            onClick={onClearCategory}
            className="ml-0.5 rounded p-0.5 text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]"
          >
            <X size={13} />
          </button>
        </span>
      )}

      {statusInfo && (
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--hover-2)] px-3 py-1.5 text-sm text-[var(--text-primary)]/75">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusInfo.dot}`} />
          <span>{statusInfo.label}</span>
          <button
            type="button"
            aria-label="Убрать фильтр статуса"
            onClick={onClearStatus}
            className="ml-0.5 rounded p-0.5 text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-1)] hover:text-[var(--text-primary)]"
          >
            <X size={13} />
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={onClearAll}
        className="px-1 text-sm text-[var(--accent)]/75 transition-colors hover:text-[var(--accent)]"
      >
        Сбросить всё
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Карточка продукта в списке
────────────────────────────────────────────────────────────── */

const ProductRow = ({
  product,
  onClick,
}: {
  product: any;
  onClick: () => void;
}) => {
  const cat = catMeta(product.category);
  const Icon = cat?.icon || Package;
  const sInfo = statusMeta(product.status);

  const truncate = (text: string, max = 60) =>
    text.length <= max ? text : text.slice(0, max) + '...';

  const productName = product.display_name || product.name || 'Без названия';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 text-left rounded-xl
                 hover:bg-[var(--hover-1)] active:bg-[var(--hover-2)] transition-colors duration-100 group"
    >
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-xl ${cat?.bg || 'bg-[var(--hover-2)]'}
                    flex items-center justify-center ${cat?.color || 'text-[var(--text-primary)]/40'}
                    group-hover:scale-105 transition-transform`}
      >
        <Icon size={18} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Название не обрезается: переносится на следующие строки */}
        <span
          className="block text-base text-[var(--text-primary)] font-medium
                     whitespace-normal break-words leading-snug"
          style={{ overflowWrap: 'anywhere' }}
        >
          {productName}
        </span>

        {product.description && (
          <p className="text-base text-[var(--text-primary)]/40 mt-0.5 leading-snug">
            {truncate(product.description)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-5 flex-shrink-0">
        <span className="text-base text-[var(--text-primary)]/50 hidden md:block w-[110px] truncate text-right">
          {product.vendor}
        </span>

        <span className="text-base text-[var(--text-primary)]/40 hidden lg:block w-[70px] text-right font-mono">
          {product.version ? `v${product.version}` : '—'}
        </span>

        <span
          className={`text-base px-2.5 py-1 rounded-lg ${
            cat?.bg || 'bg-[var(--hover-2)]'
          } ${
            cat?.color || 'text-[var(--text-primary)]/50'
          } hidden sm:block w-[90px] text-center`}
        >
          {cat?.label || product.category}
        </span>

        <div className="flex items-center gap-2 w-[100px] justify-end">
          <div className={`w-2 h-2 rounded-full ${statusDot(product.status)}`} />
          <span className={`text-base ${sInfo?.color || 'text-[var(--text-primary)]/40'}`}>
            {statusLabel(product.status)}
          </span>
        </div>
      </div>
    </button>
  );
};

/* ──────────────────────────────────────────────────────────────
   Окно с подробностями продукта
────────────────────────────────────────────────────────────── */

const ProductModal = ({
  product,
  onClose,
}: {
  product: any;
  onClose: () => void;
}) => {
  const cat = catMeta(product.category);
  const Icon = cat?.icon || Package;
  const sInfo = statusMeta(product.status);

  const productName = product.display_name || product.name || 'Без названия';

  const attrEntries = Object.entries(product.attributes || {}).filter(
    ([, value]) =>
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0),
  );

  // ref нужен, чтобы Escape закрывал модалку,
  // даже если родитель передал новую функцию onClose.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Затемнённый фон; клик по нему закрывает окно */}
      <button
        type="button"
        aria-label="Закрыть окно продукта"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="relative z-10 w-full max-w-3xl max-h-[90vh]
                   overflow-hidden rounded-2xl border border-[var(--border-color)]
                   bg-[var(--bg-card)]"
        style={{
          boxShadow: 'var(--shadow-lg)',
          maxHeight: 'min(90vh, calc(100dvh - 24px))',
        }}
      >
        {/* Кнопка закрытия остаётся на месте при прокрутке */}
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center
                     rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]
                     text-[var(--text-primary)]/50 transition-colors
                     hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
        >
          <X size={20} />
        </button>

        {/* Прокручивается всё содержимое окна, в том числе длинное название */}
        <div
          className="max-h-[90vh] overflow-y-auto overscroll-contain"
          style={{
            maxHeight: 'min(90vh, calc(100dvh - 24px))',
          }}
        >
          {/* Заголовок */}
          <div className="border-b border-[var(--border-color)] bg-[var(--hover-1)] px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-20">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center
                            flex-shrink-0 ${cat?.bg || 'bg-[var(--hover-2)]'}
                            ${cat?.color || 'text-[var(--text-primary)]/40'}`}
              >
                <Icon size={22} />
              </div>

              <div className="min-w-0 flex-1">
                <h2
                  id="product-modal-title"
                  className="text-xl sm:text-2xl font-bold leading-snug
                             text-[var(--text-primary)] whitespace-normal break-words"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {productName}
                </h2>

                {product.vendor && (
                  <p
                    className="mt-2 flex items-start gap-2 text-sm sm:text-base
                               text-[var(--text-primary)]/50 whitespace-normal break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <Building2 size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{product.vendor}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {cat && (
                    <span
                      className={`inline-flex items-center gap-2 rounded-lg border
                                  border-[var(--border-color)] px-3 py-1.5 text-sm
                                  ${cat.bg} ${cat.color}`}
                    >
                      <Icon size={15} />
                      {cat.label}
                    </span>
                  )}

                  <span
                    className="inline-flex items-center gap-2 rounded-lg border
                               border-[var(--border-color)] bg-[var(--bg-card)]
                               px-3 py-1.5 text-sm"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${statusDot(product.status)}`} />
                    <span className={sInfo?.color || 'text-[var(--text-primary)]/60'}>
                      {statusLabel(product.status)}
                    </span>
                  </span>

                  {product.version && (
                    <span
                      className="inline-flex items-center gap-2 rounded-lg border
                                 border-[var(--border-color)] bg-[var(--bg-card)]
                                 px-3 py-1.5 font-mono text-sm text-[var(--text-primary)]/65"
                    >
                      <Tag size={15} />
                      v{product.version}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Описание и характеристики */}
          <div className="space-y-6 p-5 sm:p-7">
            {product.description && (
              <section className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-4 sm:p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]/45">
                  Описание
                </h3>

                <p
                  className="text-sm sm:text-base leading-relaxed text-[var(--text-primary)]/75
                             whitespace-pre-wrap break-words"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {product.description}
                </p>
              </section>
            )}

            {attrEntries.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]/45">
                    Характеристики
                  </h3>
                  <span className="text-xs text-[var(--text-primary)]/35">
                    {attrEntries.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {attrEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="min-w-0 rounded-xl border border-[var(--border-color)]
                                 bg-[var(--hover-1)] p-4"
                    >
                      <p
                        className="text-xs text-[var(--text-primary)]/45
                                   whitespace-normal break-words"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {getAttrLabel(key)}
                      </p>

                      <p
                        className="mt-2 text-sm text-[var(--text-primary)]/80
                                   whitespace-pre-wrap break-words"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {formatAttrValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!product.description && attrEntries.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--text-primary)]/45">
                Нет дополнительной информации
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   Страница продуктов
────────────────────────────────────────────────────────────── */

export default function ProductsPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const loadRequestId = useRef(0);

  const loadProducts = useCallback(async () => {
    const requestId = ++loadRequestId.current;

    setLoading(true);
    setError(null);

    try {
      const response = await productsApi.getProducts({
        page,
        size: 30,
        category: filterCategory || undefined,
        status: filterStatus || undefined,
      });

      // Игнорируем старый ответ, если пользователь уже сменил фильтр или страницу.
      if (requestId !== loadRequestId.current) return;

      setProducts(response.items ?? []);
      setTotalPages(Math.max(1, response.total_pages ?? 1));
    } catch {
      if (requestId === loadRequestId.current) {
        setError('Не удалось загрузить продукты');
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }, [page, filterCategory, filterStatus]);

  useEffect(() => {
    void loadProducts();

    return () => {
      // Не даём ответу предыдущего запроса перезаписать актуальные данные.
      loadRequestId.current += 1;
    };
  }, [loadProducts]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    if (!normalizedSearch) return products;

    return products.filter((product) => {
      const name = String(product.display_name || product.name || '').toLowerCase();
      const vendor = String(product.vendor || '').toLowerCase();
      const description = String(product.description || '').toLowerCase();

      return (
        name.includes(normalizedSearch) ||
        vendor.includes(normalizedSearch) ||
        description.includes(normalizedSearch)
      );
    });
  }, [products, normalizedSearch]);

  const categoryOptions = useMemo<FilterOption[]>(
    () =>
      CATEGORIES.map((category) => {
        const CategoryIcon = category.icon;

        return {
          value: category.value,
          label: category.label,
          icon: <CategoryIcon size={16} className={category.color} />,
        };
      }),
    [],
  );

  const statusOptions = useMemo<FilterOption[]>(
    () =>
      STATUSES.map((status) => ({
        value: status.value,
        label: status.label,
        dot: status.dot,
      })),
    [],
  );

  const closeProductModal = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const visiblePageNumbers = useMemo(() => {
    const count = Math.min(5, totalPages);
    const start = Math.max(
      1,
      Math.min(page - Math.floor(count / 2), totalPages - count + 1),
    );

    return Array.from({ length: count }, (_, index) => start + index);
  }, [page, totalPages]);

  const clearFilters = () => {
    setFilterCategory('');
    setFilterStatus('');
    setPage(1);
  };

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in duration-500 sm:space-y-6">
      {/* Заголовок страницы */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Продукты
          </h1>
          <p className="mt-1 text-sm text-[var(--text-primary)]/50 sm:text-base">
            Справочник программного обеспечения и оборудования
          </p>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            aria-label="Обновить список продуктов"
            title="Обновить"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/55 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          <ActionButton
            onClick={() => navigate('/products/new')}
            className="flex-1 justify-center px-4 py-3 text-sm font-semibold sm:flex-none sm:text-base"
          >
            <Plus size={18} />
            Добавить продукт
          </ActionButton>
        </div>
      </header>

      {/* Поиск и фильтры */}
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(160px,auto)_minmax(160px,auto)]">
          <div className="relative min-w-0">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40"
            />

            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Поиск по названию, поставщику..."
              aria-label="Поиск продуктов"
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-3 pl-10 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/35 transition-colors focus:border-[var(--accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] sm:text-base"
            />

            {searchQuery && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <FilterDropdown
            value={filterCategory}
            onChange={(value) => {
              setFilterCategory(value);
              setPage(1);
            }}
            options={categoryOptions}
            placeholder="Все категории"
            icon={<Package size={16} />}
          />

          <FilterDropdown
            value={filterStatus}
            onChange={(value) => {
              setFilterStatus(value);
              setPage(1);
            }}
            options={statusOptions}
            placeholder="Все статусы"
            icon={<Filter size={16} />}
          />
        </div>
      </section>

      <ActiveFilters
        category={filterCategory}
        status={filterStatus}
        onClearCategory={() => {
          setFilterCategory('');
          setPage(1);
        }}
        onClearStatus={() => {
          setFilterStatus('');
          setPage(1);
        }}
        onClearAll={clearFilters}
      />

      {/* Количество результатов */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-primary)]/45">
          <span>
            На этой странице: {filteredProducts.length}
            {normalizedSearch ? ' найдено' : ''}
          </span>

          {totalPages > 1 && (
            <span>
              Страница {page} из {totalPages}
            </span>
          )}
        </div>
      )}

      {/* Список продуктов */}
      {loading ? (
        <div className="flex min-h-56 items-center justify-center">
          <Loader2 size={30} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] px-5 py-10 text-center">
          <p className="text-sm text-[var(--accent)]">{error}</p>
          <button
            type="button"
            onClick={() => void loadProducts()}
            className="mt-4 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-2)]"
          >
            Попробовать снова
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] px-5 py-12 text-center">
          <Package size={40} className="mb-4 text-[var(--text-primary)]/20" />

          <p className="text-base font-medium text-[var(--text-primary)]/65">
            {normalizedSearch
              ? 'Продукты не найдены'
              : filterCategory || filterStatus
                ? 'Нет продуктов с выбранными фильтрами'
                : 'Список продуктов пуст'}
          </p>

          {normalizedSearch && (
            <p className="mt-1 max-w-md text-sm text-[var(--text-primary)]/40">
              Поиск выполняется по продуктам на текущей странице. Попробуйте
              изменить запрос или перейти на другую страницу.
            </p>
          )}

          {(filterCategory || filterStatus) && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && !loading && !error && (
        <nav
          aria-label="Страницы продуктов"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] pt-4 sm:justify-center"
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
          >
            <ChevronLeft size={16} />
            <span>Назад</span>
          </button>

          <span className="px-2 text-sm text-[var(--text-primary)]/55 sm:hidden">
            {page} / {totalPages}
          </span>

          <div className="hidden items-center gap-1.5 sm:flex">
            {visiblePageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                aria-current={pageNumber === page ? 'page' : undefined}
                onClick={() => setPage(pageNumber)}
                className={[
                  'h-10 w-10 rounded-xl border text-sm font-medium transition-colors',
                  pageNumber === page
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/65 hover:bg-[var(--hover-2)]',
                ].join(' ')}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
          >
            <span>Вперёд</span>
            <ChevronRight size={16} />
          </button>
        </nav>
      )}

      {/* Подробности продукта */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={closeProductModal}
        />
      )}
    </div>
  );
}