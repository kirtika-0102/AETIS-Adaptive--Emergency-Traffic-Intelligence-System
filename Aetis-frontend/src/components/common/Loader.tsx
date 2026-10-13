type LoaderSize = "sm" | "md" | "lg";

export interface LoaderProps {
  /** Fills the viewport on the app background (route-level loading) */
  fullScreen?: boolean;
  size?: LoaderSize;
  /** Visible caption under the spinner. Screen readers always hear "Loading". */
  label?: string;
  className?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const SIZE_CLASSES: Record<LoaderSize, string> = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-12 w-12 border-4",
};

function Loader({ fullScreen = false, size = "md", label, className }: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "flex flex-col items-center justify-center gap-3",
        fullScreen ? "min-h-screen w-full bg-[var(--bg-app)]" : "py-12",
        className
      )}
    >
      <span
        aria-hidden
        className={cx(
          "animate-spin rounded-full border-[var(--color-sand-300)] border-t-[var(--color-clay-500)]",
          SIZE_CLASSES[size]
        )}
      />
      {label ? (
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

export default Loader;