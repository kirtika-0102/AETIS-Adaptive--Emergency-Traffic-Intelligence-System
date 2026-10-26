import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../routes/routePaths";

/**
 * Catch-all page for unknown URLs.
 *
 * This route sits outside every layout in AppRouter, so the page is
 * self-contained: its own full-screen shell, logo and navigation.
 */
function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    document.title = "Page not found | AETIS";
  }, []);

  const signedIn = !isLoading && isAuthenticated && user != null;
  const primaryPath = signedIn ? getHomeRouteForRole(user.role) : ROUTES.HOME;
  const primaryLabel = signedIn ? "Go to my dashboard" : "Go to home";

  // With no history entry to return to (e.g. the page was opened directly),
  // navigate(-1) would leave the app, so the back button is hidden.
  const canGoBack =
    typeof window !== "undefined" && window.history.state?.idx > 0;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-app)] px-6 py-12">
      {/* Decorative shapes using the palette */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--color-clay-500)] opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[var(--color-olive-500)] opacity-80"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-20 right-16 h-20 w-20 rounded-full bg-[var(--color-sand-300)] opacity-60"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card relative z-10 w-full max-w-lg p-8 text-center sm:p-10"
      >
        <Link
          to={ROUTES.HOME}
          className="inline-flex flex-col leading-none"
          aria-label="AETIS home"
        >
          <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            AETIS
          </span>
          <span className="mt-1 text-xs text-[var(--text-muted)]">
            Safer Roads. Faster Response.
          </span>
        </Link>

        <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-teal-50)] text-[var(--color-teal-600)]">
          <Compass size={32} aria-hidden />
        </div>

        <p className="mt-6 font-[family-name:var(--font-display)] text-6xl font-extrabold leading-none text-gradient-brand">
          404
        </p>

        <h1 className="mt-4 text-2xl text-[var(--text-primary)]">
          Page not found
        </h1>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          We could not find{" "}
          <span className="break-all font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)]">
            {pathname}
          </span>
          . It may have moved, or the address may be mistyped.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to={primaryPath}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)]"
          >
            {primaryLabel}
          </Link>

          {canGoBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)]"
            >
              <ArrowLeft size={16} aria-hidden />
              Go back
            </button>
          )}
        </div>
      </motion.div>
    </main>
  );
}

export default NotFoundPage;