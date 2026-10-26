import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Clock,
  Flame,
  HeartPulse,
  MapPin,
  ShieldAlert,
  Truck,
} from "lucide-react";

import type { EmergencyType } from "../../types/emergency.types";
import type { IncomingAlert } from "../../types/hospital.types";
import {
  EMERGENCY_TYPE_LABELS,
  SEVERITY_LABELS,
  VEHICLE_TYPE_LABELS,
} from "../../utils/constants";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";
import SeverityBadge from "../emergency/SeverityBadge";
import AcknowledgeButton from "./AcknowledgeButton";

export interface IncomingAlertCardProps {
  alert: IncomingAlert;
  /** True while this card's acknowledgement request is running */
  isAcknowledging: boolean;
  onOpen: (emergencyId: string) => void;
  onAcknowledge: (emergencyId: string) => void;
  className?: string;
}

const TYPE_STYLE: Record<EmergencyType, { icon: LucideIcon; tile: string }> = {
  medical: { icon: HeartPulse, tile: "bg-[var(--color-olive-500)]" },
  police: { icon: ShieldAlert, tile: "bg-[var(--color-teal-600)]" },
  fire: { icon: Flame, tile: "bg-[var(--color-clay-500)]" },
};

const MAX_RESOURCE_CHIPS = 3;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function formatReceived(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return formatDateTime(iso);

  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  return seconds < 60 ? "Just now" : `${formatDuration(seconds)} ago`;
}

function IncomingAlertCard({
  alert,
  isAcknowledging,
  onOpen,
  onAcknowledge,
  className,
}: IncomingAlertCardProps) {
  const { emergency, patient } = alert;

  const style = TYPE_STYLE[emergency.type] ?? TYPE_STYLE.medical;
  const Icon = style.icon;
  const typeLabel = EMERGENCY_TYPE_LABELS[emergency.type] ?? emergency.type;

  const hasEta = Number.isFinite(alert.etaSeconds);
  const arriving = hasEta && alert.etaSeconds <= 0;
  const etaText = !hasEta
    ? "-"
    : arriving
      ? "Arriving"
      : formatDuration(alert.etaSeconds);

  const condition = patient?.condition?.trim() ?? "";
  const resources = patient?.requiredResources ?? [];
  const shownResources = resources.slice(0, MAX_RESOURCE_CHIPS);
  const hiddenResources = resources.length - shownResources.length;

  return (
    <article
      aria-label={`${typeLabel} at ${emergency.location.address}`}
      className={cx(
        "card overflow-hidden border-l-4",
        alert.acknowledged
          ? "border-l-[var(--color-olive-500)]"
          : "border-l-[var(--color-clay-500)]",
        className
      )}
    >
      {/* Opens the detail page. Spans only, since a button may not hold blocks. */}
      <button
        type="button"
        onClick={() => onOpen(alert.emergencyId)}
        aria-label={`View details: ${typeLabel}, ${
          SEVERITY_LABELS[emergency.severity] ?? emergency.severity
        } severity, ${arriving ? "arriving now" : `arriving in ${etaText}`}`}
        className="block w-full p-4 text-left transition-colors hover:bg-[var(--bg-surface-muted)]"
      >
        <span className="flex items-start gap-4">
          <span
            aria-hidden
            className={cx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
              style.tile
            )}
          >
            <Icon size={22} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-base font-bold">{typeLabel}</span>
              <SeverityBadge severity={emergency.severity} size="sm" />
            </span>

            <span className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
              <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{emergency.location.address}</span>
            </span>

            {condition && (
              <span className="mt-2 block line-clamp-2 break-words text-sm text-[var(--text-primary)]">
                {condition}
              </span>
            )}

            {shownResources.length > 0 && (
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {shownResources.map((r, i) => (
                  <span
                    key={`${r}-${i}`}
                    className="rounded-full bg-[var(--color-sand-200)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    {r}
                  </span>
                ))}
                {hiddenResources > 0 && (
                  <span className="rounded-full bg-[var(--color-sand-200)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                    +{hiddenResources} more
                  </span>
                )}
              </span>
            )}

            <span className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Truck size={13} aria-hidden />
                {alert.vehicleLabel}
                <span aria-hidden>·</span>
                {VEHICLE_TYPE_LABELS[alert.vehicleType] ?? alert.vehicleType}
              </span>
              <span className="font-[family-name:var(--font-mono)]">{emergency.id}</span>
              <time
                dateTime={alert.receivedAt}
                title={formatDateTime(alert.receivedAt)}
              >
                Received {formatReceived(alert.receivedAt)}
              </time>
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2 self-center">
            <span className="text-right">
              <span className="flex items-center justify-end gap-1 text-xs text-[var(--text-muted)]">
                <Clock size={12} aria-hidden />
                ETA
              </span>
              <span className="block font-[family-name:var(--font-display)] text-xl font-extrabold leading-tight">
                {etaText}
              </span>
            </span>
            <ChevronRight
              size={18}
              aria-hidden
              className="hidden text-[var(--text-muted)] sm:block"
            />
          </span>
        </span>
      </button>

      {/* Acknowledgement is a separate control, outside the open button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-4 py-3">
        <Badge tone={alert.acknowledged ? "success" : "warning"} size="sm" dot>
          {alert.acknowledged ? "Acknowledged" : "Awaiting acknowledgement"}
        </Badge>

        <AcknowledgeButton
          size="sm"
          acknowledged={alert.acknowledged}
          acknowledgedAt={alert.acknowledgedAt}
          isSubmitting={isAcknowledging}
          onAcknowledge={() => onAcknowledge(alert.emergencyId)}
        />
      </div>
    </article>
  );
}

export default IncomingAlertCard;