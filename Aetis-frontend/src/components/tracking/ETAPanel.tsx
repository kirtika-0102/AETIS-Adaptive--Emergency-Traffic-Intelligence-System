import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import type { TrackedEV } from "../../types/tracking.types";
import { VEHICLE_TYPE_LABELS } from "../../utils/constants";
import { formatDuration } from "../../utils/formatters";
import { routeRemainingMeters } from "../../utils/mapHelpers";
import EmptyState from "../common/EmptyState";

export interface ETAPanelProps {
  /** null shows an empty state (nothing selected, or not transmitting yet) */
  ev: TrackedEV | null;
  className?: string;
}

/** A position older than this is flagged, since the ETA can no longer be trusted */
const STALE_AFTER_SECONDS = 30;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function useNow(enabled: boolean, intervalMs = 5_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);

  return now;
}

const formatDistance = (meters: number) =>
  meters < 1000
    ? `${Math.max(10, Math.round(meters / 10) * 10)} m`
    : `${(meters / 1000).toFixed(1)} km`;

const formatClock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ETAPanel({ ev, className }: ETAPanelProps) {
  const now = useNow(ev !== null);

  const remainingMeters = useMemo(
    () => (ev ? routeRemainingMeters(ev.route, ev.location) : null),
    [ev]
  );

  if (!ev) {
    return (
      <section
        aria-label="Arrival estimate"
        className={cx("card-sand", className)}
      >
        <EmptyState
          compact
          icon={<Clock size={26} />}
          title="No live vehicle yet"
          description="Arrival details appear here once a vehicle is selected and sharing its location."
        />
      </section>
    );
  }

  const hasEta = Number.isFinite(ev.etaSeconds);
  const arriving = hasEta && ev.etaSeconds <= 0;

  const etaText = !hasEta ? "-" : arriving ? "Arriving" : formatDuration(ev.etaSeconds);
  const arrivalClock =
    hasEta && !arriving ? formatClock(now + ev.etaSeconds * 1000) : null;

  const updatedMs = ev.lastUpdateAt ? Date.parse(ev.lastUpdateAt) : NaN;
  const ageSeconds = Number.isFinite(updatedMs)
    ? Math.max(0, Math.floor((now - updatedMs) / 1000))
    : null;
  const isStale = ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS;

  return (
    <section
      aria-label="Arrival estimate"
      className={cx("card p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Estimated arrival</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-none text-[var(--text-primary)]">
            {etaText}
          </p>
          {arrivalClock && (
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Around {arrivalClock}
            </p>
          )}
        </div>

        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold">{ev.vehicleLabel}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {VEHICLE_TYPE_LABELS[ev.vehicleType] ?? ev.vehicleType}
          </p>
        </div>
      </div>

      {isStale && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-3.5 py-3 text-sm text-[var(--color-clay-700)]"
        >
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            No location update for {formatDuration(ageSeconds)}. The position and
            ETA shown may be out of date.
          </p>
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--border-subtle)] pt-4 text-sm">
        <div className="col-span-2">
          <dt className="text-[var(--text-muted)]">Destination</dt>
          <dd className="font-semibold">
            {ev.destinationName || "Not set yet"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Distance left</dt>
          <dd className="font-semibold">
            {remainingMeters !== null ? formatDistance(remainingMeters) : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Speed</dt>
          <dd className="font-semibold">
            {Number.isFinite(ev.speedKmh)
              ? `${Math.round(ev.speedKmh)} km/h`
              : "-"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default ETAPanel;