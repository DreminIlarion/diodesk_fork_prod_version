import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  User,
  Briefcase,
  ArrowLeft,
  Save,
  Phone,
  Mail,
  MapPin,
  UserCircle,
  Plus,
  Trash2,
  GitBranch,
  X,
  Loader2,
  Package,
  Search,
  Check,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

import { counterpartiesApi, productsApi } from '../api/client';
import { ActionButton } from '../components/ui/ActionButton';

import type {
  CounterpartyType,
  CreateCounterpartyInput,
  ContactPersonInput,
  CreateBranchInput,
} from '../types';

/* ═══════════════════════════════════════════════════════════════════
   PHONE
   ═══════════════════════════════════════════════════════════════════ */

function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }

  if (digits.length > 0 && !digits.startsWith('7')) {
    digits = '7' + digits;
  }

  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 1) return '+7';
  if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
  if (digits.length <= 7) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
  }
  if (digits.length <= 9) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function getPhoneDigits(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');

  if (digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }

  return digits;
}

function isPhoneComplete(formatted: string): boolean {
  return getPhoneDigits(formatted).length === 11;
}

function isPhoneValid(formatted: string): boolean {
  if (!formatted || formatted === '+7') return true;
  return isPhoneComplete(formatted);
}

function usePhoneMask(initial = '') {
  const [display, setDisplay] = useState(() =>
    formatPhoneInput(initial),
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDisplay(formatPhoneInput(event.target.value));
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key === 'Backspace' &&
        display.length > 0
      ) {
        event.preventDefault();

        const digits = getPhoneDigits(display);

        setDisplay(
          formatPhoneInput(digits.slice(0, -1)),
        );
      }
    },
    [display],
  );

  const rawValue = display
    ? '+' + getPhoneDigits(display)
    : '';

  const isEmpty =
    getPhoneDigits(display).length <= 1;

  return {
    display,
    setDisplay,
    handleChange,
    handleKeyDown,
    rawValue,
    isComplete: isPhoneComplete(display),
    isEmpty,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   EMAIL
   ═══════════════════════════════════════════════════════════════════ */

function isEmailValid(email: string): boolean {
  if (!email) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
    email.trim(),
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DUPLICATES
   ═══════════════════════════════════════════════════════════════════ */

interface BranchFormData {
  name: string;
  legal_name: string;
  kpp: string;
  okpo: string;
  phone: string;
  email: string;
  address: string;
}

function collectAllEmails(
  companyEmail: string,
  contactPersons: ContactPersonInput[],
  includeContacts: boolean,
  branches: BranchFormData[],
  includeBranches: boolean,
): { email: string; source: string }[] {
  const all: { email: string; source: string }[] =
    [];

  if (companyEmail.trim()) {
    all.push({
      email: companyEmail.trim().toLowerCase(),
      source: 'Компания',
    });
  }

  if (includeContacts) {
    contactPersons.forEach((contact, index) => {
      if (contact.email?.trim()) {
        all.push({
          email: contact.email
            .trim()
            .toLowerCase(),
          source: `Контакт #${index + 1}`,
        });
      }
    });
  }

  if (includeBranches) {
    branches.forEach((branch, index) => {
      if (branch.email.trim()) {
        all.push({
          email: branch.email
            .trim()
            .toLowerCase(),
          source: `Подразделение #${index + 1}`,
        });
      }
    });
  }

  return all;
}

function findDuplicateEmails(
  companyEmail: string,
  contactPersons: ContactPersonInput[],
  includeContacts: boolean,
  branches: BranchFormData[],
  includeBranches: boolean,
) {
  const all = collectAllEmails(
    companyEmail,
    contactPersons,
    includeContacts,
    branches,
    includeBranches,
  );

  const grouped = new Map<string, string[]>();

  all.forEach(({ email, source }) => {
    if (!grouped.has(email)) {
      grouped.set(email, []);
    }

    grouped.get(email)!.push(source);
  });

  return Array.from(grouped.entries())
    .filter(([, sources]) => sources.length > 1)
    .map(([email, sources]) => ({
      email,
      sources,
    }));
}

/* ═══════════════════════════════════════════════════════════════════
   VALIDATION
   ═══════════════════════════════════════════════════════════════════ */

function validateInn(
  inn: string,
  type: CounterpartyType,
): { valid: boolean; message: string } {
  if (!inn) {
    return { valid: false, message: '' };
  }

  if (!/^\d+$/.test(inn)) {
    return {
      valid: false,
      message: 'ИНН должен содержать только цифры',
    };
  }

  const length =
    type === 'Юридическое лицо' ? 10 : 12;

  if (inn.length !== length) {
    return {
      valid: false,
      message: `ИНН: ${inn.length}/${length} цифр`,
    };
  }

  return { valid: true, message: '' };
}

function validateKpp(kpp: string) {
  if (!kpp) {
    return { valid: false, message: '' };
  }

  if (!/^\d{9}$/.test(kpp)) {
    return {
      valid: false,
      message: `КПП: ${kpp.length}/9 цифр`,
    };
  }

  return { valid: true, message: '' };
}

function validateOkpo(okpo: string) {
  if (!okpo) {
    return { valid: true, message: '' };
  }

  if (!/^\d+$/.test(okpo)) {
    return {
      valid: false,
      message: 'ОКПО должен содержать только цифры',
    };
  }

  if (
    okpo.length !== 8 &&
    okpo.length !== 10
  ) {
    return {
      valid: false,
      message: 'ОКПО должен содержать 8 или 10 цифр',
    };
  }

  return { valid: true, message: '' };
}

/* ═══════════════════════════════════════════════════════════════════
   BACKEND ERRORS
   ═══════════════════════════════════════════════════════════════════ */

interface FieldError {
  field: string;
  message: string;
}

function parseBackendErrors(err: any): {
  general: string;
  fields: FieldError[];
} {
  const data = err?.response?.data;
  const status = err?.response?.status;

  if (!data) {
    return {
      general: 'Произошла неизвестная ошибка',
      fields: [],
    };
  }

  const detail = data.detail;

  if (status === 422 && Array.isArray(detail)) {
    const fields = detail.map((error: any) => {
      const loc = error.loc || [];

      return {
        field:
          loc
            .filter((part: any) => part !== 'body')
            .join('.') || 'unknown',
        message:
          error.msg || JSON.stringify(error),
      };
    });

    return {
      general:
        'Проверьте правильность заполнения полей',
      fields,
    };
  }

  if (typeof detail === 'string') {
    return {
      general: detail,
      fields: [],
    };
  }

  return {
    general:
      typeof detail === 'object'
        ? JSON.stringify(detail)
        : 'Ошибка создания контрагента',
    fields: [],
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SMALL UI
   ═══════════════════════════════════════════════════════════════════ */

const inputCls = (error = false) => `
  w-full px-4 py-3.5
  text-base
  bg-[var(--hover-2)]
  border rounded-xl
  text-[var(--text-primary)]
  placeholder-[var(--text-muted)]
  focus:outline-none
  focus:ring-2
  transition-all
  ${error
    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/10'
    : 'border-[var(--border-color)] focus:border-[var(--accent)]/40 focus:ring-[var(--accent-ring)]'
  }
`;

const labelCls =
  'block text-sm font-medium text-[var(--text-primary)]/65 mb-2';

function Hint({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {children}
    </p>
  );
}

function SuccessHint({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1.5">
      <Check className="w-3.5 h-3.5 shrink-0" />
      {children}
    </p>
  );
}

function EmailInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [touched, setTouched] =
    useState(false);

  const valid = isEmailValid(value);
  const error =
    touched && !!value && !valid;

  return (
    <>
      <input
        type="email"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        onBlur={() => setTouched(true)}
        placeholder={
          placeholder ?? 'email@example.ru'
        }
        className={inputCls(error)}
      />

      {error && (
        <Hint>Введите корректный email</Hint>
      )}

      {touched && !!value && valid && (
        <SuccessHint>Email корректен</SuccessHint>
      )}
    </>
  );
}

function ContactPhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  const [display, setDisplay] = useState(
    () => formatPhoneInput(value),
  );

  const change = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const formatted = formatPhoneInput(
      event.target.value,
    );

    setDisplay(formatted);

    const digits =
      getPhoneDigits(formatted);

    onChange(
      digits.length > 1 ? '+' + digits : '',
    );
  };

  const valid = isPhoneComplete(display);
  const hasValue =
    getPhoneDigits(display).length > 1;

  return (
    <>
      <input
        type="tel"
        value={display}
        onChange={change}
        placeholder="+7 (___) ___-__-__"
        className={inputCls(
          hasValue && !valid,
        )}
      />

      {hasValue && !valid && (
        <Hint>Введите полный номер</Hint>
      )}
    </>
  );
}

function BranchPhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <ContactPhoneInput
      value={value}
      onChange={onChange}
    />
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-6 py-5 border-b border-[var(--border-color)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--hover-2)] flex items-center justify-center text-[var(--text-primary)]/45">
          {icon}
        </div>

        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>

          {description && (
            <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════ */

const COUNTERPARTY_TYPES: {
  value: CounterpartyType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
    {
      value: 'Юридическое лицо',
      label: 'Юридическое лицо',
      desc: 'ИНН 10 цифр, КПП обязателен',
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      value: 'Физическое лицо',
      label: 'Физическое лицо',
      desc: 'ИНН 12 цифр',
      icon: <User className="w-5 h-5" />,
    },
    {
      value:
        'Индивидуальный предприниматель',
      label: 'ИП',
      desc: 'ИНН 12 цифр',
      icon: <Briefcase className="w-5 h-5" />,
    },
  ];

const ENVIRONMENTS = [
  {
    value: 'production',
    label: 'Продакшн',
  },
  {
    value: 'staging',
    label: 'Стенд',
  },
  {
    value: 'testing',
    label: 'Тестирование',
  },
  {
    value: 'development',
    label: 'Разработка',
  },
] as const;

function envLabel(value: string) {
  return (
    ENVIRONMENTS.find(
      (item) => item.value === value,
    )?.label ?? value
  );
}

function emptyContactPerson(): ContactPersonInput {
  return {
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    email: '',
    position: '',
    extension: '',
    messengers: {
      telegram: '',
      vk: '',
    },
  };
}

function emptyBranch(): BranchFormData {
  return {
    name: '',
    legal_name: '',
    kpp: '',
    okpo: '',
    phone: '',
    email: '',
    address: '',
  };
}

interface LinkedProduct {
  product: any;
  environment: string;
  is_primary: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function NewCounterpartyPage() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] =
    useState(false);

  const [generalError, setGeneralError] =
    useState<string | null>(null);

  const [fieldErrors, setFieldErrors] =
    useState<FieldError[]>([]);

  const [formData, setFormData] =
    useState<CreateCounterpartyInput>({
      counterparty_type:
        'Юридическое лицо',
      name: '',
      legal_name: '',
      inn: '',
      kpp: '',
      okpo: '',
      phone: '',
      email: '',
      address: '',
    });

  const companyPhone =
    usePhoneMask(formData.phone);

  /* additional */

  const [includeContacts, setIncludeContacts] =
    useState(false);

  const [contactPersons, setContactPersons] =
    useState<ContactPersonInput[]>([]);

  const [includeBranches, setIncludeBranches] =
    useState(false);

  const [branches, setBranches] =
    useState<BranchFormData[]>([]);

  const [includeProducts, setIncludeProducts] =
    useState(false);

  /* products */

  const [linkedProducts, setLinkedProducts] =
    useState<LinkedProduct[]>([]);

  const [allProducts, setAllProducts] =
    useState<any[]>([]);

  const [loadingProducts, setLoadingProducts] =
    useState(false);

  const [productFilter, setProductFilter] =
    useState('');

  const [productEnv, setProductEnv] =
    useState('production');

  const [
    productIsPrimary,
    setProductIsPrimary,
  ] = useState(false);

  useEffect(() => {
    if (
      !includeProducts ||
      allProducts.length > 0
    ) {
      return;
    }

    setLoadingProducts(true);

    productsApi
      .getProducts({
        page: 1,
        size: 50,
      })
      .then((response) =>
        setAllProducts(
          response.items ?? [],
        ),
      )
      .catch(() => { })
      .finally(() =>
        setLoadingProducts(false),
      );
  }, [
    includeProducts,
    allProducts.length,
  ]);

  const clearErrors = () => {
    setGeneralError(null);
    setFieldErrors([]);
  };

  /* ──────────────────────────────────────
     TYPE
  ────────────────────────────────────── */

  const handleTypeChange = (
    type: CounterpartyType,
  ) => {
    clearErrors();

    setFormData((prev) => ({
      ...prev,
      counterparty_type: type,
      inn: '',
      kpp:
        type === 'Юридическое лицо'
          ? prev.kpp
          : '',
    }));

    if (type !== 'Юридическое лицо') {
      setIncludeBranches(false);
      setBranches([]);
    }
  };

  /* ──────────────────────────────────────
     CONTACTS
  ────────────────────────────────────── */

  const toggleContacts = () => {
    if (includeContacts) {
      setIncludeContacts(false);
      setContactPersons([]);
      return;
    }

    setIncludeContacts(true);

    if (!contactPersons.length) {
      setContactPersons([
        emptyContactPerson(),
      ]);
    }
  };

  const updateContact = (
    index: number,
    value: ContactPersonInput,
  ) => {
    setContactPersons((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? value
          : item,
      ),
    );
  };

  /* ──────────────────────────────────────
     BRANCHES
  ────────────────────────────────────── */

  const toggleBranches = () => {
    if (includeBranches) {
      setIncludeBranches(false);
      setBranches([]);
      return;
    }

    setIncludeBranches(true);

    if (!branches.length) {
      setBranches([emptyBranch()]);
    }
  };

  const updateBranch = (
    index: number,
    value: BranchFormData,
  ) => {
    setBranches((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? value
          : item,
      ),
    );
  };

  /* ──────────────────────────────────────
     PRODUCTS
  ────────────────────────────────────── */

  const filteredProducts =
    allProducts.filter((product) => {
      if (
        linkedProducts.some(
          (linked) =>
            linked.product.id ===
            product.id,
        )
      ) {
        return false;
      }

      const query =
        productFilter
          .trim()
          .toLowerCase();

      if (!query) return true;

      return (
        (
          product.display_name ||
          product.name ||
          ''
        )
          .toLowerCase()
          .includes(query) ||
        (product.vendor || '')
          .toLowerCase()
          .includes(query)
      );
    });

  /* ──────────────────────────────────────
     VALIDATION
  ────────────────────────────────────── */

  const innLength =
    formData.counterparty_type ===
      'Юридическое лицо'
      ? 10
      : 12;

  const innValidation = validateInn(
    formData.inn,
    formData.counterparty_type,
  );

  const kppValidation = validateKpp(
    formData.kpp ?? '',
  );

  const okpoValidation = validateOkpo(
    formData.okpo ?? '',
  );

  const isMainValid =
    !!formData.name.trim() &&
    !!formData.legal_name.trim() &&
    innValidation.valid &&
    (
      formData.counterparty_type !==
      'Юридическое лицо' ||
      kppValidation.valid
    ) &&
    okpoValidation.valid;

  const areContactsValid =
    !includeContacts ||
    contactPersons.every(
      (contact) =>
        !!contact.last_name?.trim() &&
        !!contact.first_name?.trim() &&
        !!contact.middle_name?.trim() &&
        isPhoneValid(
          contact.phone ?? '',
        ) &&
        isEmailValid(
          contact.email ?? '',
        ),
    );

  const areBranchesValid =
    !includeBranches ||
    branches.every(
      (branch) =>
        !!branch.name.trim() &&
        !!branch.legal_name.trim() &&
        validateKpp(branch.kpp).valid &&
        validateOkpo(branch.okpo).valid &&
        isPhoneComplete(branch.phone) &&
        !!branch.email.trim() &&
        isEmailValid(branch.email),
    );

  const duplicates = findDuplicateEmails(
    formData.email,
    contactPersons,
    includeContacts,
    branches,
    includeBranches,
  );

  const companyContactsValid =
    companyPhone.isComplete &&
    isEmailValid(formData.email);

  const isFormValid =
    isMainValid &&
    companyContactsValid &&
    areContactsValid &&
    areBranchesValid &&
    duplicates.length === 0;

  /* ──────────────────────────────────────
     SUBMIT
  ────────────────────────────────────── */

  const handleSubmit = async () => {
    clearErrors();

    if (!isFormValid) {
      setGeneralError(
        'Проверьте обязательные поля перед созданием контрагента.',
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      return;
    }

    setIsLoading(true);

    let createdId: string | null = null;

    try {
      const payload: any = {
        counterparty_type:
          formData.counterparty_type,
        name: formData.name.trim(),
        legal_name:
          formData.legal_name.trim(),
        inn: formData.inn,
        phone: companyPhone.rawValue,
      };

      if (formData.email.trim()) {
        payload.email =
          formData.email.trim();
      }

      if (
        formData.counterparty_type ===
        'Юридическое лицо'
      ) {
        payload.kpp = formData.kpp;
      } else {
        payload.kpp = 0;
      }

      if (formData.okpo) {
        payload.okpo = formData.okpo;
      }

      if (formData.address?.trim()) {
        payload.address =
          formData.address.trim();
      }

      if (
        includeContacts &&
        contactPersons.length
      ) {
        payload.contact_persons =
          contactPersons.map(
            (contact) => {
              const result: any = {
                first_name:
                  contact.first_name.trim(),
                last_name:
                  contact.last_name.trim(),
              };

              if (
                contact.middle_name?.trim()
              ) {
                result.middle_name =
                  contact.middle_name.trim();
              }

              if (contact.phone) {
                result.phone =
                  contact.phone;
              }

              if (
                contact.extension?.trim()
              ) {
                result.extension =
                  contact.extension.trim();
              }

              if (
                contact.position?.trim()
              ) {
                result.position =
                  contact.position.trim();
              }

              if (contact.email?.trim()) {
                result.email =
                  contact.email.trim();
              }

              const messengers: any = {};

              if (
                contact.messengers
                  ?.telegram
              ) {
                messengers.telegram =
                  contact.messengers.telegram;
              }

              if (
                contact.messengers?.vk
              ) {
                messengers.vk =
                  contact.messengers.vk;
              }

              if (
                Object.keys(messengers)
                  .length
              ) {
                result.messengers =
                  messengers;
              }

              return result;
            },
          );
      }

      const created =
        await counterpartiesApi.create(
          payload,
        );

      createdId = created.id;

      if (
        includeBranches &&
        branches.length
      ) {
        for (const branch of branches) {
          const data: CreateBranchInput = {
            name: branch.name.trim(),
            legal_name:
              branch.legal_name.trim(),
            kpp: branch.kpp,
            phone: branch.phone,
            email: branch.email.trim(),
          };

          if (branch.okpo) {
            data.okpo = branch.okpo;
          }

          if (branch.address.trim()) {
            data.address =
              branch.address.trim();
          }

          await counterpartiesApi.createBranch(
            created.id,
            data,
          );
        }
      }

      for (const linked of linkedProducts) {
        await counterpartiesApi.linkProduct(
          created.id,
          {
            product_id:
              linked.product.id,
            environment:
              linked.environment,
            is_primary:
              linked.is_primary,
          },
        );
      }

      navigate(
        `/counterparties/${created.id}`,
      );
    } catch (error: any) {
      if (createdId) {
        try {
          await counterpartiesApi.delete(
            createdId,
          );
        } catch {
          console.error(
            'Не удалось откатить создание контрагента',
          );
        }
      }

      const parsed =
        parseBackendErrors(error);

      setGeneralError(parsed.general);
      setFieldErrors(parsed.fields);

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[1500px] mx-auto px-1 md:px-3 pb-16">

      {/* HEADER */}
      <div className="flex items-center gap-4 mb-7">
        <button
          type="button"
          onClick={() =>
            navigate('/counterparties')
          }
          className="
            p-2.5 rounded-xl
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

        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Новый контрагент
          </h1>

          <p className="mt-1 text-sm text-[var(--text-primary)]/40">
            Основные данные обязательны,
            остальные можно добавить при
            необходимости
          </p>
        </div>
      </div>

      {/* ERROR */}
      {generalError && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />

          <div>
            <p className="text-sm font-medium text-[var(--accent)]">
              {generalError}
            </p>

            {fieldErrors.map(
              (error, index) => (
                <p
                  key={index}
                  className="mt-1 text-xs text-[var(--accent)]/70"
                >
                  {error.message}
                </p>
              ),
            )}
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">

        {/* LEFT */}
        <div className="space-y-5">

          {/* ===================================================
              BASIC
          =================================================== */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
            <SectionHeader
              icon={
                <Building2 className="w-5 h-5" />
              }
              title="Основные данные"
              description="Тип организации и реквизиты"
            />

            <div className="p-6 space-y-6">

              {/* TYPE */}
              <div>
                <label className={labelCls}>
                  Тип контрагента
                </label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {COUNTERPARTY_TYPES.map(
                    (type) => {
                      const selected =
                        formData.counterparty_type ===
                        type.value;

                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() =>
                            handleTypeChange(
                              type.value,
                            )
                          }
                          className={`
                            relative
                            p-4 rounded-xl
                            border text-left
                            transition-colors
                            ${selected
                              ? 'border-[var(--accent)]/50 bg-[var(--accent)]/[0.05]'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--hover-2)]'
                            }
                          `}
                        >
                          {selected && (
                            <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}

                          <div
                            className={
                              selected
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--text-primary)]/35'
                            }
                          >
                            {type.icon}
                          </div>

                          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                            {type.label}
                          </p>

                          <p className="mt-1 text-xs text-[var(--text-primary)]/35">
                            {type.desc}
                          </p>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* NAME */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Краткое название
                    <span className="text-[var(--accent)] ml-1">
                      *
                    </span>
                  </label>

                  <input
                    value={formData.name}
                    onChange={(event) => {
                      clearErrors();

                      setFormData((prev) => ({
                        ...prev,
                        name:
                          event.target.value,
                      }));
                    }}
                    placeholder="ООО Ромашка"
                    className={inputCls()}
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    Полное наименование
                    <span className="text-[var(--accent)] ml-1">
                      *
                    </span>
                  </label>

                  <input
                    value={
                      formData.legal_name
                    }
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        legal_name:
                          event.target.value,
                      }))
                    }
                    placeholder={
                      formData.counterparty_type ===
                        'Юридическое лицо'
                        ? 'ООО «Ромашка»'
                        : 'Полное ФИО'
                    }
                    className={inputCls()}
                  />
                </div>
              </div>

              {/* REQUISITES */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-5">
                  <label className={labelCls}>
                    ИНН
                    <span className="text-[var(--accent)] ml-1">
                      *
                    </span>
                  </label>

                  <input
                    value={formData.inn}
                    inputMode="numeric"
                    maxLength={innLength}
                    onChange={(event) => {
                      const value =
                        event.target.value
                          .replace(/\D/g, '')
                          .slice(
                            0,
                            innLength,
                          );

                      setFormData(
                        (prev) => ({
                          ...prev,
                          inn: value,
                        }),
                      );
                    }}
                    placeholder={`${innLength} цифр`}
                    className={inputCls(
                      !!formData.inn &&
                      !innValidation.valid,
                    )}
                  />

                  {!!formData.inn &&
                    !innValidation.valid && (
                      <Hint>
                        {innValidation.message}
                      </Hint>
                    )}

                  {innValidation.valid && (
                    <SuccessHint>
                      ИНН корректен
                    </SuccessHint>
                  )}
                </div>

                {formData.counterparty_type ===
                  'Юридическое лицо' && (
                    <div className="md:col-span-4">
                      <label
                        className={labelCls}
                      >
                        КПП
                        <span className="text-[var(--accent)] ml-1">
                          *
                        </span>
                      </label>

                      <input
                        value={formData.kpp}
                        inputMode="numeric"
                        maxLength={9}
                        onChange={(event) =>
                          setFormData(
                            (prev) => ({
                              ...prev,
                              kpp:
                                event.target.value
                                  .replace(
                                    /\D/g,
                                    '',
                                  )
                                  .slice(0, 9),
                            }),
                          )
                        }
                        placeholder="9 цифр"
                        className={inputCls(
                          !!formData.kpp &&
                          !kppValidation.valid,
                        )}
                      />

                      {!!formData.kpp &&
                        !kppValidation.valid && (
                          <Hint>
                            {
                              kppValidation.message
                            }
                          </Hint>
                        )}
                    </div>
                  )}

                <div
                  className={
                    formData.counterparty_type ===
                      'Юридическое лицо'
                      ? 'md:col-span-3'
                      : 'md:col-span-4'
                  }
                >
                  <label className={labelCls}>
                    ОКПО
                    <span className="ml-1 text-xs font-normal text-[var(--text-primary)]/30">
                      необяз.
                    </span>
                  </label>

                  <input
                    value={formData.okpo}
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setFormData(
                        (prev) => ({
                          ...prev,
                          okpo:
                            event.target.value
                              .replace(
                                /\D/g,
                                '',
                              )
                              .slice(0, 10),
                        }),
                      )
                    }
                    placeholder="8 или 10 цифр"
                    className={inputCls(
                      !!formData.okpo &&
                      !okpoValidation.valid,
                    )}
                  />

                  {!!formData.okpo &&
                    !okpoValidation.valid && (
                      <Hint>
                        {okpoValidation.message}
                      </Hint>
                    )}
                </div>
              </div>
            </div>
          </section>

          {/* ===================================================
              COMPANY CONTACTS
          =================================================== */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
            <SectionHeader
              icon={
                <Phone className="w-5 h-5" />
              }
              title="Контакты компании"
              description="Основные способы связи"
            />

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Телефон
                    <span className="text-[var(--accent)] ml-1">
                      *
                    </span>
                  </label>

                  <input
                    type="tel"
                    value={
                      companyPhone.display
                    }
                    onChange={
                      companyPhone.handleChange
                    }
                    onKeyDown={
                      companyPhone.handleKeyDown
                    }
                    placeholder="+7 (___) ___-__-__"
                    className={inputCls(
                      !companyPhone.isEmpty &&
                      !companyPhone.isComplete,
                    )}
                  />

                  {!companyPhone.isEmpty &&
                    !companyPhone.isComplete && (
                      <Hint>
                        Введите полный номер
                      </Hint>
                    )}
                </div>

                <div>
                  <label className={labelCls}>
                    Email
                    <span className="ml-1 text-xs font-normal text-[var(--text-primary)]/30">
                      необяз.
                    </span>
                  </label>

                  <EmailInput
                    value={formData.email}
                    onChange={(value) =>
                      setFormData(
                        (prev) => ({
                          ...prev,
                          email: value,
                        }),
                      )
                    }
                    placeholder="info@company.ru"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>
                  Адрес
                  <span className="ml-1 text-xs font-normal text-[var(--text-primary)]/30">
                    необяз.
                  </span>
                </label>

                <textarea
                  value={formData.address}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      address:
                        event.target.value,
                    }))
                  }
                  placeholder="г. Москва, ул. Примерная, д. 1"
                  rows={2}
                  className={`${inputCls()} resize-none`}
                />
              </div>
            </div>
          </section>

          {/* ===================================================
              ADDITIONAL
          =================================================== */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--border-color)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Дополнительно
              </h2>

              <p className="mt-1 text-xs text-[var(--text-primary)]/35">
                Можно заполнить сейчас или
                добавить после создания
              </p>
            </div>

            {/* CONTACTS ROW */}
            <button
              type="button"
              onClick={toggleContacts}
              className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-[var(--hover-2)] transition-colors border-b border-[var(--border-color)]"
            >
              <UserCircle className="w-5 h-5 text-[var(--text-primary)]/35 shrink-0" />

              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Контактные лица
                </p>

                <p className="text-xs text-[var(--text-primary)]/35">
                  Ответственные сотрудники
                </p>
              </div>

              <span className="hidden sm:block text-xs text-[var(--text-primary)]/35">
                {contactPersons.length
                  ? `${contactPersons.length} добавлено`
                  : 'Не добавлены'}
              </span>

              <ChevronDown
                className={`w-4 h-4 text-[var(--text-primary)]/35 transition-transform ${includeContacts
                    ? 'rotate-180'
                    : ''
                  }`}
              />
            </button>

            {includeContacts && (
              <div className="p-6 border-b border-[var(--border-color)] space-y-4">
                {contactPersons.map(
                  (contact, index) => (
                    <div
                      key={index}
                      className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-5"
                    >
                      <div className="flex justify-between">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          Контакт {index + 1}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setContactPersons(
                              (prev) =>
                                prev.filter(
                                  (_, i) =>
                                    i !== index,
                                ),
                            )
                          }
                          className="p-1.5 text-[var(--text-primary)]/30 hover:text-[var(--accent)]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          [
                            'Фамилия',
                            'last_name',
                          ],
                          [
                            'Имя',
                            'first_name',
                          ],
                          [
                            'Отчество',
                            'middle_name',
                          ],
                        ].map(
                          ([label, field]) => (
                            <div key={field}>
                              <label
                                className={
                                  labelCls
                                }
                              >
                                {label} *
                              </label>

                              <input
                                value={
                                  (contact as any)[
                                  field
                                  ] ?? ''
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateContact(
                                    index,
                                    {
                                      ...contact,
                                      [field]:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                                }
                                className={inputCls()}
                              />
                            </div>
                          ),
                        )}
                      </div>

                      <div>
                        <label
                          className={labelCls}
                        >
                          Должность
                        </label>

                        <input
                          value={
                            contact.position ??
                            ''
                          }
                          onChange={(event) =>
                            updateContact(
                              index,
                              {
                                ...contact,
                                position:
                                  event.target
                                    .value,
                              },
                            )
                          }
                          placeholder="Главный бухгалтер"
                          className={inputCls()}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_170px] gap-3">
                        <div>
                          <label
                            className={
                              labelCls
                            }
                          >
                            Телефон
                          </label>

                          <ContactPhoneInput
                            value={
                              contact.phone ??
                              ''
                            }
                            onChange={(value) =>
                              updateContact(
                                index,
                                {
                                  ...contact,
                                  phone: value,
                                },
                              )
                            }
                          />
                        </div>

                        <div>
                          <label
                            className={
                              labelCls
                            }
                          >
                            Добавочный
                          </label>

                          <input
                            value={
                              contact.extension ??
                              ''
                            }
                            inputMode="numeric"
                            onChange={(
                              event,
                            ) =>
                              updateContact(
                                index,
                                {
                                  ...contact,
                                  extension:
                                    event.target.value.replace(
                                      /\D/g,
                                      '',
                                    ),
                                },
                              )
                            }
                            placeholder="1234"
                            className={inputCls()}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          className={labelCls}
                        >
                          Email
                        </label>

                        <EmailInput
                          value={
                            contact.email ?? ''
                          }
                          onChange={(value) =>
                            updateContact(
                              index,
                              {
                                ...contact,
                                email: value,
                              },
                            )
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label
                            className={
                              labelCls
                            }
                          >
                            Telegram
                          </label>

                          <input
                            value={
                              contact.messengers
                                ?.telegram ?? ''
                            }
                            onChange={(
                              event,
                            ) =>
                              updateContact(
                                index,
                                {
                                  ...contact,
                                  messengers: {
                                    ...contact.messengers,
                                    telegram:
                                      event.target
                                        .value,
                                  },
                                },
                              )
                            }
                            placeholder="@username"
                            className={inputCls()}
                          />
                        </div>

                        <div>
                          <label
                            className={
                              labelCls
                            }
                          >
                            ВКонтакте
                          </label>

                          <input
                            value={
                              contact.messengers
                                ?.vk ?? ''
                            }
                            onChange={(
                              event,
                            ) =>
                              updateContact(
                                index,
                                {
                                  ...contact,
                                  messengers: {
                                    ...contact.messengers,
                                    vk:
                                      event.target
                                        .value,
                                  },
                                },
                              )
                            }
                            placeholder="username"
                            className={inputCls()}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}

                <button
                  type="button"
                  onClick={() =>
                    setContactPersons(
                      (prev) => [
                        ...prev,
                        emptyContactPerson(),
                      ],
                    )
                  }
                  className="w-full py-3 rounded-xl border border-dashed border-[var(--border-color)] text-sm text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)]"
                >
                  + Добавить ещё контакт
                </button>
              </div>
            )}

            {/* BRANCH ROW */}
            {formData.counterparty_type ===
              'Юридическое лицо' && (
                <>
                  <button
                    type="button"
                    onClick={toggleBranches}
                    className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-[var(--hover-2)] transition-colors border-b border-[var(--border-color)]"
                  >
                    <GitBranch className="w-5 h-5 text-[var(--text-primary)]/35" />

                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Подразделения
                      </p>

                      <p className="text-xs text-[var(--text-primary)]/35">
                        Обособленные подразделения
                      </p>
                    </div>

                    <span className="hidden sm:block text-xs text-[var(--text-primary)]/35">
                      {branches.length
                        ? `${branches.length} добавлено`
                        : 'Не добавлены'}
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-[var(--text-primary)]/35 transition-transform ${includeBranches
                          ? 'rotate-180'
                          : ''
                        }`}
                    />
                  </button>

                  {includeBranches && (
                    <div className="p-6 border-b border-[var(--border-color)] space-y-4">
                      {branches.map(
                        (branch, index) => (
                          <div
                            key={index}
                            className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-4"
                          >
                            <div className="flex justify-between">
                              <p className="text-sm font-semibold text-[var(--text-primary)]">
                                Подразделение{' '}
                                {index + 1}
                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  setBranches(
                                    (prev) =>
                                      prev.filter(
                                        (_, i) =>
                                          i !==
                                          index,
                                      ),
                                  )
                                }
                                className="p-1.5 text-[var(--text-primary)]/30 hover:text-[var(--accent)]"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  Название *
                                </label>

                                <input
                                  value={
                                    branch.name
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        name:
                                          event
                                            .target
                                            .value,
                                      },
                                    )
                                  }
                                  className={inputCls()}
                                />
                              </div>

                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  Полное
                                  наименование *
                                </label>

                                <input
                                  value={
                                    branch.legal_name
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        legal_name:
                                          event
                                            .target
                                            .value,
                                      },
                                    )
                                  }
                                  className={inputCls()}
                                />
                              </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  КПП *
                                </label>

                                <input
                                  value={
                                    branch.kpp
                                  }
                                  inputMode="numeric"
                                  onChange={(
                                    event,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        kpp:
                                          event.target.value
                                            .replace(
                                              /\D/g,
                                              '',
                                            )
                                            .slice(
                                              0,
                                              9,
                                            ),
                                      },
                                    )
                                  }
                                  className={inputCls()}
                                />
                              </div>

                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  ОКПО
                                </label>

                                <input
                                  value={
                                    branch.okpo
                                  }
                                  inputMode="numeric"
                                  onChange={(
                                    event,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        okpo:
                                          event.target.value
                                            .replace(
                                              /\D/g,
                                              '',
                                            )
                                            .slice(
                                              0,
                                              10,
                                            ),
                                      },
                                    )
                                  }
                                  className={inputCls()}
                                />
                              </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  Телефон *
                                </label>

                                <BranchPhoneInput
                                  value={
                                    branch.phone
                                  }
                                  onChange={(
                                    value,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        phone:
                                          value,
                                      },
                                    )
                                  }
                                />
                              </div>

                              <div>
                                <label
                                  className={
                                    labelCls
                                  }
                                >
                                  Email *
                                </label>

                                <EmailInput
                                  value={
                                    branch.email
                                  }
                                  onChange={(
                                    value,
                                  ) =>
                                    updateBranch(
                                      index,
                                      {
                                        ...branch,
                                        email:
                                          value,
                                      },
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div>
                              <label
                                className={
                                  labelCls
                                }
                              >
                                Адрес
                              </label>

                              <input
                                value={
                                  branch.address
                                }
                                onChange={(
                                  event,
                                ) =>
                                  updateBranch(
                                    index,
                                    {
                                      ...branch,
                                      address:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                                }
                                className={inputCls()}
                              />
                            </div>
                          </div>
                        ),
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setBranches(
                            (prev) => [
                              ...prev,
                              emptyBranch(),
                            ],
                          )
                        }
                        className="w-full py-3 rounded-xl border border-dashed border-[var(--border-color)] text-sm text-[var(--text-primary)]/45 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)]"
                      >
                        + Добавить подразделение
                      </button>
                    </div>
                  )}
                </>
              )}

            {/* PRODUCTS ROW */}
            <button
              type="button"
              onClick={() =>
                setIncludeProducts(
                  (value) => !value,
                )
              }
              className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-[var(--hover-2)] transition-colors"
            >
              <Package className="w-5 h-5 text-[var(--text-primary)]/35" />

              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Продукты
                </p>

                <p className="text-xs text-[var(--text-primary)]/35">
                  ПО и оборудование
                </p>
              </div>

              <span className="hidden sm:block text-xs text-[var(--text-primary)]/35">
                {linkedProducts.length
                  ? `${linkedProducts.length} привязано`
                  : 'Не привязаны'}
              </span>

              <ChevronDown
                className={`w-4 h-4 text-[var(--text-primary)]/35 transition-transform ${includeProducts
                    ? 'rotate-180'
                    : ''
                  }`}
              />
            </button>

            {includeProducts && (
              <div className="p-6 border-t border-[var(--border-color)] space-y-5">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />

                  <input
                    value={productFilter}
                    onChange={(event) =>
                      setProductFilter(
                        event.target.value,
                      )
                    }
                    placeholder="Найти продукт..."
                    className={`${inputCls()} pl-11`}
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--text-primary)]/40">
                    Среда
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {ENVIRONMENTS.map(
                      (environment) => (
                        <button
                          key={
                            environment.value
                          }
                          type="button"
                          onClick={() =>
                            setProductEnv(
                              environment.value,
                            )
                          }
                          className={`px-3 py-2.5 rounded-xl border text-sm ${productEnv ===
                              environment.value
                              ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text-primary)]'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/45'
                            }`}
                        >
                          {
                            environment.label
                          }
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]/60">
                  <input
                    type="checkbox"
                    checked={
                      productIsPrimary
                    }
                    onChange={(event) =>
                      setProductIsPrimary(
                        event.target
                          .checked,
                      )
                    }
                  />

                  Основной продукт
                </label>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-[var(--border-color)]">
                  {loadingProducts ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : (
                    filteredProducts
                      .slice(0, 30)
                      .map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            setLinkedProducts(
                              (prev) => [
                                ...prev,
                                {
                                  product,
                                  environment:
                                    productEnv,
                                  is_primary:
                                    productIsPrimary,
                                },
                              ],
                            )
                          }
                          className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border-color)] hover:bg-[var(--hover-2)] text-left"
                        >
                          <div className="flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              {product.display_name ||
                                product.name}
                            </p>

                            <p className="text-xs text-[var(--text-primary)]/35">
                              {
                                product.vendor
                              }
                            </p>
                          </div>

                          <Plus className="w-4 h-4 text-[var(--text-primary)]/30" />
                        </button>
                      ))
                  )}
                </div>

                {linkedProducts.length >
                  0 && (
                    <div className="space-y-2">
                      {linkedProducts.map(
                        (linked, index) => (
                          <div
                            key={
                              linked.product.id
                            }
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {linked.product
                                  .display_name ||
                                  linked.product
                                    .name}
                              </p>

                              <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                                {envLabel(
                                  linked.environment,
                                )}
                                {linked.is_primary
                                  ? ' · Основной'
                                  : ''}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setLinkedProducts(
                                  (prev) =>
                                    prev.filter(
                                      (_, i) =>
                                        i !==
                                        index,
                                    ),
                                )
                              }
                              className="p-1.5 text-[var(--text-primary)]/30 hover:text-[var(--accent)]"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  )}
              </div>
            )}
          </section>
        </div>

        {/* =====================================================
            RIGHT SIDEBAR
        ===================================================== */}
        <aside className="xl:sticky xl:top-5 space-y-4">

          {/* STATUS */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-color)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Создание контрагента
              </p>

              <p className="mt-1 text-xs text-[var(--text-primary)]/35 truncate">
                {formData.name ||
                  'Новый контрагент'}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Main */}
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${isMainValid
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-[var(--hover-2)] text-[var(--text-primary)]/30'
                    }`}
                >
                  {isMainValid ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    '1'
                  )}
                </span>

                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  Основные данные
                </span>

                <span
                  className={`text-xs ${isMainValid
                      ? 'text-emerald-500'
                      : 'text-[var(--text-primary)]/30'
                    }`}
                >
                  {isMainValid
                    ? 'Готово'
                    : 'Заполните'}
                </span>
              </div>

              {/* Contacts */}
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${companyContactsValid
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-[var(--hover-2)] text-[var(--text-primary)]/30'
                    }`}
                >
                  {companyContactsValid ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    '2'
                  )}
                </span>

                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  Контакты
                </span>

                <span
                  className={`text-xs ${companyContactsValid
                      ? 'text-emerald-500'
                      : 'text-[var(--text-primary)]/30'
                    }`}
                >
                  {companyContactsValid
                    ? 'Готово'
                    : 'Заполните'}
                </span>
              </div>

              <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-primary)]/40">
                    Контактные лица
                  </span>
                  <span className="text-[var(--text-primary)]/65">
                    {contactPersons.length ||
                      '—'}
                  </span>
                </div>

                {formData.counterparty_type ===
                  'Юридическое лицо' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--text-primary)]/40">
                        Подразделения
                      </span>
                      <span className="text-[var(--text-primary)]/65">
                        {branches.length ||
                          '—'}
                      </span>
                    </div>
                  )}

                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-primary)]/40">
                    Продукты
                  </span>
                  <span className="text-[var(--text-primary)]/65">
                    {linkedProducts.length ||
                      '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* DUPLICATES */}
          {duplicates.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06]">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />

                <div>
                  <p className="text-sm font-medium text-amber-400">
                    Повторяющиеся email
                  </p>

                  {duplicates.map(
                    (duplicate) => (
                      <p
                        key={
                          duplicate.email
                        }
                        className="mt-1 text-xs text-amber-400/65"
                      >
                        {duplicate.email}
                      </p>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTION */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] p-4">
            <ActionButton
              type="button"
              onClick={handleSubmit}
              disabled={
                isLoading ||
                !isFormValid
              }
              className="w-full px-5 py-3.5 text-sm font-semibold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Создаём...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Создать контрагента
                </>
              )}
            </ActionButton>

            {!isFormValid && (
              <p className="mt-3 text-center text-xs text-[var(--text-primary)]/30">
                Заполните обязательные поля
              </p>
            )}

            <button
              type="button"
              onClick={() =>
                navigate('/counterparties')
              }
              disabled={isLoading}
              className="w-full mt-2 px-4 py-2.5 rounded-xl text-xs font-medium text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)] transition-colors"
            >
              Отмена
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}