import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Globe, LogOut, Menu } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES } from "../../routes/routePaths";
import { ROLE_LABELS } from "../../utils/constants";
import NotificationBell from "../notifications/NotificationBell";

export interface TopbarProps {
  /** Opens the mobile navigation drawer (the button is hidden from lg up) */
  onMenuClick: () => void;
}

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* Close the account menu on outside click or Escape */
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setMenuOpen(false);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-[var(--z-topbar)] flex h-[var(--topbar-height)] items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[rgba(250,246,240,0.9)] px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* ---------- Left ---------- */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)] lg:hidden"
        >
          <Menu size={22} aria-hidden />
        </button>

        {/* Brand is in the sidebar on desktop, so only show it below lg */}
        <span className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--text-primary)] lg:hidden">
          AETIS
        </span>

        {user && (
          <p className="hidden truncate text-sm text-[var(--text-secondary)] lg:block">
            {ROLE_LABELS[user.role]} console
          </p>
        )}
      </div>

      {/* ---------- Right ---------- */}
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        {user && (
          <div ref={menuRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-[var(--bg-surface-muted)] sm:pr-3"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-teal-600)] text-sm font-bold text-[var(--text-inverse)]"
              >
                {getInitials(user.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-sm font-semibold leading-tight text-[var(--text-primary)]">
                  {user.name}
                </span>
                <span className="block text-xs leading-tight text-[var(--text-secondary)]">
                  {ROLE_LABELS[user.role]}
                </span>
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`hidden text-[var(--text-muted)] transition-transform sm:block ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
              <span className="sr-only">Account menu</span>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label="Account"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-[var(--z-dropdown)] w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]"
                >
                  <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {user.name}
                    </p>
                    {user.email && (
                      <p className="truncate text-xs text-[var(--text-secondary)]">
                        {user.email}
                      </p>
                    )}
                  </div>

                  <div className="p-1.5">
                    <Link
                      to={ROUTES.HOME}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)]"
                    >
                      <Globe size={16} aria-hidden />
                      Public website
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      disabled={isSigningOut}
                      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold text-[var(--color-clay-600)] transition-colors hover:bg-[var(--color-clay-50)] disabled:opacity-60"
                    >
                      <LogOut size={16} aria-hidden />
                      {isSigningOut ? "Signing out..." : "Sign out"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </header>
  );
}

export default Topbar;