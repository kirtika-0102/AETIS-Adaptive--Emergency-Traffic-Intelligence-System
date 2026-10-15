import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { Vehicle } from "../types/vehicle.types";
import { isValidLatLng } from "../utils/mapHelpers";
import { signedOut } from "./auth/authSlice";

/* ==========================================================================
   Vehicles as the interface sees them:
     - the nearby candidates for an emergency (the dispatch screen), and
     - the signed-in driver's own vehicle.

   The admin fleet list is not held here; the admin pages load it themselves.
   A candidate's ETA belongs to one emergency, so candidates are stored per
   emergency, never in a shared pool.
   ========================================================================== */

interface KnownStatus {
  status: string;
  /** Epoch ms of the event, or of the request that returned it */
  at: number;
}

export interface VehicleState {
  /** Candidates by emergencyId, as last returned by the server */
  nearby: Record<string, Vehicle[]>;
  /** Oldest first, so the oldest entry can be dropped at the limit */
  nearbyOrder: string[];
  myVehicle: Vehicle | null;
  /** Latest status seen per vehicle, used to ignore late messages */
  statuses: Record<string, KnownStatus>;
}

export const initialVehicleState: VehicleState = {
  nearby: {},
  nearbyOrder: [],
  myVehicle: null,
  statuses: {},
};

const NEARBY_LIMIT = 20;

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isUsable = (v: unknown): v is Vehicle =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Vehicle).id === "string" &&
  VALID_ID.test((v as Vehicle).id) &&
  typeof (v as Vehicle).label === "string" &&
  isValidLatLng((v as Vehicle).location);

/**
 * If a status change newer than the request is already known (another
 * dispatcher took the vehicle while the request was in flight), it wins.
 */
function applyKnownStatus(
  statuses: Record<string, KnownStatus>,
  vehicle: Vehicle,
  requestedAt: number
): Vehicle {
  const known = hasOwn(statuses, vehicle.id) ? statuses[vehicle.id] : undefined;
  return known && known.at > requestedAt
    ? { ...vehicle, status: known.status }
    : vehicle;
}

export interface VehicleStatusChange {
  id: string;
  status: string;
  /** Epoch ms of the event. Added automatically when missing. */
  at?: number;
}

const vehicleSlice = createSlice({
  name: "vehicles",
  initialState: initialVehicleState,
  reducers: {
    /** Nearby candidates for one emergency. `requestedAt` is when the request was sent. */
    nearbyVehiclesReceived: {
      reducer(
        state,
        action: PayloadAction<{
          emergencyId: string;
          vehicles: Vehicle[];
          requestedAt: number;
        }>
      ) {
        const { emergencyId, vehicles, requestedAt } = action.payload;
        if (!VALID_ID.test(emergencyId)) return;

        state.nearby[emergencyId] = vehicles
          .filter(isUsable)
          .map((v) => applyKnownStatus(state.statuses, v, requestedAt));

        state.nearbyOrder = [
          ...state.nearbyOrder.filter((id) => id !== emergencyId),
          emergencyId,
        ];
        while (state.nearbyOrder.length > NEARBY_LIMIT) {
          const oldest = state.nearbyOrder.shift();
          if (oldest !== undefined) delete state.nearby[oldest];
        }
      },
      prepare(
        emergencyId: string,
        vehicles: Vehicle[],
        requestedAt: number = Date.now()
      ) {
        return { payload: { emergencyId, vehicles, requestedAt } };
      },
    },

    nearbyCleared(state, action: PayloadAction<string>) {
      if (!hasOwn(state.nearby, action.payload)) return;
      delete state.nearby[action.payload];
      state.nearbyOrder = state.nearbyOrder.filter((id) => id !== action.payload);
    },

    /** The driver's own vehicle, or null when none is assigned */
    myVehicleReceived: {
      reducer(
        state,
        action: PayloadAction<{ vehicle: Vehicle | null; requestedAt: number }>
      ) {
        const { vehicle, requestedAt } = action.payload;

        state.myVehicle =
          vehicle && isUsable(vehicle)
            ? applyKnownStatus(state.statuses, vehicle, requestedAt)
            : null;
      },
      prepare(vehicle: Vehicle | null, requestedAt: number = Date.now()) {
        return { payload: { vehicle, requestedAt } };
      },
    },

    /**
     * A vehicle's status changed (dispatched, en route, off duty...). Applied
     * to every list that holds the vehicle, so a vehicle taken by another
     * dispatcher stops showing as available everywhere at once.
     */
    vehicleStatusChanged: {
      reducer(state, action: PayloadAction<VehicleStatusChange & { at: number }>) {
        const { id, status, at } = action.payload;
        if (typeof id !== "string" || !VALID_ID.test(id)) return;

        const known = hasOwn(state.statuses, id) ? state.statuses[id] : undefined;
        if (known && at < known.at) return;

        state.statuses[id] = { status, at };

        Object.values(state.nearby).forEach((list) => {
          list.forEach((v) => {
            if (v.id === id) v.status = status;
          });
        });

        if (state.myVehicle && state.myVehicle.id === id) {
          state.myVehicle.status = status;
        }
      },
      prepare(change: VehicleStatusChange) {
        return { payload: { ...change, at: change.at ?? Date.now() } };
      },
    },

    vehiclesCleared() {
      return initialVehicleState;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialVehicleState);
  },
});

export const {
  nearbyVehiclesReceived,
  nearbyCleared,
  myVehicleReceived,
  vehicleStatusChanged,
  vehiclesCleared,
} = vehicleSlice.actions;

export const VEHICLE_STATE_KEY = vehicleSlice.name;

export default vehicleSlice.reducer;

/* ---------- Selectors ---------- */

const EMPTY_VEHICLES: Vehicle[] = [];

/** The stored array itself, so it is stable between renders */
export const selectNearbyVehicles = (
  s: VehicleState,
  emergencyId: string | null | undefined
): Vehicle[] =>
  emergencyId && hasOwn(s.nearby, emergencyId)
    ? s.nearby[emergencyId]
    : EMPTY_VEHICLES;

export const selectMyVehicle = (s: VehicleState): Vehicle | null => s.myVehicle;

/** On duty means assigned a vehicle that is not offline */
export const selectIsOnDuty = (s: VehicleState): boolean =>
  s.myVehicle !== null && s.myVehicle.status !== "offline";