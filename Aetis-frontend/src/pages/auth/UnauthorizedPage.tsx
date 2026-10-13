import { useEffect } from "react";
import { motion } from "framer-motion";
import { LogOut, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";

/**
 * Shown when a signed-in user opens a page their role cannot access.
 * Renders inside DashboardLayout, so the sidebar and topbar stay visible.
 */
function UnauthorizedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Access denied | AETIS";
  }, []);

  const homePath = user ? getHomeRouteForRole(user.role) : ROUTES.HOME;

  const handleSwitchAccount = async () => {
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="card w-full max-w-lg p-8 text-center sm:p-10"
        role="alert"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-clay-50)] text-[var(--color-clay-500)]">
          <ShieldAlert size={32} aria-hidden />
        </div>

        <h1 className="mt-6 text-2xl text-[var(--text-primary)]">
          Access denied
        </h1>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Your account
          {user ? (
            <>
              {" "}
              (<span className="font-semibold capitalize">{user.role}</span>)
            </>
          ) : null}{" "}
          does not have permission to view this page. If you believe this is a
          mistake, contact your administrator.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to={homePath}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)]"
          >
            Go to my dashboard
          </Link>

          <button
            type="button"
            onClick={handleSwitchAccount}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-muted)]"
          >
            <LogOut size={16} aria-hidden />
            Switch account
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default UnauthorizedPage;