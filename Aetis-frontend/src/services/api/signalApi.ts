import type { SignalStatus, TrafficSignal } from "../../types/signal.types";
import {
  USE_MOCK_API,
  badResponse,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  parseLatLng,
  pathSegment,
  str,
  toEpochMs,
} from "./axiosClient";

function deriveSignalStatus(r: Record<string, unknown>): SignalStatus {
  const rawStatus = str(r.status).trim().toLowerCase();
  if (
    rawStatus === "normal" ||
    rawStatus === "priority" ||
    rawStatus === "pending" ||
    rawStatus === "fault"
  ) {
    return rawStatus;
  }
  if (r.is_preempted === true) return "priority";
  const phase = str(r.current_phase).trim().toUpperCase();
  if (phase === "FAULT") return "fault";
  return "normal";
}

export function normalizeSignal(raw: unknown): TrafficSignal {
  const r = expectRecord(raw, "signal");
  const id = idOf(r.id);
  const status = deriveSignalStatus(r);
  if (!id) badResponse("signal");

  const lat = finiteNumber(r.latitude);
  const lng = finiteNumber(r.longitude);
  const location =
    parseLatLng(r.location) ??
    (lat !== undefined && lng !== undefined
      ? { lat, lng }
      : { lat: Number.NaN, lng: Number.NaN });

  return {
    ...(r as unknown as TrafficSignal),
    id,
    name: str(r.name).trim() || id,
    status,
    location,
    expectedArrivalAt: toEpochMs(r.expectedArrivalAt ?? r.preemption_end_time),
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
    const path = USE_MOCK_API
      ? `/emergencies/${pathSegment(emergencyId)}/signals`
      : `/signals/corridor/${pathSegment(emergencyId)}`;
    const data = await http.get<unknown>(path);
    return expectArray(data, "signal list").map(normalizeSignal);
  },
};