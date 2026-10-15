import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { Emergency, EmergencyStatus } from "../../types/emergency.types";
import { signedOut } from "../auth/authSlice";

/* ==========================================================================
   Emergencies the dispatcher console currently knows about.

   Fed by the API calls and, later, by WebSocket events. Fetching itself does
   not live here: hooks and services call the API, then dispatch the results.
   ========================================================================== */

export type EmergencyLoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface EmergencyState {
  entities: Record<string, Emergency>;
  /** Newest first. Always matches the keys of `entities`. */
  ids: string[];
  loadStatus: EmergencyLoadStatus;
  error: string | null;
  /** Epoch ms of the last successful load */
  lastLoadedAt: number | null;
}

export const initialEmergencyState: EmergencyState = {
  entities: {},
  ids: [],
  loadStatus: "idle",
  error: null,
  lastLoadedAt: null,
};

/** Finished emergencies kept in memory. Active ones are never dropped. */
const FINISHED_LIMIT = 50;

/** Ids come from the server and are used as object keys, so odd ones are refused */
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/**
 * Normal progression. completed and cancelled are final.
 * A late or repeated update must never move an emergency backwards.
 */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  dispatched: 1,
  en_route: 2,
  arrived: 3,
  completed: 4,
  cancelled: 4,
};

const isFinished = (status: string) =>
  status === "completed" || status === "cancelled";

/** Unknown statuses count as active, so a new backend status is shown, not hidden */
export const isActiveStatus = (status: string) => !isFinished(status);

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isUsable = (e: unknown): e is Emergency =>
  typeof e === "object" &&
  e !== null &&
  typeof (e as Emergency).id === "string" &&
  VALID_ID.test((e as Emergency).id);

/** True when the incoming status should be ignored in favour of the stored one */
function shouldKeepStatus(existing: string, incoming: string): boolean {
  if (existing === incoming) return false;
  if (isFinished(existing)) return true;
  if (isFinished(incoming)) return false;

  const from = STATUS_RANK[existing];
  const to = STATUS_RANK[incoming];
  if (from === undefined || to === undefined) return false;

  return to < from;
}

function merge(state: EmergencyState, incoming: Emergency) {
  const existing = hasOwn(state.entities, incoming.id)
    ? state.entities[incoming.id]
    : undefined;

  if (!existing) {
    state.entities[incoming.id] = incoming;
    return;
  }

  state.entities[incoming.id] = {
    ...existing,
    ...incoming,
    status: shouldKeepStatus(existing.status, incoming.status)
      ? existing.status
      : incoming.status,
  };
}

const timeOf = (e: Emergency) => {
  const t = Date.parse(e.createdAt);
  return Number.isFinite(t) ? t : 0;
};

/** Re-sorts newest first and drops the oldest finished emergencies */
function rebuildOrder(state: EmergencyState) {
  const all = Object.values(state.entities);
  all.sort((a, b) => timeOf(b) - timeOf(a) || (a.id < b.id ? -1 : 1));

  const kept: string[] = [];
  let finished = 0;

  for (const e of all) {
    if (isFinished(e.status)) {
      finished += 1;
      if (finished > FINISHED_LIMIT) {
        delete state.entities[e.id];
        continue;
      }
    }
    kept.push(e.id);
  }

  state.ids = kept;
}

export interface StatusChange {
  id: string;
  status: EmergencyStatus;
  responseSeconds?: number;
}

const emergencySlice = createSlice({
  name: "emergency",
  initialState: initialEmergencyState,
  reducers: {
    loadStarted(state) {
      state.loadStatus = "loading";
      state.error = null;
    },

    /**
     * A page of emergencies from the API. Merged into what is already held;
     * nothing is removed, because the dashboard only fetches the first few.
     */
    emergenciesReceived: {
      reducer(
        state,
        action: PayloadAction<{ emergencies: Emergency[]; receivedAt: number }>
      ) {
        action.payload.emergencies.filter(isUsable).forEach((e) => merge(state, e));
        rebuildOrder(state);

        state.loadStatus = "succeeded";
        state.error = null;
        state.lastLoadedAt = action.payload.receivedAt;
      },
      // The timestamp is added here so the reducer itself stays pure
      prepare(emergencies: Emergency[]) {
        return { payload: { emergencies, receivedAt: Date.now() } };
      },
    },

    loadFailed(state, action: PayloadAction<string>) {
      state.loadStatus = "failed";
      state.error = action.payload;
    },

    /** After creating an emergency, or when a full record arrives over the socket */
    emergencyUpserted(state, action: PayloadAction<Emergency>) {
      if (!isUsable(action.payload)) return;
      merge(state, action.payload);
      rebuildOrder(state);
    },

    /**
     * A status-only event. If the emergency is not held here, there is nothing
     * to update (a bare status cannot create a record), so it is ignored.
     */
    emergencyStatusChanged(state, action: PayloadAction<StatusChange>) {
      const { id, status, responseSeconds } = action.payload;
      if (typeof id !== "string" || !hasOwn(state.entities, id)) return;

      const existing = state.entities[id];
      state.entities[id] = {
        ...existing,
        status: shouldKeepStatus(existing.status, status) ? existing.status : status,
        ...(responseSeconds !== undefined ? { responseSeconds } : {}),
      };
      rebuildOrder(state);
    },

    emergencyRemoved(state, action: PayloadAction<string>) {
      if (!hasOwn(state.entities, action.payload)) return;
      delete state.entities[action.payload];
      state.ids = state.ids.filter((id) => id !== action.payload);
    },

    emergenciesCleared() {
      return initialEmergencyState;
    },
  },

  extraReducers: (builder) => {
    // The next person on a shared console must not see the last one's data
    builder.addCase(signedOut, () => initialEmergencyState);
  },
});

export const {
  loadStarted,
  emergenciesReceived,
  loadFailed,
  emergencyUpserted,
  emergencyStatusChanged,
  emergencyRemoved,
  emergenciesCleared,
} = emergencySlice.actions;

export const EMERGENCY_STATE_KEY = emergencySlice.name;

export default emergencySlice.reducer;

/* ==========================================================================
   Selectors. Like the auth selectors, they take the slice itself
   (EmergencyState), so they work in a Redux store (`state.emergency`) or
   anywhere the reducer runs.
   ========================================================================== */

/** Newest first */
export const selectAllEmergencies = createSelector(
  [(s: EmergencyState) => s.ids, (s: EmergencyState) => s.entities],
  (ids, entities) => ids.map((id) => entities[id]).filter(Boolean)
);

export const selectEmergencyById = (
  s: EmergencyState,
  id: string | null | undefined
): Emergency | null =>
  id && hasOwn(s.entities, id) ? s.entities[id] : null;

/** Everything that is not completed or cancelled */
export const selectActiveEmergencies = createSelector(
  [selectAllEmergencies],
  (all) => all.filter((e) => isActiveStatus(e.status))
);

/** Waiting for a vehicle to be assigned */
export const selectPendingEmergencies = createSelector(
  [selectAllEmergencies],
  (all) => all.filter((e) => e.status === "pending")
);

export const selectActiveEmergencyCount = (s: EmergencyState): number =>
  selectActiveEmergencies(s).length;

export const selectEmergencyLoadStatus = (s: EmergencyState): EmergencyLoadStatus =>
  s.loadStatus;

export const selectEmergencyError = (s: EmergencyState): string | null => s.error;

export const selectEmergenciesLastLoadedAt = (s: EmergencyState): number | null =>
  s.lastLoadedAt;