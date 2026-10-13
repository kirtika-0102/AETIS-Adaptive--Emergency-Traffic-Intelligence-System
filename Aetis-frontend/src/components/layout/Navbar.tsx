import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";

/** `id` matches the section ids in LandingPage.tsx */
const NAV_LINKS = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it Works" },
  { id: "impact", label: "Impact" },
  { id: "about", label: "About" },
] as const;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Sticky public navbar.
 *  - Anchor links scroll to landing sections (PublicLayout handles the hash)
 *  - Highlights the section currently in view
 *  - Signed-in visitors see "Dashboard" instead of "Get Started"
 *  - Collapses into a dropdown panel below the md breakpoint
 */
function Navbar() {
  const { pathname, hash } = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("home");

  const onLanding = pathname === ROUTES.HOME;
  const signedIn = !isLoading && isAuthenticated && user != null;

  const ctaTo = signedIn ? getHomeRouteForRole(user.role) : ROUTES.LOGIN;
  const ctaLabel = signedIn ? "Dashboard" : "Get Started";
  const CtaIcon = signedIn ? LayoutDashboard : ArrowRight;

  /* Border and blur appear once the page has scrolled */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Close the mobile panel on navigation */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, hash]);

  /* Escape closes the mobile panel */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  /* Scroll spy: highlight the section crossing the middle of the viewport */
  useEffect(() => {
    if (!onLanding) return;

    const sections = NAV_LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [onLanding]);

  /* Re-clicking the link for the current hash does not change the URL,
     so the scroll has to be triggered by hand. */
  const handleAnchorClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (onLanding && hash === `#${id}`) {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
    setMenuOpen(false);
  };

  return (
    <header
      className={cx(
        "sticky top-0 z-[var(--z-sticky)] w-full transition-[background-color,box-shadow,border-color] duration-[var(--duration-base)]",
        scrolled
          ? "border-b border-[var(--border-subtle)] bg-[rgba(250,246,240,0.88)] shadow-[var(--shadow-xs)] backdrop-blur-md"
          : "border-b border-transparent bg-[var(--bg-app)]"
      )}
    >
      <div className="container-aetis flex h-[72px] items-center justify-between gap-6">
        {/* ---------- Logo ---------- */}
        <Link
          to={{ pathname: ROUTES.HOME, hash: "#home" }}
          onClick={(e) => handleAnchorClick(e, "home")}
          className="inline-flex flex-col leading-none"
          aria-label="AETIS home"
        >
          <span className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            AETIS
          </span>
          <span className="mt-1 hidden text-[11px] text-[var(--text-muted)] sm:block">
            Safer Roads. Faster Response.
          </span>
        </Link>

        {/* ---------- Desktop links ---------- */}
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map((link) => {
              const active = onLanding && activeId === link.id;
              return (
                <li key={link.id}>
                  <Link
                    to={{ pathname: ROUTES.HOME, hash: `#${link.id}` }}
                    onClick={(e) => handleAnchorClick(e, link.id)}
                    aria-current={active ? "location" : undefined}
                    className={cx(
                      "relative py-2 text-sm font-semibold transition-colors",
                      active
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {link.label}
                    {active && (
                      <motion.span
                        layoutId="navbar-active-underline"
                        aria-hidden
                        className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[var(--color-clay-500)]"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ---------- Actions ---------- */}
        <div className="flex items-center gap-3">
          <Link
            to={ctaTo}
            className="hidden items-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)] sm:inline-flex"
          >
            {ctaLabel}
            <CtaIcon size={16} aria-hidden />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)] md:hidden"
          >
            {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </div>

      {/* ---------- Mobile panel ---------- */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-[var(--border-subtle)] bg-[var(--bg-app)] md:hidden"
          >
            <nav aria-label="Mobile" className="container-aetis py-4">
              <ul className="space-y-1">
                {NAV_LINKS.map((link) => {
                  const active = onLanding && activeId === link.id;
                  return (
                    <li key={link.id}>
                      <Link
                        to={{ pathname: ROUTES.HOME, hash: `#${link.id}` }}
                        onClick={(e) => handleAnchorClick(e, link.id)}
                        aria-current={active ? "location" : undefined}
                        className={cx(
                          "block rounded-[var(--radius-md)] px-4 py-3 text-base font-semibold transition-colors",
                          active
                            ? "bg-[var(--bg-surface-muted)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)]"
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <Link
                to={ctaTo}
                className="mt-4 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-3 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)]"
              >
                {ctaLabel}
                <CtaIcon size={16} aria-hidden />
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export default Navbar;