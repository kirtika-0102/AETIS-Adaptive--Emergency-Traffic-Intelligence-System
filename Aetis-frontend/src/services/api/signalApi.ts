import type { TrafficSignal } from "../../types/signal.types";
import {
  badResponse,
  expectArray,
  expectRecord,
  http,
  idOf,
  parseLatLng,
  pathSegment,
  str,
  toEpochMs,
} from "./axiosClient";

export function normalizeSignal(raw: unknown): TrafficSignal {
  const r = expectRecord(raw, "signal");
  const id = idOf(r.id);
  const status = str(r.status);
  // No status means we cannot say whether a signal is safe, so it is an error
  if (!id || !status) badResponse("signal");

  return {
    ...(r as unknown as TrafficSignal),
    id,
    name: str(r.name).trim() || id,
    status: status as TrafficSignal["status"],
    location: parseLatLng(r.location) ?? { lat: Number.NaN, lng: Number.NaN },
    // Epoch milliseconds. ISO strings are converted.
    expectedArrivalAt: toEpochMs(r.expectedArrivalAt),
  };
}

export const signalApi = {
  /** Every signal, with its current status */
  async getSignals(): Promise<TrafficSignal[]> {
    const data = await http.get<unknown>("/signals");
    return expectArray(data, "signal list").map(normalizeSignal);
  },

  /** Signals on one emergency's route, in the order the vehicle reaches them */
  async getSignalsForEmergency(emergencyId: string): Promise<TrafficSignal[]> {
    const data = await http.get<unknown>(
      `/emergencies/${pathSegment(emergencyId)}/signals`
    );
    return expectArray(data, "signal list").map(normalizeSignal);
  },
};