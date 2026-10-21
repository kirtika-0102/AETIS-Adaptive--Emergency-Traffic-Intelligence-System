import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import type { AuthState } from "../features/auth/authSlice";
import {
  allMarkedRead,
  loadFailed,
  loadStarted,
  markedRead,
  markedUnread,
  notificationsReceived,
  selectAllNotifications,
  unreadRestored,
} from "../features/notificationSlice";
import type { NotificationState } from "../features/notificationSlice";
import { ApiError } from "../services/api/axiosClient";
import { notificationApi } from "../services/api/notificationApi";
import type { AppNotification } from "../types/notification.types";
import { usePolling } from "./usePolling";
import { useSocketStatus } from "./useSocketStatus";

interface Root {
  auth: AuthState;
  notifications: NotificationState;
}

export interface UseNotificationsResult {
  /** Newest first */
  notifications: AppNotification[];
  /** The server's total, which can exceed the number of items held */
  unreadCount: number;
  /** True only until the first load has finished */
  isLoading: boolean;
  error: string | null;
  /** Never rejects. The screen updates at once and is rolled back on failure. */
  markAsRead(id: string): Promise<void>;
  /** Never rejects. The screen updates at once and is rolled back on failure. */
  markAllAsRead(): Promise<void>;
  refresh(): Promise<void>;
}

/** Alerts also arrive over the socket, so this is only a safety net */
const POLL_MS = 30_000;
const LOAD_FAILED = "Could not load notifications. Please try again.";
const WRITE_FAILED = "Could not update that notification. Please try again.";

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

export function useNotifications(): UseNotificationsResult {
  const dispatch = useDispatch();
  const store = useStore<Root>();
  const { isOpen } = useSocketStatus();

  const notifications = useSelector((s: Root) =>
    selectAllNotifications(s.notifications)
  );
  const unreadCount = useSelector((s: Root) => s.notifications.unreadCount);
  const loadStatus = useSelector((s: Root) => s.notifications.loadStatus);
  const loadError = useSelector((s: Root) => s.notifications.error);

  const [actionError, setActionError] = useState<string | null>(null);
  // How many "mark as read" requests are waiting for the server
  const pendingWrites = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const userId = () => store.getState().auth.user?.id ?? null;
    const owner = userId();

    if (store.getState().notifications.loadStatus === "idle") {
      dispatch(loadStarted());
    }

    try {
      const result = await notificationApi.getNotifications();
      if (userId() !== owner) return;

      // The server has not heard about a tap yet, so this snapshot would
      // briefly undo it. The next load picks up the settled state.
      if (pendingWrites.current > 0) return;

      dispatch(
        notificationsReceived({
          items: result.items,
          unreadCount: result.unreadCount,
        })
      );
      setActionError(null);
    } catch (err) {
      if (userId() === owner) {
        dispatch(loadFailed(err instanceof ApiError ? err.message : LOAD_FAILED));
      }
      throw err;
    }
  }, [dispatch, store]);

  usePolling(load, { enabled: !isOpen, intervalMs: POLL_MS });

  useEffect(() => {
    if (!isOpen) return;
    if (store.getState().notifications.loadStatus !== "idle") return;
    load().catch(() => undefined);
  }, [isOpen, load, store]);

  const markAsRead = useCallback(
    async (id: string): Promise<void> => {
      const { entities } = store.getState().notifications;
      const item = hasOwn(entities, id) ? entities[id] : undefined;
      if (!item || item.read) return;

      dispatch(markedRead(id));
      pendingWrites.current += 1;
      try {
        await notificationApi.markAsRead(id);
        setActionError(null);
      } catch {
        dispatch(markedUnread(id));
        setActionError(WRITE_FAILED);
      } finally {
        pendingWrites.current -= 1;
      }
    },
    [dispatch, store]
  );

  const markAllAsRead = useCallback(async (): Promise<void> => {
    const state = store.getState().notifications;
    if (state.unreadCount === 0) return;

    // Remembered so a failure can put everything back exactly as it was
    const previousIds = Object.values(state.entities)
      .filter((n) => !n.read)
      .map((n) => n.id);
    const previousCount = state.unreadCount;

    dispatch(allMarkedRead());
    pendingWrites.current += 1;
    try {
      await notificationApi.markAllAsRead();
      setActionError(null);
    } catch {
      dispatch(unreadRestored({ ids: previousIds, unreadCount: previousCount }));
      setActionError(WRITE_FAILED);
    } finally {
      pendingWrites.current -= 1;
    }
  }, [dispatch, store]);

  const refresh = useCallback(() => load().catch(() => undefined), [load]);

  return {
    notifications,
    unreadCount,
    isLoading: loadStatus === "idle" || loadStatus === "loading",
    error: actionError ?? loadError,
    markAsRead,
    markAllAsRead,
    refresh,
  };
}