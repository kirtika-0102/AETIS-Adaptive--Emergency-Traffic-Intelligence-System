import { motion, useReducedMotion } from "framer-motion";
import type { MotionProps } from "framer-motion";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";

const reveal = (reduce: boolean | null): MotionProps =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      };

function CallToAction() {
  const reduce = useReducedMotion();
  const { isAuthenticated, isLoading, user } = useAuth();

  const signedIn = !isLoading && isAuthenticated && user != null;
  const ctaTo = signedIn ? getHomeRouteForRole(user.role) : ROUTES.LOGIN;
  const ctaLabel = signedIn ? "Open dashboard" : "Get Started";
  const CtaIcon = signedIn ? LayoutDashboard : ArrowRight;

  return (
    <div className="container-aetis">
      <motion.div
        {...reveal(reduce)}
        className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--bg-inverse)] px-6 py-12 text-[var(--text-inverse)] sm:px-12 sm:py-14"
      >
        <div
          aria-hidden
          className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-[var(--color-clay-500)] opacity-90"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 right-1/3 h-64 w-64 rounded-full bg-[var(--color-olive-500)] opacity-70"
        />
        <div
          aria-hidden
          className="absolute -right-16 -top-10 h-48 w-48 rounded-full bg-[var(--color-clay-600)] opacity-80"
        />

        <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl md:pl-24">
            <h2 className="text-3xl text-[var(--text-inverse)] sm:text-4xl">
              Towards Safer Roads and Smarter Communities.
            </h2>
            <p className="mt-3 text-sm text-[var(--text-inverse-muted)] sm:text-base">
              Join us in building a faster, more coordinated emergency response
              system.
            </p>
          </div>

          <Link
            to={ctaTo}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-[var(--radius-md)] bg-[var(--action-accent)] px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition-colors hover:bg-[var(--action-accent-hover)] md:self-auto"
          >
            {ctaLabel}
            <CtaIcon size={16} aria-hidden />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default CallToAction;