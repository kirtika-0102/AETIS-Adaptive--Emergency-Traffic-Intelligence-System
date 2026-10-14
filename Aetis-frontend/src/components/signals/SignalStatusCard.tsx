import { useEffect, useState } from "react";
import { AlertTriangle, TrafficCone } from "lucide-react";

import type { SignalStatus, TrafficSignal } from "../../types/signal.types";
import { formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";

export interface SignalStatusCardProps {
  signal: TrafficSignal;
  /**
   * Shared clock (epoch ms) from a parent list, so one timer drives every
   * card. When omitted, the card runs its own.
   */
  now?: number;
  /** Tighter layout for use inside side panels */
  compact?: boolean;
  className?: string;
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TICK_MS = 1_000;

const STATUS: Record<SignalStatus, { label: string; tone: Tone; tile: string }> = {
  normal: { label: "Normal", tone: "success", tile: "bg-[var(--color-olive-500)]" },
  priority: { label: "Priority active", tone: "danger", tile: "bg-[var(--color-clay-500)]" },
  pending: { label: "Priority pending", tone: "warning", tile: "bg-[var(--feedback-warning)]" },
  fault: { label: "Fault", tone: "neutral", tile: "bg-[var(--text-muted)]" },
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}

const formatClock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Wording is careful on purpose: once the expected time has passed on a
 * signal that is no longer in priority, we cannot tell whether the vehicle
 * went through or the detection was missed, so it says only what is known.
 */
function describeArrival(
  expectedAt: number | undefined,
  status: string,
  now: number
): { text: string; clock: string | null; overdue: boolean } | null {
  if (expectedAt === undefined || !Number.isFinite(expectedAt)) return null;

  const diff = Math.round((expectedAt - now) / 1000);

  if (diff > 0) {
    return {
      text: `Vehicle due in ${formatDuration(diff)}`,
      clock: formatClock(expectedAt),
      overdue: false,
    };
  }

  if (status === "priority" || status === "pending") {
    return diff > -5
      ? { text: "Vehicle due now", clock: null, overdue: false }
      : { text: `Vehicle ${formatDuration(-diff)} overdue`, clock: null, overdue: true };
  }

  return { text: "Expected arrival time has passed", clock: null, overdue: false };
}

function SignalStatusCard({
  signal,
  now: nowProp,
  compact = false,
  className,
}: SignalStatusCardProps) {
  const ownNow = useNow(nowProp === undefined);
  const now = nowProp ?? ownNow;

  const meta = STATUS[signal.status] ?? {
    label: String(signal.status),
    tone: "neutral" as Tone,
    tile: "bg-[var(--text-muted)]",
  };

  const arrival = describeArrival(signal.expectedArrivalAt, signal.status, now);

  return (
    <article
      aria-label={`${signal.name}, ${meta.label}`}
      className={cx("card", compact ? "p-3.5" : "p-4", className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cx(
            "flex shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
            compact ? "h-9 w-9" : "h-11 w-11",
            meta.tile
          )}
        >
          <TrafficCone size={compact ? 18 : 22} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="truncate text-sm font-semibold">{signal.name}</h3>
            <Badge tone={meta.tone} size="sm" dot>
              {meta.label}
            </Badge>
          </div>

          {!compact && (
            <p className="mt-0.5 font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
              {signal.id}
            </p>
          )}

          {arrival && (
            <p
              className={cx(
                "mt-1.5 text-sm",
                arrival.overdue
                  ? "font-semibold text-[var(--color-clay-600)]"
                  : "text-[var(--text-secondary)]"
              )}
            >
              {arrival.text}
              {arrival.clock && (
                <span className="text-[var(--text-muted)]">
                  {" "}
                  · around {arrival.clock}
                </span>
              )}
            </p>
          )}

          {signal.status === "fault" && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--color-clay-700)]">
              <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
              Not responding. Priority cannot be applied at this signal.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default SignalStatusCard;