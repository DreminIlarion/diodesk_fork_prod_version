import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, Clock, Edit, FileText, Hash, Link2,
  Loader2, Plus, RefreshCcw, Trash2, X,
} from 'lucide-react';
import { contractsApi } from '../api/client';
import type { Contract } from '../types';

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ContractRateInput {
  type_rate: string;
  rate: number;
  unit_measurement_rate: string;
  hours_subscription: number | null;
  hours_its: number | null;
}

// ─── Константы ────────────────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  'ИТС',
  'Сопровождение',
  'Сервис',
  'Проект',
  'Внутренние работы',
  'Аутстаффинг',
] as const;

const CONTRACT_PERIODS = ['Месяц', 'Квартал', 'Полугодие', 'Год'] as const;

const CONTRACT_STATUSES = [
  'Договор оформлен и подписан',
  'Подписан заказчиком, есть скан копия',
  'Расторгнут',
  'Черновик',
] as const;

const CONTRACT_RATES_TYPES = [
  'Фиксированная',
  'До превышения',
  'После превышения',
] as const;

const CONTRACT_RATES_MEASUREMENT = ['Часы', 'Дни'] as const;

const EMPTY_RATE: ContractRateInput = {
  type_rate: 'Фиксированная',
  rate: 0,
  unit_measurement_rate: 'Часы',
  hours_subscription: null,
  hours_its: null,
};

const CONTRACT_RATE_VALIDATION_ERROR =
  'Размер каждой добавленной ставки должен быть числом не меньше 0.';

const parseContractRate = (value: unknown): number => {
  if (value === null || value === undefined || value === '') {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const isInvalidContractRate = (rate: ContractRateInput): boolean => {
  const raw: unknown = rate.rate;
  if (raw === null || raw === undefined || raw === '') return true;
  const amount = Number(raw);
  return !Number.isFinite(amount) || amount < 0;
};

// ─── ContractSelect ───────────────────────────────────────────────────────────

export function ContractSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выберите значение',
  required = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const optionList =
    value && !options.includes(value) ? [value, ...options] : [...options];

  const selectedIndex = optionList.indexOf(value);
  const selectedLabel =
    selectedIndex >= 0 ? optionList[selectedIndex] : placeholder;

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [open]);

  const focusOption = (index: number) => {
    if (!optionList.length) return;
    const nextIndex = (index + optionList.length) % optionList.length;
    setActiveIndex(nextIndex);
    window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });
  };

  const openAt = (index: number) => {
    if (!optionList.length) return;
    const nextIndex = Math.max(0, Math.min(index, optionList.length - 1));
    setActiveIndex(nextIndex);
    setOpen(true);
    window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });
  };

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseOption = (option: string) => {
    onChange(option);
    closeMenu();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="mb-1.5 text-sm text-[var(--text-primary)]/55">
        {label}
        {required && <span className="ml-1 text-[var(--accent)]">*</span>}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openAt(selectedIndex >= 0 ? selectedIndex : 0);
          }
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            closeMenu();
            return;
          }

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;

            if (open) {
              focusOption(activeIndex + direction);
            } else {
              const startIndex =
                selectedIndex >= 0
                  ? selectedIndex
                  : direction > 0
                    ? 0
                    : optionList.length - 1;
              openAt(startIndex);
            }

            return;
          }

          if (open && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            const option = optionList[activeIndex];
            if (option !== undefined) chooseOption(option);
          }
        }}
        className={`
          flex min-h-[48px] w-full items-center justify-between gap-3
          rounded-xl border px-4 py-3 text-left text-base transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]
          ${
            open
              ? 'border-[var(--accent)]/40 bg-[var(--hover-2)]'
              : 'border-[var(--border-color)] bg-[var(--hover-2)] hover:border-[var(--accent)]/35'
          }
        `}
      >
        <span
          className={`min-w-0 flex-1 whitespace-normal break-words leading-snug ${
            value ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'
          }`}
          style={{ overflowWrap: 'anywhere' }}
        >
          {selectedLabel}
        </span>

        <ChevronDown
          size={17}
          className={`flex-shrink-0 text-[var(--text-primary)]/45 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-[100] mt-2 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="max-h-[280px] overflow-y-auto overscroll-contain">
            {optionList.map((option, index) => {
              const selected = option === value;

              return (
                <button
                  key={`${option}-${index}`}
                  ref={element => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => chooseOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeMenu();
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusOption(index + 1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      focusOption(index - 1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      focusOption(0);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      focusOption(optionList.length - 1);
                    } else if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      chooseOption(option);
                    }
                  }}
                  className={`
                    flex w-full items-center gap-3 rounded-lg px-3.5 py-3
                    text-left text-sm transition-colors
                    ${
                      selected
                        ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                        : 'text-[var(--text-primary)]/75 hover:bg-[var(--hover-2)]'
                    }
                    ${
                      activeIndex === index
                        ? 'ring-1 ring-[var(--accent)]/25'
                        : ''
                    }
                  `}
                >
                  <span
                    className="min-w-0 flex-1 whitespace-normal break-words leading-snug"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {option}
                  </span>

                  {selected && (
                    <CheckCircle2
                      size={16}
                      className="flex-shrink-0 text-[var(--accent)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ContractsTab ─────────────────────────────────────────────────────────────

export function ContractsTab({
  counterpartyId,
  projectId,
  onCountChange,
}: {
  counterpartyId: string;
  projectId?: string;
  onCountChange?: (n: number) => void;
}) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateValidationAttempted, setRateValidationAttempted] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Модалка «Привязать существующий» — только для проекта
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkOptions, setLinkOptions] = useState<Contract[]>([]);
  const [loadingLink, setLoadingLink] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: '',
    date_start: '',
    date_end: '',
    status: 'Договор оформлен и подписан',
    type: 'ИТС' as string,
    period: 'Год' as string,
    sum: '',
  });

  const [rates, setRates] = useState<ContractRateInput[]>([]);

  const fieldCls = `
    mt-1.5 w-full min-h-[46px] rounded-xl border
    border-[var(--border-color)] bg-[var(--hover-2)]
    px-3.5 py-3 text-base text-[var(--text-primary)]
    placeholder-[var(--text-muted)]
    transition-all
    focus:outline-none focus:border-[var(--accent)]/40
    focus:ring-2 focus:ring-[var(--accent-ring)]
  `;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await contractsApi.list({
        counterparty_id: counterpartyId,
        ...(projectId ? { project_id: projectId } : {}),
        page,
        size: 10,
      });

      const items = res.items ?? [];
      const count = Number(res.total_items ?? 0);

      setContracts(items);
      setTotalPages(Math.max(1, Number(res.total_pages) || 1));
      setTotalItems(count);
      onCountChange?.(count);
    } catch {
      setError('Не удалось загрузить договоры');
    } finally {
      setLoading(false);
    }
  }, [counterpartyId, projectId, page, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Загрузка списка для модалки «Привязать существующий»
  useEffect(() => {
    if (!showLinkModal || !projectId) return;
    setLoadingLink(true);
    contractsApi
      .list({ counterparty_id: counterpartyId, page: 1, size: 100 })
      .then(res => setLinkOptions(res.items ?? []))
      .catch(() => setLinkOptions([]))
      .finally(() => setLoadingLink(false));
  }, [showLinkModal, counterpartyId, projectId]);

  const resetForm = () => {
    setForm({
      name: '',
      date_start: '',
      date_end: '',
      status: 'Договор оформлен и подписан',
      type: 'ИТС',
      period: 'Год',
      sum: '',
    });

    setRates([]);
    setRateValidationAttempted(false);
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  };

  const scrollToForm = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
    scrollToForm();
  };

  const startEdit = (contract: Contract) => {
    const contractRates = Array.isArray(contract.rates) ? contract.rates : [];

    setEditingId(contract.id);
    setForm({
      name: contract.name,
      date_start: contract.date_start,
      date_end: contract.date_end ?? '',
      status: contract.status,
      type: contract.type,
      period: contract.period ?? 'Год',
      sum:
        contract.sum === null || contract.sum === undefined
          ? ''
          : String(contract.sum),
    });

    setRates(
      contractRates.length
        ? contractRates.map(rate => ({
            type_rate: rate.type_rate,
            rate: parseContractRate(rate.rate),
            unit_measurement_rate: rate.unit_measurement_rate,
            hours_subscription: rate.hours_subscription ?? null,
            hours_its: rate.hours_its ?? null,
          }))
        : [],
    );

    setRateValidationAttempted(false);
    setFormError(null);
    setShowForm(true);
    setExpandedId(null);
    setConfirmDeleteId(null);
    scrollToForm();
  };

  const handleSave = async () => {
    if (
      !form.name.trim() ||
      !form.date_start ||
      !form.status.trim() ||
      !form.type.trim()
    ) {
      setFormError(
        'Заполните обязательные поля: наименование, дата начала, статус и вид договора.',
      );
      return;
    }

    const invalidRateIndex = rates.findIndex(isInvalidContractRate);

    if (invalidRateIndex !== -1) {
      setRateValidationAttempted(true);
      setFormError(CONTRACT_RATE_VALIDATION_ERROR);
      return;
    }

    setRateValidationAttempted(false);

    const sumValue = form.sum.trim() ? Number(form.sum) : null;

    if (sumValue !== null && (!Number.isFinite(sumValue) || sumValue < 0)) {
      setFormError('Сумма договора должна быть числом не меньше 0.');
      return;
    }

    const hasInvalidHours = rates.some(rate => {
      const thresholdRate = ['До превышения', 'После превышения'].includes(
        rate.type_rate.trim(),
      );

      if (!thresholdRate) return false;

      const hours =
        form.type === 'ИТС'
          ? rate.hours_its
          : form.type === 'Сопровождение'
            ? rate.hours_subscription
            : null;

      if (hours === null || hours === undefined) return false;

      const value = Number(hours);
      return !Number.isInteger(value) || value < 0;
    });

    if (hasInvalidHours) {
      setFormError('Количество часов должно быть целым числом не меньше 0.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payloadBase = {
      name: form.name.trim(),
      date_start: form.date_start,
      date_end: form.date_end || null,
      status: form.status.trim(),
      type: form.type.trim(),
      period: form.period.trim() || null,
      sum: sumValue,
      rates: rates.map(rate => {
        const rateType = rate.type_rate.trim();
        const isThresholdRate = ['До превышения', 'После превышения'].includes(rateType);
        const showItsHours = isThresholdRate && form.type === 'ИТС';
        const showSubscriptionHours = isThresholdRate && form.type === 'Сопровождение';

        return {
          type_rate: rateType,
          rate: Number(rate.rate),
          unit_measurement_rate: rate.unit_measurement_rate.trim(),
          hours_subscription:
            showSubscriptionHours && rate.hours_subscription != null
              ? Number(rate.hours_subscription)
              : null,
          hours_its:
            showItsHours && rate.hours_its != null
              ? Number(rate.hours_its)
              : null,
        };
      }),
    };

    try {
      if (editingId) {
        await contractsApi.update(editingId, payloadBase);
      } else {
        await contractsApi.create({
          counterparty_id: counterpartyId,
          ...(projectId ? { project_ids: [projectId] } : {}),
          ...payloadBase,
        });
      }

      resetForm();
      await load();
    } catch (e: any) {
      setFormError(
        typeof e?.response?.data?.error?.message === 'string'
          ? e.response.data.error.message
          : typeof e?.response?.data?.detail === 'string'
            ? e.response.data.detail
            : 'Не удалось сохранить договор',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);

    try {
      if (projectId) {
        // На проекте — только отвязываем, договор остаётся у контрагента
        await contractsApi.unlinkProject(id, projectId);
      } else {
        await contractsApi.remove(id);
      }
      setConfirmDeleteId(null);

      if (contracts.length === 1 && page > 1) {
        setPage(currentPage => Math.max(1, currentPage - 1));
      } else {
        await load();
      }
    } catch {
      setDeleteError(
        projectId
          ? 'Не удалось отвязать договор. Попробуйте ещё раз.'
          : 'Не удалось удалить договор. Попробуйте ещё раз.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const setRate = (index: number, patch: Partial<ContractRateInput>) => {
    setRates(current =>
      current.map((rate, rateIndex) =>
        rateIndex === index ? { ...rate, ...patch } : rate,
      ),
    );
  };

  const addRate = () => {
    setRates(current => [...current, { ...EMPTY_RATE, rate: Number.NaN }]);
  };

  const removeRate = (index: number) => {
    setRates(current => current.filter((_, rateIndex) => rateIndex !== index));
  };

  const fmtDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return '—';

    const dateString = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T00:00:00`
      : dateValue;

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return dateValue;

    return date.toLocaleDateString('ru-RU');
  };

  const formatMoney = (value: any): string | null => {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount)
      ? `${amount.toLocaleString('ru-RU')} ₽`
      : `${value} ₽`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      {/* Заголовок вкладки */}
      <div className="flex flex-col gap-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <FileText size={21} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Договоры
              </h2>
              <span className="rounded-full border border-[var(--border-color)] bg-[var(--hover-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-primary)]/55">
                {totalItems}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-primary)]/45">
              Сроки, условия и ставки по договорам
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Обновить список"
            aria-label="Обновить список договоров"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/50 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {projectId && (
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]/75 hover:bg-[var(--hover-2)]"
            >
              <Link2 size={16} /> Привязать существующий
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => (showForm ? resetForm() : startCreate())}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              showForm
                ? 'border border-[var(--border-color)] bg-[var(--hover-2)] text-[var(--text-primary)]/75 hover:bg-[var(--hover-3)]'
                : 'bg-[var(--accent)] text-white shadow-sm hover:brightness-110'
            }`}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Закрыть форму' : 'Добавить договор'}
          </button>
        </div>
      </div>

      {/* Создание / редактирование */}
      {showForm && (
        <div
          ref={formRef}
          className="scroll-mt-6 border-b border-[var(--border-color)] bg-[var(--hover-1)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                {editingId ? <Edit size={17} /> : <Plus size={18} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {editingId ? 'Редактирование' : 'Новый договор'}
                </p>
                <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                  {editingId ? 'Изменить условия договора' : 'Добавить договор'}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-primary)]/45">
                  Заполните основные данные и при необходимости добавьте ставки.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              aria-label="Закрыть форму"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)]/45 transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <form
            noValidate
            onSubmit={event => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="space-y-4 p-4 sm:p-6">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]"
                >
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Основные данные */}
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-bold text-[var(--text-primary)]/50">
                    1
                  </span>
                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)]">
                      Основные данные
                    </h4>
                    <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
                      Наименование, вид договора и сроки действия
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block min-w-0 md:col-span-2">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Наименование
                      <span className="ml-1 text-[var(--accent)]">*</span>
                    </span>
                    <input
                      value={form.name}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Например: Договор на 1С:ИТС №123"
                      className={fieldCls}
                    />
                  </label>

                  <ContractSelect
                    label="Вид договора"
                    required
                    value={form.type}
                    onChange={type => {
                      setForm(current => ({ ...current, type }));
                      setRates(current =>
                        current.map(r => ({
                          ...r,
                          hours_its: type === 'ИТС' ? r.hours_its : null,
                          hours_subscription:
                            type === 'Сопровождение' ? r.hours_subscription : null,
                        })),
                      );
                    }}
                    options={CONTRACT_TYPES}
                    placeholder="Выберите вид договора"
                  />

                  <ContractSelect
                    label="Статус"
                    required
                    value={form.status}
                    onChange={status => setForm(current => ({ ...current, status }))}
                    options={CONTRACT_STATUSES}
                    placeholder="Выберите статус"
                  />

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Дата начала
                      <span className="ml-1 text-[var(--accent)]">*</span>
                    </span>
                    <input
                      type="date"
                      value={form.date_start}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          date_start: event.target.value,
                        }))
                      }
                      className={fieldCls}
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Дата окончания
                    </span>
                    <input
                      type="date"
                      value={form.date_end}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          date_end: event.target.value,
                        }))
                      }
                      className={fieldCls}
                    />
                  </label>

                  <ContractSelect
                    label="Период оплаты"
                    value={form.period}
                    onChange={period => setForm(current => ({ ...current, period }))}
                    options={CONTRACT_PERIODS}
                    placeholder="Выберите период оплаты"
                  />

                  <label className="block min-w-0">
                    <span className="text-sm text-[var(--text-primary)]/55">
                      Сумма договора
                    </span>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.sum}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            sum: event.target.value,
                          }))
                        }
                        placeholder="120000"
                        className={`${fieldCls} pr-12`}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-primary)]/35">
                        ₽
                      </span>
                    </div>
                  </label>
                </div>
              </section>

              {/* Ставки */}
              <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-bold text-[var(--text-primary)]/50">
                      2
                    </span>
                    <div>
                      <h4 className="font-semibold text-[var(--text-primary)]">
                        Ставки
                      </h4>
                      <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
                        Ставки необязательны — договор можно сохранить без них.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addRate}
                    className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15 sm:self-auto"
                  >
                    <Plus size={15} />
                    Добавить ставку
                  </button>
                </div>

                {rates.length === 0 && (
                  <div className="mb-3 flex items-start gap-3 rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--hover-1)] p-4">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)]/45">
                      <Plus size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]/75">
                        Ставки не добавлены
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-primary)]/40">
                        Это необязательный раздел. Если ставки нужны, добавьте их кнопкой выше.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {rates.map((rate, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--hover-2)] text-xs font-semibold text-[var(--text-primary)]/55">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            Ставка
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRate(index)}
                          title="Удалить ставку"
                          aria-label={`Удалить ставку ${index + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                        >
                          <Trash2 size={14} />
                          Удалить
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
                        <ContractSelect
                          label="Вид ставки"
                          required
                          value={rate.type_rate}
                          onChange={value =>
                            setRate(index, {
                              type_rate: value,
                              hours_its: ['До превышения', 'После превышения'].includes(value)
                                ? rate.hours_its
                                : null,
                              hours_subscription: ['До превышения', 'После превышения'].includes(value)
                                ? rate.hours_subscription
                                : null,
                            })
                          }
                          options={CONTRACT_RATES_TYPES}
                          placeholder="Выберите вид ставки"
                        />

                        <label className="block min-w-0">
                          <span className="text-xs text-[var(--text-primary)]/45">
                            Размер ставки
                            <span className="ml-1 text-[var(--accent)]">*</span>
                          </span>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={Number.isFinite(rate.rate) ? rate.rate : ''}
                            onChange={event => {
                              setRate(index, {
                                rate: parseContractRate(event.target.value),
                              });

                              setFormError(current =>
                                current === CONTRACT_RATE_VALIDATION_ERROR ? null : current,
                              );
                            }}
                            placeholder="Введите сумму"
                            aria-invalid={
                              rateValidationAttempted && isInvalidContractRate(rate)
                            }
                            aria-describedby={
                              rateValidationAttempted && isInvalidContractRate(rate)
                                ? `contract-rate-error-${index}`
                                : undefined
                            }
                            className={`${fieldCls} ${
                              rateValidationAttempted && isInvalidContractRate(rate)
                                ? 'border-[var(--accent)]/50 focus:border-[var(--accent)]/60'
                                : ''
                            }`}
                          />

                          {rateValidationAttempted && isInvalidContractRate(rate) && (
                            <span
                              id={`contract-rate-error-${index}`}
                              className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--accent)]"
                            >
                              <AlertTriangle size={13} />
                              Укажите число от 0 и выше.
                            </span>
                          )}
                        </label>

                        <ContractSelect
                          label="Единица измерения"
                          required
                          value={rate.unit_measurement_rate}
                          onChange={value => setRate(index, { unit_measurement_rate: value })}
                          options={CONTRACT_RATES_MEASUREMENT}
                          placeholder="Выберите единицу"
                        />

                        {form.type === 'ИТС' &&
                          ['До превышения', 'После превышения'].includes(rate.type_rate.trim()) && (
                            <label className="block min-w-0">
                              <span className="text-xs text-[var(--text-primary)]/45">
                                Часы ИТС
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={rate.hours_its ?? ''}
                                onChange={event =>
                                  setRate(index, {
                                    hours_its:
                                      event.target.value === ''
                                        ? null
                                        : Number(event.target.value),
                                  })
                                }
                                placeholder="Не указано"
                                className={fieldCls}
                              />
                            </label>
                          )}

                        {form.type === 'Сопровождение' &&
                          ['До превышения', 'После превышения'].includes(rate.type_rate.trim()) && (
                            <label className="block min-w-0">
                              <span className="text-xs text-[var(--text-primary)]/45">
                                Абонентские часы
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={rate.hours_subscription ?? ''}
                                onChange={event =>
                                  setRate(index, {
                                    hours_subscription:
                                      event.target.value === ''
                                        ? null
                                        : Number(event.target.value),
                                  })
                                }
                                placeholder="Не указано"
                                className={fieldCls}
                              />
                            </label>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Кнопки формы */}
            <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-[var(--text-primary)]/40">
                Поля, отмеченные звёздочкой, обязательны.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)] disabled:opacity-50 sm:flex-none"
                >
                  Отмена
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {saving
                    ? 'Сохранение…'
                    : editingId
                      ? 'Сохранить изменения'
                      : 'Создать договор'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Список договоров */}
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-4 sm:px-6">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              Список договоров
            </h3>
            <p className="mt-0.5 text-sm text-[var(--text-primary)]/40">
              Всего: {totalItems}
            </p>
          </div>

          {totalPages > 1 && (
            <span className="text-xs text-[var(--text-primary)]/40">
              Страница {page} из {totalPages}
            </span>
          )}
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              <p className="text-sm text-[var(--text-primary)]/40">
                Загружаем договоры…
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/5 px-5 py-12 text-center"
            >
              <AlertTriangle size={28} className="mb-3 text-[var(--accent)]" />
              <p className="font-medium text-[var(--text-primary)]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 py-2 text-sm text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)]"
              >
                <RefreshCcw size={14} />
                Попробовать снова
              </button>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] px-5 py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--hover-1)] text-[var(--text-primary)]/35">
                <FileText size={25} />
              </div>
              <p className="font-semibold text-[var(--text-primary)]">
                Договоров пока нет
              </p>
              <p className="mt-1 max-w-sm text-sm text-[var(--text-primary)]/40">
                Добавьте договор, чтобы сохранить сроки, сумму и условия обслуживания.
              </p>
              {!showForm && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
                >
                  <Plus size={16} />
                  Добавить договор
                </button>
              )}
            </div>
          ) : (
            contracts.map(contract => {
              const isExpanded = expandedId === contract.id;
              const isConfirming = confirmDeleteId === contract.id;
              const contractRates = Array.isArray(contract.rates) ? contract.rates : [];
              const amount = formatMoney(contract.sum);

              return (
                <article
                  key={contract.id}
                  className={`overflow-hidden rounded-2xl border bg-[var(--bg-card)] transition-colors ${
                    isExpanded
                      ? 'border-[var(--accent)]/25'
                      : 'border-[var(--border-color)] hover:border-[var(--border-color)]'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--hover-1)] sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                      <FileText size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="min-w-0 whitespace-normal break-words font-semibold text-[var(--text-primary)]"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {contract.name}
                        </span>

                        <span className="rounded-lg border border-[var(--border-color)] bg-[var(--hover-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-primary)]/60">
                          {contract.type}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hover-1)] px-2.5 py-1 text-xs text-[var(--text-primary)]/65">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
                          <span
                            className="whitespace-normal break-words"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {contract.status || 'Без статуса'}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-primary)]/45">
                          <Calendar size={13} className="flex-shrink-0" />
                          {contract.date_end
                            ? `${fmtDate(contract.date_start)} — ${fmtDate(contract.date_end)}`
                            : `С ${fmtDate(contract.date_start)}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2 pt-0.5">
                      {amount && (
                        <span className="max-w-[115px] break-words text-right text-xs font-semibold text-[var(--text-primary)]/70 sm:max-w-none sm:text-sm">
                          {amount}
                        </span>
                      )}

                      {isExpanded ? (
                        <ChevronUp size={17} className="text-[var(--text-primary)]/40" />
                      ) : (
                        <ChevronDown size={17} className="text-[var(--text-primary)]/35" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border-color)] px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Calendar
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Срок действия
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {fmtDate(contract.date_start)}
                              {' — '}
                              {fmtDate(contract.date_end)}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Clock
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Период оплаты
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {contract.period || 'Не указан'}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] p-3.5">
                          <Hash
                            size={17}
                            className="mt-0.5 flex-shrink-0 text-[var(--text-primary)]/40"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                              Сумма договора
                            </p>
                            <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                              {amount || 'Не указана'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                              Ставки
                            </h4>
                            <p className="mt-0.5 text-xs text-[var(--text-primary)]/40">
                              {contractRates.length
                                ? `Указано ставок: ${contractRates.length}`
                                : 'Ставки не добавлены'}
                            </p>
                          </div>
                        </div>

                        {contractRates.length > 0 && (
                          <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                            {contractRates.map((rate, index) => {
                              const numericRate = Number(rate.rate);
                              const rateText = Number.isFinite(numericRate)
                                ? numericRate.toLocaleString('ru-RU')
                                : String(rate.rate ?? '—');

                              const hours = [
                                rate.hours_subscription != null
                                  ? `Абонентские: ${rate.hours_subscription} ч`
                                  : null,
                                rate.hours_its != null
                                  ? `ИТС: ${rate.hours_its} ч`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ');

                              return (
                                <div
                                  key={rate.id ?? `${rate.type_rate}-${index}`}
                                  className={`grid grid-cols-1 gap-3 bg-[var(--hover-1)] p-4 sm:grid-cols-3 ${
                                    index > 0
                                      ? 'border-t border-[var(--border-color)]'
                                      : ''
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Вид ставки
                                    </p>
                                    <p className="mt-1 break-words text-sm font-medium text-[var(--text-primary)]/80">
                                      {rate.type_rate || `Ставка ${index + 1}`}
                                    </p>
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Размер
                                    </p>
                                    <p className="mt-1 break-words text-sm text-[var(--text-primary)]/75">
                                      {rateText}
                                      {rate.unit_measurement_rate
                                        ? ` за ${rate.unit_measurement_rate}`
                                        : ''}
                                    </p>
                                  </div>

                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
                                      Часы
                                    </p>
                                    <p className="mt-1 break-words text-sm text-[var(--text-primary)]/75">
                                      {hours || 'Не указаны'}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 border-t border-[var(--border-color)] pt-4">
                        {isConfirming ? (
                          <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle
                                size={18}
                                className="mt-0.5 flex-shrink-0 text-[var(--accent)]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  {projectId
                                    ? 'Отвязать этот договор от проекта?'
                                    : 'Удалить этот договор?'}
                                </p>
                                <p
                                  className="mt-1 break-words text-sm text-[var(--text-primary)]/55"
                                  style={{ overflowWrap: 'anywhere' }}
                                >
                                  {contract.name}.
                                  {projectId
                                    ? ' Договор останется у контрагента, но пропадёт из проекта.'
                                    : ' Это действие нельзя отменить.'}
                                </p>
                              </div>
                            </div>

                            {deleteError && (
                              <p
                                role="alert"
                                className="mt-3 text-sm text-[var(--accent)]"
                              >
                                {deleteError}
                              </p>
                            )}

                            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setDeleteError(null);
                                }}
                                disabled={deletingId === contract.id}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]/70 transition-colors hover:bg-[var(--hover-2)] disabled:opacity-50"
                              >
                                {projectId ? 'Оставить' : 'Оставить договор'}
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDelete(contract.id)}
                                disabled={deletingId === contract.id}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingId === contract.id ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Trash2 size={15} />
                                )}
                                {projectId ? 'Отвязать' : 'Удалить договор'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-[var(--text-primary)]/40">
                              {projectId
                                ? 'Можно изменить условия или отвязать договор от проекта.'
                                : 'Можно изменить условия или удалить договор.'}
                            </p>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(contract)}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--hover-1)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)]/75 transition-colors hover:bg-[var(--hover-2)]"
                              >
                                <Edit size={15} />
                                Изменить
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmDeleteId(contract.id);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                              >
                                <Trash2 size={15} />
                                {projectId ? 'Отвязать' : 'Удалить'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {!loading && !error && contracts.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-color)] px-4 py-4 sm:px-6">
            <span className="text-sm text-[var(--text-primary)]/45">
              Страница {page} из {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(currentPage => Math.max(1, currentPage - 1))}
                disabled={page <= 1}
                aria-label="Предыдущая страница"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/65 transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                type="button"
                onClick={() =>
                  setPage(currentPage => Math.min(totalPages, currentPage + 1))
                }
                disabled={page >= totalPages}
                aria-label="Следующая страница"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/65 transition-colors hover:bg-[var(--hover-2)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Модалка «Привязать существующий» — только для проекта */}
      {showLinkModal && projectId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowLinkModal(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Привязать договор
            </h3>

            {loadingLink ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-[var(--accent)]" />
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {linkOptions.filter(c => !(c.project_ids ?? []).includes(projectId)).length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-primary)]/40">
                    Нет доступных договоров
                  </p>
                ) : (
                  linkOptions
                    .filter(c => !(c.project_ids ?? []).includes(projectId))
                    .map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={async () => {
                          await contractsApi.linkProject(c.id, projectId);
                          setShowLinkModal(false);
                          await load();
                        }}
                        className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-left hover:bg-[var(--hover-2)]"
                      >
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {c.name}
                        </p>
                        <p className="text-xs text-[var(--text-primary)]/45">
                          {fmtDate(c.date_start)}
                        </p>
                      </button>
                    ))
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className="mt-4 w-full rounded-xl bg-[var(--hover-2)] py-2.5 text-sm font-medium text-[var(--text-primary)]/70"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}