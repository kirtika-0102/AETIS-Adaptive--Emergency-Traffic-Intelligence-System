import { BellRing, Check } from "lucide-react";

import { formatDateTime } from "../../utils/formatters";
import Button from "../common/Button";

type Size = "sm" | "md" | "lg";

export interface AcknowledgeButtonProps {
  acknowledged: boolean;
  isSubmitting: boolean;
  onAcknowledge: () => void;
  /** Shown to assistive tech and as a tooltip once acknowledged */
  acknowledgedAt?: string;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Same sizing as <Button>, so the two states do not shift the layout */
const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

/**
 * One-tap acknowledgement. The acknowledged state is plain text rather than
 * a disabled button, so it is not a dead control in the tab order. White on
 * olive with a faint light border reads clearly on both the light cards of
 * the dashboard and the dark summary bar of the detail page.
 */
function AcknowledgeButton({
  acknowledged,
  isSubmitting,
  onAcknowledge,
  acknowledgedAt,
  size = "md",
  fullWidth = false,
  className,
}: AcknowledgeButtonProps) {
  if (acknowledged) {
    const when = acknowledgedAt ? formatDateTime(acknowledgedAt) : null;

    return (
      <span
        role="status"
        title={when ? `Acknowledged ${when}` : undefined}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.25)] bg-[var(--color-olive-500)] font-semibold text-white",
          SIZE_CLASSES[size],
          fullWidth && "w-full",
          className
        )}
      >
        <Check size={size === "sm" ? 14 : 16} aria-hidden />
        Acknowledged
        {when && <span className="sr-only"> at {when}</span>}
      </span>
    );
  }

  return (
    <Button
      variant="accent"
      size={size}
      fullWidth={fullWidth}
      className={className}
      isLoading={isSubmitting}
      onClick={onAcknowledge}
      leftIcon={<BellRing size={size === "sm" ? 14 : 16} aria-hidden />}
    >
      {isSubmitting ? "Acknowledging..." : "Acknowledge"}
    </Button>
  );
}

export default AcknowledgeButton;