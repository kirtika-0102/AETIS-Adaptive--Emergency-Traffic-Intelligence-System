import { Suspense, useCallback, useEffect, useState } from "react";
import Loader from "../components/common/Loader";
import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";

const COLLAPSE_KEY = "aetis:sidebar-collapsed";

/** localStorage can throw (private mode, blocked storage), so always guard it */
const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeCollapsed = (value: boolean) => {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, String(value));
  } catch {
    /* ignore */
  }
};

/**
 * Shell for every authenticated page.
 *  - Desktop (lg+): fixed sidebar, collapsible, width remembered
 *  - Mobile: sidebar becomes a slide-in drawer opened from the topbar
 *  - Page content fades in on each route change
 */
function DashboardLayout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      writeCollapsed(!prev);
      return !prev;
    });
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Escape closes the drawer and the body scroll is locked while it is open
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const sidebarWidth = collapsed
    ? "var(--sidebar-width-collapsed)"
    : "var(--sidebar-width)";

  return (
    <div
      className="min-h-screen bg-[var(--bg-app)]"
      style={{ ["--current-sidebar-width" as string]: sidebarWidth }}
    >
      <a
        href="#dashboard-content"
        className="sr-only-focusable fixed left-4 top-4 z-[var(--z-tooltip)] rounded-md bg-[var(--action-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-inverse)]"
      >
        Skip to main content
      </a>

      {/* ---------- Desktop sidebar ---------- */}
      <aside
        className="fixed inset-y-0 left-0 z-[var(--z-sidebar)] hidden border-r border-[var(--border-inverse)] bg-[var(--bg-inverse)] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)] lg:block"
        style={{ width: sidebarWidth }}
        aria-label="Primary navigation"
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* ---------- Mobile drawer ---------- */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMobile}
              aria-hidden
              className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-[var(--color-teal-900)]/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-[var(--z-modal)] w-[var(--sidebar-width)] max-w-[85vw] bg-[var(--bg-inverse)] shadow-[var(--shadow-xl)] lg:hidden"
            >
              <Sidebar collapsed={false} onNavigate={closeMobile} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ---------- Main column ---------- */}
      <div className="flex min-h-screen flex-col transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-standard)] lg:pl-[var(--current-sidebar-width)]">
        <Topbar onMenuClick={openMobile} />

        <main
          id="dashboard-content"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-[1400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                   <Suspense fallback={<Loader />}>
                    <Outlet />
                  </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;