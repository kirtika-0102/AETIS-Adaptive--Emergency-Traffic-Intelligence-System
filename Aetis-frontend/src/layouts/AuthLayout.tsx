import { motion } from "framer-motion";
import { Link, Outlet } from "react-router-dom";

import { ROUTES } from "../routes/routePaths";

const HIGHLIGHTS = [
  "Verified dispatcher and driver authentication",
  "Fastest route with live ETA for every emergency vehicle",
  "Traffic signals cleared before the ambulance arrives",
] as const;

/**
 * Split-screen layout for authentication pages.
 * Left: AETIS branding panel (hidden on small screens).
 * Right: the form rendered by the nested route.
 */
function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Brand panel ---------- */}
      <aside className="relative hidden overflow-hidden bg-[var(--bg-inverse)] text-[var(--text-inverse)] lg:flex lg:flex-col lg:justify-between lg:p-12">
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
          className="pointer-events-none absolute bottom-24 right-10 h-24 w-24 rounded-full bg-[var(--color-sand-200)] opacity-20"
        />

        <Link
          to={ROUTES.HOME}
          className="relative z-10 inline-flex flex-col leading-none"
          aria-label="AETIS home"
        >
          <span className="font-[var(--font-display)] text-3xl font-extrabold tracking-tight">
            AETIS
          </span>
          <span className="mt-1 text-xs text-[var(--text-inverse-muted)]">
            Safer Roads. Faster Response.
          </span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 max-w-md"
        >
          <h1 className="font-[var(--font-display)] text-4xl font-extrabold leading-tight text-[var(--text-inverse)]">
            Connecting the needy to the right help,{" "}
            <span className="text-[var(--color-clay-300)]">faster.</span>
          </h1>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.1, duration: 0.4 }}
                className="flex items-start gap-3 text-sm text-[var(--text-inverse-muted)]"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-sand-200)]"
                />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <p className="relative z-10 text-xs text-[var(--text-inverse-muted)]">
          Authorized personnel only. All sessions are logged.
        </p>
      </aside>

      {/* ---------- Form panel ---------- */}
      <main className="flex min-h-screen flex-col bg-[var(--bg-app)] px-6 py-8 sm:px-12">
        {/* Mobile-only logo (brand panel is hidden below lg) */}
        <Link
          to={ROUTES.HOME}
          className="mb-8 inline-flex flex-col leading-none lg:hidden"
          aria-label="AETIS home"
        >
          <span className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            AETIS
          </span>
          <span className="mt-1 text-xs text-[var(--text-muted)]">
            Safer Roads. Faster Response.
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            <Outlet />
          </motion.div>
        </div>

        <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} AETIS. All rights reserved.
        </footer>
      </main>
    </div>
  );
}

export default AuthLayout;