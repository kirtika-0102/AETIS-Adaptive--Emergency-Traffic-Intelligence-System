import { useEffect, useRef } from "react";

export interface UsePollingOptions {
  /** Wait between the end of one run and the start of the next */
  intervalMs: number;
  /** Polling runs only while true. Default true. */
  enabled?: boolean;
  /** Run once straight away when polling starts. Default true. */
  immediate?: boolean;
  /** Stop while the tab is hidden and run again as soon as it is shown. Default true. */
  pauseWhenHidden?: boolean;
  /** Changing this restarts polling with an immediate run, for when what is polled changes */
  resetKey?: string | number | null;
}

const MIN_INTERVAL_MS = 1_000;
const FALLBACK_INTERVAL_MS = 10_000;
/** After repeated failures the wait grows to at most 2^3 = 8 times the interval */
const MAX_BACKOFF_STEPS = 3;

/**
 * Calls `task` repeatedly.
 *  - The next run is scheduled when the previous one finishes, so runs never overlap
 *  - If `task` rejects, the wait grows (up to 8x) until a run succeeds
 *  - Hidden tabs do no work; coming back runs it again immediately
 *  - The latest `task` is always the one called, so it need not be memoized
 */
export function usePolling(
  task: () => Promise<unknown>,
  options: UsePollingOptions
): void {
  const {
    intervalMs,
    enabled = true,
    immediate = true,
    pauseWhenHidden = true,
    resetKey = null,
  } = options;

  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;

    const interval = Number.isFinite(intervalMs)
      ? Math.max(MIN_INTERVAL_MS, intervalMs)
      : FALLBACK_INTERVAL_MS;

    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: number | null = null;

    function hidden(): boolean {
      return pauseWhenHidden && document.visibilityState === "hidden";
    }

    function clear(): void {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(): void {
      clear();
      if (stopped || hidden()) return;

      const delay = interval * 2 ** Math.min(failures, MAX_BACKOFF_STEPS);
      timer = window.setTimeout(() => void run(), delay);
    }

    async function run(): Promise<void> {
      timer = null;
      if (stopped || running || hidden()) return;

      running = true;
      try {
        await taskRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        if (!stopped) schedule();
      }
    }

    function onVisibility(): void {
      clear();
      if (document.visibilityState === "visible") void run();
    }

    if (pauseWhenHidden) {
      document.addEventListener("visibilitychange", onVisibility);
    }

    if (immediate) void run();
    else schedule();

    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // resetKey is not read inside; a new value restarts the effect on purpose
  }, [enabled, intervalMs, immediate, pauseWhenHidden, resetKey]);
}