import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, User, Briefcase, ArrowLeft, Save, Phone, Mail, MapPin,
  FileText, UserCircle, MessageSquare, Plus, Trash2, GitBranch, X,
  Loader2, Package, Server, Globe, Smartphone, Monitor, Cpu, Code, HelpCircle,
  AlertCircle, Search, Check,
} from 'lucide-react';
import { counterpartiesApi, productsApi } from '../api/client';
import type {
  CounterpartyType, CreateCounterpartyInput, ContactPersonInput, CreateBranchInput,
} from '../types';

import { ActionButton } from '../components/ui/ActionButton';

// ─── Маска телефона ────

function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length > 0 && !digits.startsWith('7')) digits = '7' + digits;
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 1) return '+7';
  if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
  if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
  if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function getPhoneDigits(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('8')) return '7' + digits.slice(1);
  return digits;
}

function isPhoneComplete(formatted: string): boolean {
  return getPhoneDigits(formatted).length === 11;
}

function isPhoneValid(formatted: string): boolean {
  if (!formatted || formatted === '+7') return true; // пустое — ок (если не обязательное)
  return isPhoneComplete(formatted);
}

function usePhoneMask(initial = '') {
  const [display, setDisplay] = useState(() => formatPhoneInput(initial));

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(formatPhoneInput(e.target.value));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && display.length > 0) {
      e.preventDefault();
      const digits = getPhoneDigits(display);
      setDisplay(formatPhoneInput(digits.slice(0, -1)));
    }
  }, [display]);

  const rawValue = display ? '+' + getPhoneDigits(display) : '';
  const isEmpty = getPhoneDigits(display).length <= 1;

  return {
    display, setDisplay, handleChange, handleKeyDown,
    rawValue, isComplete: isPhoneComplete(display), isEmpty,
  };
}

// ─── Валидация email ───

function isEmailValid(email: string): boolean {
  if (!email) return true; // пустое — ок если необязательное
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// ─── Проверка уникальности email ──────────────────────────────────────────────

function collectAllEmails(
  companyEmail: string,
  contactPersons: ContactPersonInput[],
  includeContacts: boolean,
  branches: BranchFormData[],
  includeBranches: boolean,
): { email: string; source: string }[] {
  const all: { email: string; source: string }[] = [];

  if (companyEmail.trim()) {
    all.push({ email: companyEmail.trim().toLowerCase(), source: 'Компания' });
  }

  if (includeContacts) {
    contactPersons.forEach((cp, i) => {
      if (cp.email?.trim()) {
        all.push({
          email: cp.email.trim().toLowerCase(),
          source: `Контакт #${i + 1} (${cp.last_name || 'без фамилии'})`,
        });
      }
    });
  }

  if (includeBranches) {
    branches.forEach((b, i) => {
      if (b.email.trim()) {
        all.push({
          email: b.email.trim().toLowerCase(),
          source: `Подразделение #${i + 1} (${b.name || 'без названия'})`,
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
): { email: string; sources: string[] }[] {
  const all = collectAllEmails(
    companyEmail, contactPersons, includeContacts, branches, includeBranches,
  );

  const grouped = new Map<string, string[]>();
  for (const { email, source } of all) {
    if (!grouped.has(email)) grouped.set(email, []);
    grouped.get(email)!.push(source);
  }

  return Array.from(grouped.entries())
    .filter(([_, sources]) => sources.length > 1)
    .map(([email, sources]) => ({ email, sources }));
}

function DuplicateEmailWarning({ duplicates }: {
  duplicates: { email: string; sources: string[] }[];
}) {
  if (duplicates.length === 0) return null;
  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <p className="text-base font-medium text-amber-400">
          Обнаружены одинаковые email-адреса
        </p>
      </div>
      {duplicates.map((d, i) => (
        <div key={i} className="ml-7 text-sm text-amber-400/80">
          <span className="font-mono font-medium">{d.email}</span>
          {' — '}
          {d.sources.join(', ')}
        </div>
      ))}
      <p className="ml-7 text-xs text-amber-400/60">
        В системе нельзя использовать один email для разных сущностей.
        Измените дублирующиеся адреса.
      </p>
    </div>
  );
}

// ─── Валидация ИНН 

function validateInn(inn: string, type: CounterpartyType): { valid: boolean; message: string } {
  if (!inn) return { valid: false, message: '' };
  if (!/^\d+$/.test(inn)) return { valid: false, message: 'ИНН должен содержать только цифры' };

  const expectedLen = type === 'Юридическое лицо' ? 10 : 12;
  if (inn.length !== expectedLen) {
    return { valid: false, message: `ИНН: ${inn.length}/${expectedLen} цифр` };
  }



  return { valid: true, message: '' };
}

// ─── Валидация КПП 

function validateKpp(kpp: string): { valid: boolean; message: string } {
  if (!kpp) return { valid: false, message: '' };
  if (!/^\d{9}$/.test(kpp)) return { valid: false, message: `КПП: ${kpp.length}/9 цифр` };
  // КПП формат: NNNNPPXXX — первые 4 цифры (код ИФНС), следующие 2 (причина), последние 3 (порядковый)
  if (!/^\d{4}[\dA-Z]{2}\d{3}$/.test(kpp)) {
    return { valid: false, message: 'Неверный формат КПП' };
  }
  return { valid: true, message: '' };
}

// ─── Валидация ОКПО ────

function validateOkpo(okpo: string): { valid: boolean; message: string } {
  if (!okpo) return { valid: true, message: '' }; // необязательное
  if (!/^\d+$/.test(okpo)) return { valid: false, message: 'ОКПО должен содержать только цифры' };
  if (okpo.length !== 8 && okpo.length !== 10) {
    return { valid: false, message: `ОКПО: ${okpo.length} цифр (нужно 8 или 10)` };
  }
  return { valid: true, message: '' };
}

// ─── Парсинг ошибок backend ───────────────────────────────────────────────────

interface FieldError { field: string; message: string; }

function parseBackendErrors(err: any): { general: string; fields: FieldError[] } {
  const data = err?.response?.data;
  const status = err?.response?.status;
  if (!data) return { general: 'Произошла неизвестная ошибка', fields: [] };
  const detail = data.detail;
  if (status === 422 && Array.isArray(detail)) {
    const fields: FieldError[] = detail.map((e: any) => {
      const loc = e.loc || [];
      const fieldPath = loc.filter((l: any) => l !== 'body').join('.');
      return { field: fieldPath || 'unknown', message: e.msg || JSON.stringify(e) };
    });
    return { general: fields.length > 0 ? 'Проверьте правильность заполнения полей' : 'Ошибка валидации', fields };
  }
  if (typeof detail === 'string') {
    const fields: FieldError[] = [];
    const lower = detail.toLowerCase();
    if (lower.includes('inn') || lower.includes('инн')) fields.push({ field: 'inn', message: detail });
    if (lower.includes('kpp') || lower.includes('кпп')) fields.push({ field: 'kpp', message: detail });
    if (lower.includes('okpo') || lower.includes('окпо')) fields.push({ field: 'okpo', message: detail });
    if (lower.includes('phone') || lower.includes('телефон')) fields.push({ field: 'phone', message: detail });
    if (lower.includes('email')) fields.push({ field: 'email', message: detail });
    return { general: detail, fields };
  }
  if (Array.isArray(detail)) {
    return {
      general: detail.map((x: any) => typeof x === 'string' ? x : x.msg || JSON.stringify(x)).join('; '),
      fields: [],
    };
  }
  return { general: JSON.stringify(detail), fields: [] };
}

function FieldErrorMsg({ fieldErrors, fieldName }: { fieldErrors: FieldError[]; fieldName: string }) {
  const errors = fieldErrors.filter(e =>
    e.field === fieldName || e.field.startsWith(fieldName + '.') || e.field.endsWith('.' + fieldName)
  );
  if (errors.length === 0) return null;
  return (
    <div className="mt-1.5 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
      <p className="text-sm text-[var(--accent)]">{errors.map(e => e.message).join('; ')}</p>
    </div>
  );
}

function hasFieldError(fieldErrors: FieldError[], fieldName: string): boolean {
  return fieldErrors.some(e =>
    e.field === fieldName || e.field.startsWith(fieldName + '.') || e.field.endsWith('.' + fieldName)
  );
}

// ─── Inline hint ─

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-sm text-amber-400 flex items-center gap-1">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
      {children}
    </p>
  );
}

function SuccessHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-sm text-emerald-400 flex items-center gap-1">
      <Check className="w-3.5 h-3.5 flex-shrink-0" />
      {children}
    </p>
  );
}

// ─── Константы ────

const COUNTERPARTY_TYPES: { value: CounterpartyType; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'Юридическое лицо', label: 'Юридическое лицо', desc: 'ИНН 10 цифр, КПП обязателен', icon: <Building2 className="w-7 h-7" /> },
  { value: 'Физическое лицо', label: 'Физическое лицо', desc: 'ИНН 12 цифр, КПП не нужен', icon: <User className="w-7 h-7" /> },
  { value: 'Индивидуальный предприниматель', label: 'Индивидуальный предприниматель', desc: 'ИНН 12 цифр, КПП не нужен', icon: <Briefcase className="w-7 h-7" /> },
];

const PRODUCT_CATEGORIES = [
  { value: 'ERP', label: 'ERP', icon: Server },
  { value: 'WEB', label: 'Web', icon: Globe },
  { value: 'MOBILE', label: 'Mobile', icon: Smartphone },
  { value: 'API', label: 'API', icon: Code },
  { value: 'DESKTOP', label: 'Desktop', icon: Monitor },
  { value: 'HARDWARE', label: 'Hardware', icon: Cpu },
  { value: 'OTHER', label: 'Прочее', icon: HelpCircle },
] as const;

const ENVIRONMENTS = [
  { value: 'production', label: 'Продакшн' },
  { value: 'staging', label: 'Стенд' },
  { value: 'testing', label: 'Тестирование' },
  { value: 'development', label: 'Разработка' },
] as const;

const catMeta = (v: string) => PRODUCT_CATEGORIES.find(c => c.value === v);
const envLabel = (v: string) => ENVIRONMENTS.find(e => e.value === v)?.label ?? v;

const envBadgeClass = (e: string) => {
  if (e === 'production') return 'bg-emerald-500/10 text-[var(--success)] border border-emerald-500/20';
  if (e === 'staging') return 'bg-yellow-500/10 text-[var(--warning)] border border-yellow-500/20';
  if (e === 'testing') return 'bg-blue-500/10 text-[var(--info)] border border-blue-500/20';
  if (e === 'development') return 'bg-blue-500/10 text-[var(--info)] border border-blue-500/20';
  return 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border border-white/10';
};

function getInnMaxLength(type: CounterpartyType) { return type === 'Юридическое лицо' ? 10 : 12; }
function getInnPlaceholder(type: CounterpartyType) { return type === 'Юридическое лицо' ? '10 цифр' : '12 цифр'; }
function isKppAllowed(type: CounterpartyType) { return type === 'Юридическое лицо'; }
function isKppRequired(type: CounterpartyType) { return type === 'Юридическое лицо'; }

const emptyContactPerson = (): ContactPersonInput => ({
  first_name: '', last_name: '', middle_name: '', phone: '', email: '',
  position: '', extension: '',
  messengers: { telegram: '', vk: '' },
});

interface BranchFormData {
  name: string; legal_name: string; kpp: string;
  okpo: string; phone: string; email: string; address: string;
}
const emptyBranch = (): BranchFormData => ({
  name: '', legal_name: '', kpp: '', okpo: '', phone: '', email: '', address: '',
});

interface LinkedProduct { product: any; environment: string; is_primary: boolean; }

const inputCls = (hasError = false) =>
  `w-full px-4 py-3.5 text-base bg-[var(--hover-2)] border rounded-xl text-[var(--text-primary)]
   placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 transition-all ${hasError
    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
    : 'border-[var(--border-color)] focus:border-[var(--accent)]/30 focus:ring-[var(--accent-ring)]'
  }`;

const labelCls = 'block text-base font-medium text-[var(--text-primary)]/80 mb-2';

// ─── Компонент телефона контактного лица (с маской) ──────────────────────────

function ContactPhoneInput({ value, onChange }: {
  value: string;
  onChange: (raw: string, display: string) => void;
}) {
  const [display, setDisplay] = useState(() => formatPhoneInput(value));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setDisplay(formatted);
    const digits = getPhoneDigits(formatted);
    onChange(digits.length > 1 ? '+' + digits : '', formatted);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && display.length > 0) {
      e.preventDefault();
      const digits = getPhoneDigits(display);
      const newFormatted = formatPhoneInput(digits.slice(0, -1));
      setDisplay(newFormatted);
      const newDigits = getPhoneDigits(newFormatted);
      onChange(newDigits.length > 1 ? '+' + newDigits : '', newFormatted);
    }
  };

  const hasValue = getPhoneDigits(display).length > 1;
  const isComplete = isPhoneComplete(display);
  const showError = hasValue && !isComplete;
  const showOk = hasValue && isComplete;

  return (
    <div>
      <input
        type="tel"
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="+7 (___) ___-__-__"
        className={inputCls(showError)}
      />
      {showError && <Hint>Введите полный номер: +7 (XXX) XXX-XX-XX</Hint>}
      {showOk && <SuccessHint>{display}</SuccessHint>}
    </div>
  );
}

// ─── Компонент телефона подразделения (с маской) ─────────────────────────────

function BranchPhoneInput({ value, onChange, required }: {
  value: string;
  onChange: (raw: string) => void;
  required?: boolean;
}) {
  const [display, setDisplay] = useState(() => formatPhoneInput(value));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setDisplay(formatted);
    const digits = getPhoneDigits(formatted);
    onChange(digits.length > 1 ? '+' + digits : '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && display.length > 0) {
      e.preventDefault();
      const digits = getPhoneDigits(display);
      const newFormatted = formatPhoneInput(digits.slice(0, -1));
      setDisplay(newFormatted);
      const newDigits = getPhoneDigits(newFormatted);
      onChange(newDigits.length > 1 ? '+' + newDigits : '');
    }
  };

  const hasValue = getPhoneDigits(display).length > 1;
  const isComplete = isPhoneComplete(display);
  const showError = (hasValue && !isComplete) || (required && !hasValue);
  const showOk = hasValue && isComplete;

  return (
    <div>
      <input
        type="tel"
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="+7 (___) ___-__-__"
        className={inputCls(showError)}
      />
      {hasValue && !isComplete && <Hint>Введите полный номер: +7 (XXX) XXX-XX-XX</Hint>}
      {showOk && <SuccessHint>{display}</SuccessHint>}
    </div>
  );
}

// ─── Email input с валидацией ─────────────────────────────────────────────────

function EmailInput({ value, onChange, placeholder, required, hasBackendError }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hasBackendError?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const valid = isEmailValid(value);
  const showError = hasBackendError || (touched && value.length > 0 && !valid);
  const showOk = touched && value.length > 0 && valid;

  return (
    <div>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder ?? 'email@example.ru'}
        className={inputCls(showError)}
      />
      {showError && !hasBackendError && <Hint>Введите корректный email: example@domain.ru</Hint>}
      {showOk && <SuccessHint>{value.trim()}</SuccessHint>}
    </div>
  );
}

// ─── Основной компонент 

export default function NewCounterpartyPage() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const [formData, setFormData] = useState<CreateCounterpartyInput>({
    counterparty_type: 'Юридическое лицо',
    name: '',
    legal_name: '',
    inn: '',
    kpp: '',
    okpo: '',
    phone: '',
    email: '',
    address: '',
  });

  const companyPhone = usePhoneMask(formData.phone);

  // Дополнительные разделы
  const [includeContacts, setIncludeContacts] = useState(false);
  const [contactPersons, setContactPersons] = useState<ContactPersonInput[]>([]);

  const [includeBranches, setIncludeBranches] = useState(false);
  const [branches, setBranches] = useState<BranchFormData[]>([]);

  const [includeProducts, setIncludeProducts] = useState(false);
  const [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);

  // Продукты
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productFilter, setProductFilter] = useState('');
  const [productEnv, setProductEnv] = useState('production');
  const [productIsPrimary, setProductIsPrimary] = useState(false);

  useEffect(() => {
    if (!includeProducts || allProducts.length > 0) return;

    setLoadingProducts(true);

    productsApi
      .getProducts({ page: 1, size: 50 })
      .then((res) => setAllProducts(res.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [includeProducts, allProducts.length]);

  const clearErrors = () => {
    setGeneralError(null);
    setFieldErrors([]);
  };

  const handleTypeChange = (type: CounterpartyType) => {
    clearErrors();

    setFormData((prev) => ({
      ...prev,
      counterparty_type: type,
      inn: '',
      kpp: type === 'Юридическое лицо' ? prev.kpp : '',
    }));

    if (type !== 'Юридическое лицо') {
      setIncludeBranches(false);
      setBranches([]);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // CONTACTS
  // ─────────────────────────────────────────────────────────────

  const toggleContacts = () => {
    if (includeContacts) {
      setIncludeContacts(false);
      setContactPersons([]);
      return;
    }

    setIncludeContacts(true);

    if (contactPersons.length === 0) {
      setContactPersons([emptyContactPerson()]);
    }
  };

  const addContactPerson = () =>
    setContactPersons((prev) => [...prev, emptyContactPerson()]);

  const removeContactPerson = (index: number) =>
    setContactPersons((prev) =>
      prev.filter((_, i) => i !== index),
    );

  const updateContactPerson = (
    index: number,
    value: ContactPersonInput,
  ) =>
    setContactPersons((prev) =>
      prev.map((item, i) => (i === index ? value : item)),
    );

  // ─────────────────────────────────────────────────────────────
  // BRANCHES
  // ─────────────────────────────────────────────────────────────

  const toggleBranches = () => {
    if (includeBranches) {
      setIncludeBranches(false);
      setBranches([]);
      return;
    }

    setIncludeBranches(true);

    if (branches.length === 0) {
      setBranches([emptyBranch()]);
    }
  };

  const addBranch = () =>
    setBranches((prev) => [...prev, emptyBranch()]);

  const removeBranch = (index: number) =>
    setBranches((prev) =>
      prev.filter((_, i) => i !== index),
    );

  const updateBranch = (
    index: number,
    value: BranchFormData,
  ) =>
    setBranches((prev) =>
      prev.map((item, i) => (i === index ? value : item)),
    );

  // ─────────────────────────────────────────────────────────────
  // PRODUCTS
  // ─────────────────────────────────────────────────────────────

  const filteredProducts = productFilter.trim()
    ? allProducts.filter((product) => {
        const q = productFilter.toLowerCase();

        return (
          (product.display_name || product.name || '')
            .toLowerCase()
            .includes(q) ||
          (product.vendor || '').toLowerCase().includes(q)
        );
      })
    : allProducts;

  const availableProducts = filteredProducts.filter(
    (product) =>
      !linkedProducts.some(
        (linked) => linked.product.id === product.id,
      ),
  );

  const addLinkedProduct = (product: any) => {
    setLinkedProducts((prev) => [
      ...prev,
      {
        product,
        environment: productEnv,
        is_primary: productIsPrimary,
      },
    ]);
  };

  const removeLinkedProduct = (index: number) =>
    setLinkedProducts((prev) =>
      prev.filter((_, i) => i !== index),
    );

  // ─────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────

  const innLength = getInnMaxLength(formData.counterparty_type);

  const innValidation = validateInn(
    formData.inn,
    formData.counterparty_type,
  );

  const kppValidation = validateKpp(formData.kpp ?? '');
  const okpoValidation = validateOkpo(formData.okpo ?? '');

  const isMainValid =
    !!formData.name.trim() &&
    !!formData.legal_name.trim() &&
    innValidation.valid &&
    (
      !isKppRequired(formData.counterparty_type) ||
      kppValidation.valid
    ) &&
    okpoValidation.valid;

  const areContactsValid =
    !includeContacts ||
    contactPersons.every(
      (person) =>
        person.last_name?.trim() &&
        person.first_name?.trim() &&
        person.middle_name?.trim() &&
        (!person.phone || isPhoneValid(person.phone)) &&
        (!person.email || isEmailValid(person.email)),
    );

  const areBranchesValid =
    !includeBranches ||
    branches.every(
      (branch) =>
        branch.name.trim() &&
        branch.legal_name.trim() &&
        validateKpp(branch.kpp).valid &&
        (!branch.okpo || validateOkpo(branch.okpo).valid) &&
        isPhoneValid(branch.phone) &&
        branch.phone &&
        branch.email.trim() &&
        isEmailValid(branch.email),
    );

  const duplicates = findDuplicateEmails(
    formData.email,
    contactPersons,
    includeContacts,
    branches,
    includeBranches,
  );

  const isFormValid =
    isMainValid &&
    companyPhone.isComplete &&
    isEmailValid(formData.email) &&
    areContactsValid &&
    areBranchesValid &&
    duplicates.length === 0;

  // ─────────────────────────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    clearErrors();

    const duplicateEmails = findDuplicateEmails(
      formData.email,
      contactPersons,
      includeContacts,
      branches,
      includeBranches,
    );

    if (duplicateEmails.length > 0) {
      setGeneralError(
        `Дубликаты email: ${duplicateEmails
          .map((item) => item.email)
          .join(', ')}. В системе нельзя использовать одинаковые email для разных сущностей.`,
      );
      return;
    }

    const allEmails = collectAllEmails(
      formData.email,
      contactPersons,
      includeContacts,
      branches,
      includeBranches,
    );

    const invalidEmail = allEmails.find(
      (item) =>
        item.email.trim() &&
        !isEmailValid(item.email),
    );

    if (invalidEmail) {
      setGeneralError(
        `Некорректный email "${invalidEmail.email}" в: ${invalidEmail.source}`,
      );
      return;
    }

    if (!isFormValid) {
      setGeneralError(
        'Проверьте обязательные поля перед созданием контрагента.',
      );
      return;
    }

    setIsLoading(true);

    let createdId: string | null = null;

    try {
      const payload: any = {
        counterparty_type: formData.counterparty_type,
        name: formData.name.trim(),
        legal_name: formData.legal_name.trim(),
        inn: formData.inn,
        phone: companyPhone.rawValue,
      };

      if (formData.email?.trim()) {
        payload.email = formData.email.trim();
      }

      if (
        formData.counterparty_type === 'Юридическое лицо'
      ) {
        if (formData.kpp) {
          payload.kpp = formData.kpp;
        }
      } else {
        payload.kpp = 0;
      }

      if (formData.okpo) {
        payload.okpo = formData.okpo;
      }

      if (formData.address?.trim()) {
        payload.address = formData.address.trim();
      }

      if (
        includeContacts &&
        contactPersons.length > 0
      ) {
        payload.contact_persons = contactPersons.map(
          (contact) => {
            const result: any = {
              first_name: contact.first_name.trim(),
              last_name: contact.last_name.trim(),
            };

            if (contact.middle_name?.trim()) {
              result.middle_name =
                contact.middle_name.trim();
            }

            if (contact.phone) {
              result.phone = contact.phone;
            }

            if (contact.extension?.trim()) {
              result.extension =
                contact.extension.trim();
            }

            if (contact.position?.trim()) {
              result.position =
                contact.position.trim();
            }

            if (contact.email?.trim()) {
              result.email = contact.email.trim();
            }

            const messengers: any = {};

            if (contact.messengers?.telegram) {
              messengers.telegram =
                contact.messengers.telegram;
            }

            if (contact.messengers?.vk) {
              messengers.vk = contact.messengers.vk;
            }

            if (Object.keys(messengers).length) {
              result.messengers = messengers;
            }

            return result;
          },
        );
      }

      const created =
        await counterpartiesApi.create(payload);

      createdId = created.id;

      // Подразделения
      if (
        includeBranches &&
        branches.length > 0
      ) {
        for (const branch of branches) {
          const branchPayload: CreateBranchInput = {
            name: branch.name.trim(),
            legal_name: branch.legal_name.trim(),
            kpp: branch.kpp,
            phone: branch.phone,
            email: branch.email.trim(),
          };

          if (branch.okpo) {
            branchPayload.okpo = branch.okpo;
          }

          if (branch.address.trim()) {
            branchPayload.address =
              branch.address.trim();
          }

          await counterpartiesApi.createBranch(
            created.id,
            branchPayload,
          );
        }
      }

      // Продукты
      if (linkedProducts.length > 0) {
        for (const linked of linkedProducts) {
          await counterpartiesApi.linkProduct(
            created.id,
            {
              product_id: linked.product.id,
              environment: linked.environment,
              is_primary: linked.is_primary,
            },
          );
        }
      }

      navigate(`/counterparties/${created.id}`);
    } catch (error: any) {
      /*
       * Если основной контрагент уже был создан, но создание
       * подразделения/продукта упало — сохраняем прежнюю
       * транзакционную логику страницы.
       */
      if (createdId) {
        try {
          await counterpartiesApi.delete(createdId);
        } catch {
          console.error(
            'Не удалось откатить создание контрагента',
            createdId,
          );
        }
      }

      const parsed = parseBackendErrors(error);

      setGeneralError(
        createdId
          ? `${parsed.general}. Контрагент не был создан — исправьте данные и попробуйте снова.`
          : parsed.general,
      );

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
    <div className="max-w-5xl mx-auto pb-16">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => navigate('/counterparties')}
            className="
              mt-0.5 p-2.5
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

          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Новый контрагент
            </h1>

            <p className="mt-1 text-sm text-[var(--text-primary)]/40">
              Заполните основные данные. Остальные разделы можно добавить при необходимости.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================
          GLOBAL ERROR
      ========================================================= */}
      {generalError && (
        <div className="mb-6 p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />

          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--accent)]">
              {generalError}
            </p>

            {fieldErrors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fieldErrors.map((error, index) => (
                  <li
                    key={index}
                    className="text-xs text-[var(--accent)]/75"
                  >
                    {error.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">

        {/* =======================================================
            1. ОСНОВНЫЕ ДАННЫЕ
        ======================================================= */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                <Building2 className="w-4.5 h-4.5 text-[var(--accent)]" />
              </div>

              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Основные данные
                </h2>

                <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                  Тип организации и реквизиты
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* TYPE */}
            <div>
              <label className={labelCls}>
                Тип контрагента
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {COUNTERPARTY_TYPES.map((type) => {
                  const selected =
                    formData.counterparty_type ===
                    type.value;

                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() =>
                        handleTypeChange(type.value)
                      }
                      className={`
                        relative
                        p-4 rounded-xl
                        border
                        text-left
                        transition-colors

                        ${
                          selected
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

                      <p className="mt-3 pr-6 text-sm font-semibold text-[var(--text-primary)]">
                        {type.label}
                      </p>

                      <p className="mt-1 text-xs text-[var(--text-primary)]/35">
                        {type.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* NAMES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      name: event.target.value,
                    }));
                  }}
                  placeholder="ООО Ромашка"
                  className={inputCls(
                    hasFieldError(fieldErrors, 'name'),
                  )}
                />

                <FieldErrorMsg
                  fieldErrors={fieldErrors}
                  fieldName="name"
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
                  value={formData.legal_name}
                  onChange={(event) => {
                    clearErrors();

                    setFormData((prev) => ({
                      ...prev,
                      legal_name:
                        event.target.value,
                    }));
                  }}
                  placeholder={
                    formData.counterparty_type ===
                    'Юридическое лицо'
                      ? 'Общество с ограниченной ответственностью «Ромашка»'
                      : 'Полное ФИО'
                  }
                  className={inputCls(
                    hasFieldError(
                      fieldErrors,
                      'legal_name',
                    ),
                  )}
                />

                <FieldErrorMsg
                  fieldErrors={fieldErrors}
                  fieldName="legal_name"
                />
              </div>
            </div>

            {/* REQUISITES */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
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
                    clearErrors();

                    const value =
                      event.target.value.replace(
                        /\D/g,
                        '',
                      );

                    if (value.length <= innLength) {
                      setFormData((prev) => ({
                        ...prev,
                        inn: value,
                      }));
                    }
                  }}
                  placeholder={getInnPlaceholder(
                    formData.counterparty_type,
                  )}
                  className={inputCls(
                    (!!formData.inn &&
                      !innValidation.valid) ||
                    hasFieldError(
                      fieldErrors,
                      'inn',
                    ),
                  )}
                />

                {formData.inn &&
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

              {isKppAllowed(
                formData.counterparty_type,
              ) && (
                <div>
                  <label className={labelCls}>
                    КПП
                    <span className="text-[var(--accent)] ml-1">
                      *
                    </span>
                  </label>

                  <input
                    value={formData.kpp}
                    inputMode="numeric"
                    maxLength={9}
                    onChange={(event) => {
                      clearErrors();

                      const value =
                        event.target.value.replace(
                          /\D/g,
                          '',
                        );

                      if (value.length <= 9) {
                        setFormData((prev) => ({
                          ...prev,
                          kpp: value,
                        }));
                      }
                    }}
                    placeholder="9 цифр"
                    className={inputCls(
                      (!!formData.kpp &&
                        !kppValidation.valid) ||
                      hasFieldError(
                        fieldErrors,
                        'kpp',
                      ),
                    )}
                  />

                  {formData.kpp &&
                    !kppValidation.valid && (
                      <Hint>
                        {kppValidation.message}
                      </Hint>
                    )}

                  {formData.kpp &&
                    kppValidation.valid && (
                      <SuccessHint>
                        КПП корректен
                      </SuccessHint>
                    )}
                </div>
              )}

              <div>
                <label className={labelCls}>
                  ОКПО{' '}
                  <span className="text-sm font-normal text-[var(--text-primary)]/30">
                    (необяз.)
                  </span>
                </label>

                <input
                  value={formData.okpo}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => {
                    const value =
                      event.target.value.replace(
                        /\D/g,
                        '',
                      );

                    if (value.length <= 10) {
                      setFormData((prev) => ({
                        ...prev,
                        okpo: value,
                      }));
                    }
                  }}
                  placeholder="8 или 10 цифр"
                  className={inputCls(
                    !!formData.okpo &&
                      !okpoValidation.valid,
                  )}
                />

                {formData.okpo &&
                  !okpoValidation.valid && (
                    <Hint>
                      {okpoValidation.message}
                    </Hint>
                  )}
              </div>
            </div>
          </div>
        </section>

        {/* =======================================================
            2. КОНТАКТЫ КОМПАНИИ
        ======================================================= */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-color)]">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Контакты компании
            </h2>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Телефон
                  <span className="text-[var(--accent)] ml-1">
                    *
                  </span>
                </label>

                <input
                  type="tel"
                  value={companyPhone.display}
                  onChange={companyPhone.handleChange}
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
                      Введите полный номер телефона
                    </Hint>
                  )}
              </div>

              <div>
                <label className={labelCls}>
                  Email{' '}
                  <span className="text-sm font-normal text-[var(--text-primary)]/30">
                    (необяз.)
                  </span>
                </label>

                <EmailInput
                  value={formData.email}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      email: value,
                    }))
                  }
                  placeholder="info@company.ru"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Адрес{' '}
                <span className="text-sm font-normal text-[var(--text-primary)]/30">
                  (необяз.)
                </span>
              </label>

              <textarea
                value={formData.address}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: event.target.value,
                  }))
                }
                placeholder="г. Москва, ул. Примерная, д. 1"
                rows={2}
                className={`${inputCls()} resize-none`}
              />
            </div>
          </div>
        </section>

        {/* =======================================================
            CONTACT PERSONS
        ======================================================= */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
          <button
            type="button"
            onClick={toggleContacts}
            className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-[var(--hover-2)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <UserCircle className="w-5 h-5 text-[var(--text-primary)]/40" />

              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  Контактные лица
                </p>

                <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                  Необязательно
                </p>
              </div>
            </div>

            <span className="text-sm text-[var(--accent)]">
              {includeContacts
                ? 'Убрать'
                : '+ Добавить'}
            </span>
          </button>

          {includeContacts && (
            <div className="border-t border-[var(--border-color)] p-6 space-y-4">
              {contactPersons.map(
                (contact, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Контакт {index + 1}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          removeContactPerson(index)
                        }
                        className="p-2 rounded-lg text-[var(--text-primary)]/30 hover:text-[var(--accent)] hover:bg-[var(--hover-2)]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* ФИО */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>
                          Фамилия *
                        </label>

                        <input
                          value={
                            contact.last_name
                          }
                          onChange={(event) =>
                            updateContactPerson(
                              index,
                              {
                                ...contact,
                                last_name:
                                  event.target
                                    .value,
                              },
                            )
                          }
                          className={inputCls()}
                        />
                      </div>

                      <div>
                        <label className={labelCls}>
                          Имя *
                        </label>

                        <input
                          value={
                            contact.first_name
                          }
                          onChange={(event) =>
                            updateContactPerson(
                              index,
                              {
                                ...contact,
                                first_name:
                                  event.target
                                    .value,
                              },
                            )
                          }
                          className={inputCls()}
                        />
                      </div>

                      <div>
                        <label className={labelCls}>
                          Отчество *
                        </label>

                        <input
                          value={
                            contact.middle_name
                          }
                          onChange={(event) =>
                            updateContactPerson(
                              index,
                              {
                                ...contact,
                                middle_name:
                                  event.target
                                    .value,
                              },
                            )
                          }
                          className={inputCls()}
                        />
                      </div>
                    </div>

                    {/* Position */}
                    <div>
                      <label className={labelCls}>
                        Должность{' '}
                        <span className="text-sm font-normal text-[var(--text-primary)]/30">
                          (необяз.)
                        </span>
                      </label>

                      <input
                        value={
                          contact.position ?? ''
                        }
                        onChange={(event) =>
                          updateContactPerson(
                            index,
                            {
                              ...contact,
                              position:
                                event.target.value,
                            },
                          )
                        }
                        placeholder="Главный бухгалтер"
                        className={inputCls()}
                      />
                    </div>

                    {/* Phone / extension */}
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_170px] gap-3">
                      <div>
                        <label className={labelCls}>
                          Телефон
                        </label>

                        <ContactPhoneInput
                          value={contact.phone}
                          onChange={(raw) =>
                            updateContactPerson(
                              index,
                              {
                                ...contact,
                                phone: raw,
                              },
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className={labelCls}>
                          Добавочный
                        </label>

                        <input
                          value={
                            contact.extension ??
                            ''
                          }
                          inputMode="numeric"
                          onChange={(event) =>
                            updateContactPerson(
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

                    {/* Email */}
                    <div>
                      <label className={labelCls}>
                        Email
                      </label>

                      <EmailInput
                        value={
                          contact.email ?? ''
                        }
                        onChange={(value) =>
                          updateContactPerson(
                            index,
                            {
                              ...contact,
                              email: value,
                            },
                          )
                        }
                      />
                    </div>

                    {/* Messengers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>
                          Telegram
                        </label>

                        <input
                          value={
                            contact.messengers
                              ?.telegram ?? ''
                          }
                          onChange={(event) =>
                            updateContactPerson(
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
                        <label className={labelCls}>
                          ВКонтакте
                        </label>

                        <input
                          value={
                            contact.messengers
                              ?.vk ?? ''
                          }
                          onChange={(event) =>
                            updateContactPerson(
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
                onClick={addContactPerson}
                className="w-full py-3 rounded-xl border border-dashed border-[var(--border-color)] text-sm text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)] transition-colors"
              >
                + Добавить ещё контакт
              </button>
            </div>
          )}
        </section>

        {/* =======================================================
            BRANCHES
        ======================================================= */}
        {formData.counterparty_type ===
          'Юридическое лицо' && (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
            <button
              type="button"
              onClick={toggleBranches}
              className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-[var(--hover-2)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="w-5 h-5 text-[var(--text-primary)]/40" />

                <div>
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    Обособленные подразделения
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                    Необязательно · наследуют ИНН
                  </p>
                </div>
              </div>

              <span className="text-sm text-[var(--accent)]">
                {includeBranches
                  ? 'Убрать'
                  : '+ Добавить'}
              </span>
            </button>

            {includeBranches && (
              <div className="border-t border-[var(--border-color)] p-6 space-y-4">
                {branches.map(
                  (branch, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-5"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          Подразделение {index + 1}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            removeBranch(index)
                          }
                          className="p-2 rounded-lg text-[var(--text-primary)]/30 hover:text-[var(--accent)] hover:bg-[var(--hover-2)]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="px-4 py-3 rounded-xl bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/50">
                        ИНН:{' '}
                        <span className="font-mono text-[var(--text-primary)]">
                          {formData.inn || '—'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>
                            Название *
                          </label>

                          <input
                            value={branch.name}
                            onChange={(event) =>
                              updateBranch(
                                index,
                                {
                                  ...branch,
                                  name:
                                    event.target
                                      .value,
                                },
                              )
                            }
                            className={inputCls()}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>
                            Полное наименование *
                          </label>

                          <input
                            value={
                              branch.legal_name
                            }
                            onChange={(event) =>
                              updateBranch(
                                index,
                                {
                                  ...branch,
                                  legal_name:
                                    event.target
                                      .value,
                                },
                              )
                            }
                            className={inputCls()}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>
                            КПП *
                          </label>

                          <input
                            value={branch.kpp}
                            inputMode="numeric"
                            maxLength={9}
                            onChange={(event) =>
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
                                      .slice(0, 9),
                                },
                              )
                            }
                            className={inputCls()}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>
                            ОКПО
                          </label>

                          <input
                            value={branch.okpo}
                            inputMode="numeric"
                            maxLength={10}
                            onChange={(event) =>
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
                                      .slice(0, 10),
                                },
                              )
                            }
                            className={inputCls()}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>
                            Телефон *
                          </label>

                          <BranchPhoneInput
                            value={branch.phone}
                            onChange={(value) =>
                              updateBranch(
                                index,
                                {
                                  ...branch,
                                  phone: value,
                                },
                              )
                            }
                            required
                          />
                        </div>

                        <div>
                          <label className={labelCls}>
                            Email *
                          </label>

                          <EmailInput
                            value={branch.email}
                            onChange={(value) =>
                              updateBranch(
                                index,
                                {
                                  ...branch,
                                  email: value,
                                },
                              )
                            }
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>
                          Адрес
                        </label>

                        <input
                          value={branch.address}
                          onChange={(event) =>
                            updateBranch(index, {
                              ...branch,
                              address:
                                event.target.value,
                            })
                          }
                          className={inputCls()}
                        />
                      </div>
                    </div>
                  ),
                )}

                <button
                  type="button"
                  onClick={addBranch}
                  className="w-full py-3 rounded-xl border border-dashed border-[var(--border-color)] text-sm text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)]"
                >
                  + Добавить подразделение
                </button>
              </div>
            )}
          </section>
        )}

        {/* =======================================================
            PRODUCTS
        ======================================================= */}
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--hover-1)] overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setIncludeProducts(
                (value) => !value,
              )
            }
            className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-[var(--hover-2)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-[var(--text-primary)]/40" />

              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  Продукты
                </p>

                <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                  Необязательно · ПО и оборудование
                </p>
              </div>
            </div>

            <span className="text-sm text-[var(--accent)]">
              {includeProducts
                ? 'Скрыть'
                : '+ Привязать'}
            </span>
          </button>

          {includeProducts && (
            <div className="border-t border-[var(--border-color)] p-6 space-y-5">

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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {ENVIRONMENTS.map(
                  (environment) => (
                    <button
                      key={environment.value}
                      type="button"
                      onClick={() =>
                        setProductEnv(
                          environment.value,
                        )
                      }
                      className={`
                        px-3 py-2.5
                        rounded-xl border
                        text-sm font-medium

                        ${
                          productEnv ===
                          environment.value
                            ? envBadgeClass(
                                environment.value,
                              )
                            : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]/40'
                        }
                      `}
                    >
                      {environment.label}
                    </button>
                  ),
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productIsPrimary}
                  onChange={(event) =>
                    setProductIsPrimary(
                      event.target.checked,
                    )
                  }
                />

                <span className="text-sm text-[var(--text-primary)]/60">
                  Основной продукт
                </span>
              </label>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                {loadingProducts ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : availableProducts.length ===
                  0 ? (
                  <div className="py-10 text-center text-sm text-[var(--text-primary)]/35">
                    Ничего не найдено
                  </div>
                ) : (
                  availableProducts
                    .slice(0, 30)
                    .map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() =>
                          addLinkedProduct(
                            product,
                          )
                        }
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left border-b last:border-b-0 border-[var(--border-color)] hover:bg-[var(--hover-2)]"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {product.display_name ||
                              product.name}
                          </p>

                          <p className="text-xs text-[var(--text-primary)]/35">
                            {product.vendor}
                          </p>
                        </div>

                        <Plus className="w-4 h-4 text-[var(--text-primary)]/30" />
                      </button>
                    ))
                )}
              </div>

              {linkedProducts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--text-primary)]/40">
                    Выбрано: {linkedProducts.length}
                  </p>

                  {linkedProducts.map(
                    (linked, index) => (
                      <div
                        key={linked.product.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {linked.product
                              .display_name ||
                              linked.product.name}
                          </p>

                          <p className="mt-1 text-xs text-[var(--text-primary)]/35">
                            {envLabel(
                              linked.environment,
                            )}
                            {linked.is_primary &&
                              ' · Основной'}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeLinkedProduct(
                              index,
                            )
                          }
                          className="p-2 rounded-lg text-[var(--text-primary)]/30 hover:text-[var(--accent)]"
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

        {/* =======================================================
            DUPLICATES
        ======================================================= */}
        <DuplicateEmailWarning
          duplicates={duplicates}
        />

        {/* =======================================================
            ACTIONS
        ======================================================= */}
        <div className="sticky bottom-3 z-20">
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-xl shadow-lg">
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Создание контрагента
              </p>

              <p className="mt-0.5 text-xs text-[var(--text-primary)]/35">
                {isFormValid
                  ? 'Все обязательные данные заполнены'
                  : 'Заполните обязательные поля'}
              </p>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() =>
                  navigate('/counterparties')
                }
                disabled={isLoading}
                className="px-5 py-3 rounded-xl text-sm font-medium text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] disabled:opacity-50"
              >
                Отмена
              </button>

              <ActionButton
                type="button"
                onClick={handleSubmit}
                disabled={
                  isLoading || !isFormValid
                }
                className="px-6 py-3 text-sm font-semibold"
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}