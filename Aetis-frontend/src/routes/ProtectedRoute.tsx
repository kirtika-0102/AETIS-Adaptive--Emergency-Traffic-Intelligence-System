import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import Loader from "../components/common/Loader";
import { useAuth } from "../hooks/useAuth";
import type { UserRole } from "../types/user.types";
import { ROUTES, getHomeRouteForRole } from "./routePaths";

interface ProtectedRouteProps {
  /** If omitted, any signed-in user can open the route */
  allowedRoles?: readonly UserRole[];
  /** Where to send signed-out users. Defaults to the login page. */
  redirectTo?: string;
  /** Optional: wrap a single element instead of using nested routes */
  children?: ReactNode;
}

interface FromState {
  from?: { pathname?: unknown; search?: unknown; hash?: unknown };
}

/**
 * The page a signed-out user originally asked for, saved by ProtectedRoute in
 * the navigation state. Only in-app paths are followed, and never the login
 * page itself.
 */
export function getReturnPath(state: unknown): string | null {
  const from = (state as FromState | null)?.from;
  const pathname = from?.pathname;

  if (typeof pathname !== "string") return null;
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) {
    return null;
  }
  if (pathname === ROUTES.LOGIN) return null;

  const search = typeof from?.search === "string" ? from.search : "";
  const hash = typeof from?.hash === "string" ? from.hash : "";

  return `${pathname}${search}${hash}`;
}

/**
 * Guards routes behind sign-in and role checks.
 *  1. Session still being checked   -> loader
 *  2. Not signed in                 -> login, remembering the page they wanted
 *  3. Signed in but wrong role      -> unauthorized page
 *  4. Otherwise                     -> the page
 *
 * This decides what the interface shows. The server must enforce the same
 * rules on every request.
 */
export function ProtectedRoute({
  allowedRoles,
  redirectTo = ROUTES.LOGIN,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loader fullScreen />;

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * The reverse guard, for the login page: someone already signed in is sent
 * to the page they originally wanted, or else to their role's home page.
 * (Before this fix it always sent them home, which could override the
 * "return to where you were going" step in LoginPage.)
 */
export function GuestRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loader fullScreen />;

  if (isAuthenticated && user) {
    const target = getReturnPath(location.state) ?? getHomeRouteForRole(user.role);
    return <Navigate to={target} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;