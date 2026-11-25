import type { Vehicle, VehicleType } from "../../types/vehicle.types";
import {
  ApiError,
  USE_MOCK_API,
  badResponse,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  isRecord,
  nullIfNotFound,
  parseLatLng,
  pathSegment,
  str,
} from "./axiosClient";

function normalizeVehicleType(raw: string): VehicleType {
  const v = raw.trim().toLowerCase();
  if (v === "fire" || v === "fire_truck") return "fire";
  if (v === "police") return "police";
  return "ambulance";
}

function normalizeVehicleStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "offline";
  if (s === "maintenance") return "offline";
  return s;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeVehicle(raw: unknown): Vehicle {
  const r = expectRecord(raw, "vehicle");
  const id = idOf(r.id);
  if (!id) badResponse("vehicle");

  const lat = finiteNumber(r.current_latitude);
  const lng = finiteNumber(r.current_longitude);
  const location =
    parseLatLng(r.location) ??
    (lat !== undefined && lng !== undefined
      ? { lat, lng }
      : { lat: Number.NaN, lng: Number.NaN });

  return {
    ...(r as unknown as Vehicle),
    id,
    label: str(r.label).trim() || str(r.call_sign).trim() || id,
    type: normalizeVehicleType(str(r.type)),
    location,
    etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
    status: normalizeVehicleStatus(str(r.status)),
  };
}

const SELF_STATUSES = ["available", "offline"] as const;
type SelfStatus = (typeof SELF_STATUSES)[number];

export const vehicleApi = {
  /** Candidate vehicles for one emergency, with straight-line ETAs */
  async getNearbyVehicles(emergencyId: string): Promise<Vehicle[]> {
    if (USE_MOCK_API) {
      const data = await http.get<unknown>(
        `/emergencies/${pathSegment(emergencyId)}/nearby-vehicles`
      );
      return expectArray(data, "vehicle list").map(normalizeVehicle);
    }

    const [rawVehicles, rawEmergency] = await Promise.all([
      http.get<unknown>("/vehicles"),
      http.get<unknown>(`/emergencies/${pathSegment(emergencyId)}`),
    ]);

    const emergencyRec = isRecord(rawEmergency) ? rawEmergency : {};
    const emgLat =
      finiteNumber(emergencyRec.pickup_latitude) ??
      (isRecord(emergencyRec.location) ? finiteNumber(emergencyRec.location.lat) : undefined);
    const emgLng =
      finiteNumber(emergencyRec.pickup_longitude) ??
      (isRecord(emergencyRec.location) ? finiteNumber(emergencyRec.location.lng) : undefined);

    const vehicles = expectArray(rawVehicles, "vehicle list").map(normalizeVehicle);
    return vehicles
      .map((v) => {
        if (
          emgLat !== undefined &&
          emgLng !== undefined &&
          Number.isFinite(v.location.lat) &&
          Number.isFinite(v.location.lng)
        ) {
          const distM = haversineMeters(v.location.lat, v.location.lng, emgLat, emgLng);
          return { ...v, etaSeconds: Math.max(30, Math.round(distM / 11.1)) };
        }
        return v;
      })
      .sort((a, b) => {
        const ae = Number.isFinite(a.etaSeconds) ? a.etaSeconds : Number.MAX_SAFE_INTEGER;
        const be = Number.isFinite(b.etaSeconds) ? b.etaSeconds : Number.MAX_SAFE_INTEGER;
        return ae - be;
      });
  },

  /** The server decides whether the vehicle is still available */
  async dispatchVehicle(emergencyId: string, vehicleId: string): Promise<void> {
    if (USE_MOCK_API) {
      await http.post(`/emergencies/${pathSegment(emergencyId)}/dispatch`, {
        vehicleId,
      });
      return;
    }

    await http.patch(`/vehicles/${pathSegment(vehicleId)}/assign`, {
      emergency_id: emergencyId,
    });
  },

  /** The signed-in driver's vehicle, or null when none is assigned */
  async getMyVehicle(): Promise<Vehicle | null> {
    if (USE_MOCK_API) {
      const data = await nullIfNotFound(http.get<unknown>("/driver/vehicle"));
      if (data == null || data === "") return null;
      return normalizeVehicle(data);
    }

    const [me, rawVehicles] = await Promise.all([
      http.get<unknown>("/auth/me", { skipAuthRedirect: true }),
      http.get<unknown>("/vehicles"),
    ]);
    const meId = isRecord(me) ? idOf(me.id) : "";
    if (!meId) return null;

    const list = expectArray(rawVehicles, "vehicle list");
    const match = list.find((item) => {
      if (!isRecord(item)) return false;
      const driverId = idOf(item.current_driver_id) || (isRecord(item.driver) ? idOf(item.driver.id) : "");
      return driverId === meId;
    });
    return match ? normalizeVehicle(match) : null;
  },

  async setMyStatus(status: SelfStatus): Promise<void> {
    if (!SELF_STATUSES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    if (USE_MOCK_API) {
      await http.patch("/driver/vehicle/status", { status });
      return;
    }

    const mine = await vehicleApi.getMyVehicle();
    if (!mine) {
      throw new ApiError({ code: "NOT_FOUND", message: "No vehicle assigned to your account." });
    }
    await http.patch(`/vehicles/${pathSegment(mine.id)}/status`, {
      status: status === "offline" ? "OFFLINE" : "AVAILABLE",
    });
  },
};