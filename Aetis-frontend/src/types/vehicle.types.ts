import type { LatLng } from "./route.types";

export type VehicleType = "ambulance" | "fire" | "police";

/**
 * A vehicle as dispatchers and drivers see it.
 *
 * `status` is a plain string so an unexpected backend value cannot break the
 * interface. The expected values are available, dispatched, en_route, arrived
 * and offline. Do not use the VehicleStatus type from styles/theme.ts for
 * this: its key for "en route" is camelCase.
 */
export interface Vehicle {
  id: string;
  label: string;
  type: VehicleType;
  /** NaN coordinates when the vehicle has not reported a position yet */
  location: LatLng;
  /** Seconds to the emergency being dispatched to. NaN when unknown. */
  etaSeconds: number;
  status: string;
}

/** A row on the admin Vehicles page */
export interface AdminVehicleRow {
  id: string;
  label: string;
  type: VehicleType;
  registrationNumber: string;
  homeBase: string;
  /** Same values as Vehicle.status */
  status: string;
  retired: boolean;
  driver: { id: string; name: string } | null;
}

/** A driver who can be assigned to a vehicle */
export interface AdminDriverOption {
  id: string;
  name: string;
}

export interface CreateVehiclePayload {
  label: string;
  type: VehicleType;
  registrationNumber: string;
  homeBase: string;
}