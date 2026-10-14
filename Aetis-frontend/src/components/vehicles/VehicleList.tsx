import { useMemo } from "react";

import type { Vehicle } from "../../types/vehicle.types";
import EmptyState from "../common/EmptyState";
import VehicleCard from "./VehicleCard";

export interface VehicleListProps {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (vehicle: Vehicle) => void;
  isLoading: boolean;
  emptyMessage?: string;
  /** Placeholder cards shown on the first load */
  skeletonCount?: number;
}

function VehicleList({
  vehicles,
  selectedId,
  onSelect,
  isLoading,
  emptyMessage = "No vehicles are available nearby.",
  skeletonCount = 3,
}: VehicleListProps) {
  /**
   * "Fastest" is only meaningful when there is a choice, so it appears only
   * if at least two vehicles are available. Ties mark the first in the list.
   */
  const fastestId = useMemo(() => {
    const candidates = vehicles.filter(
      (v) => v.status === "available" && Number.isFinite(v.etaSeconds)
    );
    if (candidates.length < 2) return null;

    return candidates.reduce((best, v) =>
      v.etaSeconds < best.etaSeconds ? v : best
    ).id;
  }, [vehicles]);

  if (isLoading && vehicles.length === 0) {
    return (
      <ul className="space-y-3" aria-busy="true">
        <li className="sr-only">Loading vehicles</li>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li
            key={i}
            aria-hidden
            className="card flex items-center gap-4 p-4"
          >
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
            </div>
            <div className="h-8 w-12 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-sand-200)]" />
          </li>
        ))}
      </ul>
    );
  }

  if (vehicles.length === 0) {
    return (
      <EmptyState
        compact
        title={emptyMessage}
        description="Every nearby vehicle may be busy or off duty. Check again in a moment."
      />
    );
  }

  return (
    <ul
      className={`space-y-3 transition-opacity ${
        isLoading ? "opacity-60" : "opacity-100"
      }`}
      aria-busy={isLoading}
    >
      {vehicles.map((vehicle) => (
        <li key={vehicle.id}>
          <VehicleCard
            vehicle={vehicle}
            selected={vehicle.id === selectedId}
            isFastest={vehicle.id === fastestId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

export default VehicleList;