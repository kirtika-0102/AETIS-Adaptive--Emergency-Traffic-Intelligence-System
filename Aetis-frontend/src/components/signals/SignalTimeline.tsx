import { useEffect, useMemo, useState } from "react";

import type { SignalStatus, TrafficSignal } from "../../types/signal.types";
import { formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";
import EmptyState from "../common/EmptyState";

export interface SignalTimelineProps {
  signals: TrafficSignal[];
  className?: string;
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TICK_MS = 1_000;

const STATUS: Record<SignalStatus, { label: string; tone: Tone; dot: string }> = {
  normal: { label: "Normal", tone: "success", dot: "bg-[var(--color-olive-500)]" },
  priority: { label: "Priority active", tone: "danger", dot: "bg-[var(--color-clay-500)]" },
  pending: { label: "Priority pending", tone: "warning", dot: "bg-[var(--feedback-warning)]" },
  fault: { label: "Fault", tone: "neutral", dot: "bg-[var(--text-muted)]" },
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Signals with no usable arrival time go to the end */
const arrivalKey = (s: TrafficSignal) =>
  Number.isFinite(s.expectedArrivalAt)
    ? (s.expectedArrivalAt as number)
    : Number.MAX_SAFE_INTEGER;

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

/**
 * Vertical timeline of signals in the order the vehicle will reach them.
 * The step number carries the order, so it does not rely on colour.
 */
function SignalTimeline({ signals, className }: SignalTimelineProps) {
  const sorted = useMemo(
    () => [...signals].sort((a, b) => arrivalKey(a) - arrivalKey(b)),
    [signals]
  );
  const now = useNow(sorted.length > 0);

  if (sorted.length === 0) {
    return (
      <EmptyState
        compact
        title="No signals in the timeline"
        description="Signals appear here, in order, once a vehicle's route passes through them."
      />
    );
  }

  return (
    <ol aria-label="Signal activation order" className={cx("m-0", className)}>
      {sorted.map((s, i) => {
        const meta = STATUS[s.status] ?? {
          label: String(s.status),
          tone: "neutral" as Tone,
          dot: "bg-[var(--text-muted)]",
        };
        const arrival = describeArrival(s.expectedArrivalAt, s.status, now);
        const isLast = i === sorted.length - 1;

        return (
          <li key={s.id} className={cx("relative flex gap-4", !isLast && "pb-6")}>
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-3 top-6 bottom-0 w-px -translate-x-1/2 bg-[var(--border-default)]"
              />
            )}

            <span
              aria-hidden
              className={cx(
                "relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ring-4 ring-[var(--bg-surface)]",
                meta.dot
              )}
            >
              {i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <Badge tone={meta.tone} size="sm">
                  {meta.label}
                </Badge>
              </div>

              {arrival && (
                <p
                  className={cx(
                    "mt-1 text-sm",
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default SignalTimeline;