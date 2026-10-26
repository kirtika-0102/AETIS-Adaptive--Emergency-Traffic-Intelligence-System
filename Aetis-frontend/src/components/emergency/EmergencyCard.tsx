import type { LucideIcon } from "lucide-react";
import { ChevronRight, Flame, HeartPulse, MapPin, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { buildDispatchPath, buildTrackingPath } from "../../routes/routePaths";
import type {
  Emergency,
  EmergencyStatus,
  EmergencyType,
} from "../../types/emergency.types";
import {
  EMERGENCY_STATUS_LABELS,
  EMERGENCY_TYPE_LABELS,
  SEVERITY_LABELS,
} from "../../utils/constants";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";
import SeverityBadge from "./SeverityBadge";

export interface EmergencyCardProps {
  emergency: Emergency;
  /**
   * Where the card links to. Leave undefined for the default (based on
   * status), or pass null to render the card without a link.
   */
  to?: string | null;
  className?: string;
}

const TYPE_STYLE: Record<EmergencyType, { icon: LucideIcon; tile: string }> = {
  medical: { icon: HeartPulse, tile: "bg-[var(--color-olive-500)]" },
  police: { icon: ShieldAlert, tile: "bg-[var(--color-teal-600)]" },
  fire: { icon: Flame, tile: "bg-[var(--color-clay-500)]" },
};

const STATUS_TONE: Record<
  EmergencyStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  pending: "warning",
  dispatched: "info",
  en_route: "danger",
  arrived: "info",
  completed: "success",
  cancelled: "neutral",
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Default destination by status:
 *  - pending: no vehicle yet, so go to the dispatch screen
 *  - dispatched / en route / arrived: follow it on the tracking screen
 *  - completed / cancelled: nothing left to act on, so no link
 */
function getDefaultDestination(
  e: Emergency
): { to: string; cue: string } | null {
  switch (e.status) {
    case "pending":
      return { to: buildDispatchPath(e.id), cue: "Dispatch vehicle" };
    case "dispatched":
    case "en_route":
    case "arrived":
      return { to: buildTrackingPath(e.id), cue: "Track" };
    default:
      return null;
  }
}

function formatReported(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return formatDateTime(createdAt);

  const elapsed = Math.max(0, Math.floor((Date.now() - created) / 1000));
  return elapsed < 60 ? "Just now" : `${formatDuration(elapsed)} ago`;
}

function EmergencyCard({ emergency, to, className }: EmergencyCardProps) {
  const style = TYPE_STYLE[emergency.type];
  const Icon = style.icon;

  const fallback = getDefaultDestination(emergency);
  const destination =
    to === undefined ? fallback?.to ?? null : to;
  const cue = destination ? fallback?.cue ?? "Open" : null;

  const body = (
    <div className="flex items-start gap-4">
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-base">{EMERGENCY_TYPE_LABELS[emergency.type]}</h3>
          <SeverityBadge severity={emergency.severity} size="sm" />
          <Badge tone={STATUS_TONE[emergency.status]} size="sm">
            {EMERGENCY_STATUS_LABELS[emergency.status]}
          </Badge>
        </div>

        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
          <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{emergency.location.address}</span>
        </p>

        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span className="font-[family-name:var(--font-mono)]">{emergency.id}</span>
          <span>{emergency.callerName}</span>
          <time
            dateTime={emergency.createdAt}
            title={formatDateTime(emergency.createdAt)}
          >
            {formatReported(emergency.createdAt)}
          </time>
        </p>
      </div>

      {cue && (
        <span
          aria-hidden
          className="hidden items-center gap-1 self-center whitespace-nowrap text-sm font-semibold text-[var(--action-accent)] sm:inline-flex"
        >
          {cue}
          <ChevronRight size={16} />
        </span>
      )}
    </div>
  );

  if (!destination) {
    return <div className={cx("card p-4", className)}>{body}</div>;
  }

  return (
    <Link
      to={destination}
      aria-label={`${EMERGENCY_TYPE_LABELS[emergency.type]}, ${
        SEVERITY_LABELS[emergency.severity] ?? emergency.severity
      } severity, ${emergency.location.address}. ${cue}`}
      className={cx(
        "card block p-4 transition-shadow hover:shadow-[shadow:var(--shadow-md)]",
        className
      )}
    >
      {body}
    </Link>
  );
}

export default EmergencyCard;