// pages/WorkflowPage.tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
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
    Loader2,
    Play, Pause, StopCircle,
    Flag, Tag, Code, Star,
    Minimize2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

type WfEntityKind = 'task' | 'ticket';
type NodeCategory = 'open' | 'progress' | 'review' | 'done' | 'cancelled' | 'custom';

interface WfStatusNode {
    id: string;
    label: string;
    description?: string;
    category: NodeCategory;
    color: string;
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

type ActionType =
    | 'notify_email' | 'notify_telegram' | 'notify_push' | 'change_assignee'
    | 'create_subtask' | 'set_priority' | 'run_webhook' | 'send_template'
    | 'log_event' | 'auto_assign' | 'set_deadline';

interface WfAction {
    id: string;
    type: ActionType;
    label: string;
    enabled: boolean;
    params: Record<string, string>;
    order: number;
}

interface WorkflowData {
    id: string;
    name: string;
    entityKind: WfEntityKind;
    description?: string;
    nodes: WfStatusNode[];
    transitions: WfTransition[];
    isDefault: boolean;
    updatedAt: string;
}

interface ToastData {
    title: string;
    description?: string;
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const NODE_W = 220;
const NODE_H = 88;
const CANVAS_SIZE = 6000;
// Минимальное расстояние перетаскивания (px) чтобы считать действие "drag", а не "click"
const DRAG_THRESHOLD = 5;

const CATEGORY_META: Record<NodeCategory, {
    bg: string; border: string; text: string; dot: string; chip: string;
}> = {
    open: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400', chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    progress: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-400', chip: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    review: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400', dot: 'bg-violet-400', chip: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
    done: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    cancelled: { bg: 'bg-neutral-500/10', border: 'border-neutral-500/30', text: 'text-neutral-400', dot: 'bg-neutral-400', chip: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30' },
    custom: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-400', chip: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
};

const CATEGORY_LABELS: Record<NodeCategory, string> = {
    open: 'Начальный', progress: 'В работе', review: 'Проверка',
    done: 'Завершён', cancelled: 'Отменён', custom: 'Другой',
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    circle: Circle, timer: Timer, eye: Eye, alert: AlertCircle,
    check: CheckCircle2, ban: Ban, rotate: RotateCcw, clock: Clock,
    play: Play, pause: Pause, stop: StopCircle, target: Target,
    flag: Flag, star: Star, shield: Shield,
};

const ACTION_META: Record<ActionType, {
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
        icon: Database, label: 'Логировать событие', color: 'text-neutral-400',
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

const CONDITION_META: Record<WfCondition['type'], {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
}> = {
    role: { icon: Shield, label: 'Проверка роли', color: 'text-violet-400' },
    field_required: { icon: Tag, label: 'Обязательные поля', color: 'text-blue-400' },
    custom_check: { icon: Code, label: 'Условный скрипт', color: 'text-orange-400' },
    assignee_set: { icon: UserCheck, label: 'Исполнитель назначен', color: 'text-emerald-400' },
};

/* ═══════════════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════════════ */

const MOCK_WORKFLOWS: WorkflowData[] = [
    {
        id: 'wf-task-default',
        name: 'Жизненный цикл задачи',
        entityKind: 'task',
        description: 'Основной workflow для задач сотрудников',
        isDefault: true,
        updatedAt: '2026-07-28T14:30:00Z',
        nodes: [
            { id: 'n1', label: 'Резерв', category: 'open', color: '#3b82f6', iconKey: 'circle', x: 80, y: 80, isInitial: true, description: 'Задача создана, но не готова к выполнению' },
            { id: 'n2', label: 'Готово к выполнению', category: 'open', color: '#3b82f6', iconKey: 'alert', x: 380, y: 80, description: 'Задача оценена и готова к взятию в работу' },
            { id: 'n3', label: 'В работе', category: 'progress', color: '#eab308', iconKey: 'timer', x: 680, y: 80, description: 'Исполнитель работает над задачей' },
            { id: 'n4', label: 'На проверке', category: 'review', color: '#8b5cf6', iconKey: 'eye', x: 980, y: 80, description: 'Задача отправлена на ревью' },
            { id: 'n5', label: 'На доработку', category: 'custom', color: '#f97316', iconKey: 'alert', x: 980, y: 260, description: 'Ревьюер вернул задачу на доработку' },
            { id: 'n6', label: 'На тестировании', category: 'review', color: '#06b6d4', iconKey: 'check', x: 680, y: 260, description: 'Задача проходит QA' },
            { id: 'n7', label: 'Выполнено', category: 'done', color: '#10b981', iconKey: 'check', x: 380, y: 260, isTerminal: true, description: 'Задача успешно завершена' },
            { id: 'n8', label: 'Отменено', category: 'cancelled', color: '#6b7280', iconKey: 'ban', x: 80, y: 260, isTerminal: true, description: 'Задача отменена' },
        ],
        transitions: [
            { id: 't1', fromId: 'n1', toId: 'n2', label: 'Подготовить', conditions: [{ id: 'c1', type: 'field_required', params: { fields: 'priority,story_points' } }], actions: [{ id: 'a1', type: 'notify_push', label: 'Уведомить о готовности', enabled: true, params: { to: 'Все участники', title: 'Задача готова к выполнению' }, order: 0 }] },
            { id: 't2', fromId: 'n2', toId: 'n3', label: 'Взять в работу', conditions: [{ id: 'c2', type: 'assignee_set', params: {} }], actions: [{ id: 'a2', type: 'notify_telegram', label: 'TG: задача взята', enabled: true, params: { to: 'Автор', message: '{{assignee}} взял задачу {{task_number}}' }, order: 0 }, { id: 'a3', type: 'set_deadline', label: 'Установить дедлайн', enabled: true, params: { offset: '7', notify: '2 дня' }, order: 1 }] },
            { id: 't3', fromId: 'n3', toId: 'n4', label: 'На ревью', conditions: [{ id: 'c3', type: 'field_required', params: { fields: 'description' } }], actions: [{ id: 'a4', type: 'notify_email', label: 'Email ревьюеру', enabled: true, params: { to: 'Ревьюер', subject: 'Задача на ревью', body: 'Проверьте задачу' }, order: 0 }] },
            { id: 't4', fromId: 'n4', toId: 'n6', label: 'Принято → Тесты', conditions: [], actions: [{ id: 'a5', type: 'auto_assign', label: 'Назначить QA', enabled: true, params: { strategy: 'По нагрузке' }, order: 0 }] },
            { id: 't5', fromId: 'n4', toId: 'n5', label: 'На доработку', conditions: [], actions: [{ id: 'a6', type: 'notify_push', label: 'Уведомить исполнителя', enabled: true, params: { to: 'Исполнитель', title: 'Задача возвращена' }, order: 0 }] },
            { id: 't6', fromId: 'n5', toId: 'n3', label: 'Доработать', conditions: [], actions: [] },
            { id: 't7', fromId: 'n6', toId: 'n7', label: 'Тесты пройдены', conditions: [], actions: [{ id: 'a7', type: 'notify_email', label: 'Email автору', enabled: true, params: { to: 'Автор', subject: 'Выполнена', body: 'Готово' }, order: 0 }] },
            { id: 't8', fromId: 'n6', toId: 'n5', label: 'Баг', conditions: [], actions: [] },
            { id: 't9', fromId: 'n1', toId: 'n8', label: 'Отменить', conditions: [{ id: 'c4', type: 'role', params: { role: 'admin,manager' } }], actions: [{ id: 'a10', type: 'log_event', label: 'Лог отмены', enabled: true, params: { level: 'info', message: 'Отменено' }, order: 0 }] },
            { id: 't10', fromId: 'n2', toId: 'n8', label: 'Отменить', conditions: [], actions: [] },
            { id: 't11', fromId: 'n3', toId: 'n7', label: 'Быстро', conditions: [{ id: 'c5', type: 'role', params: { role: 'admin' } }], actions: [] },
        ],
    },
    {
        id: 'wf-ticket-default',
        name: 'Жизненный цикл заявки',
        entityKind: 'ticket',
        description: 'Workflow для обращений',
        isDefault: true,
        updatedAt: '2026-07-25T09:15:00Z',
        nodes: [
            { id: 'tn1', label: 'Новая', category: 'open', color: '#3b82f6', iconKey: 'circle', x: 80, y: 80, isInitial: true },
            { id: 'tn2', label: 'В работе', category: 'progress', color: '#eab308', iconKey: 'timer', x: 380, y: 80 },
            { id: 'tn3', label: 'Ожидание клиента', category: 'custom', color: '#f97316', iconKey: 'clock', x: 680, y: 80 },
            { id: 'tn4', label: 'Решена', category: 'done', color: '#10b981', iconKey: 'check', x: 380, y: 260, isTerminal: true },
            { id: 'tn5', label: 'Закрыта', category: 'done', color: '#10b981', iconKey: 'shield', x: 680, y: 260, isTerminal: true },
            { id: 'tn6', label: 'Отклонена', category: 'cancelled', color: '#6b7280', iconKey: 'ban', x: 80, y: 260, isTerminal: true },
        ],
        transitions: [
            { id: 'tt1', fromId: 'tn1', toId: 'tn2', label: 'Взять', conditions: [{ id: 'tc1', type: 'assignee_set', params: {} }], actions: [{ id: 'ta1', type: 'notify_email', label: 'Email', enabled: true, params: { to: 'Автор', subject: 'Принята', body: 'Взята в работу' }, order: 0 }] },
            { id: 'tt2', fromId: 'tn2', toId: 'tn3', label: 'Ожидание', conditions: [], actions: [] },
            { id: 'tt3', fromId: 'tn3', toId: 'tn2', label: 'Продолжить', conditions: [], actions: [] },
            { id: 'tt4', fromId: 'tn2', toId: 'tn4', label: 'Решить', conditions: [], actions: [] },
            { id: 'tt5', fromId: 'tn4', toId: 'tn5', label: 'Закрыть', conditions: [], actions: [] },
            { id: 'tt6', fromId: 'tn1', toId: 'tn6', label: 'Отклонить', conditions: [{ id: 'tc2', type: 'role', params: { role: 'admin' } }], actions: [] },
        ],
    },
    {
        id: 'wf-task-bugfix',
        name: 'Быстрый баг-фикс',
        entityKind: 'task',
        description: 'Упрощённый workflow',
        isDefault: false,
        updatedAt: '2026-07-20T16:45:00Z',
        nodes: [
            { id: 'bn1', label: 'Буг-репорт', category: 'open', color: '#ef4444', iconKey: 'alert', x: 80, y: 80, isInitial: true },
            { id: 'bn2', label: 'Фикс в процессе', category: 'progress', color: '#eab308', iconKey: 'timer', x: 380, y: 80 },
            { id: 'bn3', label: 'Задеплоено', category: 'done', color: '#10b981', iconKey: 'check', x: 680, y: 80, isTerminal: true },
        ],
        transitions: [
            { id: 'bt1', fromId: 'bn1', toId: 'bn2', label: 'Взять', conditions: [], actions: [{ id: 'ba1', type: 'notify_telegram', label: 'Алерт', enabled: true, params: { to: 'Канал', message: '🔥 Баг взят' }, order: 0 }] },
            { id: 'bt2', fromId: 'bn2', toId: 'bn3', label: 'Задеплоено', conditions: [], actions: [{ id: 'ba2', type: 'notify_telegram', label: 'Деплой', enabled: true, params: { to: 'Канал', message: '✅ Исправлен' }, order: 0 }] },
        ],
    },
];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function getNodeCenter(n: WfStatusNode) {
    return { cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 };
}

function getEdgePath(from: WfStatusNode, to: WfStatusNode) {
    const fc = getNodeCenter(from);
    const tc = getNodeCenter(to);
    const dx = tc.cx - fc.cx;
    const dy = tc.cy - fc.cy;

    let sx: number, sy: number, ex: number, ey: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) { sx = from.x + NODE_W; sy = fc.cy; ex = to.x; ey = tc.cy; }
        else { sx = from.x; sy = fc.cy; ex = to.x + NODE_W; ey = tc.cy; }
    } else {
        if (dy > 0) { sx = fc.cx; sy = from.y + NODE_H; ex = tc.cx; ey = to.y; }
        else { sx = fc.cx; sy = from.y; ex = tc.cx; ey = to.y + NODE_H; }
    }

    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;

    let c1x: number, c1y: number, c2x: number, c2y: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
        c1x = sx + (ex - sx) * 0.4; c1y = sy;
        c2x = sx + (ex - sx) * 0.6; c2y = ey;
    } else {
        c1x = sx; c1y = sy + (ey - sy) * 0.4;
        c2x = ex; c2y = sy + (ey - sy) * 0.6;
    }

    return { path: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`, midX, midY };
}

function makeBezier(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let c1x: number, c1y: number, c2x: number, c2y: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
        c1x = from.x + dx * 0.4; c1y = from.y;
        c2x = from.x + dx * 0.6; c2y = to.y;
    } else {
        c1x = from.x; c1y = from.y + dy * 0.4;
        c2x = to.x; c2y = from.y + dy * 0.6;
    }
    return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

/* ═══════════════════════════════════════════════════════════════════
   ATOMS
   ═══════════════════════════════════════════════════════════════════ */

function NodeIcon({ iconKey, className }: { iconKey: string; className?: string }) {
    const Ic = ICON_MAP[iconKey] ?? Circle;
    return <Ic className={className} />;
}

/* ═══════════════════════════════════════════════════════════════════
   NODE CARD
   ═══════════════════════════════════════════════════════════════════ */

function WfNodeCard({
    node, isSelected, isConnecting, isConnectTarget, hoverTarget,
    onMouseDown, onClick, onConnectHandleDown,
}: {
    node: WfStatusNode;
    isSelected: boolean;
    isConnecting: boolean;
    isConnectTarget: boolean;
    hoverTarget: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onClick: () => void;
    onConnectHandleDown: (e: React.MouseEvent) => void;
}) {
    const cat = CATEGORY_META[node.category];
    const Icon = ICON_MAP[node.iconKey] ?? Circle;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onMouseDown={onMouseDown}
            onClick={onClick}
            className={[
                'absolute select-none cursor-grab active:cursor-grabbing',
                'bg-[var(--bg-card)] border-2 rounded-2xl overflow-visible',
                'transition-all duration-150',
                isSelected
                    ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-ring)]'
                    : hoverTarget
                        ? 'border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,.2)] scale-[1.02]'
                        : isConnectTarget
                            ? 'border-emerald-500/40 shadow-[0_0_0_2px_rgba(16,185,129,.1)]'
                            : `${cat.border} hover:shadow-lg`,
                isConnecting ? 'ring-2 ring-[var(--accent)]/30' : '',
            ].join(' ')}
            style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H, zIndex: isSelected ? 20 : hoverTarget ? 15 : 10 }}
        >
            {/* Tooltip ABOVE the node */}
            {hoverTarget && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap">
                    <span className="text-[11px] font-semibold text-emerald-400 bg-[var(--bg-card)] border border-emerald-500/30 px-2.5 py-1 rounded-lg shadow-lg">
                        Отпустите для связи
                    </span>
                </div>
            )}

            <div className="h-1 w-full rounded-t-2xl" style={{ backgroundColor: node.color }} />
            <div className="px-3.5 py-2.5 flex items-center gap-3 h-[calc(100%-4px)]">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.bg}`}>
                    <Icon className={`w-[18px] h-[18px] ${cat.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        {node.isInitial && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">{node.label}</span>
                        {node.isTerminal && <Lock className="w-3 h-3 text-[var(--text-primary)]/25 shrink-0" />}
                    </div>
                    <span className={`text-[11px] ${cat.text}`}>{CATEGORY_LABELS[node.category]}</span>
                </div>

                <div
                    onMouseDown={onConnectHandleDown}
                    className={[
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-crosshair',
                        isConnecting
                            ? 'border-[var(--accent)] bg-[var(--accent)]/20 scale-110'
                            : 'border-[var(--border-color)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10',
                    ].join(' ')}
                    title="Зажмите и перетащите на другой статус"
                >
                    <Plus className="w-3 h-3 text-[var(--text-primary)]/40" />
                </div>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   EDGE
   ═══════════════════════════════════════════════════════════════════ */

function WfEdgePath({ transition, fromNode, toNode, isSelected, onClick }: {
    transition: WfTransition; fromNode: WfStatusNode; toNode: WfStatusNode;
    isSelected: boolean; onClick: () => void;
}) {
    const { path, midX, midY } = getEdgePath(fromNode, toNode);
    return (
        <g>
            <path d={path} fill="none" stroke="transparent" strokeWidth={20}
                className="cursor-pointer" style={{ pointerEvents: 'stroke' }}
                onClick={(e) => { e.stopPropagation(); onClick(); }} />
            <path d={path} fill="none"
                stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'}
                strokeWidth={isSelected ? 2.5 : 1.5}
                className="transition-colors duration-150"
                markerEnd={isSelected ? 'url(#arrowSel)' : 'url(#arrow)'} />
            {isSelected && (
                <path d={path} fill="none" stroke="var(--accent)"
                    strokeWidth={2} strokeDasharray="6 4" opacity={0.4} className="animate-flow" />
            )}
            {transition.label && (
                <g className="cursor-pointer" style={{ pointerEvents: 'bounding-box' }}
                    onClick={(e) => { e.stopPropagation(); onClick(); }}>
                    <rect x={midX - 50} y={midY - 12} width={100} height={24} rx={8}
                        fill={isSelected ? 'var(--accent)' : 'var(--bg-card)'}
                        stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'} strokeWidth={1} />
                    <text x={midX} y={midY + 4} textAnchor="middle" className="text-[11px] font-medium select-none"
                        fill={isSelected ? 'white' : 'var(--text-primary)'} opacity={isSelected ? 1 : 0.55}>
                        {transition.label}
                    </text>
                </g>
            )}
            {transition.actions.length > 0 && (
                <g>
                    <circle cx={midX + 55} cy={midY} r={8}
                        fill={isSelected ? 'var(--accent)' : 'var(--hover-3)'}
                        stroke={isSelected ? 'var(--accent)' : 'var(--border-color)'} strokeWidth={1} />
                    <text x={midX + 55} y={midY + 3.5} textAnchor="middle"
                        className="text-[9px] font-bold select-none" fill="white">{transition.actions.length}</text>
                </g>
            )}
        </g>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ACTION & CONDITION ITEMS
   ═══════════════════════════════════════════════════════════════════ */

function ActionItem({ action, onToggle, onRemove, onEdit }: {
    action: WfAction; onToggle: () => void; onRemove: () => void; onEdit: () => void;
}) {
    const m = ACTION_META[action.type];
    if (!m) return null;
    const Ic = m.icon;
    return (
        <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            className={['group flex items-start gap-3 p-3 rounded-xl border transition-all',
                action.enabled ? 'bg-[var(--hover-1)] border-[var(--border-color)]' : 'bg-[var(--hover-2)]/50 border-[var(--border-color)]/50 opacity-50',
            ].join(' ')}>
            <button onClick={onToggle}
                className={`mt-0.5 w-8 h-5 rounded-full shrink-0 relative transition-colors ${action.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--hover-3)]'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${action.enabled ? 'left-3.5' : 'left-0.5'}`} />
            </button>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${action.enabled ? 'bg-[var(--accent)]/10' : 'bg-[var(--hover-2)]'}`}>
                <Ic className={`w-4 h-4 ${action.enabled ? m.color : 'text-[var(--text-primary)]/30'}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium ${action.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/40'}`}>{m.label}</p>
                {Object.entries(action.params).slice(0, 2).map(([k, v]) => (
                    <p key={k} className="text-[11px] text-[var(--text-primary)]/30 truncate">{k}: <span className="text-[var(--text-primary)]/50">{v}</span></p>
                ))}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]/60"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
        </motion.div>
    );
}

function ConditionItem({ condition, onRemove }: { condition: WfCondition; onRemove: () => void }) {
    const m = CONDITION_META[condition.type];
    if (!m) return null;
    const Ic = m.icon;
    return (
        <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="group flex items-center gap-3 p-2.5 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--hover-2)]"><Ic className={`w-3.5 h-3.5 ${m.color}`} /></div>
            <span className="flex-1 text-[13px] text-[var(--text-primary)]/70 truncate">{m.label}</span>
            <button onClick={onRemove} className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--text-primary)]/30 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   ADD MENU
   ═══════════════════════════════════════════════════════════════════ */

interface AddMenuItem { type: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string }

function AddMenu({ items, onSelect, onClose }: { items: AddMenuItem[]; onSelect: (t: string) => void; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);
    return (
        <motion.div ref={ref} initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="p-1.5 max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
                {items.map((item) => {
                    const Ic = item.icon; return (
                        <button key={item.type} onClick={() => { onSelect(item.type); onClose(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] transition-colors text-left">
                            <Ic className={`w-4 h-4 ${item.color} shrink-0`} /><span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   DELETE CONFIRM
   ═══════════════════════════════════════════════════════════════════ */

function DeleteConfirm({ label, description, onCancel, onConfirm }: {
    label: string; description: string; onCancel: () => void; onConfirm: () => void;
}) {
    return (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
            <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-4 h-4" /><p className="text-[13px] font-medium">{label}</p></div>
            <p className="text-[11px] text-[var(--text-primary)]/40">{description}</p>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--hover-2)] text-[var(--text-primary)]/60 text-[13px]">Отмена</button>
                <button onClick={onConfirm} className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[13px] font-medium hover:bg-red-500/30">Удалить</button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   NODE DETAIL PANEL
   ═══════════════════════════════════════════════════════════════════ */

function NodeDetailPanel({ node, onClose, onUpdate, onDelete }: {
    node: WfStatusNode; onClose: () => void; onUpdate: (n: WfStatusNode) => void; onDelete: () => void;
}) {
    const [label, setLabel] = useState(node.label);
    const [desc, setDesc] = useState(node.description ?? '');
    const [category, setCategory] = useState(node.category);
    const [showCatMenu, setShowCatMenu] = useState(false);
    const [showDel, setShowDel] = useState(false);

    useEffect(() => { setLabel(node.label); setDesc(node.description ?? ''); setCategory(node.category); setShowDel(false); }, [node.id]);

    const cat = CATEGORY_META[category];
    const handleSave = () => onUpdate({ ...node, label: label.trim() || node.label, description: desc.trim(), category });

    return (
        <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-[360px] shrink-0 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            <div className="px-5 py-4 border-b border-[var(--border-color)] shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cat.bg}`}>
                            <NodeIcon iconKey={node.iconKey} className={`w-4 h-4 ${cat.text}`} />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Настройка статуса</h3>
                            <p className="text-[11px] text-[var(--text-primary)]/35">ID: {node.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: node.color }} />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
                <div>
                    <label className="block text-[13px] font-medium text-[var(--text-primary)]/55 mb-1.5">Название</label>
                    <input value={label} onChange={(e) => setLabel(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[13px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all" />
                </div>
                <div>
                    <label className="block text-[13px] font-medium text-[var(--text-primary)]/55 mb-1.5">Описание</label>
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Описание..."
                        className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[13px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all resize-none" />
                </div>

                <div>
                    <label className="block text-[13px] font-medium text-[var(--text-primary)]/55 mb-1.5">Категория</label>
                    <div className="relative">
                        <button onClick={() => setShowCatMenu((v) => !v)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[13px] text-left hover:bg-[var(--hover-3)] transition-colors">
                            <span className={`w-2.5 h-2.5 rounded-full ${cat.dot}`} />
                            <span className="flex-1 text-[var(--text-primary)]">{CATEGORY_LABELS[category]}</span>
                            <ChevronDown className="w-4 h-4 text-[var(--text-primary)]/30" />
                        </button>
                        {showCatMenu && (<>
                            <div className="fixed inset-0 z-10" onClick={() => setShowCatMenu(false)} />
                            <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
                                <div className="p-1">
                                    {(Object.entries(CATEGORY_LABELS) as [NodeCategory, string][]).map(([key, lbl]) => {
                                        const cm = CATEGORY_META[key];
                                        return (
                                            <button key={key} onClick={() => { setCategory(key); setShowCatMenu(false); }}
                                                className={['w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors',
                                                    category === key ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]',
                                                ].join(' ')}>
                                                <span className={`w-2.5 h-2.5 rounded-full ${cm.dot}`} />{lbl}
                                                {category === key && <Check className="w-3.5 h-3.5 text-[var(--accent)] ml-auto" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>)}
                    </div>
                </div>

                <div className="space-y-2">
                    {([
                        { key: 'isInitial' as const, label: 'Начальный статус', hint: 'Задачи создаются в этом статусе' },
                        { key: 'isTerminal' as const, label: 'Конечный статус', hint: 'Из него нет переходов' },
                    ]).map(({ key, label: fl, hint }) => (
                        <label key={key} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] cursor-pointer hover:bg-[var(--hover-2)] transition-colors">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${node[key] ? 'bg-emerald-500 border-emerald-600' : 'border-[var(--border-color)]'}`}>
                                {node[key] && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div>
                                <p className="text-[13px] font-medium text-[var(--text-primary)]">{fl}</p>
                                <p className="text-[11px] text-[var(--text-primary)]/35">{hint}</p>
                            </div>
                            <input type="checkbox" checked={node[key] ?? false} onChange={(e) => onUpdate({ ...node, [key]: e.target.checked })} className="sr-only" />
                        </label>
                    ))}
                </div>

                <div className="pt-3 border-t border-[var(--border-color)]">
                    {!showDel ? (
                        <button onClick={() => setShowDel(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" /> Удалить статус
                        </button>
                    ) : (
                        <DeleteConfirm label={`Удалить «${node.label}»?`} description="Все связанные переходы удалятся." onCancel={() => setShowDel(false)} onConfirm={onDelete} />
                    )}
                </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-color)] shrink-0">
                <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-[13px] font-medium transition-colors shadow-[var(--shadow-md)]">
                    <Save className="w-4 h-4" /> Сохранить
                </button>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   TRANSITION DETAIL PANEL
   ═══════════════════════════════════════════════════════════════════ */

function TransitionDetailPanel({ transition, fromNode, toNode, onClose, onUpdate, onDelete }: {
    transition: WfTransition; fromNode: WfStatusNode; toNode: WfStatusNode;
    onClose: () => void; onUpdate: (t: WfTransition) => void; onDelete: () => void;
}) {
    const [label, setLabel] = useState(transition.label ?? '');
    const [showAddAction, setShowAddAction] = useState(false);
    const [showAddCond, setShowAddCond] = useState(false);
    const [showDel, setShowDel] = useState(false);

    useEffect(() => { setLabel(transition.label ?? ''); setShowDel(false); }, [transition.id]);

    const fromCat = CATEGORY_META[fromNode.category];
    const toCat = CATEGORY_META[toNode.category];

    const addAction = useCallback((type: string) => {
        const m = ACTION_META[type as ActionType];
        const a: WfAction = { id: uid(), type: type as ActionType, label: m?.label ?? type, enabled: true, params: {}, order: transition.actions.length };
        onUpdate({ ...transition, actions: [...transition.actions, a] });
    }, [transition, onUpdate]);

    const addCondition = useCallback((type: string) => {
        const c: WfCondition = { id: uid(), type: type as WfCondition['type'], params: {} };
        onUpdate({ ...transition, conditions: [...transition.conditions, c] });
    }, [transition, onUpdate]);

    const toggleAction = useCallback((id: string) => {
        onUpdate({ ...transition, actions: transition.actions.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a) });
    }, [transition, onUpdate]);

    const removeAction = useCallback((id: string) => {
        onUpdate({ ...transition, actions: transition.actions.filter((a) => a.id !== id) });
    }, [transition, onUpdate]);

    const removeCondition = useCallback((id: string) => {
        onUpdate({ ...transition, conditions: transition.conditions.filter((c) => c.id !== id) });
    }, [transition, onUpdate]);

    const handleSave = () => onUpdate({ ...transition, label: label.trim() });

    const actionItems = useMemo<AddMenuItem[]>(() => Object.entries(ACTION_META).map(([t, m]) => ({ type: t, label: m.label, icon: m.icon, color: m.color })), []);
    const condItems = useMemo<AddMenuItem[]>(() => Object.entries(CONDITION_META).map(([t, m]) => ({ type: t, label: m.label, icon: m.icon, color: m.color })), []);

    return (
        <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-[400px] shrink-0 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col"
            onClick={(e) => e.stopPropagation()}>

            <div className="px-5 py-4 border-b border-[var(--border-color)] shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center"><ArrowRight className="w-4 h-4 text-[var(--accent)]" /></div>
                        <div>
                            <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Настройка перехода</h3>
                            <p className="text-[11px] text-[var(--text-primary)]/35">ID: {transition.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${fromCat.chip}`}>
                        <span className={`w-2 h-2 rounded-full ${fromCat.dot}`} /><span className="text-[11px] font-medium">{fromNode.label}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-primary)]/20 shrink-0" />
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${toCat.chip}`}>
                        <span className={`w-2 h-2 rounded-full ${toCat.dot}`} /><span className="text-[11px] font-medium">{toNode.label}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
                <div>
                    <label className="block text-[13px] font-medium text-[var(--text-primary)]/55 mb-1.5">Название</label>
                    <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Например: «Взять в работу»"
                        className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[13px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all" />
                </div>

                <section>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-[var(--text-primary)]/35" />
                            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Условия</h4>
                            {transition.conditions.length > 0 && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/45">{transition.conditions.length}</span>}
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowAddCond((v) => !v)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"><Plus className="w-3 h-3" /> Добавить</button>
                            <AnimatePresence>{showAddCond && <div className="absolute right-0 top-full mt-1 z-30 w-56"><AddMenu items={condItems} onSelect={addCondition} onClose={() => setShowAddCond(false)} /></div>}</AnimatePresence>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <AnimatePresence mode="popLayout">
                            {transition.conditions.length === 0 ? (
                                <div className="py-4 text-center border-2 border-dashed border-[var(--border-color)] rounded-xl"><p className="text-[11px] text-[var(--text-primary)]/25">Без ограничений</p></div>
                            ) : transition.conditions.map((c) => <ConditionItem key={c.id} condition={c} onRemove={() => removeCondition(c.id)} />)}
                        </AnimatePresence>
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-[var(--text-primary)]/35" />
                            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Действия</h4>
                            {transition.actions.length > 0 && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/45">{transition.actions.length}</span>}
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowAddAction((v) => !v)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"><Plus className="w-3 h-3" /> Добавить</button>
                            <AnimatePresence>{showAddAction && <div className="absolute right-0 top-full mt-1 z-30 w-64"><AddMenu items={actionItems} onSelect={addAction} onClose={() => setShowAddAction(false)} /></div>}</AnimatePresence>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <AnimatePresence mode="popLayout">
                            {transition.actions.length === 0 ? (
                                <div className="py-5 text-center border-2 border-dashed border-[var(--border-color)] rounded-xl">
                                    <Zap className="w-5 h-5 text-[var(--text-primary)]/10 mx-auto mb-1" /><p className="text-[11px] text-[var(--text-primary)]/25">Нет действий</p>
                                </div>
                            ) : transition.actions.map((a) => <ActionItem key={a.id} action={a} onToggle={() => toggleAction(a.id)} onRemove={() => removeAction(a.id)} onEdit={() => { }} />)}
                        </AnimatePresence>
                    </div>
                </section>

                <div className="pt-3 border-t border-[var(--border-color)]">
                    {!showDel ? (
                        <button onClick={() => setShowDel(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition-colors">
                            <Unlink className="w-4 h-4" /> Удалить переход
                        </button>
                    ) : (
                        <DeleteConfirm label="Удалить переход?" description={`«${fromNode.label}» → «${toNode.label}»`} onCancel={() => setShowDel(false)} onConfirm={onDelete} />
                    )}
                </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-color)] shrink-0">
                <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-[13px] font-medium transition-colors shadow-[var(--shadow-md)]">
                    <Save className="w-4 h-4" /> Сохранить
                </button>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE MODAL
   ═══════════════════════════════════════════════════════════════════ */

function CreateWorkflowModal({ onClose, onCreate }: { onClose: () => void; onCreate: (wf: Partial<WorkflowData>) => void }) {
    const [name, setName] = useState('');
    const [kind, setKind] = useState<WfEntityKind>('task');
    const [desc, setDesc] = useState('');

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSubmit = () => {
        if (!name.trim()) return;
        onCreate({
            name: name.trim(), entityKind: kind, description: desc.trim() || undefined,
            nodes: [
                { id: uid(), label: 'Новый', category: 'open', color: '#3b82f6', iconKey: 'circle', x: 80, y: 80, isInitial: true },
                { id: uid(), label: 'Выполнено', category: 'done', color: '#10b981', iconKey: 'check', x: 380, y: 80, isTerminal: true },
            ],
            transitions: [],
        });
    };

    const opts: { value: WfEntityKind; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
        { value: 'task', label: 'Задачи', icon: Layers, desc: 'Для задач' },
        { value: 'ticket', label: 'Заявки', icon: Ticket, desc: 'Для обращений' },
    ];

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden mx-4"
                style={{ boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center"><Workflow className="w-5 h-5 text-[var(--accent)]" /></div>
                        <div>
                            <h2 className="text-[17px] font-bold text-[var(--text-primary)]">Новый процесс</h2>
                            <p className="text-[13px] text-[var(--text-primary)]/40">Создайте workflow</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-5">
                    <div>
                        <label className="block text-[13px] font-medium text-[var(--text-primary)]/65 mb-1.5">Название <span className="text-[var(--accent)]">*</span></label>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Жизненный цикл задачи" autoFocus
                            className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[15px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all" />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-[var(--text-primary)]/65 mb-1.5">Описание</label>
                        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Описание..." rows={3}
                            className="w-full px-3.5 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-[15px] placeholder-[var(--text-primary)]/25 focus:outline-none focus:border-[var(--accent)]/30 focus:ring-2 focus:ring-[var(--accent-ring)] transition-all resize-none" />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-[var(--text-primary)]/65 mb-2">Тип сущности</label>
                        <div className="grid grid-cols-2 gap-2">
                            {opts.map((o) => {
                                const Ic = o.icon; return (
                                    <button key={o.value} onClick={() => setKind(o.value)}
                                        className={['flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border',
                                            kind === o.value ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--text-primary)]' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/55 hover:bg-[var(--hover-2)]',
                                        ].join(' ')}>
                                        <Ic className={`w-5 h-5 shrink-0 ${kind === o.value ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/30'}`} />
                                        <div><p className="text-[13px] font-medium">{o.label}</p><p className="text-[11px] text-[var(--text-primary)]/35">{o.desc}</p></div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/65 text-[14px]">Отмена</button>
                    <button onClick={handleSubmit} disabled={!name.trim()} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-[14px] font-medium disabled:opacity-40 shadow-[var(--shadow-md)]">
                        <Plus className="w-4 h-4" /> Создать
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowCanvas({
    workflow, selectedNodeId, selectedTransitionId, connectingFrom, tempConnectPos,
    onSelectNode, onSelectTransition, onNodeMove, onConnectStart, onConnectEnd, onConnectComplete, onDeselectAll,
}: {
    workflow: WorkflowData;
    selectedNodeId: string | null; selectedTransitionId: string | null;
    connectingFrom: string | null; tempConnectPos: { x: number; y: number } | null;
    onSelectNode: (id: string | null) => void; onSelectTransition: (id: string | null) => void;
    onNodeMove: (id: string, x: number, y: number) => void;
    onConnectStart: (id: string) => void; onConnectEnd: () => void;
    onConnectComplete: (from: string, to: string) => void;
    onDeselectAll: () => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);

    const panRef = useRef(pan); panRef.current = pan;
    const zoomRef = useRef(zoom); zoomRef.current = zoom;

    // Interaction modes
    const modeRef = useRef<
        | null
        | { type: 'pan'; sx: number; sy: number; px: number; py: number }
        | { type: 'drag'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
        | { type: 'connect'; fromId: string }
    >(null);

    const nodeMap = useMemo(() => { const m = new Map<string, WfStatusNode>(); workflow.nodes.forEach((n) => m.set(n.id, n)); return m; }, [workflow.nodes]);

    // Screen coords → canvas coords
    const screenToCanvas = useCallback((sx: number, sy: number) => {
        const r = containerRef.current?.getBoundingClientRect();
        if (!r) return { x: 0, y: 0 };
        return { x: (sx - r.left - panRef.current.x) / zoomRef.current, y: (sy - r.top - panRef.current.y) / zoomRef.current };
    }, []);

    // Find which node is under the cursor (canvas coords)
    const findNodeAt = useCallback((cx: number, cy: number, excludeId?: string): string | null => {
        for (let i = workflow.nodes.length - 1; i >= 0; i--) {
            const n = workflow.nodes[i];
            if (n.id === excludeId) continue;
            if (cx >= n.x && cx <= n.x + NODE_W && cy >= n.y && cy <= n.y + NODE_H) return n.id;
        }
        return null;
    }, [workflow.nodes]);

    // Node body mousedown — start drag
    const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: WfStatusNode) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        modeRef.current = { type: 'drag', id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, moved: false };
    }, []);

    // Connect handle mousedown — start connection
    const handleConnectHandleDown = useCallback((e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        e.preventDefault();
        modeRef.current = { type: 'connect', fromId: nodeId };
        onConnectStart(nodeId);
    }, [onConnectStart]);

    // Canvas mousedown — pan
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        modeRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
        onDeselectAll();
    }, [onDeselectAll]);

    // Global mouse events
    useEffect(() => {
        const move = (e: MouseEvent) => {
            const m = modeRef.current;
            if (!m) return;

            if (m.type === 'pan') {
                setPan({ x: m.px + e.clientX - m.sx, y: m.py + e.clientY - m.sy });
            }

            if (m.type === 'drag') {
                const dx = e.clientX - m.sx;
                const dy = e.clientY - m.sy;
                if (!m.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
                m.moved = true;
                const z = zoomRef.current;
                onNodeMove(m.id, Math.max(0, m.ox + dx / z), Math.max(0, m.oy + dy / z));
            }

            if (m.type === 'connect') {
                // Find node under cursor for hover highlight
                const canvas = screenToCanvas(e.clientX, e.clientY);
                const target = findNodeAt(canvas.x, canvas.y, m.fromId);
                setHoverNodeId(target);
            }
        };

        const up = (e: MouseEvent) => {
            const m = modeRef.current;
            if (!m) return;

            if (m.type === 'drag') {
                if (!m.moved) {
                    // It was a click, not a drag — select the node
                    onSelectNode(m.id);
                    onSelectTransition(null);
                }
                // If it was a drag, do NOT open panel
            }

            if (m.type === 'connect') {
                const canvas = screenToCanvas(e.clientX, e.clientY);
                const targetId = findNodeAt(canvas.x, canvas.y, m.fromId);
                if (targetId) {
                    onConnectComplete(m.fromId, targetId);
                }
                onConnectEnd();
                setHoverNodeId(null);
            }

            modeRef.current = null;
        };

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    }, [onNodeMove, onSelectNode, onSelectTransition, onConnectComplete, onConnectEnd, screenToCanvas, findNodeAt]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const c = containerRef.current; if (!c) return;
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const old = zoomRef.current;
        const factor = e.deltaY > 0 ? 0.96 : 1.04;
        const nz = clamp(old * factor, 0.2, 3);
        const r = nz / old;
        setPan({ x: mx - (mx - panRef.current.x) * r, y: my - (my - panRef.current.y) * r });
        setZoom(nz);
    }, []);

    const connectFromNode = connectingFrom ? nodeMap.get(connectingFrom) : null;
    const connectFromPt = connectFromNode ? { x: connectFromNode.x + NODE_W, y: connectFromNode.y + NODE_H / 2 } : null;
    const tempCanvas = useMemo(() => {
        if (!tempConnectPos || !containerRef.current) return null;
        const r = containerRef.current.getBoundingClientRect();
        return { x: (tempConnectPos.x - r.left - pan.x) / zoom, y: (tempConnectPos.y - r.top - pan.y) / zoom };
    }, [tempConnectPos, pan, zoom]);

    return (
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[var(--bg-main)]"
            onMouseDown={handleCanvasMouseDown} onWheel={handleWheel}
            style={{ cursor: modeRef.current?.type === 'connect' ? 'crosshair' : modeRef.current ? 'grabbing' : 'default' }}>

            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(circle, var(--border-color) 1px, transparent 1px)',
                backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
            }} />

            <div className="absolute origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: CANVAS_SIZE, height: CANVAS_SIZE }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                    <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-color)" /></marker>
                        <marker id="arrowSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" /></marker>
                    </defs>
                    {workflow.transitions.map((t) => {
                        const f = nodeMap.get(t.fromId), to = nodeMap.get(t.toId); if (!f || !to) return null; return (
                            <WfEdgePath key={t.id} transition={t} fromNode={f} toNode={to} isSelected={selectedTransitionId === t.id}
                                onClick={() => { onSelectTransition(t.id); onSelectNode(null); }} />
                        );
                    })}
                    {connectFromPt && tempCanvas && <path d={makeBezier(connectFromPt, tempCanvas)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" opacity={0.6} />}
                </svg>

                <AnimatePresence>
                    {workflow.nodes.map((n) => (
                        <WfNodeCard key={n.id} node={n}
                            isSelected={selectedNodeId === n.id}
                            isConnecting={connectingFrom === n.id}
                            isConnectTarget={connectingFrom !== null && connectingFrom !== n.id}
                            hoverTarget={hoverNodeId === n.id && connectingFrom !== null}
                            onMouseDown={(e) => handleNodeMouseDown(e, n)}
                            onClick={() => { }} // handled in mouseup via moved check
                            onConnectHandleDown={(e) => handleConnectHandleDown(e, n.id)} />
                    ))}
                </AnimatePresence>
            </div>

            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-1 shadow-[var(--shadow-md)]">
                <button onClick={() => setZoom((z) => clamp(z * 0.85, 0.2, 3))} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]"><ZoomOut className="w-4 h-4" /></button>
                <span className="px-1.5 text-[11px] font-medium text-[var(--text-primary)]/45 tabular-nums min-w-[36px] text-center select-none">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => clamp(z * 1.15, 0.2, 3))} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]"><ZoomIn className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-[var(--border-color)]" />
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]" title="Сбросить"><Maximize2 className="w-4 h-4" /></button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowListItem({ wf, isActive, onClick }: { wf: WorkflowData; isActive: boolean; onClick: () => void }) {
    const Ic = wf.entityKind === 'task' ? Layers : Ticket;
    return (
        <button onClick={onClick} className={['w-full text-left px-3 py-2.5 rounded-xl transition-all border',
            isActive ? 'bg-[var(--accent)]/10 border-[var(--accent)]/20' : 'hover:bg-[var(--hover-2)] border-transparent',
        ].join(' ')}>
            <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-[var(--accent)]/15' : 'bg-[var(--hover-2)]'}`}>
                    <Ic className={`w-4 h-4 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/30'}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium truncate ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/65'}`}>{wf.name}</p>
                    <p className="text-[11px] text-[var(--text-primary)]/30 mt-0.5">{wf.nodes.length} статусов</p>
                </div>
            </div>
        </button>
    );
}

function WfSidebar({ workflows, activeId, onSelect, onCreate }: {
    workflows: WorkflowData[]; activeId: string; onSelect: (id: string) => void; onCreate: () => void;
}) {
    const tasks = workflows.filter((w) => w.entityKind === 'task');
    const tickets = workflows.filter((w) => w.entityKind === 'ticket');
    const group = (label: string, icon: React.ReactNode, items: WorkflowData[]) => (
        <div>
            <div className="flex items-center gap-2 px-1 mb-2">
                {icon}
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/25 font-semibold">{label}</span>
            </div>
            <div className="space-y-0.5">{items.map((wf) => <WorkflowListItem key={wf.id} wf={wf} isActive={activeId === wf.id} onClick={() => onSelect(wf.id)} />)}</div>
        </div>
    );
    return (
        <div className="w-[240px] shrink-0 h-full bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-color)] shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Процессы</h2>
                    <button onClick={onCreate} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--accent)]"><Plus className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-4 scrollbar-thin scrollbar-thumb-[var(--hover-3)]">
                {group('Задачи', <Layers className="w-3.5 h-3.5 text-[var(--text-primary)]/25" />, tasks)}
                {group('Заявки', <Ticket className="w-3.5 h-3.5 text-[var(--text-primary)]/25" />, tickets)}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   TOOLBAR
   ═══════════════════════════════════════════════════════════════════ */

function WfToolbar({ workflow, saving, isFullscreen, onAddNode, onSave, onToggleFullscreen }: {
    workflow: WorkflowData; saving: boolean; isFullscreen: boolean;
    onAddNode: () => void; onSave: () => void; onToggleFullscreen: () => void;
}) {
    const Ic = workflow.entityKind === 'task' ? Layers : Ticket;
    return (
        <div className="h-[48px] shrink-0 bg-[var(--bg-card)] border-b border-[var(--border-color)] flex items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
                <Ic className="w-4 h-4 text-[var(--text-primary)]/25" />
                <h2 className="text-[15px] font-bold text-[var(--text-primary)]">{workflow.name}</h2>
                {workflow.description && <span className="text-[13px] text-[var(--text-primary)]/25 hidden xl:block ml-1">— {workflow.description}</span>}
            </div>
            <div className="flex items-center gap-2">
                <button onClick={onToggleFullscreen}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/55 text-[13px] font-medium hover:bg-[var(--hover-3)] hover:text-[var(--text-primary)] transition-colors"
                    title={isFullscreen ? 'Свернуть' : 'Во весь экран'}>
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    {isFullscreen ? 'Свернуть' : 'Весь экран'}
                </button>
                <button onClick={onAddNode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/55 text-[13px] font-medium hover:bg-[var(--hover-3)] hover:text-[var(--text-primary)] transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Статус
                </button>
                <button onClick={onSave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white text-[13px] font-medium disabled:opacity-40 transition-colors shadow-[var(--shadow-md)]">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Сохранить
                </button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════════ */

function ToastNotification({ data }: { data: ToastData }) {
    return (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-[var(--shadow-lg)] px-4 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 text-emerald-400" /></div>
            <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{data.title}</p>
                {data.description && <p className="text-[11px] text-[var(--text-primary)]/35">{data.description}</p>}
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   INNER CONTENT
   ═══════════════════════════════════════════════════════════════════ */

function WorkflowInner({ isFullscreen, onToggleFullscreen }: {
    isFullscreen: boolean; onToggleFullscreen: () => void;
}) {
    const [workflows, setWorkflows] = useState<WorkflowData[]>(MOCK_WORKFLOWS);
    const [activeWfId, setActiveWfId] = useState(MOCK_WORKFLOWS[0].id);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedTransId, setSelectedTransId] = useState<string | null>(null);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [tempConnectPos, setTempConnectPos] = useState<{ x: number; y: number } | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeWf = useMemo(() => workflows.find((w) => w.id === activeWfId) ?? workflows[0], [workflows, activeWfId]);

    const showToast = useCallback((title: string, description?: string) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ title, description });
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    const updateActiveWf = useCallback((fn: (wf: WorkflowData) => WorkflowData) => {
        setWorkflows((prev) => prev.map((w) => w.id === activeWfId ? fn(w) : w));
    }, [activeWfId]);

    const handleDeselectAll = useCallback(() => { setSelectedNodeId(null); setSelectedTransId(null); }, []);

    const handleNodeMove = useCallback((id: string, x: number, y: number) => {
        updateActiveWf((wf) => ({ ...wf, nodes: wf.nodes.map((n) => n.id === id ? { ...n, x, y } : n) }));
    }, [updateActiveWf]);

    const handleAddNode = useCallback(() => {
        const n: WfStatusNode = { id: uid(), label: 'Новый статус', category: 'custom', color: '#f97316', iconKey: 'circle', x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 };
        updateActiveWf((wf) => ({ ...wf, nodes: [...wf.nodes, n] }));
        setSelectedNodeId(n.id); setSelectedTransId(null);
    }, [updateActiveWf]);

    const handleUpdateNode = useCallback((n: WfStatusNode) => {
        updateActiveWf((wf) => ({ ...wf, nodes: wf.nodes.map((nd) => nd.id === n.id ? n : nd) }));
        showToast('Статус обновлён');
    }, [updateActiveWf, showToast]);

    const handleDeleteNode = useCallback((id: string) => {
        updateActiveWf((wf) => ({ ...wf, nodes: wf.nodes.filter((n) => n.id !== id), transitions: wf.transitions.filter((t) => t.fromId !== id && t.toId !== id) }));
        setSelectedNodeId(null); showToast('Статус удалён');
    }, [updateActiveWf, showToast]);

    const handleUpdateTransition = useCallback((t: WfTransition) => {
        updateActiveWf((wf) => ({ ...wf, transitions: wf.transitions.map((tr) => tr.id === t.id ? t : tr) }));
        showToast('Переход обновлён');
    }, [updateActiveWf, showToast]);

    const handleDeleteTransition = useCallback((id: string) => {
        updateActiveWf((wf) => ({ ...wf, transitions: wf.transitions.filter((t) => t.id !== id) }));
        setSelectedTransId(null); showToast('Переход удалён');
    }, [updateActiveWf, showToast]);

    const handleConnectStart = useCallback((id: string) => setConnectingFrom(id), []);
    const handleConnectEnd = useCallback(() => { setConnectingFrom(null); setTempConnectPos(null); }, []);

    const handleConnectComplete = useCallback((fromId: string, toId: string) => {
        if (fromId === toId) return;
        if (activeWf.transitions.some((t) => t.fromId === fromId && t.toId === toId)) { showToast('Уже существует'); return; }
        const t: WfTransition = { id: uid(), fromId, toId, label: '', conditions: [], actions: [] };
        updateActiveWf((wf) => ({ ...wf, transitions: [...wf.transitions, t] }));
        setSelectedTransId(t.id); setSelectedNodeId(null); showToast('Переход создан');
    }, [activeWf.transitions, updateActiveWf, showToast]);

    useEffect(() => {
        if (!connectingFrom) return;
        const h = (e: MouseEvent) => setTempConnectPos({ x: e.clientX, y: e.clientY });
        document.addEventListener('mousemove', h);
        return () => document.removeEventListener('mousemove', h);
    }, [connectingFrom]);

    const handleSave = useCallback(() => {
        setSaving(true);
        setTimeout(() => { setSaving(false); showToast('Сохранено', 'Изменения применены'); }, 700);
    }, [showToast]);

    const handleCreate = useCallback((p: Partial<WorkflowData>) => {
        const wf: WorkflowData = { id: uid(), name: p.name ?? 'Новый', entityKind: p.entityKind ?? 'task', description: p.description, nodes: p.nodes ?? [], transitions: p.transitions ?? [], isDefault: false, updatedAt: new Date().toISOString() };
        setWorkflows((prev) => [...prev, wf]); setActiveWfId(wf.id); setShowCreateModal(false); showToast('Создано');
    }, [showToast]);

    const selectedNode = selectedNodeId ? activeWf.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    const selectedTrans = selectedTransId ? activeWf.transitions.find((t) => t.id === selectedTransId) ?? null : null;
    const transFrom = selectedTrans ? activeWf.nodes.find((n) => n.id === selectedTrans.fromId) ?? null : null;
    const transTo = selectedTrans ? activeWf.nodes.find((n) => n.id === selectedTrans.toId) ?? null : null;

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showCreateModal) handleDeselectAll(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [showCreateModal, handleDeselectAll]);

    return (
        <>
            <div className="flex h-full w-full">
                <WfSidebar workflows={workflows} activeId={activeWfId}
                    onSelect={(id) => { setActiveWfId(id); handleDeselectAll(); }}
                    onCreate={() => setShowCreateModal(true)} />

                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                    <WfToolbar workflow={activeWf} saving={saving} isFullscreen={isFullscreen}
                        onAddNode={handleAddNode} onSave={handleSave} onToggleFullscreen={onToggleFullscreen} />

                    <div className="flex-1 flex min-h-0">
                        <WorkflowCanvas
                            workflow={activeWf}
                            selectedNodeId={selectedNodeId} selectedTransitionId={selectedTransId}
                            connectingFrom={connectingFrom} tempConnectPos={tempConnectPos}
                            onSelectNode={setSelectedNodeId} onSelectTransition={setSelectedTransId}
                            onNodeMove={handleNodeMove}
                            onConnectStart={handleConnectStart} onConnectEnd={handleConnectEnd}
                            onConnectComplete={handleConnectComplete}
                            onDeselectAll={handleDeselectAll} />

                        <AnimatePresence mode="wait">
                            {selectedNode && (
                                <NodeDetailPanel key={`n-${selectedNode.id}`} node={selectedNode}
                                    onClose={() => setSelectedNodeId(null)}
                                    onUpdate={handleUpdateNode}
                                    onDelete={() => handleDeleteNode(selectedNode.id)} />
                            )}
                            {selectedTrans && transFrom && transTo && (
                                <TransitionDetailPanel key={`t-${selectedTrans.id}`}
                                    transition={selectedTrans} fromNode={transFrom} toNode={transTo}
                                    onClose={() => setSelectedTransId(null)}
                                    onUpdate={handleUpdateTransition}
                                    onDelete={() => handleDeleteTransition(selectedTrans.id)} />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {showCreateModal && <CreateWorkflowModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />}

            <AnimatePresence>
                {toast && <ToastNotification key="t" data={toast} />}
            </AnimatePresence>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function WorkflowPage() {
    const [isFullscreen, setIsFullscreen] = useState(true);

    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            
            const header = document.querySelector('header');
            const sidebar = document.querySelector('aside');
            if (header) header.style.display = 'none';
            if (sidebar) sidebar.style.display = 'none';
            
            return () => {
                document.body.style.overflow = '';
                const header = document.querySelector('header');
                const sidebar = document.querySelector('aside');
                if (header) header.style.display = '';
                if (sidebar) sidebar.style.display = '';
            };
        }
    }, [isFullscreen]);

    const content = (
        <WorkflowInner 
            isFullscreen={isFullscreen} 
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)} 
        />
    );

    if (isFullscreen) {
        return createPortal(
            <div
                className="fixed inset-0 flex flex-col"
                style={{ zIndex: 9999, backgroundColor: 'var(--bg-main)', isolation: 'isolate' }}
            >
                {content}
            </div>,
            document.body
        );
    }

    return (
        <div className="h-full flex flex-col bg-[var(--bg-main)]">
            {content}
        </div>
    );
}