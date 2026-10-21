import type { LatLng } from "./route.types";
import type { VehicleType } from "./vehicle.types";

/** A vehicle on a live trip, keyed by the emergency it is serving */
export interface TrackedEV {
  emergencyId: string;
  vehicleId: string;
  vehicleLabel: string;
  vehicleType: VehicleType;
  location: LatLng;
  /** NaN when unknown */
  speedKmh: number;
  /** Seconds until the end of the route. NaN when unknown, 0 or less when arriving. */
  etaSeconds: number;
  destinationName: string;
  /** The rest of the route from the vehicle's position. Empty when not planned. */
  route: LatLng[];
  /**
   * ISO date-time of the last GPS fix, stamped by the server. The "no recent
   * update" warning depends on it, so treat it as required in practice.
   */
  lastUpdateAt?: string;
}