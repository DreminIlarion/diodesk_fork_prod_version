// pages/NotificationsPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  MessageSquare,
  UserPlus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Ticket,
  RefreshCw,
  Clock,
} from 'lucide-react';

import { notificationsApi, ticketsApi } from '../api/client';
import type { Notification } from '../api/client';
import { useNotifications } from '../contexts/NotificationsContext';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 20;
const BULK_PAGE_SIZE = 100;

const NOTIFICATION_META: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    bg: string;
    label: string;
  }
> = {
  ticket_created: {
    icon: Ticket,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    label: 'Новая заявка',
  },

  ticket_assigned: {
    icon: UserPlus,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    label: 'Назначение',
  },

  ticket_status_changed: {
    icon: RefreshCw,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    label: 'Изменение статуса',
  },

  ticket_commented: {
    icon: MessageSquare,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    label: 'Комментарий',
  },

  ticket_resolved: {
    icon: Check,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    label: 'Решение заявки',
  },

  ticket_closed: {
    icon: Check,
    color: 'text-[var(--text-primary)]/45',
    bg: 'bg-[var(--hover-2)]',
    label: 'Закрытие заявки',
  },
};

const DEFAULT_META = {
  icon: Bell,
  color: 'text-[var(--text-primary)]/45',
  bg: 'bg-[var(--hover-2)]',
  label: 'Уведомление',
};

function getMeta(type: string) {
  return NOTIFICATION_META[type] || DEFAULT_META;
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days === 1) return 'Вчера';
  if (days < 7) return `${days} дн. назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   NOTIFICATION ITEM
   ═══════════════════════════════════════════════════════════════════ */

function NotificationItem({
  notification,
  onMarkRead,
  onClick,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onClick: (notification: Notification) => void;
}) {
  const meta = getMeta(notification.type);
  const Icon = meta.icon;

  const isUnread = !notification.read;

  return (
    <div
      onClick={() => onClick(notification)}
      className={`
        group relative
        flex items-start gap-4
        px-5 py-5
        cursor-pointer
        transition-colors duration-150

        ${
          isUnread
            ? 'bg-[var(--accent)]/[0.035] hover:bg-[var(--hover-1)]'
            : 'hover:bg-[var(--hover-1)]'
        }
      `}
    >
      {/* Индикатор непрочитанного */}
      {isUnread && (
        <span
          className="
            absolute left-0 top-0 bottom-0
            w-[3px]
            bg-[var(--accent)]
          "
        />
      )}

      {/* Иконка события */}
      <div
        className={`
          w-11 h-11
          rounded-xl
          flex items-center justify-center
          shrink-0
          ${meta.bg}
        `}
      >
        <Icon className={`w-5 h-5 ${meta.color}`} />
      </div>

      {/* Содержание */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3
            className={`
              text-base leading-snug
              ${
                isUnread
                  ? 'font-semibold text-[var(--text-primary)]'
                  : 'font-medium text-[var(--text-primary)]/75'
              }
            `}
          >
            {notification.title}
          </h3>

          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
          )}
        </div>

        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-primary)]/55">
          {notification.message}
        </p>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]/35">
            <Clock className="w-3.5 h-3.5" />
            {formatTime(notification.created_at)}
          </span>

          <span className="text-xs text-[var(--text-primary)]/20">
            ·
          </span>

          <span className="text-xs text-[var(--text-primary)]/40">
            {meta.label}
          </span>
        </div>
      </div>

      {/* Действия */}
      <div className="flex items-center gap-2 shrink-0">
        {isUnread && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMarkRead(notification.id);
            }}
            title="Отметить прочитанным"
            aria-label="Отметить прочитанным"
            className="
              p-2.5
              rounded-xl
              text-[var(--text-primary)]/40
              hover:text-[var(--accent)]
              hover:bg-[var(--hover-2)]
              transition-colors
            "
          >
            <Check className="w-4 h-4" />
          </button>
        )}

        <ChevronRight
          className="
            w-4 h-4
            text-[var(--text-primary)]/20
            group-hover:text-[var(--accent)]
            group-hover:translate-x-0.5
            transition-all
          "
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function NotificationsPage() {
  const navigate = useNavigate();

  const {
    unreadCount,
    refreshUnreadCount,
  } = useNotifications();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  /* ═══════════════════════════════════════════════════════════════
     LOAD NOTIFICATIONS
     ═══════════════════════════════════════════════════════════════ */

  const loadNotifications = useCallback(async () => {
    setLoading(true);

    try {
      const response = await notificationsApi.getAll(
        page,
        PAGE_SIZE,
        unreadOnly,
      );

      setNotifications(response.items || []);
      setTotalPages(response.total_pages || 1);
      setTotalItems(response.total_items || 0);
    } catch (error) {
      console.error('Не удалось загрузить уведомления:', error);

      setNotifications([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  /* ═══════════════════════════════════════════════════════════════
     FILTER
     ═══════════════════════════════════════════════════════════════ */

  const changeFilter = (onlyUnread: boolean) => {
    if (unreadOnly === onlyUnread) return;

    setPage(1);
    setUnreadOnly(onlyUnread);
  };

  /* ═══════════════════════════════════════════════════════════════
     MARK ONE AS READ
     ═══════════════════════════════════════════════════════════════ */

  const handleMarkRead = async (id: string) => {
    const notification = notifications.find(item => item.id === id);

    if (!notification || notification.read) return;

    try {
      await notificationsApi.markAsRead(id);

      if (unreadOnly) {
        setNotifications(prev =>
          prev.filter(item => item.id !== id)
        );

        setTotalItems(prev => Math.max(0, prev - 1));
      } else {
        setNotifications(prev =>
          prev.map(item =>
            item.id === id
              ? { ...item, read: true }
              : item
          )
        );
      }

      await refreshUnreadCount();
    } catch (error) {
      console.error('Не удалось отметить уведомление:', error);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     MARK ALL AS READ
     ═══════════════════════════════════════════════════════════════ */

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;

    setMarkingAll(true);

    try {
      /*
       * Загружаем максимум по 100 непрочитанных уведомлений.
       * Всегда page=1, потому что после отметки они
       * исчезают из unreadOnly-выборки.
       */
      while (true) {
        const response = await notificationsApi.getAll(
          1,
          BULK_PAGE_SIZE,
          true,
        );

        if (!response.items.length) {
          break;
        }

        await Promise.all(
          response.items.map(notification =>
            notificationsApi.markAsRead(notification.id)
          )
        );
      }

      await refreshUnreadCount();
      await loadNotifications();
    } catch (error) {
      console.error('Ошибка массового прочтения:', error);

      await refreshUnreadCount();
      await loadNotifications();
    } finally {
      setMarkingAll(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     NOTIFICATION CLICK
     ═══════════════════════════════════════════════════════════════ */

  const handleNotificationClick = async (notification: Notification) => {
    // Отмечаем прочитанным, не блокируя переход
    if (!notification.read) {
      void handleMarkRead(notification.id);
    }

    const ticketNumber = notification.data?.number;

    if (ticketNumber) {
      navigate(`/tickets/${ticketNumber}`);
      return;
    }

    /*
     * Если в уведомлении есть только UUID,
     * получаем заявку и используем её номер.
     */
    const ticketId = notification.data?.ticket_id;

    if (ticketId) {
      try {
        const ticket = await ticketsApi.getById(ticketId);

        if (ticket?.number) {
          navigate(`/tickets/${ticket.number}`);
        }
      } catch (error) {
        console.error('Не удалось открыть заявку:', error);
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     PAGINATION
     ═══════════════════════════════════════════════════════════════ */

  const pageNumbers = (() => {
    const pages: number[] = [];

    const count = Math.min(5, totalPages);

    const start = Math.max(
      1,
      Math.min(page - 2, totalPages - count + 1),
    );

    for (let index = 0; index < count; index++) {
      pages.push(start + index);
    }

    return pages;
  })();

  /* ═══════════════════════════════════════════════════════════════
     LOADING
     ═══════════════════════════════════════════════════════════════ */

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="w-full max-w-[1900px] mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Уведомления
            </h1>

            {unreadCount > 0 && (
              <span
                className="
                  px-2.5 py-1
                  rounded-lg
                  bg-[var(--accent-soft)]
                  text-sm font-semibold
                  text-[var(--accent)]
                  tabular-nums
                "
              >
                {unreadCount}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-base text-[var(--text-primary)]/45">
            События по вашим заявкам
          </p>
        </div>

        {/* MARK ALL */}
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={markingAll || unreadCount === 0}
          className="
            inline-flex items-center justify-center gap-2
            px-4 py-2.5
            rounded-xl
            border border-[var(--border-color)]
            bg-[var(--hover-1)]
            hover:bg-[var(--hover-2)]
            text-sm font-medium
            text-[var(--text-primary)]/70
            disabled:opacity-40
            disabled:cursor-not-allowed
            transition-colors
          "
        >
          {markingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCheck className="w-4 h-4" />
          )}

          {markingAll ? 'Обрабатываем...' : 'Прочитать все'}
        </button>
      </div>

      {/* =========================================================
          FILTERS
      ========================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)]">

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeFilter(false)}
            className={`
              px-5 py-3
              border-b-2
              text-sm font-medium
              transition-colors

              ${
                !unreadOnly
                  ? 'border-[var(--accent)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]'
              }
            `}
          >
            Все
          </button>

          <button
            type="button"
            onClick={() => changeFilter(true)}
            className={`
              flex items-center gap-2
              px-5 py-3
              border-b-2
              text-sm font-medium
              transition-colors

              ${
                unreadOnly
                  ? 'border-[var(--accent)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]'
              }
            `}
          >
            Непрочитанные

            {unreadCount > 0 && (
              <span
                className="
                  px-2 py-0.5
                  rounded-full
                  bg-[var(--hover-2)]
                  text-xs tabular-nums
                "
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* REFRESH */}
        <button
          type="button"
          onClick={() => void loadNotifications()}
          disabled={loading || markingAll}
          title="Обновить уведомления"
          className="
            p-2.5 mb-1
            rounded-xl
            text-[var(--text-primary)]/40
            hover:text-[var(--text-primary)]
            hover:bg-[var(--hover-1)]
            disabled:opacity-40
            transition-colors
          "
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* =========================================================
          NOTIFICATION LIST
      ========================================================= */}
      <section
        className="
          rounded-2xl
          border border-[var(--border-color)]
          bg-[var(--bg-card)]
          overflow-hidden
        "
      >

        {/* LIST HEADER */}
        <div
          className="
            flex items-center justify-between gap-3
            px-5 py-4
            border-b border-[var(--border-color)]
            bg-[var(--hover-1)]
          "
        >
          <span className="text-sm font-medium text-[var(--text-primary)]/50">
            {unreadOnly
              ? `${totalItems} непрочитанных`
              : `${totalItems} уведомлений`}
          </span>

          {loading && (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/35" />
          )}
        </div>

        {/* CONTENT */}
        {loading && notifications.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div
              className="
                w-14 h-14
                mx-auto
                rounded-2xl
                bg-[var(--hover-1)]
                flex items-center justify-center
              "
            >
              <Bell className="w-7 h-7 text-[var(--text-primary)]/20" />
            </div>

            <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
              {unreadOnly
                ? 'Нет непрочитанных уведомлений'
                : 'Уведомлений пока нет'}
            </h3>

            <p className="mt-2 text-sm text-[var(--text-primary)]/40">
              {unreadOnly
                ? 'Все уведомления прочитаны'
                : 'Здесь будут появляться события по вашим заявкам'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
                onClick={handleNotificationClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* =========================================================
          PAGINATION
      ========================================================= */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4">

          <span className="text-sm text-[var(--text-primary)]/40">
            Страница {page} из {totalPages}
          </span>

          <div className="flex items-center gap-1.5">
            {/* PREVIOUS */}
            <button
              type="button"
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1 || loading}
              className="
                p-2.5
                rounded-xl
                border border-[var(--border-color)]
                text-[var(--text-primary)]/60
                hover:bg-[var(--hover-2)]
                disabled:opacity-30
                transition-colors
              "
              title="Предыдущая страница"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* PAGE NUMBERS */}
            {pageNumbers.map(number => (
              <button
                key={number}
                type="button"
                onClick={() => setPage(number)}
                disabled={loading}
                className={`
                  w-10 h-10
                  rounded-xl
                  text-sm font-medium
                  transition-colors
                  disabled:opacity-50

                  ${
                    number === page
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                  }
                `}
              >
                {number}
              </button>
            ))}

            {/* NEXT */}
            <button
              type="button"
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages || loading}
              className="
                p-2.5
                rounded-xl
                border border-[var(--border-color)]
                text-[var(--text-primary)]/60
                hover:bg-[var(--hover-2)]
                disabled:opacity-30
                transition-colors
              "
              title="Следующая страница"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}