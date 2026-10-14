import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import type { TrafficSignal } from "../../types/signal.types";
import EmptyState from "../common/EmptyState";
import SignalStatusCard from "./SignalStatusCard";

export interface SignalOnRouteListProps {
  signals: TrafficSignal[];
  isLoading: boolean;
  skeletonCount?: number;
}

const TICK_MS = 1_000;

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

/** Compact list of the signals on one vehicle's route, nearest first */
function SignalOnRouteList({
  signals,
  isLoading,
  skeletonCount = 3,
}: SignalOnRouteListProps) {
  const sorted = useMemo(
    () => [...signals].sort((a, b) => arrivalKey(a) - arrivalKey(b)),
    [signals]
  );
  // One shared clock drives every card in the list
  const now = useNow(sorted.length > 0);

  const faultCount = useMemo(
    () => sorted.filter((s) => s.status === "fault").length,
    [sorted]
  );

  if (isLoading && sorted.length === 0) {
    return (
      <ul className="space-y-2" aria-busy="true">
        <li className="sr-only">Loading signals</li>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li
            key={i}
            aria-hidden
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        compact
        title="No signals on this route"
        description="Signals appear here once the route is planned."
      />
    );
  }

  return (
    <div>
      {faultCount > 0 && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-3.5 py-3 text-sm text-[var(--color-clay-700)]"
        >
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            {faultCount === 1
              ? "1 signal on this route is not responding and cannot be cleared automatically."
              : `${faultCount} signals on this route are not responding and cannot be cleared automatically.`}
          </p>
        </div>
      )}

      <ul
        className={`space-y-2 transition-opacity ${
          isLoading ? "opacity-60" : "opacity-100"
        }`}
        aria-busy={isLoading}
      >
        {sorted.map((signal) => (
          <li key={signal.id}>
            <SignalStatusCard signal={signal} now={now} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SignalOnRouteList;