import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import type { AuthState } from "../features/auth/authSlice";
import {
  evsSnapshotReceived,
  loadFailed,
  loadStarted,
  selectAllEVs,
} from "../features/trackingSlice";
import type { TrackingState } from "../features/trackingSlice";
import { ApiError } from "../services/api/axiosClient";
import { trackingApi } from "../services/api/trackingApi";
import type { TrackedEV } from "../types/tracking.types";
import { usePolling } from "./usePolling";
import { useSocketStatus } from "./useSocketStatus";

interface Root {
  auth: AuthState;
  tracking: TrackingState;
}

export interface LiveTracking {
  /** Vehicles currently on a live trip */
  evs: TrackedEV[];
  /**
   * True while the data on screen is being kept current: by the live socket,
   * or by polling when the socket is down or unavailable (mock mode).
   */
  isConnected: boolean;
  /** True only until the first load has finished */
  isLoading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

/** Positions change every few seconds, so the fallback polls quickly */
const POLL_MS = 5_000;
const FALLBACK_ERROR = "Could not load vehicle positions. Please try again.";

export function useLiveTracking(): LiveTracking {
  const dispatch = useDispatch();
  const store = useStore<Root>();
  const { isOpen } = useSocketStatus();

  const evs = useSelector((s: Root) => selectAllEVs(s.tracking));
  const loadStatus = useSelector((s: Root) => s.tracking.loadStatus);
  const error = useSelector((s: Root) => s.tracking.error);

  // Whether the last poll worked. Only matters while the socket is not open.
  const [pollOk, setPollOk] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const userId = () => store.getState().auth.user?.id ?? null;
    const owner = userId();

    // Background refreshes must not flip the screen back to "loading"
    if (store.getState().tracking.loadStatus === "idle") dispatch(loadStarted());

    const requestedAt = Date.now();
    try {
      const list = await trackingApi.getActiveEVs();
      // Signed out, or a different person signed in, while this was in flight
      if (userId() !== owner) return;

      dispatch(evsSnapshotReceived(list, requestedAt));
      setPollOk(true);
    } catch (err) {
      if (userId() === owner) {
        dispatch(
          loadFailed(err instanceof ApiError ? err.message : FALLBACK_ERROR)
        );
      }
      setPollOk(false);
      throw err;
    }
  }, [dispatch, store]);

  // Poll only while live updates are not flowing
  usePolling(load, { enabled: !isOpen, intervalMs: POLL_MS });

  // With the socket open it keeps data fresh, but this session's first
  // load may still be missing (for example if the reconnect reload failed)
  useEffect(() => {
    if (!isOpen) return;
    if (store.getState().tracking.loadStatus !== "idle") return;
    load().catch(() => undefined);
  }, [isOpen, load, store]);

  const refresh = useCallback(() => load().catch(() => undefined), [load]);

  return {
    evs,
    isConnected: isOpen || pollOk,
    isLoading: loadStatus === "idle" || loadStatus === "loading",
    error,
    refresh,
  };
}