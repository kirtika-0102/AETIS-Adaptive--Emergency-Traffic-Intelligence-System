import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "default" | "sand" | "dark";
type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Uses the .card, .card-sand and .card-dark classes from globals.css */
const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "card",
  sand: "card-sand",
  dark: "card-dark",
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 sm:p-8",
};

function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(VARIANT_CLASSES[variant], PADDING_CLASSES[padding], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot, e.g. a link or button */
  action?: ReactNode;
  className?: string;
}

/** Title row with a divider. Use inside a Card with padding="none". */
export function CardHeader({
  title,
  description,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-lg">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default Card;