import type { AuthUser, UserRole } from "../../types/user.types";
import type { AuthState, AuthStatus } from "./authSlice";

/**
 * Selectors take the auth slice itself (AuthState), not the whole app state,
 * so they work the same whether the slice sits in a Redux store
 * (`selectAuthUser(state.auth)`) or runs inside a context via useReducer.
 *
 * These exist for the interface only. They decide what to show, never what
 * a user is allowed to do. The server enforces access on every request.
 */

export const selectAuthUser = (auth: AuthState): AuthUser | null => auth.user;

export const selectAuthStatus = (auth: AuthState): AuthStatus => auth.status;

/** True until the startup session check has finished */
export const selectIsAuthChecking = (auth: AuthState): boolean =>
  auth.status === "checking";

/** Requires both the status and a user, so the two can never disagree */
export const selectIsAuthenticated = (auth: AuthState): boolean =>
  auth.status === "authenticated" && auth.user !== null;

export const selectUserRole = (auth: AuthState): UserRole | null =>
  auth.status === "authenticated" ? auth.user?.role ?? null : null;

export const selectUserHasRole = (
  auth: AuthState,
  allowedRoles: readonly UserRole[]
): boolean => {
  const role = selectUserRole(auth);
  return role !== null && allowedRoles.includes(role);
};