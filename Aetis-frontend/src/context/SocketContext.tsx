import { useEffect } from "react";
import type { ReactNode } from "react";
import { useSelector, useStore } from "react-redux";

import { selectUserRole } from "../features/auth/authSelectors";
import type { AuthState } from "../features/auth/authSlice";
import { getSocketClient } from "../services/websocket/socketClient";
import { bindSocketToStore } from "../services/websocket/socketEvents";
import type {
  ResyncOptions,
  SocketRootState,
} from "../services/websocket/socketEvents";
import { useVerifySession } from "./AuthContext";

interface Root extends SocketRootState {
  auth: AuthState;
}

/**
 * Only dispatchers and admins may read the full emergency and signal lists
 * (the backend refuses other roles), so only they reload those lists after a
 * reconnect. Everyone reloads live vehicles and notifications.
 */
const FULL_LIST_ROLES = ["dispatcher", "admin"];

/**
 * Opens the live connection while someone is signed in and closes it when
 * they sign out. It provides no context value: components follow the
 * connection with useSocketStatus(), and the data arrives in the store.
 *
 * Nothing in the app depends on this provider for correctness. While the
 * socket is not open, the hooks poll instead.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const store = useStore<Root>();
  const verifySession = useVerifySession();

  // Primitives, so the connection restarts only when the person changes
  const userId = useSelector((s: Root) =>
    s.auth.status === "authenticated" ? s.auth.user?.id ?? null : null
  );
  const role = useSelector((s: Root) => selectUserRole(s.auth));

  useEffect(() => {
    if (!userId || !role) return;

    const client = getSocketClient();
    // Mock mode, or an unusable VITE_WS_URL: there is nothing to connect to
    if (!client.available) return;

    const resync: ResyncOptions = FULL_LIST_ROLES.includes(role)
      ? { emergencies: true, signals: true }
      : {};

    // The server closes with 4401 (no session) or 4403 (role refused). Asking
    // /auth/me tells them apart: a missing session signs this tab out, while a
    // valid session means only the role was refused, so nothing happens.
    const unbind = bindSocketToStore(client, store, {
      resync,
      onUnauthorized: verifySession,
    });
    client.connect();

    return () => {
      // Unbind first, so a late response cannot reach the store afterwards
      unbind();
      client.disconnect();
    };
  }, [userId, role, store, verifySession]);

  return <>{children}</>;
}