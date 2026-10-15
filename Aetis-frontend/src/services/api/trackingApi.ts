import type { TrackedEV } from "../../types/tracking.types";
import {
  ApiError,
  badResponse,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  nullIfNotFound,
  parseLatLng,
  parseLatLngList,
  pathSegment,
  str,
} from "./axiosClient";

export interface LocationFix {
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number | null;
  /** Epoch ms on the driver's device. The server stamps its own receive time. */
  timestamp: number;
}

export function normalizeEV(raw: unknown): TrackedEV {
  const r = expectRecord(raw, "tracked vehicle");
  const emergencyId = idOf(r.emergencyId);
  const location = parseLatLng(r.location);
  if (!emergencyId || !location) badResponse("tracked vehicle");

  const vehicleId = idOf(r.vehicleId);

  return {
    ...(r as unknown as TrackedEV),
    emergencyId,
    vehicleId,
    vehicleLabel: str(r.vehicleLabel).trim() || vehicleId || emergencyId,
    vehicleType: str(r.vehicleType) as TrackedEV["vehicleType"],
    location,
    // NaN shows as "-" in the interface, instead of a misleading 0
    speedKmh: finiteNumber(r.speedKmh) ?? Number.NaN,
    etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
    destinationName: str(r.destinationName),
    route: parseLatLngList(r.route),
    lastUpdateAt: str(r.lastUpdateAt) || undefined,
  };
}

export const trackingApi = {
  /** The driver's phone reports its position */
  async sendLocation(emergencyId: string, fix: LocationFix): Promise<void> {
    const point = parseLatLng({ lat: fix.lat, lng: fix.lng });
    if (!point) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid location." });
    }

    const speed = finiteNumber(fix.speedKmh);

    await http.post(`/tracking/${pathSegment(emergencyId)}/location`, {
      lat: point.lat,
      lng: point.lng,
      speedKmh: speed !== undefined ? Math.max(0, speed) : 0,
      heading: finiteNumber(fix.heading) ?? null,
      timestamp: finiteNumber(fix.timestamp) ?? Date.now(),
    });
  },

  /** Every vehicle currently on a live trip */
  async getActiveEVs(): Promise<TrackedEV[]> {
    const data = await http.get<unknown>("/tracking/active");
    return expectArray(data, "vehicle list").map(normalizeEV);
  },

  /** One vehicle, or null if its trip is not live (for unknown ids seen on the socket) */
  async getEV(emergencyId: string): Promise<TrackedEV | null> {
    const data = await nullIfNotFound(
      http.get<unknown>(`/tracking/${pathSegment(emergencyId)}`)
    );
    if (data == null || data === "") return null;
    return normalizeEV(data);
  },
};