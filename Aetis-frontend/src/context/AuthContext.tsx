import { useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { useDispatch, useStore } from "react-redux";

import { signedIn, signedOut } from "../features/auth/authSlice";
import type { AuthState } from "../features/auth/authSlice";
import { authApi } from "../services/api/authApi";
import { setUnauthorizedHandler } from "../services/api/axiosClient";
import type { AuthUser } from "../types/user.types";

interface Root {
  auth: AuthState;
}

/** Shared by every caller, so a burst of 401s starts one check, not many */
let verifying = false;

/**
 * Returns a function that checks with the server whether the session this tab
 * believes in is still the real one, and signs this tab out locally if not:
 *  - the session is gone (expired, or ended elsewhere), or
 *  - it now belongs to a different person (someone signed in from another tab
 *    of the same browser).
 *
 * It never calls logout on the server. In the second case the session belongs
 * to somebody else and must be left alone. If the check itself fails (network,
 * server error) nothing changes, because that proves nothing about the session.
 */
export function useVerifySession(): () => void {
  const dispatch = useDispatch();
  const store = useStore<Root>();

  return useCallback(() => {
    const start = store.getState().auth;
    if (start.status !== "authenticated" || !start.user || verifying) return;

    const ownerId = start.user.id;
    verifying = true;

    authApi
      .getCurrentUser()
      .then((user) => {
        const now = store.getState().auth;
        // Signed out, or somebody else signed in, while this was running
        if (now.status !== "authenticated" || now.user?.id !== ownerId) return;

        if (user === null || user.id !== ownerId) dispatch(signedOut());
      })
      .catch(() => {
        /* cannot tell, so leave things as they are */
      })
      .finally(() => {
        verifying = false;
      });
  }, [dispatch, store]);
}

/**
 * Startup work for authentication. It provides no context value: who is
 * signed in lives in the store, and components read it with useAuth().
 *
 *  1. Asks the server once whether a session already exists, so a reload
 *     keeps the user signed in. Any failure ends in "signed out", which
 *     guarantees the route guards stop showing their loader.
 *  2. Registers what happens when a request is answered with 401.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const store = useStore<Root>();
  const verifySession = useVerifySession();

  useEffect(() => {
    setUnauthorizedHandler(verifySession);
    return () => setUnauthorizedHandler(null);
  }, [verifySession]);

  useEffect(() => {
    let cancelled = false;

    // A startup result must never overwrite a newer sign-in or sign-out
    const finish = (user: AuthUser | null) => {
      if (cancelled) return;
      if (store.getState().auth.status !== "checking") return;
      dispatch(user ? signedIn(user) : signedOut());
    };

    authApi.getCurrentUser().then(finish, () => finish(null));

    return () => {
      cancelled = true;
    };
  }, [dispatch, store]);

  return <>{children}</>;
}