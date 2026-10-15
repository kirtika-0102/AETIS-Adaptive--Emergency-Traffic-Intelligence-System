import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { LatLng } from "../types/route.types";
import type { TrackedEV } from "../types/tracking.types";
import { isValidLatLng } from "../utils/mapHelpers";
import { signedOut } from "./auth/authSlice";

/* ==========================================================================
   Emergency vehicles currently on a live trip, keyed by emergencyId.

   This is the busiest slice: positions arrive every few seconds per vehicle,
   so updates are applied in place and out-of-order messages are discarded.
   ========================================================================== */

export type TrackingLoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface TrackingState {
  entities: Record<string, TrackedEV>;
  /** Whether the live socket is currently connected */
  connected: boolean;
  loadStatus: TrackingLoadStatus;
  error: string | null;
  lastSnapshotAt: number | null;
}

export const initialTrackingState: TrackingState = {
  entities: {},
  connected: false,
  loadStatus: "idle",
  error: null,
  lastSnapshotAt: null,
};

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isUsable = (ev: unknown): ev is TrackedEV =>
  typeof ev === "object" &&
  ev !== null &&
  typeof (ev as TrackedEV).emergencyId === "string" &&
  VALID_ID.test((ev as TrackedEV).emergencyId) &&
  isValidLatLng((ev as TrackedEV).location);

const timeOf = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const finiteOrUndefined = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const cleanRoute = (route: unknown): LatLng[] =>
  Array.isArray(route) ? route.filter(isValidLatLng) : [];

/** True when `incoming` is provably older than `existing` */
const isOlder = (incoming?: string | null, existing?: string | null) => {
  const a = timeOf(incoming);
  const b = timeOf(existing);
  return a !== null && b !== null && a < b;
};

function mergeEV(existing: TrackedEV | undefined, incoming: TrackedEV): TrackedEV {
  const route = cleanRoute(incoming.route);

  if (!existing) return { ...incoming, route };

  // A late message may still carry a corrected label or destination, but it
  // must not drag the live position back in time.
  if (isOlder(incoming.lastUpdateAt, existing.lastUpdateAt)) {
    return {
      ...incoming,
      location: existing.location,
      speedKmh: existing.speedKmh,
      etaSeconds: existing.etaSeconds,
      lastUpdateAt: existing.lastUpdateAt,
      route: existing.route.length > 1 ? existing.route : route,
    };
  }

  return {
    ...existing,
    ...incoming,
    route: route.length > 1 ? route : existing.route,
  };
}

export interface EVMove {
  emergencyId: string;
  location: LatLng;
  speedKmh?: number;
  etaSeconds?: number;
  /** ISO time of the GPS fix. Without it, staleness cannot be judged. */
  lastUpdateAt?: string;
  /** Sent only when the route was recalculated */
  route?: LatLng[];
}

const trackingSlice = createSlice({
  name: "tracking",
  initialState: initialTrackingState,
  reducers: {
    loadStarted(state) {
      state.loadStatus = "loading";
      state.error = null;
    },

    /**
     * The complete list of vehicles on a live trip. Vehicles missing from it
     * are removed, unless a live message newer than the request says they are
     * still moving (the request raced with the socket).
     */
    evsSnapshotReceived: {
      reducer(state, action: PayloadAction<{ evs: TrackedEV[]; requestedAt: number }>) {
        const { evs, requestedAt } = action.payload;
        const present = new Set<string>();

        evs.filter(isUsable).forEach((ev) => {
          present.add(ev.emergencyId);
          state.entities[ev.emergencyId] = mergeEV(
            hasOwn(state.entities, ev.emergencyId)
              ? state.entities[ev.emergencyId]
              : undefined,
            ev
          );
        });

        Object.keys(state.entities).forEach((id) => {
          if (present.has(id)) return;
          const t = timeOf(state.entities[id].lastUpdateAt);
          if (t !== null && t > requestedAt) return;
          delete state.entities[id];
        });

        state.loadStatus = "succeeded";
        state.error = null;
        state.lastSnapshotAt = Date.now();
      },
      prepare(evs: TrackedEV[], requestedAt: number = Date.now()) {
        return { payload: { evs, requestedAt } };
      },
    },

    loadFailed(state, action: PayloadAction<string>) {
      state.loadStatus = "failed";
      state.error = action.payload;
    },

    /** A full record: a trip just started, or a dispatch was confirmed */
    evUpserted(state, action: PayloadAction<TrackedEV>) {
      if (!isUsable(action.payload)) return;

      const id = action.payload.emergencyId;
      state.entities[id] = mergeEV(
        hasOwn(state.entities, id) ? state.entities[id] : undefined,
        action.payload
      );
    },

    /**
     * A position update. It cannot create a vehicle (it lacks the label and
     * destination), so an unknown emergency is ignored; the socket layer
     * should fetch the full record instead. Older updates are discarded.
     */
    evMoved(state, action: PayloadAction<EVMove>) {
      const { emergencyId, location, speedKmh, etaSeconds, lastUpdateAt, route } =
        action.payload;

      if (typeof emergencyId !== "string" || !hasOwn(state.entities, emergencyId)) {
        return;
      }
      if (!isValidLatLng(location)) return;

      const ev = state.entities[emergencyId];
      if (isOlder(lastUpdateAt, ev.lastUpdateAt)) return;

      ev.location = location;

      const speed = finiteOrUndefined(speedKmh);
      if (speed !== undefined) ev.speedKmh = speed;

      const eta = finiteOrUndefined(etaSeconds);
      if (eta !== undefined) ev.etaSeconds = eta;

      // Left unchanged when missing, so the "no recent update" warning stays
      // honest instead of being reset by a message with no timestamp
      if (timeOf(lastUpdateAt) !== null && lastUpdateAt) {
        ev.lastUpdateAt = lastUpdateAt;
      }

      const newRoute = cleanRoute(route);
      if (newRoute.length > 1) ev.route = newRoute;
    },

    evRemoved(state, action: PayloadAction<string>) {
      if (!hasOwn(state.entities, action.payload)) return;
      delete state.entities[action.payload];
    },

    connectionChanged(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },

    trackingCleared() {
      return initialTrackingState;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialTrackingState);
  },
});

export const {
  loadStarted,
  evsSnapshotReceived,
  loadFailed,
  evUpserted,
  evMoved,
  evRemoved,
  connectionChanged,
  trackingCleared,
} = trackingSlice.actions;

export const TRACKING_STATE_KEY = trackingSlice.name;

export default trackingSlice.reducer;

/* ---------- Selectors ---------- */

export const selectAllEVs = createSelector(
  [(s: TrackingState) => s.entities],
  (entities) => Object.values(entities)
);

export const selectEVByEmergencyId = (
  s: TrackingState,
  emergencyId: string | null | undefined
): TrackedEV | null =>
  emergencyId && hasOwn(s.entities, emergencyId) ? s.entities[emergencyId] : null;

export const selectEVCount = (s: TrackingState): number =>
  Object.keys(s.entities).length;

export const selectIsTrackingConnected = (s: TrackingState): boolean => s.connected;

export const selectTrackingLoadStatus = (s: TrackingState): TrackingLoadStatus =>
  s.loadStatus;

export const selectTrackingError = (s: TrackingState): string | null => s.error;