import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { notificationsApi, onTokenRefreshed } from '../api/client';
import type { Notification } from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  lastNotification: Notification | null;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  lastNotification: null,
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

const ORIGINAL_TITLE = document.title || 'ДИО Деск';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthStore();

  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);
  const [tokenRefreshTrigger, setTokenRefreshTrigger] = useState(0);

  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to refresh unread count:', err);
    }
  }, [user]);

  const scheduleRefreshUnreadCount = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      refreshUnreadCount();
    }, 250);
  }, [refreshUnreadCount]);

  // Первичная загрузка
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Подписка на обновление токена
  useEffect(() => {
    const unsubscribe = onTokenRefreshed(() => {
      console.log('[notifications] token refreshed, will reconnect SSE');
      setTokenRefreshTrigger(prev => prev + 1);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // SSE
  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    abortRef.current = controller;

    notificationsApi.stream({
      signal: controller.signal,
      onOpen: () => {
        console.log('[notifications] SSE connected');
      },
      onNotification: (notification) => {
        setLastNotification(notification);
        scheduleRefreshUnreadCount();
      },
      onError: (err) => {
        console.error('[notifications] stream error:', err);
      },
    }).catch(err => {
      if (!controller.signal.aborted) {
        console.error('[notifications] stream fatal error:', err);
      }
    });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [user, scheduleRefreshUnreadCount, tokenRefreshTrigger]);

  // Мигание title
  useEffect(() => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }

    if (unreadCount <= 0) {
      document.title = ORIGINAL_TITLE;
      return;
    }

    const notifTitle = `(${unreadCount}) Новые уведомления!`;
    let showOriginal = false;

    document.title = notifTitle;

    blinkIntervalRef.current = setInterval(() => {
      showOriginal = !showOriginal;
      document.title = showOriginal ? ORIGINAL_TITLE : notifTitle;
    }, 1500);

    return () => {
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }
      document.title = ORIGINAL_TITLE;
    };
  }, [unreadCount]);

  useEffect(() => {
    return () => {
      if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      abortRef.current?.abort();
      document.title = ORIGINAL_TITLE;
    };
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        unreadCount,
        refreshUnreadCount,
        lastNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}