import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLocation } from "react-router-dom";

import { useNotifications } from "../../hooks/useNotifications";
import NotificationPanel from "./NotificationPanel";

const createdKey = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Bell button with an unread badge and a dropdown panel.
 *
 * Positioning: from the sm breakpoint the panel hangs under the bell. Below
 * it, the wrapper is not positioned, so the panel anchors to the (sticky)
 * topbar instead and spans the screen width. The bell sits in the middle of
 * the bar on a phone, so anchoring to the bell would push the panel off the
 * left edge. This avoids `position: fixed`, which would misbehave inside the
 * topbar's blur effect.
 */
function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const panelId = useId();

  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousUnread = useRef<number | null>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /* Escape closes and returns focus to the bell */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /* The topbar stays mounted across pages, so close on navigation */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /**
   * Tell screen-reader users when something new arrives. The first count
   * after loading is only recorded, never announced, so opening the app does
   * not read out the whole backlog.
   */
  useEffect(() => {
    if (isLoading) return;

    const previous = previousUnread.current;
    previousUnread.current = unreadCount;

    if (previous === null || unreadCount <= previous) return;

    const newest = notifications
      .filter((n) => !n.read)
      .sort((a, b) => createdKey(b.createdAt) - createdKey(a.createdAt))[0];
    const added = unreadCount - previous;

    setAnnouncement(
      added === 1 && newest
        ? `${newest.urgent ? "Urgent notification" : "New notification"}: ${newest.title}`
        : `${added} new notifications`
    );
  }, [isLoading, unreadCount, notifications]);

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={wrapperRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)]"
      >
        <Bell size={22} aria-hidden />

        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-clay-600)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--bg-app)]"
          >
            {badgeText}
          </span>
        )}
      </button>

      {/* Polite live region for new arrivals */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-3 top-[calc(100%+8px)] z-[var(--z-dropdown)] flex max-h-[min(70vh,520px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] sm:inset-x-auto sm:right-0 sm:w-96"
          >
            <NotificationPanel
              notifications={notifications}
              unreadCount={unreadCount}
              isLoading={isLoading}
              error={error}
              onMarkRead={markAsRead}
              onMarkAllRead={markAllAsRead}
              onClose={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;