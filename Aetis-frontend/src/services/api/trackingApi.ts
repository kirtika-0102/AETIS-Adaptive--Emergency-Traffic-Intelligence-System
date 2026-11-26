import type { TrackedEV } from "../../types/tracking.types";
import {
  ApiError,
  USE_MOCK_API,
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
  /** Vehicle identifier required by backend /tracking/update-location */
  vehicleId?: string;
}

export function normalizeEV(raw: unknown): TrackedEV {
  const r = expectRecord(raw, "tracked vehicle");
  const emergencyId = idOf(r.emergencyId) || idOf(r.emergency_id);
  const lat = finiteNumber(r.latitude);
  const lng = finiteNumber(r.longitude);
  const location =
    parseLatLng(r.location) ??
    (lat !== undefined && lng !== undefined ? { lat, lng } : null);
  if (!emergencyId || !location) badResponse("tracked vehicle");

  const vehicleId = idOf(r.vehicleId) || idOf(r.vehicle_id);

  return {
    ...(r as unknown as TrackedEV),
    emergencyId,
    vehicleId,
    vehicleLabel: str(r.vehicleLabel).trim() || vehicleId || emergencyId,
    vehicleType: (str(r.vehicleType).trim().toLowerCase() || "ambulance") as TrackedEV["vehicleType"],
    location,
    // NaN shows as "-" in the interface, instead of a misleading 0
    speedKmh: finiteNumber(r.speedKmh) ?? finiteNumber(r.speed) ?? Number.NaN,
    etaSeconds: finiteNumber(r.etaSeconds) ?? finiteNumber(r.eta_seconds) ?? Number.NaN,
    destinationName: str(r.destinationName) || str(r.destination_name),
    route: parseLatLngList(r.route),
    lastUpdateAt: str(r.lastUpdateAt) || str(r.last_update_at) || undefined,
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
    const speedKmh = speed !== undefined ? Math.max(0, speed) : 0;
    const rawTs = finiteNumber(fix.timestamp) ?? Date.now();

    if (USE_MOCK_API) {
      await http.post(`/tracking/${pathSegment(emergencyId)}/location`, {
        lat: point.lat,
        lng: point.lng,
        speedKmh,
        heading: finiteNumber(fix.heading) ?? null,
        timestamp: rawTs,
      });
      return;
    }

    if (!fix.vehicleId) {
      throw new ApiError({
        code: "VALIDATION",
        message: "Assigned vehicle ID is required to report GPS telemetry.",
      });
    }

    await http.post("/tracking/update-location", {
      vehicle_id: fix.vehicleId,
      emergency_id: emergencyId,
      latitude: point.lat,
      longitude: point.lng,
      speed: speedKmh,
      heading: finiteNumber(fix.heading) ?? 0,
      timestamp: rawTs > 1e12 ? rawTs / 1000 : rawTs,
    });
  },

  /** Every vehicle currently on a live trip */
  async getActiveEVs(): Promise<TrackedEV[]> {
    const data = await http.get<unknown>("/tracking/active");
    return expectArray(data, "vehicle list").map(normalizeEV);
  },

  /** One vehicle, or null if its trip is not live (for unknown ids seen on the socket) */
  async getEV(emergencyId: string): Promise<TrackedEV | null> {
    const path = USE_MOCK_API
      ? `/tracking/${pathSegment(emergencyId)}`
      : `/tracking/emergency/${pathSegment(emergencyId)}`;
    const data = await nullIfNotFound(http.get<unknown>(path));
    if (data == null || data === "") return null;
    return normalizeEV(data);
  },
};