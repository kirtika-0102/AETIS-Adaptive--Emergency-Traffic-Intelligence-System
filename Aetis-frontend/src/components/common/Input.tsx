import { forwardRef, useId } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Validation message; also marks the field invalid for assistive tech */
  error?: string;
  /** Helper text shown under the field */
  hint?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Labelled text input. Any native input attribute (min, max, placeholder,
 * autoComplete, type...) is passed through to the <input>.
 * `className` styles the outer wrapper, not the input itself.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, value, onChange, error, hint, required, disabled, id, className, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]"
      >
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-[var(--color-clay-500)]">
            *
          </span>
        )}
      </label>

      <input
        ref={ref}
        id={inputId}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "w-full rounded-[var(--radius-md)] border bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)]",
          "placeholder:text-[var(--text-muted)] focus:outline-none",
          "disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)]",
          error
            ? "border-[var(--color-clay-500)]"
            : "border-[var(--border-default)] focus:border-[var(--action-primary)]"
        )}
        {...rest}
      />

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

export default Input;