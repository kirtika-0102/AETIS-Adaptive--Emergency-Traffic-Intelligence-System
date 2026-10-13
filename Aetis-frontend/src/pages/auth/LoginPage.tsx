import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";

import LoginForm from "../../components/auth/LoginForm";
import RoleSelector from "../../components/auth/RoleSelector";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";
import type { UserRole } from "../../types/user.types";

interface LoginLocationState {
  /** Set by ProtectedRoute: the page the user originally tried to open */
  from?: { pathname: string; search?: string; hash?: string };
}

/**
 * Login page, rendered inside AuthLayout (which supplies the branding panel).
 *
 * Flow:
 *  1. User picks their role (dispatcher, driver, hospital, police, fire, admin)
 *  2. LoginForm validates input and calls the auth service
 *  3. onSuccess sends them back to the page they wanted, or their role's home
 *
 * Self-registration is intentionally absent: accounts are provisioned by an
 * admin so every dispatcher and driver is verified before they can log in.
 */
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<UserRole>("dispatcher");

  useEffect(() => {
    document.title = "Sign in | AETIS";
  }, []);

  const handleSuccess = (authenticatedRole: UserRole) => {
    const from = (location.state as LoginLocationState | null)?.from;
    const target = from
      ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`
      : getHomeRouteForRole(authenticatedRole);

    navigate(target, { replace: true });
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className="eyebrow">Secure access</span>
        <h1 className="mt-4 text-3xl text-[var(--text-primary)]">
          Sign in to <span className="text-gradient-brand">AETIS</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Choose your role and enter the credentials issued to you.
        </p>
      </motion.div>

      <div className="mt-8 space-y-6">
        <RoleSelector value={role} onChange={setRole} />

        <div className="card p-6">
          <LoginForm role={role} onSuccess={handleSuccess} />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Need access? Contact your system administrator.
      </p>

      <p className="mt-3 text-center text-sm">
        <Link
          to={ROUTES.HOME}
          className="font-semibold text-[var(--action-accent)] transition-colors hover:text-[var(--action-accent-hover)]"
        >
          &larr; Back to home
        </Link>
      </p>
    </div>
  );
}

export default LoginPage;