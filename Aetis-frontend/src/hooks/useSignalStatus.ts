import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";

import {
  selectUserRole,
} from "../features/auth/authSelectors";
import type { AuthState } from "../features/auth/authSlice";
import {
  makeSelectSignalsForEmergency,
  routeSignalsReceived,
  selectAllSignals,
  signalsReceived,
} from "../features/signalSlice";
import type { SignalState } from "../features/signalSlice";
import { ApiError } from "../services/api/axiosClient";
import { signalApi } from "../services/api/signalApi";
import type { TrafficSignal } from "../types/signal.types";
import type { UserRole } from "../types/user.types";
import { usePolling } from "./usePolling";
import { useSocketStatus } from "./useSocketStatus";

interface Root {
  auth: AuthState;
  signals: SignalState;
}

export interface SignalStatusResult {
  signals: TrafficSignal[];
  /** True only while there is nothing to show yet and the first load is running */
  isLoading: boolean;
  error: string | null;
}

/**
 * The network-wide list is for dispatchers and admins, matching the backend
 * rule. Other roles only ever see the signals on a route they are allowed to
 * follow, and are not sent to a list they would be refused.
 */
const ALL_SIGNALS_ROLES: readonly UserRole[] = ["dispatcher", "admin"];

const POLL_MS = 5_000;
const EMPTY: TrafficSignal[] = [];
const FALLBACK_ERROR = "Could not load signal status. Please try again.";

/**
 * With an emergency id: the signals on that vehicle's route, in route order,
 * each with its own arrival time. With no id: every signal in the network.
 *
 * Loading state is kept here rather than in the slice, because the slice's
 * status describes the network-wide list and not individual routes.
 */
export function useSignalStatus(
  emergencyId?: string | null
): SignalStatusResult {
  const dispatch = useDispatch();
  const store = useStore<Root>();
  const { isOpen } = useSocketStatus();

  const role = useSelector((s: Root) => selectUserRole(s.auth));
  // Each component gets its own selector, so each keeps its own cache
  const selectForRoute = useMemo(() => makeSelectSignalsForEmergency(), []);

  const routeId = emergencyId ? emergencyId : null;
  const key = routeId ?? "all";
  const canLoad =
    routeId !== null || (role !== null && ALL_SIGNALS_ROLES.includes(role));

  const routeSignals = useSelector((s: Root) => selectForRoute(s.signals, routeId));
  const allSignals = useSelector((s: Root) => selectAllSignals(s.signals));

  const [settledKey, setSettledKey] = useState<string | null>(null);
  // A 403 is final: asking again will not change the answer
  const [forbiddenKey, setForbiddenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = canLoad && forbiddenKey !== key;

  const load = useCallback(async (): Promise<void> => {
    const userId = () => store.getState().auth.user?.id ?? null;
    const owner = userId();
    const requestedAt = Date.now();

    try {
      if (routeId) {
        const list = await signalApi.getSignalsForEmergency(routeId);
        if (userId() !== owner) return;
        dispatch(routeSignalsReceived(routeId, list, requestedAt));
      } else {
        const list = await signalApi.getSignals();
        if (userId() !== owner) return;
        dispatch(signalsReceived(list, requestedAt));
      }
      setError(null);
    } catch (err) {
      if (userId() === owner) {
        if (err instanceof ApiError && err.status === 403) setForbiddenKey(key);
        setError(err instanceof ApiError ? err.message : FALLBACK_ERROR);
      }
      throw err;
    } finally {
      setSettledKey(key);
    }
  }, [dispatch, store, routeId, key]);

  // Restarts, with an immediate load, whenever a different route is selected
  usePolling(load, {
    enabled: active && !isOpen,
    intervalMs: POLL_MS,
    resetKey: key,
  });

  // With the socket open, events keep statuses current, but anything missed
  // while it was down (a re-planned route) is only found by loading again
  useEffect(() => {
    if (!isOpen || !active) return;
    load().catch(() => undefined);
  }, [isOpen, active, load]);

  const signals = !canLoad ? EMPTY : routeId ? routeSignals : allSignals;

  return {
    signals,
    isLoading: active && signals.length === 0 && settledKey !== key,
    error,
  };
}