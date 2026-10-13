import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback, or a function that receives the error and a reset callback */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Hook for error reporting (Sentry, backend log endpoint, ...) */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors in the tree below it so one broken component
 * does not blank the whole app. It does not catch errors thrown in event
 * handlers or async code, which each page handles itself.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AETIS] Unhandled UI error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (typeof fallback === "function") return fallback(error, this.reset);
    if (fallback !== undefined) return fallback;

    return (
      <main
        role="alert"
        className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-6 py-12"
      >
        <div className="card w-full max-w-lg p-8 text-center sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-clay-50)] text-[var(--color-clay-500)]">
            <AlertTriangle size={32} aria-hidden />
          </div>

          <h1 className="mt-6 text-2xl text-[var(--text-primary)]">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            An unexpected error stopped this page from loading. Your data is
            safe. Try again, or reload the page.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded-[var(--radius-md)] bg-[var(--bg-surface-muted)] p-3 text-left text-xs text-[var(--color-clay-700)]">
              {error.message}
            </pre>
          )}

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)]"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-semibold text-[var(--action-accent)] transition-colors hover:text-[var(--action-accent-hover)]"
            >
              Go to home
            </a>
          </div>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;