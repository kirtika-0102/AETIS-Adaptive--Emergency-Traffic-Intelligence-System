import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in a sticky bar under the content (buttons, etc.) */
  footer?: ReactNode;
  size?: ModalSize;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog rendered in a portal.
 *  - Closes on Escape and backdrop click (calls onClose; the parent decides
 *    whether to actually close, e.g. not while a request is running)
 *  - Traps Tab focus, locks page scroll, restores focus on close
 *  - Bottom sheet on small screens, centered card from the sm breakpoint
 */
function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Parents usually pass an inline onClose; a ref keeps the effect below from
  // re-running (and stealing focus) on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Start on the first field in the content, not the close button
    const initial =
      bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      closeRef.current ??
      dialogRef.current;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.getClientRects().length > 0);

      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialog.contains(active);

      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center sm:items-center sm:p-4"
        >
          <div
            aria-hidden
            onClick={() => onCloseRef.current()}
            className="absolute inset-0 bg-[rgba(4,24,34,0.6)] backdrop-blur-sm"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-[var(--bg-surface)] shadow-[shadow:var(--shadow-xl)] focus:outline-none sm:max-h-[88vh]",
              "rounded-t-[var(--radius-2xl)] sm:rounded-[var(--radius-xl)]",
              SIZE_CLASSES[size]
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 id={titleId} className="text-lg text-[var(--text-primary)]">
                {title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => onCloseRef.current()}
                aria-label="Close dialog"
                className="rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div
              ref={bodyRef}
              className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin"
            >
              {children}
            </div>

            {footer && (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default Modal;