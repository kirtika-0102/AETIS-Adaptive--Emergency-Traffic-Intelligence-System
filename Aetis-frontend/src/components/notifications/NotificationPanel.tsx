import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Camera,
  CheckCheck,
  CheckCircle2,
  Info,
  Siren,
  TrafficCone,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import type {
  AppNotification,
  NotificationType,
} from "../../types/notification.types";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import EmptyState from "../common/EmptyState";
import Tabs from "../common/Tabs";

export interface NotificationPanelProps {
  notifications: AppNotification[];
  /** Total unread, from the server. It can exceed the number of items loaded. */
  unreadCount: number;
  isLoading: boolean;
  error?: string | null;
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkAllRead: () => void | Promise<void>;
  /** Called after an item navigates somewhere, so the host can close the panel */
  onClose: () => void;
  className?: string;
}

type TabId = "all" | "unread";

const MAX_VISIBLE = 50;
const TICK_MS = 30_000;

const TYPE_META: Record<NotificationType, { icon: LucideIcon; tile: string }> = {
  emergency_incoming: { icon: Siren, tile: "bg-[var(--color-clay-500)]" },
  emergency_assigned: { icon: BellRing, tile: "bg-[var(--color-clay-500)]" },
  vehicle_dispatched: { icon: Truck, tile: "bg-[var(--color-teal-600)]" },
  signal_priority: { icon: TrafficCone, tile: "bg-[var(--color-olive-500)]" },
  signal_fault: { icon: AlertTriangle, tile: "bg-[var(--feedback-warning)]" },
  detection: { icon: Camera, tile: "bg-[var(--color-teal-500)]" },
  acknowledgement: { icon: CheckCircle2, tile: "bg-[var(--color-olive-500)]" },
  emergency_completed: { icon: CheckCheck, tile: "bg-[var(--color-olive-600)]" },
  system: { icon: Info, tile: "bg-[var(--color-teal-600)]" },
};

/** Used if the backend sends a type this build does not know about */
const FALLBACK_META = { icon: Bell, tile: "bg-[var(--text-muted)]" };

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Links come from the backend, so only in-app paths are followed. Anything
 * else (another site, a protocol-relative "//host", a backslash trick, control
 * characters) is ignored and the item just gets marked as read.
 */
function safeInternalPath(link?: string | null): string | null {
  if (typeof link !== "string") return null;

  const value = link.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  return value;
}

/** Fire and forget: a failed call must never become an unhandled rejection */
function run(fn: () => void | Promise<void>) {
  try {
    Promise.resolve(fn()).catch(() => undefined);
  } catch {
    /* the hook reports its own errors */
  }
}

function formatAge(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Time unknown";

  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 24 * 60 * 60) return `${formatDuration(seconds)} ago`;
  return formatDateTime(iso);
}

const createdKey = (n: AppNotification) => {
  const t = Date.parse(n.createdAt);
  return Number.isFinite(t) ? t : 0;
};

function NotificationPanel({
  notifications,
  unreadCount,
  isLoading,
  error,
  onMarkRead,
  onMarkAllRead,
  onClose,
  className,
}: NotificationPanelProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("all");
  const [now, setNow] = useState(() => Date.now());

  // The panel only exists while open, so this timer runs only then
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => createdKey(b) - createdKey(a)),
    [notifications]
  );

  const visible = useMemo(
    () => (tab === "unread" ? sorted.filter((n) => !n.read) : sorted),
    [sorted, tab]
  );

  const shown = visible.slice(0, MAX_VISIBLE);
  const hiddenCount = visible.length - shown.length;

  const handleSelect = (n: AppNotification) => {
    if (!n.read) run(() => onMarkRead(n.id));

    const path = safeInternalPath(n.link);
    if (path) {
      navigate(path);
      onClose();
    }
  };

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <h2 className="text-base">Notifications</h2>
        <button
          type="button"
          onClick={() => run(onMarkAllRead)}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-semibold text-[var(--action-accent)] transition-colors hover:bg-[var(--color-clay-50)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
        >
          <CheckCheck size={14} aria-hidden />
          Mark all read
        </button>
      </div>

      <div className="px-2">
        <Tabs
          aria-label="Filter notifications"
          tabs={[
            { id: "all", label: "All" },
            { id: "unread", label: "Unread", count: unreadCount },
          ]}
          activeId={tab}
          onChange={(id) => setTab(id as TabId)}
        />
      </div>

      {error && (
        <div
          role="status"
          className="border-b border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-2.5 text-xs text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
        aria-busy={isLoading}
      >
        {isLoading && notifications.length === 0 ? (
          <ul className="divide-y divide-[var(--border-subtle)]">
            <li className="sr-only">Loading notifications</li>
            {[0, 1, 2].map((i) => (
              <li key={i} aria-hidden className="flex items-start gap-3 px-4 py-3.5">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
                  <div className="h-3 w-4/5 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
                </div>
              </li>
            ))}
          </ul>
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon={<Bell size={26} />}
            title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
            description={
              tab === "unread"
                ? "New alerts appear here as they arrive."
                : "Alerts about emergencies, vehicles and signals appear here."
            }
          />
        ) : (
          <>
            <ul
              className={cx(
                "divide-y divide-[var(--border-subtle)] transition-opacity",
                isLoading ? "opacity-60" : "opacity-100"
              )}
            >
              {shown.map((n) => {
                const meta = TYPE_META[n.type] ?? FALLBACK_META;
                const Icon = meta.icon;

                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(n)}
                      className={cx(
                        "flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-muted)]",
                        n.urgent
                          ? "border-l-[var(--color-clay-500)]"
                          : "border-l-transparent",
                        !n.read && "bg-[var(--color-teal-50)]"
                      )}
                    >
                      {!n.read && <span className="sr-only">Unread. </span>}

                      <span
                        aria-hidden
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
                          meta.tile
                        )}
                      >
                        <Icon size={18} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={cx(
                              "break-words text-sm text-[var(--text-primary)]",
                              n.read ? "font-semibold" : "font-bold"
                            )}
                          >
                            {n.title}
                          </span>
                          {!n.read && (
                            <span
                              aria-hidden
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-clay-500)]"
                            />
                          )}
                        </span>

                        <span className="mt-0.5 line-clamp-3 block break-words text-sm text-[var(--text-secondary)]">
                          {n.message}
                        </span>

                        <span className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          {n.urgent && (
                            <span className="font-bold text-[var(--color-clay-700)]">
                              Urgent
                            </span>
                          )}
                          <time
                            dateTime={n.createdAt}
                            title={formatDateTime(n.createdAt)}
                          >
                            {formatAge(n.createdAt, now)}
                          </time>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {hiddenCount > 0 && (
              <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                Showing the latest {MAX_VISIBLE}. Older notifications are hidden.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default NotificationPanel;