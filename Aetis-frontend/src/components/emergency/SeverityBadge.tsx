import type { SeverityLevel } from "../../styles/theme";
import { SEVERITY_LABELS } from "../../utils/constants";

type BadgeSize = "sm" | "md";

export interface SeverityBadgeProps {
  severity: SeverityLevel;
  size?: BadgeSize;
  className?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const TONE_CLASSES: Record<SeverityLevel, string> = {
  critical: "border-transparent bg-[var(--color-clay-600)] text-white",
  high: "border-[var(--color-clay-200)] bg-[var(--color-clay-50)] text-[var(--color-clay-700)]",
  medium:
    "border-transparent bg-[color-mix(in_srgb,var(--feedback-warning)_18%,white)] text-[color-mix(in_srgb,var(--feedback-warning)_55%,black)]",
  low: "border-transparent bg-[var(--color-olive-50)] text-[var(--color-olive-700)]",
};

const DOT_CLASSES: Record<SeverityLevel, string> = {
  critical: "bg-white",
  high: "bg-[var(--severity-high)]",
  medium: "bg-[var(--severity-medium)]",
  low: "bg-[var(--severity-low)]",
};

/** Used if the backend ever sends a level this build does not know about */
const UNKNOWN_CLASSES =
  "border-[var(--border-default)] bg-[var(--color-sand-200)] text-[var(--text-secondary)]";

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

/**
 * Severity is always written out as text, never shown by colour alone.
 * An unrecognised level is shown as-is in a neutral style rather than
 * being mistaken for a low-severity case.
 */
function SeverityBadge({ severity, size = "md", className }: SeverityBadgeProps) {
  const known = severity in TONE_CLASSES;

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold",
        known ? TONE_CLASSES[severity] : UNKNOWN_CLASSES,
        SIZE_CLASSES[size],
        className
      )}
    >
      {known && (
        <span
          aria-hidden
          className={cx("h-1.5 w-1.5 rounded-full", DOT_CLASSES[severity])}
        />
      )}
      {known ? SEVERITY_LABELS[severity] : String(severity)}
    </span>
  );
}

export default SeverityBadge;