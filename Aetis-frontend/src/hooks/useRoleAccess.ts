import { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";

import {
  selectIsAuthChecking,
  selectUserRole,
} from "../features/auth/authSelectors";
import type { AuthState } from "../features/auth/authSlice";
import {
  DESTINATION_ROLES,
  ROUTES,
  getHomeRouteForRole,
} from "../routes/routePaths";
import type { UserRole } from "../types/user.types";

interface Root {
  auth: AuthState;
}

export interface RoleAccess {
  role: UserRole | null;
  /**
   * True until the startup session check has finished. Every flag below is
   * false during that time, so wait for it before showing "no access" text.
   */
  isLoading: boolean;
  hasRole(allowed: readonly UserRole[]): boolean;
  isAdmin: boolean;
  isDispatcher: boolean;
  isDriver: boolean;
  /** Hospital, police station or fire station staff */
  isDestination: boolean;
  /** The signed-in role's landing page, or the public home page if signed out */
  homePath: string;
}

/**
 * For deciding what to SHOW (a button, a menu entry). It is not a security
 * check: anyone can change what their own browser displays, so the server
 * must enforce the same rule on every request.
 */
export function useRoleAccess(): RoleAccess {
  const role = useSelector((s: Root) => selectUserRole(s.auth));
  const isLoading = useSelector((s: Root) => selectIsAuthChecking(s.auth));

  const hasRole = useCallback(
    (allowed: readonly UserRole[]) => role !== null && allowed.includes(role),
    [role]
  );

  return useMemo(
    () => ({
      role,
      isLoading,
      hasRole,
      isAdmin: role === "admin",
      isDispatcher: role === "dispatcher",
      isDriver: role === "driver",
      isDestination: role !== null && DESTINATION_ROLES.includes(role),
      homePath: role ? getHomeRouteForRole(role) : ROUTES.HOME,
    }),
    [role, isLoading, hasRole]
  );
}