import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Sparkles, Loader2, FileText,
  Tag, Upload, X, CheckCircle2, File, Building2, Zap, Plus,
  Search, FolderOpen, User, AlertCircle, Clock, Trash2,
} from 'lucide-react';
import { SignalLow, SignalMedium, SignalHigh, Flame } from 'lucide-react';
import { MessageSquare, HelpCircle, AlertTriangle, CheckCircle, Edit3 } from 'lucide-react';

import { useAuthStore } from '../stores/authStore';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import type { Counterparty, TicketTag, TicketPriority, TicketType, Project } from '../types';
import { SpellCheckField } from '../components/helpers/SpellCheckField';
import { TicketDescriptionContent, renderInlineFormatting } from '../components/helpers/TicketDescriptionContent';
import {
  TicketEditor, serializeBlocks, type DescriptionBlock,
} from '../components/helpers/TicketEditor';

// ─── Константы ────

const AI_TIMEOUT_MS = 5000;

const PRIORITIES = [
  { value: 'low', label: 'Низкий', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <SignalLow className="w-5 h-5" /> },
  { value: 'medium', label: 'Средний', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', icon: <SignalMedium className="w-5 h-5" /> },
  { value: 'high', label: 'Высокий', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30', icon: <SignalHigh className="w-5 h-5" /> },
  { value: 'critical', label: 'Критический', color: 'bg-red-500/10 text-red-400 border-red-500/30', icon: <Flame className="w-5 h-5" /> },
];

const TICKET_TYPES = [
  { value: 'Инцидент', label: 'Инцидент', icon: <AlertTriangle className="w-4 h-4" /> },
  { value: 'Запрос на услугу', label: 'Запрос на услугу', icon: <CheckCircle className="w-4 h-4" /> },
  { value: 'Консультация', label: 'Консультация', icon: <HelpCircle className="w-4 h-4" /> },
  { value: 'Жалоба', label: 'Жалоба', icon: <AlertTriangle className="w-4 h-4" /> },
  { value: 'Задача', label: 'Задача', icon: <CheckCircle className="w-4 h-4" /> },
  { value: 'Проблема', label: 'Проблема', icon: <AlertTriangle className="w-4 h-4" /> },
  { value: 'Запрос на изменение', label: 'Запрос на изменение', icon: <Edit3 className="w-4 h-4" /> },
  { value: 'Улучшение', label: 'Улучшение', icon: <Sparkles className="w-4 h-4" /> },
  { value: 'Прочее', label: 'Прочее', icon: <MessageSquare className="w-4 h-4" /> },
];

const PRESET_TAGS = [
  { name: 'Инцидент', color: '#dc2626' }, { name: 'Консультация', color: '#2563eb' },
  { name: 'Доработка', color: '#059669' }, { name: 'Ошибка', color: '#ea580c' },
  { name: 'Интеграция', color: '#2563eb' }, { name: 'Обучение', color: '#059669' },
  { name: 'Срочное', color: '#dc2626' },
];

interface GeneralFile {
  id: string; file: File; preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface SimpleUser {
  id: string; username: string; full_name: string | null; email: string; role?: string;
}

const CAN_SELECT_COUNTERPARTY_ROLES = ['admin', 'support_agent', 'support_manager', 'executor'];
type SelectionType = 'project' | 'counterparty' | null;

// ─── Draft types ────

interface DraftData {
  step: number;
  title: string;
  descriptionBlocks: DescriptionBlock[];
  priority: TicketPriority;
  type: TicketType;
  tags: TicketTag[];
  selectionType: SelectionType;
  selectedCounterpartyId: string | null;
  selectedCounterpartyName: string | null;
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  selectedReporterId: string | null;
  selectedReporterName: string | null;
  counterpartySearch: string;
  projectSearch: string;
  reporterSearch: string;
  savedAt: number;
  userId: string;
}

// ─── Draft helpers ────

function getDraftKey(userId: string | undefined): string {
  return userId ? `new_ticket_draft:${userId}` : 'new_ticket_draft:anonymous';
}

function saveDraft(data: DraftData, key: string) {
  try {
    const cleanBlocks = data.descriptionBlocks.map(b => {
      if (b.type === 'image') {
        return { id: b.id, type: b.type as 'image', value: b.value };
      }
      return { ...b };
    });
    localStorage.setItem(key, JSON.stringify({ ...data, descriptionBlocks: cleanBlocks }));
  } catch { }
}

function loadDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as DraftData;
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearDraft(key: string) {
  localStorage.removeItem(key);
}

// ─── Компонент ────

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCounterpartyId = searchParams.get('counterparty_id');
  const preselectedProjectId = searchParams.get('project_id');
  const { user } = useAuthStore();

  const draftKey = getDraftKey(user?.id ?? user?.user_id);
  const draft = useRef(loadDraft(draftKey));

  const [step, setStep] = useState(draft.current?.step || 1);
  const [title, setTitle] = useState(draft.current?.title || '');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(!!draft.current);

  const [descriptionBlocks, setDescriptionBlocks] = useState<DescriptionBlock[]>(
    draft.current?.descriptionBlocks?.length
      ? draft.current.descriptionBlocks
      : [{ id: 'init', type: 'text', value: '' }]
  );
  const description = serializeBlocks(descriptionBlocks);

  const [priority, setPriority] = useState<TicketPriority>(draft.current?.priority || 'medium');
  const [type, setType] = useState<TicketType>(draft.current?.type || 'Инцидент');
  const [tags, setTags] = useState<TicketTag[]>(draft.current?.tags || []);
  const [generalFiles, setGeneralFiles] = useState<GeneralFile[]>([]);

  const [customerCounterparty, setCustomerCounterparty] = useState<Counterparty | null>(null);
  const [selectionType, setSelectionType] = useState<SelectionType>(draft.current?.selectionType ?? null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [counterpartySearch, setCounterpartySearch] = useState(draft.current?.counterpartySearch || '');
  const [showCounterpartyDropdown, setShowCounterpartyDropdown] = useState(false);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState(draft.current?.projectSearch || '');
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedReporter, setSelectedReporter] = useState<SimpleUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showReporterDropdown, setShowReporterDropdown] = useState(false);
  const [reporterSearch, setReporterSearch] = useState(draft.current?.reporterSearch || '');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTimedOut, setAiTimedOut] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<TicketTag[]>([]);

  const aiDoneRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const titleRef = useRef('');
  const descriptionRef = useRef('');

  titleRef.current = title;
  descriptionRef.current = description;

  const [newTagInput, setNewTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);

  const isCustomer = user?.roles?.some(r => r === 'customer' || r === 'customer_admin') ?? false;
  const canSelectCounterparty = (!isCustomer && user?.roles?.some(r => CAN_SELECT_COUNTERPARTY_ROLES.includes(r))) ?? false;
  const canSelectReporter = !isCustomer;

  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const reporterDropdownRef = useRef<HTMLDivElement>(null);

  const hasDescription = descriptionBlocks.some(
    b => (b.type === 'text' && b.value.trim().length > 0) || (b.type === 'image' && b.localFile)
  );

  const prevUserIdRef = useRef<string | undefined>(user?.id ?? user?.user_id);

  useEffect(() => {
    const currentUserId = user?.id ?? user?.user_id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentUserId) {
      clearDraft(getDraftKey(prevUserIdRef.current));
      draft.current = null;
      setHasDraft(false);
      setStep(1);
      setTitle('');
      setDescriptionBlocks([{ id: 'init', type: 'text', value: '' }]);
      setPriority('medium');
      setType('Инцидент');
      setTags([]);
      setGeneralFiles([]);
      setSelectionType(null);
      setSelectedCounterparty(null);
      setSelectedProject(null);
      setSelectedReporter(null);
      setCounterpartySearch('');
      setProjectSearch('');
      setReporterSearch('');
      setAiSuggestion(null);
      setAiSuggestedTags([]);
      aiDoneRef.current = false;
    }
    prevUserIdRef.current = currentUserId;
  }, [user?.id, user?.user_id]);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      const currentUserId = user?.id ?? user?.user_id;
      if (!currentUserId) return;
      saveDraft({
        step,
        title,
        descriptionBlocks,
        priority,
        type,
        tags,
        selectionType,
        selectedCounterpartyId: selectedCounterparty?.id || null,
        selectedCounterpartyName: selectedCounterparty ? (selectedCounterparty.name || selectedCounterparty.legal_name || '') : null,
        selectedProjectId: selectedProject?.id || null,
        selectedProjectName: selectedProject ? `${selectedProject.key} - ${selectedProject.name}` : null,
        selectedReporterId: selectedReporter?.id || null,
        selectedReporterName: selectedReporter ? (selectedReporter.full_name || selectedReporter.username) : null,
        counterpartySearch,
        projectSearch,
        reporterSearch,
        savedAt: Date.now(),
        userId: currentUserId,
      }, draftKey);
      setHasDraft(true);
    }, 500);

    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [step, title, descriptionBlocks, priority, type, tags, selectionType,
    selectedCounterparty, selectedProject, selectedReporter,
    counterpartySearch, projectSearch, reporterSearch, draftKey]);

  useEffect(() => {
    if (!draft.current || !canSelectCounterparty) return;
    const d = draft.current;

    if (d.selectionType === 'counterparty' && d.selectedCounterpartyId) {
      counterpartiesApi.getById(d.selectedCounterpartyId)
        .then(cp => {
          setSelectedCounterparty(cp);
          setCounterpartySearch(cp.name || cp.legal_name || '');
        })
        .catch(() => { });
    }

    if (d.selectionType === 'project' && d.selectedProjectId) {
      projectsApi.getAll(1, 100)
        .then(res => {
          setProjects(res.items);
          const found = res.items.find(p => p.id === d.selectedProjectId);
          if (found) {
            setSelectedProject(found);
            setProjectSearch(`${found.key} - ${found.name}`);
            if (found.counterparty_id) {
              counterpartiesApi.getById(found.counterparty_id)
                .then(cp => {
                  setSelectedCounterparty(cp);
                  setCounterpartySearch(cp.name || cp.legal_name || '');
                })
                .catch(() => { });
            }
          }
        })
        .catch(() => { });
    }

    draft.current = null;
  }, [canSelectCounterparty]);

  const handleClearDraft = () => {
    clearDraft(draftKey);
    setHasDraft(false);
    setStep(1);
    setTitle('');
    setDescriptionBlocks([{ id: 'init', type: 'text', value: '' }]);
    setPriority('medium');
    setType('Инцидент');
    setTags([]);
    setGeneralFiles([]);
    setSelectionType(null);
    setSelectedCounterparty(null);
    setSelectedProject(null);
    setSelectedReporter(null);
    setCounterpartySearch('');
    setProjectSearch('');
    setReporterSearch('');
    setAiSuggestion(null);
    setAiSuggestedTags([]);
    aiDoneRef.current = false;
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(e.target as Node)) setShowCounterpartyDropdown(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) setShowProjectDropdown(false);
      if (reporterDropdownRef.current && !reporterDropdownRef.current.contains(e.target as Node)) setShowReporterDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { if (isCustomer && user?.counterparty_id) loadCustomerCounterparty(); }, [user]);
  useEffect(() => { if (canSelectCounterparty) loadCounterparties(); }, [canSelectCounterparty]);

  useEffect(() => {
    if (selectionType === 'counterparty' && selectedCounterparty) loadProjects(selectedCounterparty.id);
    else if (selectionType === 'project') loadProjectsForAll();
    else setProjects([]);
  }, [selectionType, selectedCounterparty]);

  useEffect(() => {
    if (selectedCounterparty) loadUsers(selectedCounterparty.id);
    else if (selectedProject?.counterparty_id) loadUsers(selectedProject.counterparty_id);
    else { setUsers([]); setSelectedReporter(null); setReporterSearch(''); }
  }, [selectedCounterparty, selectedProject]);

  useEffect(() => {
    if (!preselectedProjectId || !canSelectCounterparty) return;
    const autoSelectProject = async () => {
      setSelectionType('project');
      try {
        const items = (await projectsApi.getAll(1, 100)).items;
        setProjects(items);
        const found = items.find(p => p.id === preselectedProjectId);
        if (found) {
          setSelectedProject(found);
          setProjectSearch(`${found.key} - ${found.name}`);
          if (found.counterparty_id) {
            try {
              const cp = await counterpartiesApi.getById(found.counterparty_id);
              setSelectedCounterparty(cp);
              setCounterpartySearch(cp.name || cp.legal_name || '');
            } catch { }
          }
        }
      } catch (err) {
        console.error('Failed to auto-select project:', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    autoSelectProject();
  }, [preselectedProjectId, canSelectCounterparty]);

  useEffect(() => {
    if (step !== 2) {
      if (step === 1) {
        aiDoneRef.current = false;
        aiAbortRef.current?.abort();
        aiAbortRef.current = null;
        setAiTimedOut(false);
      }
      return;
    }

    if (aiDoneRef.current) return;

    const currentTitle = titleRef.current.trim();
    const currentDesc = descriptionRef.current.trim();

    if (!currentTitle || !currentDesc) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    aiDoneRef.current = true;
    setAiLoading(true);
    setAiSuggestion(null);
    setAiTimedOut(false);

    const timeoutId = setTimeout(() => {
      if (controller.signal.aborted) return;
      setAiTimedOut(true);
      setAiLoading(false);
    }, AI_TIMEOUT_MS);

    ticketsApi.predict(currentTitle, currentDesc)
      .then(r => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        setAiSuggestion(r);
        setAiSuggestedTags(r.suggested_tags || []);
        setPriority(r.suggested_priority);
        setTags(r.suggested_tags || []);
        setAiLoading(false);
        setAiTimedOut(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) return;
        console.error('AI prediction failed:', err);
        setAiLoading(false);
        setAiTimedOut(true);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [step]);

  const loadCustomerCounterparty = async () => {
    if (!user?.counterparty_id) return;
    try { setCustomerCounterparty(await counterpartiesApi.getById(user.counterparty_id)); } catch { }
  };

  const loadCounterparties = async (search?: string) => {
    setLoadingCounterparties(true);
    try {
      let items = (await counterpartiesApi.getAll(1, 50)).items;
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(c =>
          c.name?.toLowerCase().includes(q) ||
          c.legal_name?.toLowerCase().includes(q) ||
          c.inn?.includes(search)
        );
      }
      setCounterparties(items);
      if (!search && preselectedCounterpartyId && !selectedCounterparty) {
        const found = items.find(c => c.id === preselectedCounterpartyId);
        if (found) {
          setSelectionType('counterparty');
          setSelectedCounterparty(found);
          setCounterpartySearch(found.name || found.legal_name || '');
        }
      }
    } catch { }
    finally { setLoadingCounterparties(false); }
  };

  const loadProjects = async (cpId: string) => {
    setLoadingProjects(true);
    try { setProjects((await projectsApi.getByCounterparty(cpId, 1, 50)).items); }
    catch { }
    finally { setLoadingProjects(false); }
  };

  const loadProjectsForAll = async (): Promise<Project[]> => {
    setLoadingProjects(true);
    try {
      const items = (await projectsApi.getAll(1, 100)).items;
      setProjects(items);
      return items;
    } catch { return []; }
    finally { setLoadingProjects(false); }
  };

  const loadUsers = async (cpId: string) => {
    setLoadingUsers(true);
    try {
      const items = (await usersApi.getCustomers(cpId, 1, 100)).items.map(c => ({
        id: c.id, username: c.username, full_name: c.full_name, email: c.email, role: c.role,
      }));
      let all = [...items];
      if (!items.find(u => u.id === user?.user_id) && user?.user_id) {
        all = [{ id: user.user_id, username: user.username || '', full_name: user.full_name || null, email: user.email || '', role: user.role }, ...items];
      }
      setUsers(all); setSelectedReporter(null); setReporterSearch('');
    } catch { }
    finally { setLoadingUsers(false); }
  };

  const handleSelectionTypeChange = (t: SelectionType) => {
    setSelectionType(t); setSelectedCounterparty(null); setSelectedProject(null);
    setCounterpartySearch(''); setProjectSearch(''); setProjects([]);
  };

  const togglePresetTag = (tag: TicketTag) => {
    setTags(p => p.some(t => t.name === tag.name) ? p.filter(t => t.name !== tag.name) : [...p, tag]);
  };

  const addCustomTag = () => {
    const n = newTagInput.trim();
    if (!n || tags.some(t => t.name.toLowerCase() === n.toLowerCase())) return;
    setTags(p => [...p, { name: n, color: '#a1a1aa' }]);
    setNewTagInput('');
    setShowCustomTagInput(false);
  };

  const removeTag = (name: string) => setTags(p => p.filter(t => t.name !== name));

  const validateStep1 = (): boolean => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Укажите тему заявки');
    if (!hasDescription) errors.push('Добавьте описание заявки');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateStep1()) return;
    }
    setValidationErrors([]);
    setStep(step + 1);
  };

  useEffect(() => {
    if (validationErrors.length > 0 && title.trim() && hasDescription) {
      setValidationErrors([]);
    }
  }, [title, descriptionBlocks]);

  const handleGeneralFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newF: GeneralFile[] = files.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending',
    }));
    setGeneralFiles(p => [...p, ...newF].slice(0, 10));
    e.target.value = '';
  };

  const handleGeneralDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const newF: GeneralFile[] = files.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, status: 'pending',
    }));
    setGeneralFiles(p => [...p, ...newF].slice(0, 10));
  };

  const removeGeneralFile = (id: string) => {
    const f = generalFiles.find(x => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setGeneralFiles(p => p.filter(x => x.id !== id));
  };

  const formatFileSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const textOnlyDesc = descriptionBlocks
        .filter((b): b is Extract<DescriptionBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.value.trim())
        .filter(Boolean)
        .join('\n\n');

      const data: any = {
        title,
        description: textOnlyDesc || '(описание с изображениями)',
        priority,
        type,
        tags: tags.map(t => ({ name: t.name, color: t.color || '#64748b' })),
        reporter_id: user?.id,
      };

      if (isCustomer && customerCounterparty) {
        data.counterparty_id = customerCounterparty.id;
      } else if (selectedProject) {
        data.project_id = selectedProject.id;
      } else if (selectedCounterparty) {
        data.counterparty_id = selectedCounterparty.id;
      }

      if (canSelectReporter && selectedReporter) {
        data.reporter_id = selectedReporter.id;
      }

      const ticket = await ticketsApi.create(data);

      const imageBlocks = descriptionBlocks.filter(
        (b): b is Extract<DescriptionBlock, { type: 'image' }> => b.type === 'image' && !!b.localFile
      );

      const uploadMap: Record<string, string> = {};
      for (const block of imageBlocks) {
        try {
          const att = await attachmentsApi.uploadAttachment(block.localFile!, 'ticket', ticket.id);
          uploadMap[block.id] = att.id;
        } catch (err) {
          console.error('Image upload failed:', block.id, err);
        }
      }

      if (imageBlocks.length > 0) {
        let finalDesc = serializeBlocks(descriptionBlocks);
        for (const [blockId, attachmentId] of Object.entries(uploadMap)) {
          finalDesc = finalDesc.replaceAll(`![image](local:${blockId})`, `![image](media://${attachmentId})`);
        }
        finalDesc = finalDesc.replace(/!\[image\]\(local:[a-f0-9-]+\)\n*/gi, '');
        await ticketsApi.update(ticket.id, { description: finalDesc });
      }

      for (const f of generalFiles.filter(x => x.status === 'pending')) {
        try {
          await attachmentsApi.uploadAttachment(f.file, 'ticket', ticket.id);
        } catch (err) {
          console.error('File upload failed:', f.file.name, err);
        }
      }

      clearDraft(draftKey);
      setHasDraft(false);

      navigate('/tickets');
    } catch (err: any) {
      console.error('Submit failed:', err?.response?.data || err);
    } finally {
      setSubmitting(false);
    }
  };

  const cpName = (c: Counterparty) => c.name || c.legal_name || c.inn || '—';
  const prjName = (p: Project) => `${p.key} - ${p.name}`;
  const uName = (u: SimpleUser) => u.full_name || u.username || u.email;

  const stepLabels = [
    { num: 1, label: 'Описание' },
    { num: 2, label: 'Классификация' },
    { num: 3, label: 'Проверка' },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-12 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Новая заявка</h1>
        
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {stepLabels.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1 ${
                step === s.num
                  ? 'bg-[var(--accent)] text-white'
                  : step > s.num
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-[var(--hover-1)] text-[var(--text-primary)]/40 border border-[var(--border-color)]'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === s.num ? 'bg-white/20' : step > s.num ? 'bg-emerald-500/20' : 'bg-[var(--hover-2)]'
                }`}>
                  {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 2 && (
                <div className={`w-4 h-0.5 rounded-full ${step > s.num ? 'bg-emerald-500/60' : 'bg-[var(--border-color)]'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Draft notice */}
      {hasDraft && step === 1 && title && (
        <div className="mb-6 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-300">Восстановлен черновик</span>
          </div>
          <button onClick={handleClearDraft} className="text-xs text-blue-400 hover:text-blue-300">
            Очистить
          </button>
        </div>
      )}

      {/* Content */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6">
        
        {/* ═══ Step 1 ═══ */}
        {step === 1 && (
          <div className="space-y-6">
            {validationErrors.length > 0 && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Привязка */}
            {canSelectCounterparty && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                  Привязка
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: 'project' as const, label: 'Проект', icon: FolderOpen },
                    { type: 'counterparty' as const, label: 'Контрагент', icon: Building2 },
                    { type: null, label: 'Без привязки', icon: X },
                  ].map(item => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleSelectionTypeChange(item.type)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                        selectionType === item.type
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Контрагент */}
            {canSelectCounterparty && selectionType === 'counterparty' && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Контрагент <span className="text-red-400">*</span>
                </label>
                <div className="relative" ref={counterpartyDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40" />
                    <input
                      value={counterpartySearch}
                      onChange={e => { setCounterpartySearch(e.target.value); setShowCounterpartyDropdown(true); loadCounterparties(e.target.value); }}
                      onFocus={() => { setShowCounterpartyDropdown(true); if (!counterparties.length) loadCounterparties(); }}
                      placeholder="Поиск контрагента..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  {showCounterpartyDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {loadingCounterparties ? (
                        <div className="p-4 text-center">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/40" />
                        </div>
                      ) : (
                        counterparties.map(cp => (
                          <button
                            key={cp.id}
                            onClick={() => { setSelectedCounterparty(cp); setCounterpartySearch(cpName(cp)); setShowCounterpartyDropdown(false); }}
                            className="w-full text-left p-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm"
                          >
                            <div className="font-medium text-[var(--text-primary)]">{cpName(cp)}</div>
                            {cp.inn && <div className="text-xs text-[var(--text-primary)]/40 mt-0.5">ИНН: {cp.inn}</div>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Проект */}
            {canSelectCounterparty && selectionType === 'project' && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Проект <span className="text-red-400">*</span>
                </label>
                <div className="relative" ref={projectDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40" />
                    <input
                      value={projectSearch}
                      onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                      onFocus={() => { setShowProjectDropdown(true); if (!projects.length) loadProjectsForAll(); }}
                      placeholder="Поиск проекта..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  {showProjectDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {loadingProjects ? (
                        <div className="p-4 text-center">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/40" />
                        </div>
                      ) : (
                        projects
                          .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || p.key.toLowerCase().includes(projectSearch.toLowerCase()))
                          .map(p => (
                            <button
                              key={p.id}
                              onClick={() => { setSelectedProject(p); setProjectSearch(prjName(p)); setShowProjectDropdown(false); }}
                              className="w-full text-left p-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm"
                            >
                              <span className="text-amber-400 font-medium">{p.key}</span> — {p.name}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Customer контрагент */}
            {isCustomer && customerCounterparty && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{customerCounterparty.name}</p>
                  {customerCounterparty.inn && (
                    <p className="text-xs text-[var(--text-primary)]/50">ИНН: {customerCounterparty.inn}</p>
                  )}
                </div>
              </div>
            )}

            {/* Инициатор */}
            {canSelectReporter && (selectedCounterparty || selectedProject) && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Инициатор <span className="text-xs text-[var(--text-primary)]/40">(по умолчанию — вы)</span>
                </label>
                <div className="relative" ref={reporterDropdownRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/40" />
                  <input
                    value={reporterSearch}
                    onChange={e => { setReporterSearch(e.target.value); setShowReporterDropdown(true); }}
                    onFocus={() => setShowReporterDropdown(true)}
                    placeholder="Выберите инициатора..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                  {showReporterDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {loadingUsers ? (
                        <div className="p-4 text-center">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--text-primary)]/40" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => { setSelectedReporter(null); setReporterSearch(''); setShowReporterDropdown(false); }}
                            className="w-full text-left p-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] text-sm"
                          >
                            <span className="text-[var(--text-primary)]">{user?.full_name || 'Вы'}</span>
                            <span className="text-[var(--text-primary)]/40 ml-2">(текущий)</span>
                          </button>
                          {users
                            .filter(u => !reporterSearch ||
                              u.full_name?.toLowerCase().includes(reporterSearch.toLowerCase()) ||
                              u.email.toLowerCase().includes(reporterSearch.toLowerCase()))
                            .map(u => (
                              <button
                                key={u.id}
                                onClick={() => { setSelectedReporter(u); setReporterSearch(uName(u)); setShowReporterDropdown(false); }}
                                className="w-full text-left p-3 hover:bg-[var(--hover-1)] border-b border-[var(--border-color)] last:border-0 text-sm"
                              >
                                <div className="text-[var(--text-primary)]">{uName(u)}</div>
                                <div className="text-xs text-[var(--text-primary)]/40">{u.email}</div>
                              </button>
                            ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Тема */}
            <SpellCheckField value={title} onChange={setTitle} label="Тема заявки *">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Кратко опишите проблему или задачу..."
                className={`w-full px-4 py-3 bg-[var(--hover-1)] border rounded-lg text-base focus:outline-none focus:border-[var(--accent)] ${
                  validationErrors.includes('Укажите тему заявки') ? 'border-red-500' : 'border-[var(--border-color)]'
                }`}
              />
            </SpellCheckField>

            {/* Описание */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Описание <span className="text-red-400">*</span>
              </label>
              <div className={validationErrors.includes('Добавьте описание заявки') ? 'ring-1 ring-red-500 rounded-lg' : ''}>
                <TicketEditor blocks={descriptionBlocks} onChange={setDescriptionBlocks} />
              </div>
            </div>

            {/* Вложения */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Файлы <span className="text-xs text-[var(--text-primary)]/40">(необязательно)</span>
              </label>
              <div
                onDrop={handleGeneralDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-[var(--border-color)] rounded-lg p-6 text-center hover:border-[var(--text-primary)]/30 transition-colors"
              >
                <Upload className="w-8 h-8 text-[var(--text-primary)]/20 mx-auto mb-2" />
                <p className="text-sm text-[var(--text-primary)]/50 mb-2">Перетащите файлы сюда</p>
                <label className="inline-block">
                  <input type="file" multiple onChange={handleGeneralFileSelect} className="hidden" />
                  <span className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-sm font-medium cursor-pointer transition-colors">
                    Выбрать файлы
                  </span>
                </label>
                <p className="mt-2 text-xs text-[var(--text-primary)]/30">До 10 файлов</p>
              </div>

              {generalFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {generalFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                      {f.preview ? (
                        <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[var(--hover-2)] flex items-center justify-center">
                          <File className="w-4 h-4 text-[var(--text-primary)]/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{f.file.name}</p>
                        <p className="text-xs text-[var(--text-primary)]/40">{formatFileSize(f.file.size)}</p>
                      </div>
                      <button
                        onClick={() => removeGeneralFile(f.id)}
                        className="p-1 rounded hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Step 2 ═══ */}
        {step === 2 && (
          <div className="space-y-6">
            {aiLoading && !aiTimedOut && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">ИИ анализирует заявку...</p>
                  <p className="text-xs text-[var(--text-primary)]/50">Подбираем приоритет и теги</p>
                </div>
              </div>
            )}

            {aiTimedOut && !aiSuggestion && (
              <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center gap-3">
                <Clock className="w-5 h-5 text-orange-400" />
                <p className="text-sm text-[var(--text-primary)]">ИИ не успел ответить. Выберите параметры вручную.</p>
              </div>
            )}

            {aiSuggestion && !aiLoading && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <p className="text-sm text-[var(--text-primary)]">ИИ предложил классификацию. Проверьте и измените при необходимости.</p>
              </div>
            )}

            <div className={aiLoading && !aiTimedOut ? 'opacity-40 pointer-events-none' : ''}>
              {/* Тип */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">Тип заявки</label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {TICKET_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value as TicketType)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                        type === t.value
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Приоритет */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">Приоритет</label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value as TicketPriority)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                        priority === p.value
                          ? `${p.color} border-current`
                          : 'border-[var(--border-color)] bg-[var(--hover-1)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                      }`}
                    >
                      {p.icon}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Теги */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">Теги</label>
                
                {aiSuggestedTags.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-[var(--text-primary)]/50 mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Предложено ИИ
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestedTags.map(t => {
                        const isSelected = tags.some(x => x.name === t.name);
                        return (
                          <button
                            key={t.name}
                            onClick={() => togglePresetTag(t)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {PRESET_TAGS.map(t => {
                    const isSelected = tags.some(x => x.name === t.name);
                    return (
                      <button
                        key={t.name}
                        onClick={() => togglePresetTag(t)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                          isSelected ? '' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                        }`}
                        style={{
                          backgroundColor: isSelected ? `${t.color}25` : undefined,
                          color: isSelected ? t.color : undefined,
                          borderColor: isSelected ? `${t.color}80` : undefined,
                        }}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowCustomTagInput(!showCustomTagInput)}
                  className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1 mb-3"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showCustomTagInput ? 'Скрыть' : 'Свой тег'}
                </button>

                {showCustomTagInput && (
                  <div className="flex gap-2 mb-4">
                    <input
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                      placeholder="Название тега..."
                      className="flex-1 px-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={addCustomTag}
                      disabled={!newTagInput.trim()}
                      className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-sm font-medium disabled:opacity-40 transition-colors"
                    >
                      Добавить
                    </button>
                  </div>
                )}

                {tags.length > 0 && (
                  <div className="p-3 rounded-lg bg-[var(--hover-1)]">
                    <p className="text-xs text-[var(--text-primary)]/50 mb-2">Выбрано: {tags.length}</p>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(t => (
                        <div
                          key={t.name}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-sm"
                          style={{
                            backgroundColor: `${t.color || '#71717a'}20`,
                            borderColor: `${t.color || '#71717a'}50`,
                            color: t.color || '#d1d5db',
                          }}
                        >
                          {t.name}
                          <X
                            className="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100 hover:text-red-400 transition-all"
                            onClick={() => removeTag(t.name)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Step 3 ═══ */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">Проверьте заявку</h2>
              <p className="text-sm text-[var(--text-primary)]/50">Убедитесь, что всё верно перед отправкой</p>
            </div>

            {/* Привязка */}
            {(selectedProject || selectedCounterparty || (isCustomer && customerCounterparty)) && (
              <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-primary)]/50 mb-1">Привязка</p>
                <div className="flex items-center gap-2">
                  {selectedProject ? (
                    <>
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{prjName(selectedProject)}</span>
                    </>
                  ) : selectedCounterparty ? (
                    <>
                      <Building2 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{cpName(selectedCounterparty)}</span>
                    </>
                  ) : isCustomer && customerCounterparty ? (
                    <>
                      <Building2 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{customerCounterparty.name}</span>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {canSelectCounterparty && selectionType === null && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center text-sm text-yellow-400">
                Без привязки
              </div>
            )}

            {/* Инициатор */}
            <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-primary)]/50 mb-1">Инициатор</p>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {selectedReporter ? uName(selectedReporter) : (user?.full_name || 'Вы')}
                  </p>
                  <p className="text-xs text-[var(--text-primary)]/40">
                    {selectedReporter ? selectedReporter.email : user?.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Тема */}
            <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-primary)]/50 mb-1">Тема</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{title || '—'}</p>
            </div>

            {/* Описание */}
            <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-primary)]/50 mb-2">Описание</p>
              <div className="space-y-2">
                {descriptionBlocks.map(block => {
                  if (block.type === 'text') {
                    if (!block.value.trim()) return null;
                    return (
                      <div key={block.id} className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                        {renderInlineFormatting(block.value)}
                      </div>
                    );
                  }
                  if (block.type === 'image' && block.localPreview) {
                    return (
                      <img
                        key={block.id}
                        src={block.localPreview}
                        alt="вложение"
                        className="max-w-full max-h-[200px] rounded-lg border border-[var(--border-color)]"
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Тип и приоритет */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-primary)]/50 mb-1">Тип</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{type}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-primary)]/50 mb-1">Приоритет</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {PRIORITIES.find(p => p.value === priority)?.label || priority}
                </p>
              </div>
            </div>

            {/* Теги */}
            {tags.length > 0 && (
              <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-primary)]/50 mb-2">Теги</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span
                      key={t.name}
                      className="px-2.5 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: (t.color || '#71717a') + '30',
                        color: t.color || '#d1d5db',
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Вложения */}
            {generalFiles.length > 0 && (
              <div className="p-3 rounded-lg bg-[var(--hover-1)] border border-[var(--border-color)]">
                <p className="text-xs text-[var(--text-primary)]/50 mb-2">Вложения ({generalFiles.length})</p>
                <div className="space-y-1">
                  {generalFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <File className="w-3.5 h-3.5 text-[var(--text-primary)]/40" />
                      <span className="truncate">{f.file.name}</span>
                      <span className="text-xs text-[var(--text-primary)]/30">{formatFileSize(f.file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-[var(--border-color)]">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--hover-1)] hover:bg-[var(--hover-2)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] transition-colors"
            >
              Назад
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={handleNextStep}
              disabled={step === 1 && (!title.trim() || !hasDescription)}
              className="px-6 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              Далее <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Создать заявку
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}