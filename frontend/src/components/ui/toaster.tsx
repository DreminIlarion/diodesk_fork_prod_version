// components/ui/toaster.tsx
import { useToast } from './use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

// Сколько времени тост висит на экране
const AUTO_DISMISS_MS = 4500;

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Авто-закрытие: для каждого нового тоста ставим таймер на dismiss
  useEffect(() => {
    toasts.forEach(t => {
      // Если тост уже скрыт (open=false) или таймер уже стоит — пропускаем
      if (!t.open || timers.current.has(t.id)) return;

      const timer = setTimeout(() => {
        dismiss(t.id);
        timers.current.delete(t.id);
      }, AUTO_DISMISS_MS);

      timers.current.set(t.id, timer);
    });

    // Чистим таймеры для тостов, которых больше нет
    const activeIds = new Set(toasts.map(t => t.id));
    timers.current.forEach((timer, id) => {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    });
  }, [toasts, dismiss]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      timers.current.forEach(timer => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  // Фильтруем только видимые тосты (open=true)
  const visible = toasts.filter(t => t.open);

  return createPortal(
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {visible.map(t => {
          const isError = t.variant === 'destructive';
          const isSuccess = (t as any).variant === 'success';

          const Icon = isError ? AlertTriangle : isSuccess ? CheckCircle2 : Info;
          const iconColor = isError
            ? 'text-[var(--accent)]'
            : isSuccess
              ? 'text-emerald-400'
              : 'text-[var(--info)]';
          const borderColor = isError
            ? 'border-[var(--accent)]/30'
            : isSuccess
              ? 'border-emerald-500/30'
              : 'border-[var(--border-color)]';

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className={`pointer-events-auto w-[300px] px-3 py-2.5 rounded-xl border
                          bg-[var(--bg-card)] flex items-start gap-2.5 ${borderColor}`}
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} />

              <div className="flex-1 min-w-0">
                {t.title && (
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                    {t.title}
                  </p>
                )}
                {t.description && (
                  <p className="text-xs text-[var(--text-primary)]/60 leading-relaxed mt-0.5 line-clamp-3">
                    {t.description}
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  // Гасим таймер если он есть
                  const timer = timers.current.get(t.id);
                  if (timer) {
                    clearTimeout(timer);
                    timers.current.delete(t.id);
                  }
                  dismiss(t.id);
                }}
                className="p-0.5 -mt-0.5 -mr-0.5 rounded-md text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)] transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}