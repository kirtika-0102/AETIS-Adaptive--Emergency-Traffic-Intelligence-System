import type { ReactNode } from "react";

type Tone = "teal" | "clay" | "sand" | "olive";

export interface StatCardProps {
  label: string;
  /** Already formatted by the caller, e.g. "7 min" or "12/14" */
  value: string;
  icon: ReactNode;
  tone: Tone;
  /** Small line under the value, e.g. "Updated just now" */
  hint?: string;
  className?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  teal: "bg-[var(--color-teal-600)] text-white",
  clay: "bg-[var(--color-clay-500)] text-white",
  sand: "bg-[var(--color-sand-300)] text-[var(--color-teal-800)]",
  olive: "bg-[var(--color-olive-500)] text-white",
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Single figure with an icon. The label comes first in the markup, so a
 * screen reader hears "Active emergencies, 12" rather than a bare number.
 */
function StatCard({ label, value, icon, tone, hint, className }: StatCardProps) {
  return (
    <div className={cx("card flex items-center gap-4 p-5", className)}>
      <span
        aria-hidden
        className={cx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)]",
          TONE_CLASSES[tone] ?? TONE_CLASSES.teal
        )}
      >
        {icon}
      </span>

      <dl className="min-w-0">
        <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
        <dd className="mt-0.5 break-words font-[family-name:var(--font-display)] text-2xl font-extrabold leading-tight text-[var(--text-primary)]">
          {value}
        </dd>
        {hint && (
          <dd className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</dd>
        )}
      </dl>
    </div>
  );
}

export default StatCard;