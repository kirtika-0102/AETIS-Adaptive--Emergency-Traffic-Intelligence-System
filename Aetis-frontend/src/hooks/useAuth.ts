import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  selectAuthStatus,
  selectAuthUser,
  selectIsAuthChecking,
  selectIsAuthenticated,
} from "../features/auth/authSelectors";
import { signedIn, signedOut } from "../features/auth/authSlice";
import type { AuthState, AuthStatus } from "../features/auth/authSlice";
import { authApi } from "../services/api/authApi";
import type { LoginCredentials } from "../services/api/authApi";
import type { AuthUser } from "../types/user.types";

export type { LoginCredentials };

interface Root {
  auth: AuthState;
}

export interface UseAuthResult {
  user: AuthUser | null;
  status: AuthStatus;
  /** True only when the status is "authenticated" and a user is present */
  isAuthenticated: boolean;
  /** True until the startup session check has finished */
  isLoading: boolean;
  /**
   * Rejects with an ApiError whose `code` is what LoginForm turns into a
   * message (INVALID_CREDENTIALS, ACCOUNT_PENDING, ...).
   */
  login(credentials: LoginCredentials): Promise<AuthUser>;
  /**
   * Never rejects, and always clears the local session. Resolves to true when
   * the server confirmed the session ended. False means the server could not
   * be reached, so the session cookie may still be valid there.
   */
  logout(): Promise<boolean>;
}

/** Shared by every caller, so a double click does not send two requests */
let logoutInFlight: Promise<boolean> | null = null;

/**
 * Reads the signed-in user from the store and offers login and logout. These
 * values decide what the interface shows; the server decides what is allowed.
 */
export function useAuth(): UseAuthResult {
  const dispatch = useDispatch();

  const user = useSelector((s: Root) => selectAuthUser(s.auth));
  const status = useSelector((s: Root) => selectAuthStatus(s.auth));
  const isAuthenticated = useSelector((s: Root) => selectIsAuthenticated(s.auth));
  const isLoading = useSelector((s: Root) => selectIsAuthChecking(s.auth));

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<AuthUser> => {
      const signedInUser = await authApi.login(credentials);
      dispatch(signedIn(signedInUser));
      return signedInUser;
    },
    [dispatch]
  );

  const logout = useCallback((): Promise<boolean> => {
    if (!logoutInFlight) {
      logoutInFlight = (async () => {
        let confirmed = true;
        try {
          await authApi.logout();
        } catch {
          confirmed = false;
        }
        // Whatever the server said, this browser is no longer signed in
        dispatch(signedOut());
        return confirmed;
      })().finally(() => {
        logoutInFlight = null;
      });
    }
    return logoutInFlight;
  }, [dispatch]);

  return useMemo(
    () => ({ user, status, isAuthenticated, isLoading, login, logout }),
    [user, status, isAuthenticated, isLoading, login, logout]
  );
}