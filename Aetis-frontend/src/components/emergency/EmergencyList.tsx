import type { Emergency } from "../../types/emergency.types";
import EmptyState from "../common/EmptyState";
import EmergencyCard from "./EmergencyCard";

export interface EmergencyListProps {
  emergencies: Emergency[];
  isLoading: boolean;
  emptyMessage?: string;
  /** Placeholder cards shown on the first load */
  skeletonCount?: number;
}

function EmergencyList({
  emergencies,
  isLoading,
  emptyMessage = "No emergencies to show.",
  skeletonCount = 3,
}: EmergencyListProps) {
  // First load: placeholders shaped like the real cards
  if (isLoading && emergencies.length === 0) {
    return (
      <ul className="space-y-3" aria-busy="true">
        <li className="sr-only">Loading emergencies</li>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li
            key={i}
            aria-hidden
            className="card flex items-start gap-4 p-4"
          >
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (emergencies.length === 0) {
    return <EmptyState compact title={emptyMessage} />;
  }

  return (
    <ul
      className={`space-y-3 transition-opacity ${
        isLoading ? "opacity-60" : "opacity-100"
      }`}
      aria-busy={isLoading}
    >
      {emergencies.map((emergency) => (
        <li key={emergency.id}>
          <EmergencyCard emergency={emergency} />
        </li>
      ))}
    </ul>
  );
}

export default EmergencyList;