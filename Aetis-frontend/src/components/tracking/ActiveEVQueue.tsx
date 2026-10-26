import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Flame, HeartPulse, ShieldAlert } from "lucide-react";

import type { TrackedEV } from "../../types/tracking.types";
import type { VehicleType } from "../../types/vehicle.types";
import { formatDuration } from "../../utils/formatters";
import EmptyState from "../common/EmptyState";

export interface ActiveEVQueueProps {
  evs: TrackedEV[];
  /** The selected vehicle's emergencyId */
  selectedId: string | null;
  onSelect: (emergencyId: string) => void;
  isLoading: boolean;
  skeletonCount?: number;
}

const TYPE_STYLE: Record<VehicleType, { icon: LucideIcon; tile: string }> = {
  ambulance: { icon: HeartPulse, tile: "bg-[var(--color-olive-500)]" },
  police: { icon: ShieldAlert, tile: "bg-[var(--color-teal-600)]" },
  fire: { icon: Flame, tile: "bg-[var(--color-clay-500)]" },
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Vehicles with no usable ETA go to the bottom */
const etaOf = (ev: TrackedEV) =>
  Number.isFinite(ev.etaSeconds) ? ev.etaSeconds : Number.MAX_SAFE_INTEGER;

function ActiveEVQueue({
  evs,
  selectedId,
  onSelect,
  isLoading,
  skeletonCount = 3,
}: ActiveEVQueueProps) {
  // Closest to arriving first
  const sorted = useMemo(
    () => [...evs].sort((a, b) => etaOf(a) - etaOf(b)),
    [evs]
  );

  if (isLoading && evs.length === 0) {
    return (
      <ul className="space-y-2" aria-busy="true">
        <li className="sr-only">Loading vehicles</li>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li
            key={i}
            aria-hidden
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
            </div>
            <div className="h-6 w-10 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-sand-200)]" />
          </li>
        ))}
      </ul>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        compact
        title="No vehicles on route"
        description="Dispatched vehicles appear here as soon as they start their trip."
      />
    );
  }

  return (
    <ul
      className={cx(
        "space-y-2 transition-opacity",
        isLoading ? "opacity-60" : "opacity-100"
      )}
      aria-busy={isLoading}
    >
      {sorted.map((ev) => {
        const style = TYPE_STYLE[ev.vehicleType] ?? TYPE_STYLE.ambulance;
        const Icon = style.icon;
        const selected = ev.emergencyId === selectedId;

        return (
          <li key={ev.emergencyId}>
            <button
              type="button"
              onClick={() => onSelect(ev.emergencyId)}
              aria-pressed={selected}
              className={cx(
                "flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors",
                selected
                  ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
                  style.tile
                )}
              >
                <Icon size={20} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {ev.vehicleLabel}
                  </span>
                  <span
                    aria-hidden
                    className="blink h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--feedback-success)]"
                  />
                </span>
                <span className="block truncate text-xs text-[var(--text-secondary)]">
                  To {ev.destinationName || "destination pending"}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block font-[family-name:var(--font-display)] text-base font-extrabold leading-tight">
                  {Number.isFinite(ev.etaSeconds)
                    ? ev.etaSeconds <= 0
                      ? "Arriving"
                      : formatDuration(ev.etaSeconds)
                    : "-"}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {Number.isFinite(ev.speedKmh)
                    ? `${Math.round(ev.speedKmh)} km/h`
                    : "-"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default ActiveEVQueue;