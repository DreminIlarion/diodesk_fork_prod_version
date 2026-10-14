import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Package,
  Server,
  Globe,
  Smartphone,
  Monitor,
  Cpu,
  Code,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Save,
} from 'lucide-react';

import { productsApi } from '../api/client';
import { DynamicAttributesFields } from '../components/helpers/DynamicAttributesFields';
import { useToast } from '../components/ui/use-toast';
import { ActionButton } from '../components/ui/ActionButton';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

type ProductCategory =
  | 'ERP'
  | 'WEB'
  | 'MOBILE'
  | 'API'
  | 'DESKTOP'
  | 'HARDWARE'
  | 'OTHER';

type ProductStatus =
  | 'active'
  | 'beta'
  | 'deprecated';

interface ProductForm {
  name: string;
  vendor: string;
  category: ProductCategory | '';
  description: string;
  version: string;
  status: ProductStatus;
  attributes: Record<string, any>;
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PRODUCT_CATEGORIES = [
  {
    value: 'ERP',
    label: 'ERP-система',
    description: 'Корпоративные системы',
    icon: Server,
  },
  {
    value: 'WEB',
    label: 'Веб-приложение',
    description: 'Сайты и веб-сервисы',
    icon: Globe,
  },
  {
    value: 'MOBILE',
    label: 'Мобильное приложение',
    description: 'Приложения для смартфонов',
    icon: Smartphone,
  },
  {
    value: 'API',
    label: 'API / Сервис',
    description: 'Интеграции и API',
    icon: Code,
  },
  {
    value: 'DESKTOP',
    label: 'Десктоп-приложение',
    description: 'Программы для компьютеров',
    icon: Monitor,
  },
  {
    value: 'HARDWARE',
    label: 'Оборудование',
    description: 'Серверы и устройства',
    icon: Cpu,
  },
  {
    value: 'OTHER',
    label: 'Прочее',
    description: 'Другие продукты',
    icon: HelpCircle,
  },
] as const;

const PRODUCT_STATUSES = [
  {
    value: 'active',
    label: 'Активный',
  },
  {
    value: 'beta',
    label: 'Бета',
  },
  {
    value: 'deprecated',
    label: 'Устаревший',
  },
] as const;

const ATTRIBUTE_LABELS: Record<string, string> = {
  license_type: 'Лицензия',
  environment: 'Среда',
  db_connection_ref: 'Подключение к БД',
  modules_enabled: 'Модули',
  max_concurrent_users: 'Макс. пользователей',
  integration_points: 'Интеграции',
  backup_policy_ref: 'Политика резервного копирования',

  base_url: 'URL',
  admin_url: 'Админ-панель',
  hosting_provider: 'Хостинг',
  tech_stack: 'Технологический стек',
  ssl_expiry_date: 'Срок действия SSL',
  cdn_enabled: 'CDN',
  cms_or_platform: 'Платформа',

  platform: 'Платформа',
  app_store_url: 'App Store',
  google_play_url: 'Google Play',
  min_os_version: 'Минимальная версия ОС',
  sdk_framework: 'Фреймворк',
  push_provider: 'Push-уведомления',

  backend_api_version: 'Версия API',
  swagger_url: 'Swagger',
  auth_method: 'Авторизация',
  rate_limit: 'Ограничение запросов',
  versioning_strategy: 'Версионирование',
  webhook_endpoints: 'Webhooks',
  health_check_url: 'Health Check',
  data_format: 'Формат данных',

  os_compatibility: 'Совместимость с ОС',
  architecture: 'Архитектура',
  default_install_path: 'Путь установки',
  runtime_dependencies: 'Зависимости',
  auto_update_enabled: 'Автообновление',
  distribution_method: 'Способ распространения',

  model_sku: 'Модель',
  firmware_version: 'Версия прошивки',
  network_config: 'Сетевые настройки',
  physical_location: 'Расположение',
  warranty_expiry: 'Гарантия до',
  maintenance_contract_ref: 'Договор обслуживания',
  monitoring_agent: 'Мониторинг',
  serial_prefix_pattern: 'Серийный номер',

  notes: 'Заметки',
  support_group: 'Группа поддержки',
};

const EMPTY_FORM: ProductForm = {
  name: '',
  vendor: '',
  category: '',
  description: '',
  version: '',
  status: 'active',
  attributes: {},
};

/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */

const INPUT_CLASS = `
  w-full
  px-4 py-3.5
  rounded-xl
  border border-[var(--border-color)]
  bg-[var(--hover-2)]
  text-base
  text-[var(--text-primary)]
  placeholder:text-[var(--text-primary)]/30
  focus:outline-none
  focus:border-[var(--accent)]/40
  focus:ring-2
  focus:ring-[var(--accent-ring)]
  transition-all
`;

const LABEL_CLASS = `
  block
  mb-2
  text-sm
  font-medium
  text-[var(--text-primary)]/70
`;

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const getCategoryLabel = (value: string): string =>
  PRODUCT_CATEGORIES.find(
    category => category.value === value
  )?.label || value;

const getStatusLabel = (value: string): string =>
  PRODUCT_STATUSES.find(
    status => status.value === value
  )?.label || value;

const getInitialAttributes = (
  schemaResponse: any,
): Record<string, any> => {
  const properties = schemaResponse?.schema?.properties || {};
  const result: Record<string, any> = {};

  Object.entries(properties).forEach(([key, raw]) => {
    const property = raw as any;

    if (property.default !== undefined) {
      result[key] = property.default;
    } else if (property.anyOf) {
      result[key] = null;
    } else if (property.type === 'boolean') {
      result[key] = false;
    } else if (property.type === 'array') {
      result[key] = [];
    } else {
      result[key] = null;
    }
  });

  return result;
};

const cleanAttributes = (
  attributes: Record<string, any>,
  required: string[],
): Record<string, any> => {
  const requiredSet = new Set(required);
  const result: Record<string, any> = {};

  Object.entries(attributes).forEach(([key, value]) => {
    const empty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (empty && !requiredSet.has(key)) {
      return;
    }

    result[key] = value;
  });

  return result;
};

const isAttributeFilled = (value: any): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

/* ═══════════════════════════════════════════════════════════════════
   FIELD
   ═══════════════════════════════════════════════════════════════════ */

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={LABEL_CLASS}>
        {label}

        {required && (
          <span className="ml-1 text-[var(--accent)]">
            *
          </span>
        )}
      </label>

      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION HEADER
   ═══════════════════════════════════════════════════════════════════ */

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-6 py-5 border-b border-[var(--border-color)]">
      <div className="flex items-center gap-3">
        <div
          className="
            w-10 h-10
            rounded-xl
            bg-[var(--hover-2)]
            flex items-center justify-center
            shrink-0
          "
        >
          <Icon className="w-5 h-5 text-[var(--text-primary)]/50" />
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h2>

          {description && (
            <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function CreateProductPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState<ProductForm>({
    ...EMPTY_FORM,
  });

  const [schema, setSchema] = useState<any | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(false);
  const [creating, setCreating] = useState(false);

  // Защита от устаревших ответов API
  const categoryRequestRef = useRef(0);

  /* ═══════════════════════════════════════════════════════════════
     UPDATE FORM
     ═══════════════════════════════════════════════════════════════ */

  const updateForm = <K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateAttribute = (
    key: string,
    value: any,
  ) => {
    setForm(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [key]: value,
      },
    }));
  };

  /* ═══════════════════════════════════════════════════════════════
     CATEGORY
     ═══════════════════════════════════════════════════════════════ */

  const handleCategoryChange = useCallback(
    async (category: ProductCategory) => {
      const requestId = ++categoryRequestRef.current;

      setForm(prev => ({
        ...prev,
        category,
        attributes: {},
      }));

      setSchema(null);
      setSchemaError(false);
      setSchemaLoading(true);

      try {
        const response =
          await productsApi.getCategorySchema(category);

        // Игнорируем ответ предыдущего запроса
        if (requestId !== categoryRequestRef.current) {
          return;
        }

        setSchema(response);

        setForm(prev => {
          // Дополнительная защита от смены категории
          if (prev.category !== category) {
            return prev;
          }

          return {
            ...prev,
            attributes: getInitialAttributes(response),
          };
        });
      } catch (error) {
        if (requestId !== categoryRequestRef.current) {
          return;
        }

        setSchemaError(true);

        toast({
          title: 'Ошибка',
          description: 'Не удалось загрузить атрибуты категории',
          variant: 'destructive',
        });
      } finally {
        if (requestId === categoryRequestRef.current) {
          setSchemaLoading(false);
        }
      }
    },
    [toast],
  );

  /* ═══════════════════════════════════════════════════════════════
     VALIDATION
     ═══════════════════════════════════════════════════════════════ */

  const requiredAttributes: string[] =
    schema?.schema?.required || [];

  const totalRequiredAttributes = requiredAttributes.length;

  const filledRequiredAttributes = requiredAttributes.filter(
    key => isAttributeFilled(form.attributes[key])
  ).length;

  const basicValid =
    form.name.trim().length > 0 &&
    form.vendor.trim().length > 0 &&
    form.category !== '';

  const attributesValid =
    form.category !== '' &&
    !schemaLoading &&
    !schemaError &&
    schema !== null &&
    filledRequiredAttributes === totalRequiredAttributes;

  const formValid = basicValid && attributesValid;

  const canCreate = formValid && !creating;

  /* ═══════════════════════════════════════════════════════════════
     CREATE
     ═══════════════════════════════════════════════════════════════ */

  const handleCreate = async () => {
    if (!canCreate) return;

    setCreating(true);

    try {
      await productsApi.createProduct({
        name: form.name.trim(),
        vendor: form.vendor.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        version: form.version.trim() || undefined,
        status: form.status,
        attributes: cleanAttributes(
          form.attributes,
          requiredAttributes,
        ),
      });

      toast({
        title: 'Продукт создан',
        description: 'Продукт успешно добавлен в каталог',
      });

      navigate('/products');
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.public_message ||
        error?.response?.data?.error?.message ||
        error?.response?.data?.detail ||
        'Не удалось создать продукт';

      toast({
        title: 'Ошибка создания',
        description:
          typeof message === 'string'
            ? message
            : 'Проверьте заполненные данные',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="w-full max-w-[1500px] mx-auto px-1 md:px-3 pb-16">

      {/* =========================================================
          PAGE HEADER
      ========================================================= */}
      <div className="flex items-center gap-4 mb-7">
        <button
          type="button"
          onClick={() => navigate('/products')}
          aria-label="Вернуться к продуктам"
          className="
            p-2.5
            rounded-xl
            border border-[var(--border-color)]
            bg-[var(--hover-1)]
            hover:bg-[var(--hover-2)]
            text-[var(--text-primary)]/50
            hover:text-[var(--text-primary)]
            transition-colors
          "
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Новый продукт
          </h1>

          <p className="mt-1 text-sm text-[var(--text-primary)]/40">
            Добавление продукта в каталог
          </p>
        </div>
      </div>

      {/* =========================================================
          MAIN LAYOUT
      ========================================================= */}
      <div
        className="
          grid grid-cols-1
          xl:grid-cols-[minmax(0,1fr)_320px]
          gap-6
          items-start
        "
      >
        {/* =====================================================
            LEFT CONTENT
        ===================================================== */}
        <div className="min-w-0 space-y-5">

          {/* ===================================================
              BASIC INFORMATION
          =================================================== */}
          <section
            className="
              rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              overflow-hidden
            "
          >
            <SectionHeader
              icon={Package}
              title="Основная информация"
              description="Общие сведения о продукте"
            />

            <div className="p-5 sm:p-6 space-y-6">

              {/* NAME / VENDOR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Название" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e =>
                      updateForm('name', e.target.value)
                    }
                    placeholder="Например: 1С Бухгалтерия"
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Производитель" required>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={e =>
                      updateForm('vendor', e.target.value)
                    }
                    placeholder="Например: 1С"
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>

              {/* CATEGORY */}
              <FormField label="Категория" required>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {PRODUCT_CATEGORIES.map(category => {
                    const Icon = category.icon;
                    const selected =
                      form.category === category.value;

                    return (
                      <button
                        key={category.value}
                        type="button"
                        onClick={() =>
                          handleCategoryChange(category.value)
                        }
                        disabled={creating}
                        aria-pressed={selected}
                        className={`
                          relative
                          flex items-center gap-3
                          min-h-[70px]
                          px-4 py-3
                          rounded-xl
                          border
                          text-left
                          transition-all duration-150
                          disabled:opacity-50

                          ${
                            selected
                              ? 'border-[var(--accent)]/50 bg-[var(--accent)]/[0.06]'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--hover-2)] hover:border-[var(--border-hover)]'
                          }
                        `}
                      >
                        <div
                          className={`
                            w-9 h-9
                            rounded-lg
                            flex items-center justify-center
                            shrink-0

                            ${
                              selected
                                ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'bg-[var(--hover-2)] text-[var(--text-primary)]/40'
                            }
                          `}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <span className="flex-1 min-w-0 text-sm font-medium text-[var(--text-primary)]">
                          {category.label}
                        </span>

                        {selected && (
                          <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </FormField>

              {/* VERSION / STATUS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <FormField label="Версия">
                  <input
                    type="text"
                    value={form.version}
                    onChange={e =>
                      updateForm('version', e.target.value)
                    }
                    placeholder="Например: 3.0.1"
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Статус">
                  <div className="grid grid-cols-3 gap-2">
                    {PRODUCT_STATUSES.map(status => {
                      const selected =
                        form.status === status.value;

                      return (
                        <button
                          key={status.value}
                          type="button"
                          onClick={() =>
                            updateForm('status', status.value)
                          }
                          disabled={creating}
                          aria-pressed={selected}
                          className={`
                            flex items-center justify-center gap-1.5
                            min-h-[50px]
                            px-2 py-3
                            rounded-xl
                            border
                            text-sm font-medium
                            transition-colors
                            disabled:opacity-50

                            ${
                              selected
                                ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text-primary)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/45 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]'
                            }
                          `}
                        >
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          )}

                          <span>{status.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </FormField>
              </div>

              {/* DESCRIPTION */}
              <FormField label="Описание">
                <textarea
                  value={form.description}
                  onChange={e =>
                    updateForm('description', e.target.value)
                  }
                  placeholder="Краткое описание продукта..."
                  rows={4}
                  className={`${INPUT_CLASS} resize-none`}
                />
              </FormField>
            </div>
          </section>

          {/* ===================================================
              DYNAMIC ATTRIBUTES
          =================================================== */}
          <section
            className="
              rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              overflow-hidden
            "
          >
            <SectionHeader
              icon={Server}
              title="Атрибуты продукта"
              description={
                form.category
                  ? `Параметры категории «${getCategoryLabel(form.category)}»`
                  : 'Дополнительные параметры зависят от категории'
              }
            />

            <div className="p-5 sm:p-6">

              {!form.category ? (
                <div className="py-12 text-center">
                  <Package className="w-10 h-10 mx-auto text-[var(--text-primary)]/15" />

                  <p className="mt-3 text-sm text-[var(--text-primary)]/40">
                    Выберите категорию продукта
                  </p>
                </div>
              ) : schemaLoading ? (
                <div className="flex items-center justify-center gap-3 py-14">
                  <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />

                  <span className="text-sm text-[var(--text-primary)]/45">
                    Загружаем атрибуты...
                  </span>
                </div>
              ) : schemaError || !schema ? (
                <div className="py-12 text-center">
                  <AlertCircle className="w-9 h-9 mx-auto text-[var(--text-primary)]/25" />

                  <p className="mt-3 text-sm text-[var(--text-primary)]/50">
                    Не удалось загрузить атрибуты
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      handleCategoryChange(form.category as ProductCategory)
                    }
                    className="
                      inline-flex items-center gap-2
                      mt-4 px-4 py-2
                      rounded-lg
                      bg-[var(--hover-2)]
                      hover:bg-[var(--hover-3)]
                      text-sm font-medium
                      text-[var(--text-primary)]/70
                      transition-colors
                    "
                  >
                    <RefreshCw className="w-4 h-4" />
                    Повторить
                  </button>
                </div>
              ) : (
                <DynamicAttributesFields
                  schemaResponse={schema}
                  values={form.attributes}
                  onChange={updateAttribute}
                  labels={ATTRIBUTE_LABELS}
                />
              )}
            </div>
          </section>
        </div>

        {/* =====================================================
            RIGHT SIDEBAR
        ===================================================== */}
        <aside className="xl:sticky xl:top-5 space-y-4">

          {/* SUMMARY */}
          <div
            className="
              rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              overflow-hidden
            "
          >
            <div className="px-5 py-4 border-b border-[var(--border-color)]">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Новый продукт
              </h3>

              <p className="mt-1 text-sm text-[var(--text-primary)]/40 truncate">
                {form.name || 'Название не указано'}
              </p>
            </div>

            <div className="p-5 space-y-5">

              {/* BASIC STATUS */}
              <div className="flex items-center gap-3">
                <div
                  className={`
                    w-7 h-7
                    rounded-full
                    flex items-center justify-center
                    shrink-0

                    ${
                      basicValid
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/35'
                    }
                  `}
                >
                  {basicValid ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-medium">1</span>
                  )}
                </div>

                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  Основные данные
                </span>

                <span
                  className={`text-xs ${
                    basicValid
                      ? 'text-emerald-500'
                      : 'text-[var(--text-primary)]/35'
                  }`}
                >
                  {basicValid ? 'Готово' : 'Заполните'}
                </span>
              </div>

              {/* ATTRIBUTES STATUS */}
              <div className="flex items-center gap-3">
                <div
                  className={`
                    w-7 h-7
                    rounded-full
                    flex items-center justify-center
                    shrink-0

                    ${
                      attributesValid
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[var(--hover-2)] text-[var(--text-primary)]/35'
                    }
                  `}
                >
                  {attributesValid ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-medium">2</span>
                  )}
                </div>

                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  Атрибуты
                </span>

                <span
                  className={`text-xs ${
                    attributesValid
                      ? 'text-emerald-500'
                      : 'text-[var(--text-primary)]/35'
                  }`}
                >
                  {attributesValid
                    ? 'Готово'
                    : `${filledRequiredAttributes}/${totalRequiredAttributes}`}
                </span>
              </div>

              {/* DETAILS */}
              <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-[var(--text-primary)]/40">
                    Категория
                  </span>

                  <span className="text-right font-medium text-[var(--text-primary)]/70">
                    {form.category
                      ? getCategoryLabel(form.category)
                      : '—'}
                  </span>
                </div>

                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-[var(--text-primary)]/40">
                    Статус
                  </span>

                  <span className="font-medium text-[var(--text-primary)]/70">
                    {getStatusLabel(form.status)}
                  </span>
                </div>

                {form.version && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-[var(--text-primary)]/40">
                      Версия
                    </span>

                    <span className="font-mono text-[var(--text-primary)]/70">
                      {form.version}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CREATE ACTION */}
          <div
            className="
              rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              p-4
            "
          >
            <ActionButton
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="w-full px-5 py-3.5 text-sm font-semibold"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Создаём...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Создать продукт
                </>
              )}
            </ActionButton>

            {!formValid && (
              <p className="mt-3 text-center text-xs text-[var(--text-primary)]/35">
                {!basicValid
                  ? 'Заполните название, производителя и категорию'
                  : schemaLoading
                    ? 'Загружаем атрибуты'
                    : schemaError
                      ? 'Не удалось загрузить атрибуты'
                      : 'Заполните обязательные атрибуты'}
              </p>
            )}

            <button
              type="button"
              onClick={() => navigate('/products')}
              disabled={creating}
              className="
                w-full mt-2
                px-4 py-2.5
                rounded-xl
                text-sm font-medium
                text-[var(--text-primary)]/45
                hover:text-[var(--text-primary)]
                hover:bg-[var(--hover-2)]
                transition-colors
                disabled:opacity-50
              "
            >
              Отмена
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}