import type { LucideIcon } from "lucide-react";
import { Check, Clock, Flame, HeartPulse, ShieldAlert } from "lucide-react";

import type { Vehicle, VehicleType } from "../../types/vehicle.types";
import { VEHICLE_TYPE_LABELS } from "../../utils/constants";
import { formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";
import VehicleStatusBadge from "./VehicleStatusBadge";

export interface VehicleCardProps {
  vehicle: Vehicle;
  selected?: boolean;
  /** When omitted the card is display-only */
  onSelect?: (vehicle: Vehicle) => void;
  /** Marks the quickest available vehicle */
  isFastest?: boolean;
  className?: string;
}

const TYPE_STYLE: Record<VehicleType, { icon: LucideIcon; tile: string }> = {
  ambulance: { icon: HeartPulse, tile: "bg-[var(--color-olive-500)]" },
  police: { icon: ShieldAlert, tile: "bg-[var(--color-teal-600)]" },
  fire: { icon: Flame, tile: "bg-[var(--color-clay-500)]" },
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function VehicleCard({
  vehicle,
  selected = false,
  onSelect,
  isFastest = false,
  className,
}: VehicleCardProps) {
  const style = TYPE_STYLE[vehicle.type] ?? TYPE_STYLE.ambulance;
  const Icon = style.icon;

  const available = vehicle.status === "available";
  const hasEta = Number.isFinite(vehicle.etaSeconds);
  const interactive = onSelect !== undefined;

  const body = (
    <div className="flex items-center gap-4">
      <span
        aria-hidden
        className={cx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
          style.tile
        )}
      >
        <Icon size={22} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="text-base">{vehicle.label}</h3>
          <VehicleStatusBadge status={vehicle.status} size="sm" />
          {isFastest && (
            <Badge tone="success" size="sm">
              Fastest
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          {VEHICLE_TYPE_LABELS[vehicle.type] ?? vehicle.type}
          {interactive && !available && " · Not available for dispatch"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xs text-[var(--text-muted)]">
            <Clock size={12} aria-hidden />
            ETA
          </p>
          <p className="font-[family-name:var(--font-display)] text-lg font-extrabold leading-tight text-[var(--text-primary)]">
            {hasEta ? formatDuration(vehicle.etaSeconds) : "-"}
          </p>
        </div>

        {interactive && (
          <span
            aria-hidden
            className={cx(
              "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
              selected
                ? "border-[var(--action-primary)] bg-[var(--action-primary)] text-white"
                : "border-[var(--border-strong)] text-transparent"
            )}
          >
            <Check size={14} />
          </span>
        )}
      </div>
    </div>
  );

  if (!interactive) {
    return <div className={cx("card p-4", className)}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(vehicle)}
      disabled={!available}
      aria-pressed={selected}
      className={cx(
        "block w-full rounded-[var(--radius-xl)] border p-4 text-left transition-colors",
        selected
          ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[shadow:var(--shadow-sm)] hover:bg-[var(--bg-surface-muted)]",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--bg-surface)]",
        className
      )}
    >
      {body}
    </button>
  );
}

export default VehicleCard;