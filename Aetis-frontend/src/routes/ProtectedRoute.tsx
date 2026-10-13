import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import Loader from "../components/common/Loader";
import { useAuth } from "../hooks/useAuth";
import type { UserRole } from "../types/user.types";
import { ROUTES, getHomeRouteForRole } from "./routePaths";

interface ProtectedRouteProps {
  /** If omitted, any authenticated user can access the route */
  allowedRoles?: readonly UserRole[];
  /** Where to send unauthenticated users. Defaults to the login page */
  redirectTo?: string;
  /** Optional: wrap a single element instead of using nested routes */
  children?: ReactNode;
}

/**
 * Guards routes behind authentication and role checks.
 *
 * Usage (layout route):
 *   <Route element={<ProtectedRoute allowedRoles={["dispatcher"]} />}>
 *     <Route path="/dispatcher/dashboard" element={<DispatcherDashboard />} />
 *   </Route>
 *
 * Flow:
 *  1. Session still being verified (JWT check) -> loader
 *  2. Not authenticated -> login, remembering the page they wanted
 *  3. Authenticated but wrong role -> unauthorized page
 *  4. Otherwise render the children / nested routes
 */
export function ProtectedRoute({
  allowedRoles,
  redirectTo = ROUTES.LOGIN,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loader fullScreen />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Inverse guard for the login page: already signed-in users
 * are sent straight to their role's home screen.
 */
export function GuestRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <Loader fullScreen />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;