import type { LatLng } from "./route.types";

/**
 * Same values as the SignalStatus exported from styles/theme.ts. Keep the two
 * in step if one changes.
 */
export type SignalStatus = "normal" | "priority" | "pending" | "fault";

export interface TrafficSignal {
  id: string;
  name: string;
  status: SignalStatus;
  /** NaN coordinates when the signal's position is unknown */
  location: LatLng;
  /** Epoch milliseconds when a vehicle is due. Absent when none is expected. */
  expectedArrivalAt?: number;
}

/** A row on the admin Signals page */
export interface AdminSignalRow {
  id: string;
  name: string;
  controllerId: string;
  status: SignalStatus;
  enabled: boolean;
  cameraCount: number;
  /** ISO date-time. Null when the controller has never reported. */
  lastHeartbeatAt: string | null;
}

export interface CreateSignalPayload {
  name: string;
  controllerId: string;
  location: { lat: number; lng: number };
}