import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Footer from "../components/layout/Footer";
import Navbar from "../components/layout/Navbar";

/**
 * Layout for public pages (landing page).
 * Navbar on top, page content in the middle, footer at the bottom.
 */
function PublicLayout() {
  const { pathname, hash } = useLocation();

  // Scroll to top on route change, or to the #section if a hash is present
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-app)]">
      <a
        href="#main-content"
        className="sr-only-focusable fixed left-4 top-4 z-[var(--z-tooltip)] rounded-md bg-[var(--action-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-inverse)]"
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

export default PublicLayout;