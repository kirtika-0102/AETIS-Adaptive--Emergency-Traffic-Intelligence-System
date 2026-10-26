import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Flame, HeartPulse, ShieldAlert } from "lucide-react";

import type { EmergencyType } from "../../types/emergency.types";

export interface EmergencyTypeSelectorProps {
  /** Empty string means nothing chosen yet */
  value: EmergencyType | "";
  onChange: (type: EmergencyType) => void;
  error?: string;
  disabled?: boolean;
  /** Set on the fieldset so a form can focus it when validation fails */
  id?: string;
}

interface TypeOption {
  type: EmergencyType;
  icon: LucideIcon;
  label: string;
  number: string;
  hint: string;
  tile: string;
}

const OPTIONS: TypeOption[] = [
  {
    type: "medical",
    icon: HeartPulse,
    label: "Medical",
    number: "108",
    hint: "Ambulance and hospital",
    tile: "bg-[var(--color-olive-500)]",
  },
  {
    type: "police",
    icon: ShieldAlert,
    label: "Police",
    number: "100",
    hint: "Police response",
    tile: "bg-[var(--color-teal-600)]",
  },
  {
    type: "fire",
    icon: Flame,
    label: "Fire",
    number: "101",
    hint: "Fire and rescue",
    tile: "bg-[var(--color-clay-500)]",
  },
];

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Which helpline the caller dialled. Built on native radio inputs, so arrow
 * keys and screen-reader behaviour come from the browser. There is no default
 * on purpose: the dispatcher must pick the service explicitly.
 */
function EmergencyTypeSelector({
  value,
  onChange,
  error,
  disabled = false,
  id,
}: EmergencyTypeSelectorProps) {
  const groupName = useId();
  const errorId = id ? `${id}-error` : `${groupName}-error`;

  return (
    <fieldset
      id={id}
      tabIndex={-1}
      disabled={disabled}
      aria-describedby={error ? errorId : undefined}
      className="min-w-0 focus:outline-none"
    >
      <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        Service requested
        <span aria-hidden className="ml-0.5 text-[var(--color-clay-500)]">
          *
        </span>
      </legend>

      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ type, icon: Icon, label, number, hint, tile }) => {
          const selected = value === type;

          return (
            <label
              key={type}
              className={cx(
                "block",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={type}
                checked={selected}
                onChange={() => onChange(type)}
                required
                className="peer sr-only"
              />

              <span
                className={cx(
                  "flex h-full items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 transition-colors",
                  "peer-focus-visible:shadow-[shadow:var(--shadow-focus)]",
                  selected
                    ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
                    : error
                      ? "border-[var(--color-clay-500)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
                      : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white",
                    tile
                  )}
                >
                  <Icon size={20} />
                </span>

                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {label}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-clay-500)]">
                      {number}
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {hint}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-medium text-[var(--color-clay-600)]"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default EmergencyTypeSelector;