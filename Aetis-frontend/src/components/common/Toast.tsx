import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. 0 keeps it until closed. */
  duration?: number;
  title?: string;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
}

interface ToastContextValue {
  show: (tone: ToastTone, message: string, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4_000,
  info: 5_000,
  warning: 6_000,
  error: 8_000,
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const ACCENT_CLASSES: Record<ToastTone, string> = {
  success: "border-l-[var(--feedback-success)]",
  error: "border-l-[var(--feedback-danger)]",
  warning: "border-l-[var(--feedback-warning)]",
  info: "border-l-[var(--feedback-info)]",
};

const ICON_CLASSES: Record<ToastTone, string> = {
  success: "text-[var(--feedback-success)]",
  error: "text-[var(--feedback-danger)]",
  warning: "text-[var(--feedback-warning)]",
  info: "text-[var(--feedback-info)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = options.duration ?? DEFAULT_DURATION[tone];

      setToasts((prev) => [
        ...prev.slice(-(MAX_VISIBLE - 1)),
        { id, tone, message, title: options.title },
      ]);

      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  // Clear pending timers when the provider unmounts
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (m, o) => show("success", m, o),
      error: (m, o) => show("error", m, o),
      warning: (m, o) => show("warning", m, o),
      info: (m, o) => show("info", m, o),
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {typeof document !== "undefined" &&
        createPortal(
          <div
            aria-live="polite"
            aria-relevant="additions"
            className="pointer-events-none fixed inset-x-4 bottom-4 z-[var(--z-toast)] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96"
          >
            <AnimatePresence initial={false}>
              {toasts.map((t) => {
                const Icon = ICONS[t.tone];
                return (
                  <motion.div
                    key={t.id}
                    layout
                    role={t.tone === "error" ? "alert" : "status"}
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className={`pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border border-l-4 border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[shadow:var(--shadow-lg)] ${ACCENT_CLASSES[t.tone]}`}
                  >
                    <Icon
                      size={20}
                      aria-hidden
                      className={`mt-0.5 shrink-0 ${ICON_CLASSES[t.tone]}`}
                    />
                    <div className="min-w-0 flex-1">
                      {t.title && (
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {t.title}
                        </p>
                      )}
                      <p className="break-words text-sm text-[var(--text-secondary)]">
                        {t.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(t.id)}
                      aria-label="Dismiss notification"
                      className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)]"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return ctx;
}

export default ToastProvider;