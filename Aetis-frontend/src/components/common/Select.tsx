import { forwardRef, useId } from "react";
import type { ChangeEvent, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "size"> {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  error?: string;
  hint?: string;
  /** When provided, renders as an empty-value first option (e.g. "Choose...") */
  placeholder?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Labelled native select. `className` styles the outer wrapper. */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    value,
    onChange,
    options,
    error,
    hint,
    placeholder,
    required,
    disabled,
    id,
    className,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const selectId = id ?? `${autoId}-select`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label
        htmlFor={selectId}
        className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]"
      >
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-[var(--color-clay-500)]">
            *
          </span>
        )}
      </label>

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--bg-surface)] py-2.5 pl-3 pr-9 text-sm text-[var(--text-primary)]",
            "focus:outline-none",
            "disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)]",
            error
              ? "border-[var(--color-clay-500)]"
              : "border-[var(--border-default)] focus:border-[var(--action-primary)]"
          )}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
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
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-[var(--text-secondary)]">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Select;