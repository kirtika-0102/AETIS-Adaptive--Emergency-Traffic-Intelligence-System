import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to an inbox icon */
  icon?: ReactNode;
  /** Button or link shown under the text */
  action?: ReactNode;
  /** Less padding, for use inside cards and panels */
  compact?: boolean;
  className?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-sand-200)] text-[var(--color-teal-600)]"
      >
        {icon ?? <Inbox size={26} />}
      </div>

      <h3 className="mt-4 text-base text-[var(--text-primary)]">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;