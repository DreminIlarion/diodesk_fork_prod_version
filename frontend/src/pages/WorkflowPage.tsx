// pages/WorkflowPage.tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Check, Save, Trash2,
  ArrowRight, Zap, Bell,
  UserCheck, Mail, MessageSquare, ChevronDown,
  Circle, Timer, Eye, AlertCircle,
  CheckCircle2, Ban, RotateCcw, Clock, Send,
  FileText, Layers, Ticket,
  Lock,
  Workflow, Target,
  Shield, Bot, Webhook,
  Database,
  Edit3, Unlink,
  AlertTriangle,
  Calendar, ZoomOut, ZoomIn, Maximize2,
  Loader2 
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

type WfNodeType = 'status';
type WfEntityKind = 'task' | 'ticket';

interface WfStatusNode {
  id: string;
  label: string;
  description?: string;
  category: 'open' | 'progress' | 'review' | 'done' | 'cancelled' | 'custom';
  color: string;       // hex
  iconKey: string;
  x: number;
  y: number;
  isTerminal?: boolean;
  isInitial?: boolean;
}

interface WfTransition {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  conditions: WfCondition[];
  actions: WfAction[];
}

interface WfCondition {
  id: string;
  type: 'role' | 'field_required' | 'custom_check' | 'assignee_set';
  params: Record<string, string>;
}

interface WfAction {
  id: string;
  type: 'notify_email' | 'notify_telegram' | 'notify_push' | 'change_assignee' |
        'create_subtask' | 'set_priority' | 'run_webhook' | 'send_template' |
        'log_event' | 'auto_assign' | 'set_deadline';
  label: string;
  enabled: boolean;
  params: Record<string, string>;
  order: number;
}

interface Workflow {
  id: string;
  name: string;
  entityKind: WfEntityKind;
  description?: string;
  nodes: WfStatusNode[];
  transitions: WfTransition[];
  isDefault: boolean;
  updatedAt: string;
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & MAPS
   ═══════════════════════════════════════════════════════════════════ */

const NODE_W = 220;
const NODE_H = 88;

const CATEGORY_META: Record<string, {
  bg: string; border: string; text: string; dot: string; chip: string;
}> = {
  open:      { bg: 'bg-blue-500/10',     border: 'border-blue-500/30',     text: 'text-blue-400',     dot: 'bg-blue-400',     chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  progress:  { bg: 'bg-yellow-500/10',   border: 'border-yellow-500/30',   text: 'text-yellow-400',   dot: 'bg-yellow-400',   chip: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  review:    { bg: 'bg-violet-500/10',   border: 'border-violet-500/30',   text: 'text-violet-400',   dot: 'bg-violet-400',   chip: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  done:      { bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30',  text: 'text-emerald-400',  dot: 'bg-emerald-400',  chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  cancelled: { bg: 'bg-[var(--hover-2)]', border: 'border-[var(--border-color)]', text: 'text-[var(--text-primary)]/40', dot: 'bg-[var(--text-muted)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]' },
  custom:    { bg: 'bg-orange-500/10',   border: 'border-orange-500/30',   text: 'text-orange-400',   dot: 'bg-orange-400',   chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
};

const CATEGORY_LABELS: Record<string, string> = {
  open: 'Начальный', progress: 'В работе', review: 'Проверка',
  done: 'Завершён', cancelled: 'Отменён', custom: 'Другой',
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  circle: Circle, timer: Timer, eye: Eye, alert: AlertCircle,
  check: CheckCircle2, ban: Ban, rotate: RotateCcw, clock: Clock,
  play: Play, pause: Pause, stop: StopCircle, target: Target,
  flag: Flag, star: Star, shield: Shield,
};

const ACTION_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  fields: { key: string; label: string; type: 'text' | 'select' | 'textarea'; options?: string[] }[];
}> = {
  notify_email: {
    icon: Mail, label: 'Email-уведомление', color: 'text-blue-400',
    fields: [
      { key: 'to', label: 'Кому', type: 'select', options: ['Исполнитель', 'Автор', 'Ревьюер', 'Все участники'] },
      { key: 'subject', label: 'Тема', type: 'text' },
      { key: 'body', label: 'Тело письма', type: 'textarea' },
    ],
  },
  notify_telegram: {
    icon: Send, label: 'Telegram-уведомление', color: 'text-sky-400',
    fields: [
      { key: 'to', label: 'Кому', type: 'select', options: ['Исполнитель', 'Автор', 'Ревьюер', 'Канал'] },
      { key: 'message', label: 'Сообщение', type: 'textarea' },
    ],
  },
  notify_push: {
    icon: Bell, label: 'Push-уведомление', color: 'text-amber-400',
    fields: [
      { key: 'to', label: 'Кому', type: 'select', options: ['Исполнитель', 'Автор', 'Все участники'] },
      { key: 'title', label: 'Заголовок', type: 'text' },
    ],
  },
  change_assignee: {
    icon: UserCheck, label: 'Сменить исполнителя', color: 'text-violet-400',
    fields: [
      { key: 'assignee', label: 'Назначить', type: 'select', options: ['Автор задачи', 'Руководитель', 'Следующий в очереди', 'Ревьюер'] },
    ],
  },
  create_subtask: {
    icon: FileText, label: 'Создать подзадачу', color: 'text-emerald-400',
    fields: [
      { key: 'title', label: 'Название', type: 'text' },
      { key: 'template', label: 'Шаблон', type: 'select', options: ['Без шаблона', 'Баг-репорт', 'Фича', 'Тестирование'] },
    ],
  },
  set_priority: {
    icon: Flag, label: 'Установить приоритет', color: 'text-orange-400',
    fields: [
      { key: 'priority', label: 'Приоритет', type: 'select', options: ['Низкий', 'Средний', 'Высокий', 'Критический'] },
    ],
  },
  run_webhook: {
    icon: Webhook, label: 'Вызвать webhook', color: 'text-pink-400',
    fields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'method', label: 'Метод', type: 'select', options: ['POST', 'GET', 'PUT'] },
      { key: 'payload', label: 'Payload (JSON)', type: 'textarea' },
    ],
  },
  send_template: {
    icon: MessageSquare, label: 'Отправить шаблон', color: 'text-teal-400',
    fields: [
      { key: 'template', label: 'Шаблон', type: 'select', options: ['Задача принята', 'Задача отклонена', 'Срок подходит', 'Срок истёк'] },
    ],
  },
  log_event: {
    icon: Database, label: 'Логировать событие', color: 'text-[var(--text-primary)]/50',
    fields: [
      { key: 'level', label: 'Уровень', type: 'select', options: ['info', 'warning', 'error'] },
      { key: 'message', label: 'Сообщение', type: 'text' },
    ],
  },
  auto_assign: {
    icon: Bot, label: 'Авто-назначение', color: 'text-cyan-400',
    fields: [
      { key: 'strategy', label: 'Стратегия', type: 'select', options: ['Round-robin', 'По нагрузке', 'По навыкам', 'Случайный'] },
    ],
  },
  set_deadline: {
    icon: Calendar, label: 'Установить срок', color: 'text-rose-400',
    fields: [
      { key: 'offset', label: 'Через (дней)', type: 'text' },
      { key: 'notify', label: 'Уведомить за', type: 'select', options: ['1 день', '2 дня', '3 дня', '1 неделю'] },
    ],
  },
};

const CONDITION_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
}> = {
  role:           { icon: Shield,   label: 'Проверка роли',        color: 'text-violet-400' },
  field_required: { icon: Tag,      label: 'Обязательные поля',    color: 'text-blue-400' },
  custom_check:   { icon: Code,     label: 'Условный скрипт',      color: 'text-orange-400' },
  assignee_set:   { icon: UserCheck,label: 'Исполнитель назначен', color: 'text-emerald-400' },
};

/* ═══════════════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════════════ */

const MOCK_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-task-default',
    name: 'Жизненный цикл задачи',
    entityKind: 'task',
    description: 'Основной workflow для задач сотрудников',
    isDefault: true,
    updatedAt: '2026-07-28T14:30:00Z',
    nodes: [
      { id: 'n1', label: 'Резерв',           category: 'open',      color: '#3b82f6', iconKey: 'circle', x: 60,   y: 60,  isInitial: true,  description: 'Задача создана, но не готова к выполнению' },
      { id: 'n2', label: 'Готово к выполнению', category: 'open',      color: '#3b82f6', iconKey: 'alert',  x: 360,  y: 60,  description: 'Задача оценена и готова к взятию в работу' },
      { id: 'n3', label: 'В работе',          category: 'progress',  color: '#eab308', iconKey: 'timer',  x: 660,  y: 60,  description: 'Исполнитель работает над задачей' },
      { id: 'n4', label: 'На проверке',       category: 'review',    color: '#8b5cf6', iconKey: 'eye',    x: 960,  y: 60,  description: 'Задача отправлена на ревью' },
      { id: 'n5', label: 'На доработку',      category: 'custom',    color: '#f97316', iconKey: 'alert',  x: 960,  y: 240, description: 'Ревьюер вернул задачу на доработку' },
      { id: 'n6', label: 'На тестировании',   category: 'review',    color: '#06b6d4', iconKey: 'check',  x: 660,  y: 240, description: 'Задача проходит QA' },
      { id: 'n7', label: 'Выполнено',         category: 'done',      color: '#10b981', iconKey: 'check',  x: 360,  y: 240, isTerminal: true, description: 'Задача успешно завершена' },
      { id: 'n8', label: 'Отменено',          category: 'cancelled', color: '#6b7280', iconKey: 'ban',    x: 60,   y: 240, isTerminal: true, description: 'Задача отменена' },
    ],
    transitions: [
      {
        id: 't1', fromId: 'n1', toId: 'n2', label: 'Подготовить',
        conditions: [
          { id: 'c1', type: 'field_required', params: { fields: 'priority,story_points' } },
        ],
        actions: [
          { id: 'a1', type: 'notify_push', label: 'Уведомить о готовности', enabled: true, params: { to: 'Все участники', title: 'Задача готова к выполнению' }, order: 0 },
        ],
      },
      {
        id: 't2', fromId: 'n2', toId: 'n3', label: 'Взять в работу',
        conditions: [
          { id: 'c2', type: 'assignee_set', params: {} },
        ],
        actions: [
          { id: 'a2', type: 'notify_telegram', label: 'TG: задача взята', enabled: true, params: { to: 'Автор', message: '{{assignee}} взял задачу {{task_number}}' }, order: 0 },
          { id: 'a3', type: 'set_deadline', label: 'Установить дедлайн', enabled: true, params: { offset: '7', notify: '2 дня' }, order: 1 },
        ],
      },
      {
        id: 't3', fromId: 'n3', toId: 'n4', label: 'Отправить на ревью',
        conditions: [
          { id: 'c3', type: 'field_required', params: { fields: 'description' } },
        ],
        actions: [
          { id: 'a4', type: 'notify_email', label: 'Email ревьюеру', enabled: true, params: { to: 'Ревьюер', subject: 'Задача {{task_number}} на ревью', body: 'Проверьте задачу: {{task_url}}' }, order: 0 },
        ],
      },
      {
        id: 't4', fromId: 'n4', toId: 'n6', label: 'Принято → Тесты',
        conditions: [],
        actions: [
          { id: 'a5', type: 'auto_assign', label: 'Назначить QA', enabled: true, params: { strategy: 'По нагрузке' }, order: 0 },
        ],
      },
      {
        id: 't5', fromId: 'n4', toId: 'n5', label: 'Вернуть на доработку',
        conditions: [],
        actions: [
          { id: 'a6', type: 'notify_push', label: 'Уведомить исполнителя', enabled: true, params: { to: 'Исполнитель', title: 'Задача возвращена на доработку' }, order: 0 },
        ],
      },
      {
        id: 't6', fromId: 'n5', toId: 'n3', label: 'Доработать',
        conditions: [],
        actions: [],
      },
      {
        id: 't7', fromId: 'n6', toId: 'n7', label: 'Тесты пройдены',
        conditions: [],
        actions: [
          { id: 'a7', type: 'notify_email', label: 'Email автору', enabled: true, params: { to: 'Автор', subject: 'Задача {{task_number}} выполнена', body: 'Задача успешно завершена' }, order: 0 },
          { id: 'a8', type: 'run_webhook', label: 'Webhook в аналитику', enabled: false, params: { url: 'https://analytics.example.com/hook', method: 'POST', payload: '{"event":"task_done","id":"{{task_id}}"}' }, order: 1 },
        ],
      },
      {
        id: 't8', fromId: 'n6', toId: 'n5', label: 'Баг → Доработка',
        conditions: [],
        actions: [
          { id: 'a9', type: 'set_priority', label: 'Повысить приоритет', enabled: false, params: { priority: 'Высокий' }, order: 0 },
        ],
      },
      {
        id: 't9', fromId: 'n1', toId: 'n8', label: 'Отменить',
        conditions: [
          { id: 'c4', type: 'role', params: { role: 'admin,manager' } },
        ],
        actions: [
          { id: 'a10', type: 'log_event', label: 'Лог отмены', enabled: true, params: { level: 'info', message: 'Задача {{task_number}} отменена' }, order: 0 },
        ],
      },
      {
        id: 't10', fromId: 'n2', toId: 'n8', label: 'Отменить',
        conditions: [],
        actions: [],
      },
      {
        id: 't11', fromId: 'n3', toId: 'n7', label: 'Завершить (без ревью)',
        conditions: [
          { id: 'c5', type: 'role', params: { role: 'admin' } },
        ],
        actions: [
          { id: 'a11', type: 'send_template', label: 'Шаблон завершения', enabled: true, params: { template: 'Задача принята' }, order: 0 },
        ],
      },
    ],
  },
  {
    id: 'wf-ticket-default',
    name: 'Жизненный цикл заявки',
    entityKind: 'ticket',
    description: 'Workflow для обращений клиентов',
    isDefault: true,
    updatedAt: '2026-07-25T09:15:00Z',
    nodes: [
      { id: 'tn1', label: 'Новая',           category: 'open',      color: '#3b82f6', iconKey: 'circle', x: 60,   y: 60,  isInitial: true },
      { id: 'tn2', label: 'В работе',        category: 'progress',  color: '#eab308', iconKey: 'timer',  x: 360,  y: 60 },
      { id: 'tn3', label: 'Ожидание клиента', category: 'custom',    color: '#f97316', iconKey: 'clock',  x: 660,  y: 60 },
      { id: 'tn4', label: 'Решена',          category: 'done',      color: '#10b981', iconKey: 'check',  x: 360,  y: 240, isTerminal: true },
      { id: 'tn5', label: 'Закрыта',         category: 'done',      color: '#10b981', iconKey: 'shield', x: 660,  y: 240, isTerminal: true },
      { id: 'tn6', label: 'Отклонена',       category: 'cancelled', color: '#6b7280', iconKey: 'ban',    x: 60,   y: 240, isTerminal: true },
    ],
    transitions: [
      { id: 'tt1', fromId: 'tn1', toId: 'tn2', label: 'Взять', conditions: [{ id: 'tc1', type: 'assignee_set', params: {} }], actions: [{ id: 'ta1', type: 'notify_email', label: 'Email клиенту', enabled: true, params: { to: 'Автор', subject: 'Заявка принята', body: 'Ваша заявка взята в работу' }, order: 0 }] },
      { id: 'tt2', fromId: 'tn2', toId: 'tn3', label: 'Ожидание', conditions: [], actions: [{ id: 'ta2', type: 'notify_email', label: 'Запрос информации', enabled: true, params: { to: 'Автор', subject: 'Нужна дополнительная информация', body: 'Уточните, пожалуйста...' }, order: 0 }] },
      { id: 'tt3', fromId: 'tn3', toId: 'tn2', label: 'Продолжить', conditions: [], actions: [] },
      { id: 'tt4', fromId: 'tn2', toId: 'tn4', label: 'Решить', conditions: [], actions: [{ id: 'ta3', type: 'notify_email', label: 'Email клиенту', enabled: true, params: { to: 'Автор', subject: 'Заявка решена', body: 'Ваша заявка решена' }, order: 0 }] },
      { id: 'tt5', fromId: 'tn4', toId: 'tn5', label: 'Закрыть', conditions: [], actions: [{ id: 'ta4', type: 'log_event', label: 'Лог закрытия', enabled: true, params: { level: 'info', message: 'Заявка закрыта' }, order: 0 }] },
      { id: 'tt6', fromId: 'tn1', toId: 'tn6', label: 'Отклонить', conditions: [{ id: 'tc2', type: 'role', params: { role: 'admin,support_manager' } }], actions: [] },
    ],
  },
  {
    id: 'wf-task-bugfix',
    name: 'Быстрый баг-фикс',
    entityKind: 'task',
    description: 'Упрощённый workflow для срочных багов',
    isDefault: false,
    updatedAt: '2026-07-20T16:45:00Z',
    nodes: [
      { id: 'bn1', label: 'Буг-репорт',    category: 'open',     color: '#ef4444', iconKey: 'alert', x: 60,  y: 60, isInitial: true },
      { id: 'bn2', label: 'Фикс в процессе', category: 'progress', color: '#eab308', iconKey: 'timer', x: 360, y: 60 },
      { id: 'bn3', label: 'Задеплоено',    category: 'done',     color: '#10b981', iconKey: 'check', x: 660, y: 60, isTerminal: true },
    ],
    transitions: [
      { id: 'bt1', fromId: 'bn1', toId: 'bn2', label: 'Взять', conditions: [], actions: [{ id: 'ba1', type: 'notify_telegram', label: 'Алерт в чат', enabled: true, params: { to: 'Канал', message: '🔥 Баг {{task_number}} взят в работу' }, order: 0 }] },
      { id: 'bt2', fromId: 'bn2', toId: 'bn3', label: 'Задеплоено', conditions: [], actions: [{ id: 'ba2', type: 'notify_telegram', label: 'Алерт о деплое', enabled: true, params: { to: 'Канал', message: '✅ Баг {{task_number}} исправлен и задеплоен' }, order: 0 }] },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const uid = () => Math.random().toString(36).slice(2, 10);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function getNodeCenter(n: WfStatusNode) {
  return { cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 };
}

function getEdgePath(from: WfStatusNode, to: WfStatusNode): { path: string; midX: number; midY: number } {
  const fc = getNodeCenter(from);
  const tc = getNodeCenter(to);

  // Determine best exit/entry sides
  const dx = tc.cx - fc.cx;
  const dy = tc.cy - fc.cy;

  let sx: number, sy: number, ex: number, ey: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominant
    if (dx > 0) {
      sx = from.x + NODE_W; sy = fc.cy;
      ex = to.x;            ey = tc.cy;
    } else {
      sx = from.x;       sy = fc.cy;
      ex = to.x + NODE_W; ey = tc.cy;
    }
  } else {
    // Vertical dominant
    if (dy > 0) {
      sx = fc.cx; sy = from.y + NODE_H;
      ex = tc.cx; ey = to.y;
    } else {
      sx = fc.cx; sy = from.y;
      ex = tc.cx; ey = to.y + NODE_H;
    }
  }

  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;

  // Cubic bezier
  let c1x: number, c1y: number, c2x: number, c2y: number;
  if (Math.abs(dx) > Math.abs(dy)) {
    c1x = sx + (ex - sx) * 0.4; c1y = sy;
    c2x = sx + (ex - sx) * 0.6; c2y = ey;
  } else {
    c1x = sx; c1y = sy + (ey - sy) * 0.4;
    c2x = ex; c2y = sy + (ey - sy) * 0.6;
  }

  const path = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
  return { path, midX: mx, midY: my };
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function NodeIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Ic = ICON_MAP[iconKey] || Circle;
  return <Ic className={className} />;
}

function ActionIcon({ type, className }: { type: string; className?: string }) {
  const m = ACTION_META[type];
  if (!m) return <Zap className={className} />;
  const Ic = m.icon;
  return <Ic className={className} />;
}

function CondIcon({ type, className }: { type: string; className?: string }) {
  const m = CONDITION_META[type];
  if (!m) return <Shield className={className} />;
  const Ic = m.icon;
  return <Ic className={className} />;
}

/* ═══════════════════════════════════════════════════════════════════
   WORKFLOW NODE (on canvas)
   ═══════════════════════════════════════════════════════════════════ */

function WfNodeCard({
  node, isSelected, isConnectSource, isConnectTarget,
  onMouseDown, onClick, onConnectStart, onConnectEnd,
  transitionCount,
}: {
  node: WfStatusNode;
  isSelected: boolean;
  isConnectSource: boolean;
  isConnectTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
  onConnectStart: () => void;
  onConnectEnd: () => void;
  transitionCount: { incoming: number; outgoing: number };
}) {
  const cat = CATEGORY_META[node.category];
  const Icon = ICON_MAP[node.iconKey] || Circle;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      onMouseDown={onMouseDown}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`
        absolute select-none cursor-grab active:cursor-grabbing
        bg-[var(--bg-card)] border-2 rounded-2xl overflow-hidden
        transition-shadow duration-200
        ${isSelected
          ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-ring)]'
          : isConnectTarget
            ? 'border-emerald-500/50 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
            : `${cat.border} hover:shadow-lg`
        }
        ${isConnectSource ? 'ring-2 ring-[var(--accent)]/30' : ''}
      `}
      style={{
        left: node.x, top: node.y, width: NODE_W, height: NODE_H,
        zIndex: isSelected ? 20 : 10,
      }}
    >
      {/* Top color bar */}
      <div className="h-1 w-full" style={{ backgroundColor: node.color }} />

      <div className="px-3.5 py-2.5 flex items-center gap-3 h-[calc(100%-4px)]">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.bg}`}>
          <Icon className={`w-4.5 h-4.5 ${cat.text}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {node.isInitial && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Начальный статус" />
            )}
            <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
              {node.label}
            </h4>
            {node.isTerminal && (
              <Lock className="w-3 h-3 text-[var(--text-primary)]/25 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] ${cat.text}`}>
              {CATEGORY_LABELS[node.category]}
            </span>
            <span className="text-[11px] text-[var(--text-primary)]/25">
              {transitionCount.outgoing}→  {transitionCount.incoming}←
            </span>
          </div>
        </div>

        {/* Connect handle (right side) */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); onConnectStart(); }}
          onMouseUp={(e) => { e.stopPropagation(); onConnectEnd(); }}
          className={`
            w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
            transition-all cursor-crosshair
            ${isConnectSource
              ? 'border-[var(--accent)] bg-[var(--accent)]/20 scale-110'
              : 'border-[var(--border-color)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10'
            }
          `}
          title="Перетащите для создания перехода"
        >
          <Plus className="w-3 h-3 text-[var(--text-primary)]/40" />
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EDGE ON CANVAS
   ═══════════════════════════════════════════════════════════════════ */

function WfEdgePath({
  transition, fromNode, toNode, isSelected, onClick,
}: {
  transition: WfTransition;
  fromNode: WfStatusNode;
  toNode: WfStatusNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { path, midX, midY } = getEdgePath(fromNode, toNode);
  const toCat = CATEGORY_META[toNode.category];

  return (
    <g>
      {/* Invisible wide path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      />
      {/* Visible path */}
      <path
        d={path}
        fill="none"
        stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'}
        strokeWidth={isSelected ? 2.5 : 1.5}
        strokeDasharray={isSelected ? 'none' : 'none'}
        className="transition-all duration-200"
        markerEnd={isSelected ? 'url(#arrowSelected)' : 'url(#arrow)'}
      />
      {/* Animated flow */}
      {isSelected && (
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
          className="animate-flow"
          opacity={0.5}
        />
      )}
      {/* Label badge */}
      {transition.label && (
        <g
          className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          <rect
            x={midX - 50} y={midY - 12}
            width={100} height={24}
            rx={8}
            fill={isSelected ? 'var(--accent)' : 'var(--bg-card)'}
            stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'}
            strokeWidth={1}
          />
          <text
            x={midX} y={midY + 4}
            textAnchor="middle"
            className="text-[10px] font-medium"
            fill={isSelected ? 'white' : 'var(--text-primary)'}
            opacity={isSelected ? 1 : 0.6}
          >
            {transition.label}
          </text>
        </g>
      )}
      {/* Action count indicator */}
      {transition.actions.length > 0 && (
        <g>
          <circle
            cx={midX + 55} cy={midY}
            r={8}
            fill={isSelected ? 'var(--accent)' : 'var(--hover-3)'}
            stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'}
            strokeWidth={1}
          />
          <text
            x={midX + 55} y={midY + 3.5}
            textAnchor="middle"
            className="text-[9px] font-bold"
            fill="white"
          >
            {transition.actions.length}
          </text>
        </g>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TEMP CONNECTION LINE (while dragging)
   ═══════════════════════════════════════════════════════════════════ */

function TempConnectionLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let c1x: number, c1y: number, c2x: number, c2y: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    c1x = from.x + dx * 0.4; c1y = from.y;
    c2x = from.x + dx * 0.6; c2y = to.y;
  } else {
    c1x = from.x; c1y = from.y + dy * 0.4;
    c2x = to.x;   c2y = from.y + dy * 0.6;
  }

  return (
    <path
      d={`M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={2}
      strokeDasharray="6 4"
      opacity={0.6}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ACTION ITEM (in detail panel)
   ═══════════════════════════════════════════════════════════════════ */

function ActionItem({
  action, onToggle, onRemove, onEdit,
}: {
  action: WfAction;
  onToggle: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const m = ACTION_META[action.type];
  if (!m) return null;
  const Ic = m.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className={`
        group flex items-start gap-3 p-3 rounded-xl border transition-all
        ${action.enabled
          ? 'bg-[var(--hover-1)] border-[var(--border-color)]'
          : 'bg-[var(--hover-2)]/50 border-[var(--border-color)]/50 opacity-60'
        }
      `}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className={`
          mt-0.5 w-8 h-5 rounded-full flex-shrink-0 relative transition-colors
          ${action.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--hover-3)]'}
        `}
      >
        <div className={`
          absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all
          ${action.enabled ? 'left-3.5' : 'left-0.5'}
        `} />
      </button>

      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${action.enabled ? 'bg-[var(--accent)]/10' : 'bg-[var(--hover-2)]'}`}>
        <Ic className={`w-4 h-4 ${action.enabled ? m.color : 'text-[var(--text-primary)]/30'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${action.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'}`}>
          {m.label}
        </p>
        {Object.entries(action.params).slice(0, 2).map(([k, v]) => (
          <p key={k} className="text-[11px] text-[var(--text-primary)]/30 truncate">
            {k}: <span className="text-[var(--text-primary)]/50">{v}</span>
          </p>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/60">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CONDITION ITEM (in detail panel)
   ═══════════════════════════════════════════════════════════════════ */

function ConditionItem({
  condition, onRemove,
}: {
  condition: WfCondition;
  onRemove: () => void;
}) {
  const m = CONDITION_META[condition.type];
  if (!m) return null;
  const Ic = m.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="group flex items-center gap-3 p-2.5 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--hover-2)]`}>
        <Ic className={`w-3.5 h-3.5 ${m.color}`} />
      </div>
      <span className="flex-1 text-sm text-[var(--text-primary)]/70 truncate">{m.label}</span>
      <button onClick={onRemove}
        className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400 transition-all">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ADD ACTION / CONDITION MENU
   ═══════════════════════════════════════════════════════════════════ */

function AddMenu({
  items, onSelect, onClose,
}: {
  items: { type: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[];
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden"
    >
      <div className="p-1.5 max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
        {items.map(item => {
          const Ic = item.icon;
          return (
            <button
              key={item.type}
              onClick={() => { onSelect(item.type); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] transition-colors text-left"
            >
              <Ic className={`w-4 h-4 ${item.color} flex-shrink-0`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DETAIL PANEL — NODE
   ═══════════════════════════════════════════════════════════════════ */

function NodeDetailPanel({
  node, onClose, onUpdate, onDelete,
}: {
  node: WfStatusNode;
  onClose: () => void;
  onUpdate: (n: WfStatusNode) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(node.label);
  const [desc, setDesc] = useState(node.description || '');
  const [category, setCategory] = useState(node.category);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const cat = CATEGORY_META[category];

  const handleSave = () => {
    onUpdate({ ...node, label: label.trim() || node.label, description: desc.trim(), category });
  };

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="w-[380px] flex-shrink-0 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cat.bg}`}>
              <NodeIcon iconKey={node.iconKey} className={`w-4 h-4 ${cat.text}`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Настройка статуса</h3>
              <p className="text-[11px] text-[var(--text-primary)]/40">ID: {node.id}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Color bar */}
        <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: node.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Название</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Описание</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            placeholder="Описание статуса..."
            className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Категория</label>
          <div className="relative">
            <button onClick={() => setShowCatMenu(v => !v)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-sm text-left hover:bg-[var(--hover-3)] transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full ${cat.dot}`} />
              <span className="flex-1 text-[var(--text-primary)]">{CATEGORY_LABELS[category]}</span>
              <ChevronDown className="w-4 h-4 text-[var(--text-primary)]/30" />
            </button>
            {showCatMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCatMenu(false)} />
                <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
                  <div className="p-1">
                    {Object.entries(CATEGORY_LABELS).map(([key, lbl]) => {
                      const cm = CATEGORY_META[key];
                      return (
                        <button key={key} onClick={() => { setCategory(key as any); setShowCatMenu(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                            ${category === key ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}>
                          <span className={`w-2.5 h-2.5 rounded-full ${cm.dot}`} />
                          {lbl}
                          {category === key && <Check className="w-3.5 h-3.5 text-[var(--accent)] ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Flags */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] cursor-pointer hover:bg-[var(--hover-2)] transition-colors">
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors
              ${node.isInitial ? 'bg-emerald-500 border-emerald-600' : 'border-[var(--border-color)]'}`}>
              {node.isInitial && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Начальный статус</p>
              <p className="text-[11px] text-[var(--text-primary)]/40">Задачи создаются сразу в этом статусе</p>
            </div>
            <input type="checkbox" checked={node.isInitial || false}
              onChange={e => onUpdate({ ...node, isInitial: e.target.checked })}
              className="sr-only" />
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] cursor-pointer hover:bg-[var(--hover-2)] transition-colors">
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors
              ${node.isTerminal ? 'bg-emerald-500 border-emerald-600' : 'border-[var(--border-color)]'}`}>
              {node.isTerminal && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Конечный статус</p>
              <p className="text-[11px] text-[var(--text-primary)]/40">Из этого статуса нет переходов</p>
            </div>
            <input type="checkbox" checked={node.isTerminal || false}
              onChange={e => onUpdate({ ...node, isTerminal: e.target.checked })}
              className="sr-only" />
          </label>
        </div>

        {/* Danger zone */}
        <div className="pt-3 border-t border-[var(--border-color)]">
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" /> Удалить статус
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <p className="text-sm font-medium">Удалить «{node.label}»?</p>
              </div>
              <p className="text-[11px] text-[var(--text-primary)]/40">Все переходы к этому статусу будут удалены.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/60 text-sm">
                  Отмена
                </button>
                <button onClick={onDelete}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30">
                  Удалить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-[var(--border-color)] flex-shrink-0">
        <button onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium transition-colors shadow-[var(--shadow-md)]">
          <Save className="w-4 h-4" /> Сохранить изменения
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DETAIL PANEL — TRANSITION
   ═══════════════════════════════════════════════════════════════════ */

function TransitionDetailPanel({
  transition, fromNode, toNode, onClose, onUpdate, onDelete,
}: {
  transition: WfTransition;
  fromNode: WfStatusNode;
  toNode: WfStatusNode;
  onClose: () => void;
  onUpdate: (t: WfTransition) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(transition.label || '');
  const [showAddAction, setShowAddAction] = useState(false);
  const [showAddCond, setShowAddCond] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fromCat = CATEGORY_META[fromNode.category];
  const toCat = CATEGORY_META[toNode.category];

  const addAction = (type: string) => {
    const m = ACTION_META[type];
    const newAction: WfAction = {
      id: uid(), type, label: m?.label || type, enabled: true,
      params: {}, order: transition.actions.length,
    };
    onUpdate({ ...transition, actions: [...transition.actions, newAction] });
  };

  const addCondition = (type: string) => {
    const newCond: WfCondition = { id: uid(), type, params: {} };
    onUpdate({ ...transition, conditions: [...transition.conditions, newCond] });
  };

  const toggleAction = (id: string) => {
    onUpdate({
      ...transition,
      actions: transition.actions.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a),
    });
  };

  const removeAction = (id: string) => {
    onUpdate({ ...transition, actions: transition.actions.filter(a => a.id !== id) });
  };

  const removeCondition = (id: string) => {
    onUpdate({ ...transition, conditions: transition.conditions.filter(c => c.id !== id) });
  };

  const handleSave = () => {
    onUpdate({ ...transition, label: label.trim() });
  };

  const actionItems = Object.entries(ACTION_META).map(([type, m]) => ({
    type, label: m.label, icon: m.icon, color: m.color,
  }));

  const condItems = Object.entries(CONDITION_META).map(([type, m]) => ({
    type, label: m.label, icon: m.icon, color: m.color,
  }));

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="w-[420px] flex-shrink-0 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Настройка перехода</h3>
              <p className="text-[11px] text-[var(--text-primary)]/40">ID: {transition.id}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* From → To */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${fromCat.chip}`}>
            <span className={`w-2 h-2 rounded-full ${fromCat.dot}`} />
            <span className="text-xs font-medium">{fromNode.label}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0" />
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${toCat.chip}`}>
            <span className={`w-2 h-2 rounded-full ${toCat.dot}`} />
            <span className="text-xs font-medium">{toNode.label}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
        {/* Label */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Название перехода</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Например: «Взять в работу»"
            className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
          />
        </div>

        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--text-primary)]/40" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Условия</h4>
              {transition.conditions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50">
                  {transition.conditions.length}
                </span>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setShowAddCond(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">
                <Plus className="w-3 h-3" /> Добавить
              </button>
              <AnimatePresence>
                {showAddCond && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-56">
                    <AddMenu items={condItems} onSelect={addCondition} onClose={() => setShowAddCond(false)} />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {transition.conditions.length === 0 ? (
                <div className="py-4 text-center border-2 border-dashed border-[var(--border-color)] rounded-xl">
                  <p className="text-[11px] text-[var(--text-primary)]/30">Без ограничений — любой пользователь</p>
                </div>
              ) : (
                transition.conditions.map(c => (
                  <ConditionItem key={c.id} condition={c} onRemove={() => removeCondition(c.id)} />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--text-primary)]/40" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Действия</h4>
              {transition.actions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50">
                  {transition.actions.length}
                </span>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setShowAddAction(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">
                <Plus className="w-3 h-3" /> Добавить
              </button>
              <AnimatePresence>
                {showAddAction && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-64">
                    <AddMenu items={actionItems} onSelect={addAction} onClose={() => setShowAddAction(false)} />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {transition.actions.length === 0 ? (
                <div className="py-6 text-center border-2 border-dashed border-[var(--border-color)] rounded-xl">
                  <Zap className="w-5 h-5 text-[var(--text-primary)]/10 mx-auto mb-1.5" />
                  <p className="text-[11px] text-[var(--text-primary)]/30">Нет действий после перехода</p>
                </div>
              ) : (
                transition.actions.map(a => (
                  <ActionItem
                    key={a.id} action={a}
                    onToggle={() => toggleAction(a.id)}
                    onRemove={() => removeAction(a.id)}
                    onEdit={() => {}}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Danger zone */}
        <div className="pt-3 border-t border-[var(--border-color)]">
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors">
              <Unlink className="w-4 h-4" /> Удалить переход
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <p className="text-sm font-medium">Удалить этот переход?</p>
              </div>
              <p className="text-[11px] text-[var(--text-primary)]/40">
                Переход «{fromNode.label}» → «{toNode.label}» будет удалён.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/60 text-sm">
                  Отмена
                </button>
                <button onClick={onDelete}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30">
                  Удалить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-[var(--border-color)] flex-shrink-0">
        <button onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium transition-colors shadow-[var(--shadow-md)]">
          <Save className="w-4 h-4" /> Сохранить переход
        </button>
      </div>
    </motion.div>
  );
}
/* ═══════════════════════════════════════════════════════════════════
   CREATE WORKFLOW MODAL
   ═══════════════════════════════════════════════════════════════════ */

function CreateWorkflowModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (wf: Partial<Workflow>) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WfEntityKind>('task');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      entityKind: kind,
      description: desc.trim() || undefined,
      nodes: [
        {
          id: uid(), label: 'Новый', category: 'open', color: '#3b82f6',
          iconKey: 'circle', x: 60, y: 60, isInitial: true,
        },
        {
          id: uid(), label: 'Выполнено', category: 'done', color: '#10b981',
          iconKey: 'check', x: 360, y: 60, isTerminal: true,
        },
      ],
      transitions: [],
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose()} />
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
              <Workflow className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Новый рабочий процесс</h2>
              <p className="text-sm text-[var(--text-primary)]/40">Создайте workflow с нуля</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
              Название <span className="text-[var(--accent)]">*</span>
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Например: Жизненный цикл задачи" autoFocus
              className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Описание</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Описание рабочего процесса..." rows={3}
              className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-base placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">Тип сущности</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'task' as const, label: 'Задачи', icon: Layers, desc: 'Для задач сотрудников' },
                { value: 'ticket' as const, label: 'Заявки', icon: Ticket, desc: 'Для обращений клиентов' },
              ]).map(opt => {
                const Ic = opt.icon;
                return (
                  <button key={opt.value} onClick={() => setKind(opt.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border
                      ${kind === opt.value
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--text-primary)]'
                        : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'}`}>
                    <Ic className={`w-5 h-5 flex-shrink-0 ${kind === opt.value ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/30'}`} />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[11px] text-[var(--text-primary)]/40">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-base">
            Отмена
          </button>
          <button onClick={submit} disabled={!name.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-base font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
            <Plus className="w-4 h-4" /> Создать
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS — MAIN GRAPH VIEW
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowCanvas({
  workflow,
  selectedNodeId,
  selectedTransitionId,
  connectingFrom,
  onSelectNode,
  onSelectTransition,
  onNodeMove,
  onConnectStart,
  onConnectEnd,
  onConnectComplete,
  tempConnectPos,
}: {
  workflow: Workflow;
  selectedNodeId: string | null;
  selectedTransitionId: string | null;
  connectingFrom: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectTransition: (id: string | null) => void;
  onNodeMove: (id: string, x: number, y: number) => void;
  onConnectStart: (nodeId: string) => void;
  onConnectEnd: () => void;
  onConnectComplete: (fromId: string, toId: string) => void;
  tempConnectPos: { x: number; y: number } | null;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const nodeMap = useMemo(() => {
    const m = new Map<string, WfStatusNode>();
    workflow.nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [workflow.nodes]);

  const transitionCounts = useMemo(() => {
    const counts = new Map<string, { incoming: number; outgoing: number }>();
    workflow.nodes.forEach(n => counts.set(n.id, { incoming: 0, outgoing: 0 }));
    workflow.transitions.forEach(t => {
      const from = counts.get(t.fromId);
      const to = counts.get(t.toId);
      if (from) from.outgoing++;
      if (to) to.incoming++;
    });
    return counts;
  }, [workflow.nodes, workflow.transitions]);

  // Node drag
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: WfStatusNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragging({
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: node.x,
      offsetY: node.y,
    });
  }, []);

  // Canvas pan
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('[data-canvas-bg]')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    onSelectNode(null);
    onSelectTransition(null);
  }, [pan, onSelectNode, onSelectTransition]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragging.startX) / zoom;
      const dy = (e.clientY - dragging.startY) / zoom;
      onNodeMove(dragging.id, Math.max(0, dragging.offsetX + dx), Math.max(0, dragging.offsetY + dy));
    };
    const handleUp = () => setDragging(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, zoom, onNodeMove]);

  useEffect(() => {
    if (!isPanning) return;
    const handleMove = (e: MouseEvent) => {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handleUp = () => setIsPanning(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isPanning, panStart]);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(z => clamp(z + delta, 0.3, 2));
  }, []);

  // Temp connection line
  const connectFromNode = connectingFrom ? nodeMap.get(connectingFrom) : null;
  const connectFromCenter = connectFromNode
    ? { x: connectFromNode.x + NODE_W, y: connectFromNode.y + NODE_H / 2 }
    : null;

  return (
    <div
      ref={canvasRef}
      className="flex-1 relative overflow-hidden bg-[var(--bg-main)]"
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'default' }}
    >
      {/* Grid background */}
      <div
        data-canvas-bg
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, var(--border-color) 1px, transparent 1px)
          `,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Transform container */}
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG layer for edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-color)" />
            </marker>
            <marker id="arrowSelected" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* Edges */}
          {workflow.transitions.map(t => {
            const from = nodeMap.get(t.fromId);
            const to = nodeMap.get(t.toId);
            if (!from || !to) return null;
            return (
              <WfEdgePath
                key={t.id}
                transition={t}
                fromNode={from}
                toNode={to}
                isSelected={selectedTransitionId === t.id}
                onClick={() => { onSelectTransition(t.id); onSelectNode(null); }}
              />
            );
          })}

          {/* Temp connection line */}
          {connectFromCenter && tempConnectPos && (
            <TempConnectionLine from={connectFromCenter} to={tempConnectPos} />
          )}
        </svg>

        {/* Nodes */}
        <AnimatePresence>
          {workflow.nodes.map(node => (
            <WfNodeCard
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isConnectSource={connectingFrom === node.id}
              isConnectTarget={connectingFrom !== null && connectingFrom !== node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onClick={() => { onSelectNode(node.id); onSelectTransition(null); }}
              onConnectStart={() => onConnectStart(node.id)}
              onConnectEnd={() => onConnectEnd()}
              transitionCount={transitionCounts.get(node.id) || { incoming: 0, outgoing: 0 }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-1 shadow-[var(--shadow-md)]">
        <button onClick={() => setZoom(z => clamp(z - 0.15, 0.3, 2))}
          className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-colors">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs font-medium text-[var(--text-primary)]/50 tabular-nums min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => clamp(z + 0.15, 0.3, 2))}
          className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-colors">
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-[var(--border-color)]" />
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-2 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] transition-colors"
          title="Сбросить вид">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas hint */}
      <div className="absolute bottom-4 left-4 flex items-center gap-3 text-[11px] text-[var(--text-primary)]/25">
        <span>Перетаскивайте ноды</span>
        <span>•</span>
        <span>Зажмите фон для панорамы</span>
        <span>•</span>
        <span>Колёсико — зум</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR — WORKFLOW LIST
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowSidebar({
  workflows,
  activeId,
  onSelect,
  onCreate,
  onToggleDefault,
}: {
  workflows: Workflow[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggleDefault: (id: string) => void;
}) {
  const taskWfs = workflows.filter(w => w.entityKind === 'task');
  const ticketWfs = workflows.filter(w => w.entityKind === 'ticket');

  return (
    <div className="w-[280px] flex-shrink-0 h-full bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[var(--border-color)] flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Рабочие процессы</h2>
          <button onClick={onCreate}
            className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-primary)]/40">{workflows.length} процессов</p>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
        {/* Tasks */}
        <div>
          <div className="flex items-center gap-2 px-1 mb-2">
            <Layers className="w-3.5 h-3.5 text-[var(--text-primary)]/30" />
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-primary)]/30 font-semibold">Задачи</span>
            <span className="text-[10px] text-[var(--text-primary)]/20 ml-auto">{taskWfs.length}</span>
          </div>
          <div className="space-y-1">
            {taskWfs.map(wf => (
              <WorkflowListItem
                key={wf.id} wf={wf} isActive={activeId === wf.id}
                onClick={() => onSelect(wf.id)}
                onToggleDefault={() => onToggleDefault(wf.id)}
              />
            ))}
          </div>
        </div>

        {/* Tickets */}
        <div>
          <div className="flex items-center gap-2 px-1 mb-2">
            <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/30" />
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-primary)]/30 font-semibold">Заявки</span>
            <span className="text-[10px] text-[var(--text-primary)]/20 ml-auto">{ticketWfs.length}</span>
          </div>
          <div className="space-y-1">
            {ticketWfs.map(wf => (
              <WorkflowListItem
                key={wf.id} wf={wf} isActive={activeId === wf.id}
                onClick={() => onSelect(wf.id)}
                onToggleDefault={() => onToggleDefault(wf.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowListItem({
  wf, isActive, onClick, onToggleDefault,
}: {
  wf: Workflow;
  isActive: boolean;
  onClick: () => void;
  onToggleDefault: () => void;
}) {
  const EntityIcon = wf.entityKind === 'task' ? Layers : Ticket;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2.5 rounded-xl transition-all group
        ${isActive
          ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/20'
          : 'hover:bg-[var(--hover-2)] border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          ${isActive ? 'bg-[var(--accent)]/15' : 'bg-[var(--hover-2)]'}`}>
          <EntityIcon className={`w-4 h-4 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/30'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium truncate ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/70'}`}>
              {wf.name}
            </p>
            {wf.isDefault && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                DEF
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-primary)]/30 mt-0.5">
            {wf.nodes.length} статусов · {wf.transitions.length} переходов
          </p>
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOP TOOLBAR
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowToolbar({
  workflow,
  onAddNode,
  onSave,
  saving,
}: {
  workflow: Workflow;
  onAddNode: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const EntityIcon = workflow.entityKind === 'task' ? Layers : Ticket;

  return (
    <div className="h-[56px] flex-shrink-0 bg-[var(--bg-card)] border-b border-[var(--border-color)] flex items-center justify-between px-5">
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <EntityIcon className="w-4 h-4 text-[var(--text-primary)]/30" />
          <h2 className="text-base font-bold text-[var(--text-primary)]">{workflow.name}</h2>
          {workflow.isDefault && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              По умолчанию
            </span>
          )}
        </div>
        {workflow.description && (
          <span className="text-sm text-[var(--text-primary)]/30 hidden lg:block">
            — {workflow.description}
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button onClick={onAddNode}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/60 text-sm font-medium hover:bg-[var(--hover-3)] hover:text-[var(--text-primary)] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Статус
        </button>

        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-sm font-medium disabled:opacity-40 transition-colors shadow-[var(--shadow-md)]">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function WorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(MOCK_WORKFLOWS);
  const [activeWfId, setActiveWfId] = useState(MOCK_WORKFLOWS[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tempConnectPos, setTempConnectPos] = useState<{ x: number; y: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ title: string; description?: string } | null>(null);

  const activeWf = workflows.find(w => w.id === activeWfId) || workflows[0];

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
    setTimeout(() => setToast(null), 3000);
  };

  // Update workflow helper
  const updateActiveWf = useCallback((updater: (wf: Workflow) => Workflow) => {
    setWorkflows(prev => prev.map(w => w.id === activeWfId ? updater(w) : w));
  }, [activeWfId]);

  // Node operations
  const handleNodeMove = useCallback((id: string, x: number, y: number) => {
    updateActiveWf(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === id ? { ...n, x, y } : n),
    }));
  }, [updateActiveWf]);

  const handleAddNode = useCallback(() => {
    const newNode: WfStatusNode = {
      id: uid(),
      label: 'Новый статус',
      category: 'custom',
      color: '#f97316',
      iconKey: 'circle',
      x: 200 + Math.random() * 300,
      y: 150 + Math.random() * 200,
    };
    updateActiveWf(wf => ({ ...wf, nodes: [...wf.nodes, newNode] }));
    setSelectedNodeId(newNode.id);
    setSelectedTransitionId(null);
  }, [updateActiveWf]);

  const handleUpdateNode = useCallback((node: WfStatusNode) => {
    updateActiveWf(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === node.id ? node : n),
    }));
    showToast('Статус обновлён');
  }, [updateActiveWf]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    updateActiveWf(wf => ({
      ...wf,
      nodes: wf.nodes.filter(n => n.id !== nodeId),
      transitions: wf.transitions.filter(t => t.fromId !== nodeId && t.toId !== nodeId),
    }));
    setSelectedNodeId(null);
    showToast('Статус удалён');
  }, [updateActiveWf]);

  // Transition operations
  const handleUpdateTransition = useCallback((transition: WfTransition) => {
    updateActiveWf(wf => ({
      ...wf,
      transitions: wf.transitions.map(t => t.id === transition.id ? transition : t),
    }));
    showToast('Переход обновлён');
  }, [updateActiveWf]);

  const handleDeleteTransition = useCallback((transitionId: string) => {
    updateActiveWf(wf => ({
      ...wf,
      transitions: wf.transitions.filter(t => t.id !== transitionId),
    }));
    setSelectedTransitionId(null);
    showToast('Переход удалён');
  }, [updateActiveWf]);

  // Connection
  const handleConnectStart = useCallback((nodeId: string) => {
    setConnectingFrom(nodeId);
  }, []);

  const handleConnectEnd = useCallback(() => {
    setConnectingFrom(null);
    setTempConnectPos(null);
  }, []);

  const handleConnectComplete = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    // Check if transition already exists
    const exists = activeWf.transitions.some(t => t.fromId === fromId && t.toId === toId);
    if (exists) {
      showToast('Переход уже существует');
      return;
    }

    const newTransition: WfTransition = {
      id: uid(),
      fromId,
      toId,
      label: '',
      conditions: [],
      actions: [],
    };
    updateActiveWf(wf => ({ ...wf, transitions: [...wf.transitions, newTransition] }));
    setSelectedTransitionId(newTransition.id);
    setSelectedNodeId(null);
    showToast('Переход создан');
  }, [activeWf.transitions, updateActiveWf]);

  // Mouse move for temp connection
  useEffect(() => {
    if (!connectingFrom) return;
    const handleMove = (e: MouseEvent) => {
      // Convert screen coords to canvas coords (simplified)
      setTempConnectPos({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('mousemove', handleMove);
    return () => document.removeEventListener('mousemove', handleMove);
  }, [connectingFrom]);

  // Save
  const handleSave = useCallback(() => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      showToast('Рабочий процесс сохранён', 'Все изменения успешно применены');
    }, 800);
  }, []);

  // Create new workflow
  const handleCreateWorkflow = useCallback((partial: Partial<Workflow>) => {
    const newWf: Workflow = {
      id: uid(),
      name: partial.name || 'Новый процесс',
      entityKind: partial.entityKind || 'task',
      description: partial.description,
      nodes: partial.nodes || [],
      transitions: partial.transitions || [],
      isDefault: false,
      updatedAt: new Date().toISOString(),
    };
    setWorkflows(prev => [...prev, newWf]);
    setActiveWfId(newWf.id);
    setShowCreateModal(false);
    showToast('Рабочий процесс создан');
  }, []);

  // Toggle default
  const handleToggleDefault = useCallback((id: string) => {
    setWorkflows(prev => prev.map(w => {
      if (w.entityKind !== activeWf.entityKind) return w;
      return { ...w, isDefault: w.id === id };
    }));
    showToast('Настройки обновлены');
  }, [activeWf.entityKind]);

  // Selected items
  const selectedNode = selectedNodeId ? activeWf.nodes.find(n => n.id === selectedNodeId) : null;
  const selectedTransition = selectedTransitionId ? activeWf.transitions.find(t => t.id === selectedTransitionId) : null;
  const selectedTransitionFrom = selectedTransition ? activeWf.nodes.find(n => n.id === selectedTransition.fromId) : null;
  const selectedTransitionTo = selectedTransition ? activeWf.nodes.find(n => n.id === selectedTransition.toId) : null;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-[var(--bg-main)] animate-in fade-in duration-500">
      {/* Sidebar + Main */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <WorkflowSidebar
          workflows={workflows}
          activeId={activeWfId}
          onSelect={setActiveWfId}
          onCreate={() => setShowCreateModal(true)}
          onToggleDefault={handleToggleDefault}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <WorkflowToolbar
            workflow={activeWf}
            onAddNode={handleAddNode}
            onSave={handleSave}
            saving={saving}
          />

          {/* Canvas + Detail panel */}
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <WorkflowCanvas
              workflow={activeWf}
              selectedNodeId={selectedNodeId}
              selectedTransitionId={selectedTransitionId}
              connectingFrom={connectingFrom}
              onSelectNode={setSelectedNodeId}
              onSelectTransition={setSelectedTransitionId}
              onNodeMove={handleNodeMove}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              onConnectComplete={handleConnectComplete}
              tempConnectPos={tempConnectPos}
            />

            {/* Right detail panel */}
            <AnimatePresence mode="wait">
              {selectedNode && (
                <NodeDetailPanel
                  key={`node-${selectedNode.id}`}
                  node={selectedNode}
                  onClose={() => setSelectedNodeId(null)}
                  onUpdate={handleUpdateNode}
                  onDelete={() => handleDeleteNode(selectedNode.id)}
                />
              )}
              {selectedTransition && selectedTransitionFrom && selectedTransitionTo && (
                <TransitionDetailPanel
                  key={`trans-${selectedTransition.id}`}
                  transition={selectedTransition}
                  fromNode={selectedTransitionFrom}
                  toNode={selectedTransitionTo}
                  onClose={() => setSelectedTransition(null)}
                  onUpdate={handleUpdateTransition}
                  onDelete={() => handleDeleteTransition(selectedTransition.id)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateWorkflow}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] px-5 py-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{toast.title}</p>
              {toast.description && (
                <p className="text-[11px] text-[var(--text-primary)]/40">{toast.description}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}