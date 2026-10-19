import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  FileText,
  Mail,
  MessageSquare,
  AlertCircle,
  Lightbulb,
  Paperclip,
  Send,
  Loader2,
  X,
  ExternalLink,
  Building2,
  ChevronDown,
  Search,
} from 'lucide-react';

import { useAuthStore } from '../stores/authStore';

import {
  ticketsApi,
  counterpartiesApi,
} from '../api/client';

import { attachmentsApi } from '../api/attachments';

import type {
  Counterparty,
  TicketType,
  TicketPriority,
} from '../types';

// =============================================================================
// Constants
// =============================================================================

const SUPPORT_EMAIL = 'dio.ilarion@mail.ru';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

type SupportCategory = 'question' | 'bug' | 'suggestion';

const CATEGORIES = [
  {
    value: 'question' as const,
    label: 'Вопрос',
    description: 'Помощь в работе',
    icon: MessageSquare,
  },
  {
    value: 'bug' as const,
    label: 'Ошибка',
    description: 'Что-то не работает',
    icon: AlertCircle,
  },
  {
    value: 'suggestion' as const,
    label: 'Предложение',
    description: 'Идея по улучшению',
    icon: Lightbulb,
  },
];

const STAFF_ROLES = [
  'admin',
  'support_agent',
  'support_manager',
  'executor',
];

// =============================================================================
// Helpers
// =============================================================================

const getCounterpartyName = (cp: Counterparty) =>
  cp.name || cp.legal_name || cp.inn || 'Без названия';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

// =============================================================================
// Component
// =============================================================================

export default function SupportPage() {
  const navigate = useNavigate();

  const { user } = useAuthStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  // ===========================================================================
  // Permissions
  // ===========================================================================

  const currentUserId = user?.id ?? user?.user_id;

  const isCustomer =
    user?.roles?.some(
      (role) =>
        role === 'customer' ||
        role === 'customer_admin',
    ) ?? false;

  const canSelectCompany =
    !isCustomer &&
    (
      user?.roles?.some((role) =>
        STAFF_ROLES.includes(role),
      ) ?? false
    );

  // ===========================================================================
  // Form
  // ===========================================================================

  const [category, setCategory] =
    useState<SupportCategory>('question');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');

  const [createdTicket, setCreatedTicket] = useState<{
    id: string;
    number: string;
  } | null>(null);

  const [uploadWarning, setUploadWarning] = useState('');

  // ===========================================================================
  // Company
  // ===========================================================================

  const [companies, setCompanies] = useState<Counterparty[]>([]);

  const [selectedCompany, setSelectedCompany] =
    useState<Counterparty | null>(null);

  const [customerCompany, setCustomerCompany] =
    useState<Counterparty | null>(null);

  const [companySearch, setCompanySearch] = useState('');

  const [showCompanyDropdown, setShowCompanyDropdown] =
    useState(false);

  const [loadingCompanies, setLoadingCompanies] =
    useState(false);

  const [loadingCustomerCompany, setLoadingCustomerCompany] =
    useState(false);

  // ===========================================================================
  // Load customer's company
  // ===========================================================================

  useEffect(() => {
    if (!isCustomer || !user?.counterparty_id) {
      setCustomerCompany(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadingCustomerCompany(true);

      try {
        const cp = await counterpartiesApi.getById(
          user.counterparty_id!,
        );

        if (!cancelled) {
          setCustomerCompany(cp);
        }
      } catch (err) {
        console.error(
          'Failed to load customer company:',
          err,
        );
      } finally {
        if (!cancelled) {
          setLoadingCustomerCompany(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isCustomer, user?.counterparty_id]);

  // ===========================================================================
  // Load companies for staff
  // ===========================================================================

  useEffect(() => {
    if (!canSelectCompany) {
      setCompanies([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadingCompanies(true);

      try {
        const response = await counterpartiesApi.getAll(1, 100);

        if (!cancelled) {
          setCompanies(response.items);
        }
      } catch (err) {
        console.error(
          'Failed to load companies:',
          err,
        );
      } finally {
        if (!cancelled) {
          setLoadingCompanies(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [canSelectCompany]);

  // ===========================================================================
  // Outside click
  // ===========================================================================

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(
          event.target as Node,
        )
      ) {
        setShowCompanyDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  // ===========================================================================
  // Filter companies
  // ===========================================================================

  const filteredCompanies = companies.filter((cp) => {
    if (!companySearch.trim()) return true;

    const query = companySearch.toLowerCase();

    return (
      getCounterpartyName(cp).toLowerCase().includes(query) ||
      cp.inn?.includes(companySearch)
    );
  });

  const selectedCounterpartyId = isCustomer
    ? user?.counterparty_id
    : selectedCompany?.id;

  // ===========================================================================
  // Files
  // ===========================================================================

  const addFiles = (selected: File[]) => {
    setError('');

    const valid = selected.filter(
      (file) => file.size <= MAX_FILE_SIZE,
    );

    if (valid.length !== selected.length) {
      setError(
        'Некоторые файлы не добавлены. Максимальный размер одного файла — 25 МБ.',
      );
    }

    setFiles((current) => {
      const available = Math.max(
        0,
        MAX_FILES - current.length,
      );

      if (selected.length > available) {
        setError(
          'Можно прикрепить не более 10 файлов.',
        );
      }

      return [
        ...current,
        ...valid.slice(0, available),
      ];
    });
  };

  const removeFile = (index: number) => {
    setFiles((current) =>
      current.filter((_, i) => i !== index),
    );
  };

  // ===========================================================================
  // Submit
  // ===========================================================================

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (submitting) return;

    setError('');

    if (!currentUserId) {
      setError('Не удалось определить текущего пользователя.');
      return;
    }

    if (!title.trim()) {
      setError('Укажите тему обращения.');
      return;
    }

    if (!description.trim()) {
      setError('Добавьте описание обращения.');
      return;
    }

    if (!selectedCounterpartyId) {
      setError(
        isCustomer
          ? 'Не удалось определить вашу компанию.'
          : 'Выберите компанию, от имени которой создаётся обращение.',
      );
      return;
    }

    setSubmitting(true);

    try {
      const categoryLabel =
        CATEGORIES.find((item) => item.value === category)?.label ||
        'Вопрос';

      // Тип заявки
      const ticketType: TicketType =
        category === 'bug'
          ? 'Инцидент'
          : category === 'suggestion'
            ? 'Улучшение'
            : 'Консультация';

      const ticketPriority: TicketPriority = 'medium';

      // Описание заявки
      const ticketDescription = [
        'Обращение в поддержку DIO Desk',
        '',
        `Категория: ${categoryLabel}`,
        '',
        'Описание обращения:',
        description.trim(),
      ].join('\n');

      const ticketData = {
        title: `[Поддержка DIO Desk] ${title.trim()}`,

        description: ticketDescription,

        priority: ticketPriority,

        type: ticketType,

        counterparty_id: selectedCounterpartyId,

        reporter_id: currentUserId,

        tags: [
          {
            name: 'Поддержка DIO Desk',
            color: '#60a5fa',
          },
          {
            name: categoryLabel,
            color: '#94a3b8',
          },
        ],
      };

      // Создаём заявку
      const ticket = await ticketsApi.create(ticketData);

      // Загрузка вложений
      const failedFiles: string[] = [];

      for (const file of files) {
        try {
          await attachmentsApi.uploadAttachment(
            file,
            'ticket',
            ticket.id,
          );
        } catch (uploadError) {
          console.error(
            'Support file upload failed:',
            file.name,
            uploadError,
          );

          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0) {
        setUploadWarning(
          `Обращение создано, но не удалось загрузить файлы: ${failedFiles.join(', ')}`,
        );
      } else {
        setUploadWarning('');
      }

      setCreatedTicket({
        id: ticket.id,
        number: ticket.number,
      });

    } catch (err: any) {
      console.error(
        'Support request failed:',
        err?.response?.data || err,
      );

      const detail = err?.response?.data?.detail;

      setError(
        typeof detail === 'string'
          ? detail
          : 'Не удалось отправить обращение. Попробуйте ещё раз или напишите нам на почту.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ===========================================================================
  // Reset
  // ===========================================================================

  const resetForm = () => {
    setCreatedTicket(null);
    setUploadWarning('');

    setCategory('question');
    setTitle('');
    setDescription('');
    setFiles([]);

    setError('');

    if (canSelectCompany) {
      setSelectedCompany(null);
      setCompanySearch('');
    }
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div className="mx-auto px-4 pb-14 sm:px-6">

      {/* Back */}

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="
          mb-6 inline-flex items-center gap-2
          text-sm font-medium
          text-[var(--text-primary)]/55
          transition-colors
          hover:text-[var(--text-primary)]
        "
      >
        <ArrowLeft className="h-4 w-4" />
        Назад
      </button>

      {/* Page header */}

      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">

          <div
            className="
              flex h-12 w-12 items-center justify-center
              rounded-xl border border-blue-500/20
              bg-blue-500/10
            "
          >
            <CircleHelp className="h-6 w-6 text-blue-400" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Поддержка DIO Desk
            </h1>

            <p className="mt-1 text-base text-[var(--text-primary)]/50">
              Помощь по работе с системой
            </p>
          </div>

        </div>

        <p className=" text-base leading-7 text-[var(--text-primary)]/65">
          Возникли вопросы при работе с DIO Desk?
          Столкнулись с ошибкой или хотите предложить улучшение?
          Опишите ситуацию, и мы поможем разобраться.
        </p>
      </div>

      {/* Success */}

      {createdTicket ? (
        <div
          className="
            rounded-2xl border border-[var(--border-color)]
            bg-[var(--bg-secondary)]
            p-8 text-center sm:p-12
          "
        >
          <div
            className="
              mx-auto mb-5 flex h-16 w-16
              items-center justify-center rounded-2xl
              bg-emerald-500/10
            "
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>

          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Обращение отправлено
          </h2>

          <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[var(--text-primary)]/60">
            Ваше обращение зарегистрировано в DIO Desk.
            Вы можете открыть заявку и отслеживать её статус.
          </p>

          <div
            className="
              mx-auto mt-5 w-fit rounded-lg
              border border-[var(--border-color)]
              bg-[var(--hover-1)]
              px-4 py-2 text-sm font-semibold
              text-[var(--text-primary)]
            "
          >
            {createdTicket.number}
          </div>

          {uploadWarning && (
            <div className="mx-auto mt-5 max-w-lg rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-sm leading-6 text-amber-400">
                {uploadWarning}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap justify-center gap-3">

            <button
              type="button"
              onClick={() =>
                navigate(`/tickets/${createdTicket.number}`)
              }
              className="
                inline-flex items-center gap-2
                rounded-xl bg-[var(--accent)]
                px-5 py-3 text-sm font-semibold text-white
                transition hover:brightness-110
              "
            >
              Перейти к заявке
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="
                rounded-xl border border-[var(--border-color)]
                bg-[var(--hover-1)]
                px-5 py-3 text-sm font-medium
                text-[var(--text-primary)]
                hover:bg-[var(--hover-2)]
              "
            >
              Новое обращение
            </button>

          </div>
        </div>
      ) : (

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">

          {/* Form */}

          <form
            onSubmit={handleSubmit}
            className="
              overflow-hidden rounded-2xl
              border border-[var(--border-color)]
              bg-[var(--bg-secondary)]
            "
          >

            {/* Form header */}

            <div className="border-b border-[var(--border-color)] px-6 py-5">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Создать обращение
              </h2>

              <p className="mt-1 text-sm text-[var(--text-primary)]/50">
                Расскажите, с чем вам нужна помощь
              </p>
            </div>

            <div className="space-y-7 p-6">

              {/* Category */}

              <section>
                <label className="mb-3 block text-sm font-semibold text-[var(--text-primary)]">
                  Тип обращения
                </label>

                <div className="grid gap-3 sm:grid-cols-3">

                  {CATEGORIES.map((item) => {
                    const Icon = item.icon;
                    const selected = category === item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setCategory(item.value)}
                        className={`
                          rounded-xl border p-3 text-left
                          transition-colors
                          ${
                            selected
                              ? 'border-blue-500/40 bg-blue-500/10'
                              : 'border-[var(--border-color)] bg-[var(--hover-1)]/40 hover:bg-[var(--hover-1)]'
                          }
                        `}
                      >
                        <Icon
                          className={`mb-2 h-5 w-5 ${
                            selected
                              ? 'text-blue-400'
                              : 'text-[var(--text-primary)]/50'
                          }`}
                        />

                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </p>

                        <p className="mt-1 text-xs text-[var(--text-primary)]/45">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}

                </div>
              </section>

              {/* Company */}

              <section>
                <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
                  Компания
                  <span className="ml-1 text-red-400">*</span>
                </label>

                {isCustomer ? (

                  <div
                    className="
                      flex min-h-[52px] items-center gap-3
                      rounded-xl border border-[var(--border-color)]
                      bg-[var(--hover-1)]
                      px-4
                    "
                  >
                    <Building2 className="h-5 w-5 shrink-0 text-blue-400" />

                    <span className="min-w-0 truncate text-base text-[var(--text-primary)]">
                      {loadingCustomerCompany
                        ? 'Загружаем компанию...'
                        : customerCompany
                          ? getCounterpartyName(customerCompany)
                          : 'Ваша компания'}
                    </span>
                  </div>

                ) : canSelectCompany ? (

                  <div ref={companyDropdownRef} className="relative">

                    <div
                      className="
                        flex h-[52px] items-center gap-3
                        rounded-xl border border-[var(--border-color)]
                        bg-[var(--hover-1)]
                        px-4
                        focus-within:border-[var(--accent)]
                      "
                    >
                      <Search className="h-5 w-5 shrink-0 text-[var(--text-primary)]/45" />

                      <input
                        type="text"
                        value={companySearch}
                        onChange={(event) => {
                          setCompanySearch(event.target.value);
                          setSelectedCompany(null);
                          setShowCompanyDropdown(true);
                        }}
                        onFocus={() => setShowCompanyDropdown(true)}
                        placeholder="Найти компанию по названию или ИНН"
                        className="
                          min-w-0 flex-1
                          border-0 bg-transparent
                          text-base text-[var(--text-primary)]
                          outline-none
                          placeholder:text-[var(--text-primary)]/35
                        "
                      />

                      {loadingCompanies ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--text-primary)]/45" />
                      ) : (
                        <ChevronDown className="h-5 w-5 shrink-0 text-[var(--text-primary)]/45" />
                      )}
                    </div>

                    {showCompanyDropdown && (
                      <div
                        className="
                          absolute left-0 right-0 top-full z-50 mt-2
                          max-h-72 overflow-y-auto
                          rounded-xl border border-[var(--border-color)]
                          bg-[var(--bg-primary)]
                          p-1.5 shadow-xl
                        "
                      >

                        {loadingCompanies ? (
                          <div className="px-4 py-5 text-center text-sm text-[var(--text-primary)]/50">
                            Загружаем компании...
                          </div>
                        ) : filteredCompanies.length === 0 ? (
                          <div className="px-4 py-5 text-center text-sm text-[var(--text-primary)]/50">
                            Компании не найдены
                          </div>
                        ) : (
                          filteredCompanies.map((cp) => (
                            <button
                              key={cp.id}
                              type="button"
                              onClick={() => {
                                setSelectedCompany(cp);
                                setCompanySearch(getCounterpartyName(cp));
                                setShowCompanyDropdown(false);
                              }}
                              className="
                                flex w-full items-center gap-3
                                rounded-lg px-3 py-3 text-left
                                transition-colors
                                hover:bg-[var(--hover-2)]
                              "
                            >
                              <Building2 className="h-5 w-5 shrink-0 text-blue-400" />

                              <div className="min-w-0 flex-1">

                                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                  {getCounterpartyName(cp)}
                                </p>

                                {cp.inn && (
                                  <p className="mt-0.5 text-xs text-[var(--text-primary)]/45">
                                    ИНН {cp.inn}
                                  </p>
                                )}

                              </div>

                            </button>
                          ))
                        )}

                      </div>
                    )}

                  </div>

                ) : (

                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-3 text-sm text-[var(--text-primary)]/55">
                    Для вашей роли создание обращения пока недоступно.
                  </div>

                )}
              </section>

              {/* Title */}

              <section>
                <label
                  htmlFor="support-title"
                  className="mb-2 block text-sm font-semibold text-[var(--text-primary)]"
                >
                  Тема обращения
                  <span className="ml-1 text-red-400">*</span>
                </label>

                <input
                  id="support-title"
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Например: Не получается открыть проект"
                  className="
                    w-full rounded-xl
                    border border-[var(--border-color)]
                    bg-[var(--hover-1)]
                    px-4 py-3 text-base
                    text-[var(--text-primary)]
                    outline-none transition-colors
                    placeholder:text-[var(--text-primary)]/35
                    focus:border-[var(--accent)]
                  "
                />
              </section>

              {/* Description */}

              <section>
                <label
                  htmlFor="support-description"
                  className="mb-2 block text-sm font-semibold text-[var(--text-primary)]"
                >
                  Описание
                  <span className="ml-1 text-red-400">*</span>
                </label>

                <textarea
                  id="support-description"
                  required
                  rows={7}
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder={
                    'Опишите ваш вопрос или проблему.\n\n' +
                    'Если возникла ошибка, расскажите, что вы делали перед её появлением.'
                  }
                  className="
                    w-full resize-y rounded-xl
                    border border-[var(--border-color)]
                    bg-[var(--hover-1)]
                    px-4 py-3 text-base leading-7
                    text-[var(--text-primary)]
                    outline-none transition-colors
                    placeholder:text-[var(--text-primary)]/35
                    focus:border-[var(--accent)]
                  "
                />

                <p className="mt-2 text-xs text-[var(--text-primary)]/45">
                  Чем подробнее описание, тем проще будет разобраться в ситуации.
                </p>
              </section>

              {/* Files */}

              <section>
                <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
                  Вложения
                  <span className="ml-2 font-normal text-[var(--text-primary)]/45">
                    Необязательно
                  </span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files || []));
                    event.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="
                    flex w-full items-center justify-center gap-3
                    rounded-xl border-2 border-dashed
                    border-[var(--border-color)]
                    bg-[var(--hover-1)]/40
                    px-4 py-6
                    text-sm text-[var(--text-primary)]/65
                    transition-colors
                    hover:border-blue-500/30
                    hover:bg-[var(--hover-1)]
                  "
                >
                  <Paperclip className="h-5 w-5" />

                  <span>
                    Прикрепить скриншоты или документы
                  </span>
                </button>

                <p className="mt-2 text-xs text-[var(--text-primary)]/40">
                  До 10 файлов, не более 25 МБ каждый
                </p>

                {files.length > 0 && (
                  <div className="mt-3 space-y-2">

                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="
                          flex items-center gap-3
                          rounded-lg border border-[var(--border-color)]
                          bg-[var(--hover-1)]
                          px-3 py-2.5
                        "
                      >
                        <FileText className="h-4 w-4 shrink-0 text-[var(--text-primary)]/50" />

                        <div className="min-w-0 flex-1">

                          <p className="truncate text-sm text-[var(--text-primary)]">
                            {file.name}
                          </p>

                          <p className="mt-0.5 text-xs text-[var(--text-primary)]/40">
                            {formatFileSize(file.size)}
                          </p>

                        </div>

                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="rounded-md p-1 text-[var(--text-primary)]/45 hover:bg-[var(--hover-2)] hover:text-red-400"
                          aria-label="Удалить файл"
                        >
                          <X className="h-4 w-4" />
                        </button>

                      </div>
                    ))}

                  </div>
                )}
              </section>

              {/* Error */}

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">

                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />

                  <p className="text-sm leading-6 text-red-400">
                    {error}
                  </p>

                </div>
              )}

            </div>

            {/* Submit */}

            <div className="flex justify-end border-t border-[var(--border-color)] px-6 py-4">

              <button
                type="submit"
                disabled={
                  submitting ||
                  !title.trim() ||
                  !description.trim() ||
                  !selectedCounterpartyId
                }
                className="
                  inline-flex items-center gap-2
                  rounded-xl bg-[var(--accent)]
                  px-6 py-3
                  text-sm font-semibold text-white
                  transition hover:brightness-110
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Отправляем...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Отправить обращение
                  </>
                )}
              </button>

            </div>
          </form>

          {/* Right column */}

          <aside className="space-y-5">

            {/* How it works */}

            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">

              <div className="mb-3 flex items-center gap-2.5">
                <MessageSquare className="h-5 w-5 text-blue-400" />

                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Как это работает
                </h3>
              </div>

              <p className="text-sm leading-6 text-[var(--text-primary)]/60">
                После отправки обращения в DIO Desk будет создана заявка.
                Вы сможете открыть её, отслеживать статус и получать
                информацию о ходе рассмотрения.
              </p>

            </div>

            {/* Email */}

            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">

              <div className="mb-3 flex items-center gap-2.5">
                <Mail className="h-5 w-5 text-blue-400" />

                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Электронная почта
                </h3>
              </div>

              <p className="mb-3 text-sm leading-6 text-[var(--text-primary)]/60">
                Если удобнее связаться напрямую или у вас остались
                дополнительные вопросы, напишите нам.
              </p>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="
                  inline-flex max-w-full items-center gap-2
                  break-all text-sm font-semibold
                  text-[var(--accent)]
                  hover:underline
                "
              >
                {SUPPORT_EMAIL}

                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>

            </div>

            {/* Tip */}

            <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">

              <div className="flex items-start gap-3">

                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />

                <p className="text-sm leading-6 text-[var(--text-primary)]/65">
                  Если вы сообщаете об ошибке, приложите скриншот.
                  Это поможет быстрее определить причину проблемы.
                </p>

              </div>

            </div>

          </aside>

        </div>
      )}

    </div>
  );
}