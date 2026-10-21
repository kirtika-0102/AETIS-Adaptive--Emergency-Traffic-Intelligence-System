import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Pass a primitive (a string, a number) or a value whose identity is stable.
 * A new object or array on every render looks like a change every time, so
 * the result would keep restarting its timer and update on every pass.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;

    // The updater form keeps a function-valued `value` from being called
    const timer = window.setTimeout(() => setDebounced(() => value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}