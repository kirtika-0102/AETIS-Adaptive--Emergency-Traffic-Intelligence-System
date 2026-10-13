import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";
type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Adds a small status dot before the text */
  dot?: boolean;
  children: ReactNode;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[var(--color-olive-50)] text-[var(--color-olive-700)]",
  danger: "bg-[var(--color-clay-50)] text-[var(--color-clay-700)]",
  info: "bg-[var(--color-teal-50)] text-[var(--color-teal-700)]",
  neutral: "bg-[var(--color-sand-200)] text-[var(--text-secondary)]",
  warning:
    "bg-[color-mix(in_srgb,var(--feedback-warning)_18%,white)] text-[color-mix(in_srgb,var(--feedback-warning)_55%,black)]",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[var(--color-olive-500)]",
  danger: "bg-[var(--color-clay-500)]",
  info: "bg-[var(--color-teal-500)]",
  neutral: "bg-[var(--text-muted)]",
  warning: "bg-[var(--feedback-warning)]",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden
          className={cx("h-1.5 w-1.5 rounded-full", DOT_CLASSES[tone])}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;