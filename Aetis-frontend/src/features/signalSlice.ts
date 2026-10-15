import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { SignalStatus, TrafficSignal } from "../types/signal.types";
import { signedOut } from "./auth/authSlice";

/* ==========================================================================
   Traffic signals: the network-wide list, plus which signals sit on each
   active emergency's route.

   A signal's status is global (it is either in priority or it is not), but
   the time a vehicle is due is per route, because two vehicles can pass the
   same signal at different times. So arrival times are stored with the route,
   not on the signal.
   ========================================================================== */

export type SignalLoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface RouteSignal {
  signalId: string;
  /** Epoch ms when this route's vehicle is due at the signal */
  expectedArrivalAt?: number;
}

export interface SignalState {
  entities: Record<string, TrafficSignal>;
  /**
   * When each signal's status was last set, as epoch ms of the *event* (or of
   * the request that returned it). A late message never overwrites a newer one.
   */
  statusAt: Record<string, number>;
  /** Signals on each emergency's route, in route order, keyed by emergencyId */
  routes: Record<string, RouteSignal[]>;
  /** Oldest first, so the oldest route can be dropped when the limit is hit */
  routeOrder: string[];
  loadStatus: SignalLoadStatus;
  error: string | null;
  lastLoadedAt: number | null;
}

export const initialSignalState: SignalState = {
  entities: {},
  statusAt: {},
  routes: {},
  routeOrder: [],
  loadStatus: "idle",
  error: null,
  lastLoadedAt: null,
};

/** Routes kept in memory. Completed emergencies should call routeCleared. */
const ROUTE_LIMIT = 30;

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isUsable = (s: unknown): s is TrafficSignal =>
  typeof s === "object" &&
  s !== null &&
  typeof (s as TrafficSignal).id === "string" &&
  VALID_ID.test((s as TrafficSignal).id);

const finiteOrUndefined = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Applies an incoming signal. `observedAt` is when the data was true: the
 * event time for live updates, or the time the request was *sent* for
 * snapshots. If something newer is already stored, the stored status wins and
 * only the other fields (name, location...) are updated.
 */
function upsert(state: SignalState, incoming: TrafficSignal, observedAt: number) {
  const existing = hasOwn(state.entities, incoming.id)
    ? state.entities[incoming.id]
    : undefined;

  if (!existing) {
    state.entities[incoming.id] = incoming;
    state.statusAt[incoming.id] = observedAt;
    return;
  }

  const lastAt = hasOwn(state.statusAt, incoming.id)
    ? state.statusAt[incoming.id]
    : -Infinity;

  if (observedAt >= lastAt) {
    state.entities[incoming.id] = { ...existing, ...incoming };
    state.statusAt[incoming.id] = observedAt;
  } else {
    state.entities[incoming.id] = { ...existing, ...incoming, status: existing.status };
  }
}

export interface SignalStatusChange {
  id: string;
  status: SignalStatus;
  /** Epoch ms of the event. Added automatically when missing. */
  at?: number;
  expectedArrivalAt?: number;
}

const signalSlice = createSlice({
  name: "signals",
  initialState: initialSignalState,
  reducers: {
    loadStarted(state) {
      state.loadStatus = "loading";
      state.error = null;
    },

    /**
     * The full list of signals. Signals missing from it are removed.
     * `requestedAt` is when the request was sent (default: now), which lets a
     * live event that arrived while the request was in flight stay in force.
     */
    signalsReceived: {
      reducer(
        state,
        action: PayloadAction<{ signals: TrafficSignal[]; requestedAt: number }>
      ) {
        const { signals, requestedAt } = action.payload;
        const usable = signals.filter(isUsable);
        const keep = new Set(usable.map((s) => s.id));

        usable.forEach((s) => upsert(state, s, requestedAt));

        Object.keys(state.entities).forEach((id) => {
          if (!keep.has(id)) {
            delete state.entities[id];
            delete state.statusAt[id];
          }
        });

        state.loadStatus = "succeeded";
        state.error = null;
        state.lastLoadedAt = Date.now();
      },
      prepare(signals: TrafficSignal[], requestedAt: number = Date.now()) {
        return { payload: { signals, requestedAt } };
      },
    },

    loadFailed(state, action: PayloadAction<string>) {
      state.loadStatus = "failed";
      state.error = action.payload;
    },

    /** The signals on one emergency's route, in the order the vehicle meets them */
    routeSignalsReceived: {
      reducer(
        state,
        action: PayloadAction<{
          emergencyId: string;
          signals: TrafficSignal[];
          requestedAt: number;
        }>
      ) {
        const { emergencyId, signals, requestedAt } = action.payload;
        if (!VALID_ID.test(emergencyId)) return;

        const usable = signals.filter(isUsable);
        usable.forEach((s) => upsert(state, s, requestedAt));

        state.routes[emergencyId] = usable.map((s) => ({
          signalId: s.id,
          expectedArrivalAt: finiteOrUndefined(s.expectedArrivalAt),
        }));

        state.routeOrder = [
          ...state.routeOrder.filter((id) => id !== emergencyId),
          emergencyId,
        ];
        while (state.routeOrder.length > ROUTE_LIMIT) {
          const oldest = state.routeOrder.shift();
          if (oldest !== undefined) delete state.routes[oldest];
        }
      },
      prepare(
        emergencyId: string,
        signals: TrafficSignal[],
        requestedAt: number = Date.now()
      ) {
        return { payload: { emergencyId, signals, requestedAt } };
      },
    },

    /** A live status change. Unknown signals are ignored (a status alone cannot create one). */
    signalStatusChanged: {
      reducer(state, action: PayloadAction<SignalStatusChange & { at: number }>) {
        const { id, status, at, expectedArrivalAt } = action.payload;
        if (typeof id !== "string" || !hasOwn(state.entities, id)) return;

        const lastAt = hasOwn(state.statusAt, id) ? state.statusAt[id] : -Infinity;
        if (at < lastAt) return;

        state.entities[id].status = status;
        state.statusAt[id] = at;

        const eta = finiteOrUndefined(expectedArrivalAt);
        if (eta !== undefined) state.entities[id].expectedArrivalAt = eta;
      },
      prepare(change: SignalStatusChange) {
        return { payload: { ...change, at: change.at ?? Date.now() } };
      },
    },

    /** When an emergency ends, its route no longer needs to be held */
    routeCleared(state, action: PayloadAction<string>) {
      if (!hasOwn(state.routes, action.payload)) return;
      delete state.routes[action.payload];
      state.routeOrder = state.routeOrder.filter((id) => id !== action.payload);
    },

    signalsCleared() {
      return initialSignalState;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialSignalState);
  },
});

export const {
  loadStarted,
  signalsReceived,
  loadFailed,
  routeSignalsReceived,
  signalStatusChanged,
  routeCleared,
  signalsCleared,
} = signalSlice.actions;

export const SIGNAL_STATE_KEY = signalSlice.name;

export default signalSlice.reducer;

/* ---------- Selectors ---------- */

const EMPTY_SIGNALS: TrafficSignal[] = [];

/** Sorted by name, so the list order is stable between updates */
export const selectAllSignals = createSelector(
  [(s: SignalState) => s.entities],
  (entities) =>
    Object.values(entities).sort(
      (a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "") || (a.id < b.id ? -1 : 1)
    )
);

export const selectSignalById = (
  s: SignalState,
  id: string | null | undefined
): TrafficSignal | null =>
  id && hasOwn(s.entities, id) ? s.entities[id] : null;

/** Signals that are in, or about to be in, emergency priority */
export const selectPrioritySignals = createSelector([selectAllSignals], (all) =>
  all.filter((s) => s.status === "priority" || s.status === "pending")
);

export const selectFaultSignals = createSelector([selectAllSignals], (all) =>
  all.filter((s) => s.status === "fault")
);

/**
 * Signals on one emergency's route, in route order, each carrying that
 * route's arrival time. This is a factory: each component that needs it
 * calls it once (e.g. in useMemo), so every instance keeps its own cache.
 */
export const makeSelectSignalsForEmergency = () =>
  createSelector(
    [
      (s: SignalState) => s.entities,
      (s: SignalState, emergencyId: string | null | undefined) =>
        emergencyId && hasOwn(s.routes, emergencyId)
          ? s.routes[emergencyId]
          : undefined,
    ],
    (entities, route): TrafficSignal[] => {
      if (!route) return EMPTY_SIGNALS;

      return route.flatMap((r) => {
        if (!hasOwn(entities, r.signalId)) return [];
        const signal = entities[r.signalId];
        return [
          {
            ...signal,
            expectedArrivalAt: r.expectedArrivalAt ?? signal.expectedArrivalAt,
          },
        ];
      });
    }
  );

export const selectSignalLoadStatus = (s: SignalState): SignalLoadStatus =>
  s.loadStatus;

export const selectSignalError = (s: SignalState): string | null => s.error;