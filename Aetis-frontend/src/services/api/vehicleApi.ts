import type { Vehicle, VehicleType } from "../../types/vehicle.types";
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
  pathSegment,
  str,
} from "./axiosClient";

export function normalizeVehicle(raw: unknown): Vehicle {
  const r = expectRecord(raw, "vehicle");
  const id = idOf(r.id);
  if (!id) badResponse("vehicle");

  return {
    ...(r as unknown as Vehicle),
    id,
    label: str(r.label).trim() || id,
    type: str(r.type) as VehicleType,
    // A vehicle that has not reported a position yet is listed but not drawn
    location: parseLatLng(r.location) ?? { lat: Number.NaN, lng: Number.NaN },
    etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
    // A missing status reads as offline, so it can never be dispatched by mistake
    status: str(r.status) || "offline",
  };
}

const SELF_STATUSES = ["available", "offline"] as const;
type SelfStatus = (typeof SELF_STATUSES)[number];

export const vehicleApi = {
  /** Candidate vehicles for one emergency, with ETAs to that emergency */
  async getNearbyVehicles(emergencyId: string): Promise<Vehicle[]> {
    const data = await http.get<unknown>(
      `/emergencies/${pathSegment(emergencyId)}/nearby-vehicles`
    );
    return expectArray(data, "vehicle list").map(normalizeVehicle);
  },

  /** The server decides whether the vehicle is still available */
  async dispatchVehicle(emergencyId: string, vehicleId: string): Promise<void> {
    await http.post(`/emergencies/${pathSegment(emergencyId)}/dispatch`, {
      vehicleId,
    });
  },

  /** The signed-in driver's vehicle, or null when none is assigned */
  async getMyVehicle(): Promise<Vehicle | null> {
    const data = await nullIfNotFound(http.get<unknown>("/driver/vehicle"));
    if (data == null || data === "") return null;
    return normalizeVehicle(data);
  },

  async setMyStatus(status: SelfStatus): Promise<void> {
    if (!SELF_STATUSES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    await http.patch("/driver/vehicle/status", { status });
  },
};