import type { RouteLeg, RoutePlan } from "../../types/route.types";
import {
  badResponse,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  isRecord,
  parseLatLngList,
  pathSegment,
  str,
} from "./axiosClient";

/**
 * Routes are planned by the backend (it holds the map provider's API key and
 * the signal data). The browser only reads the result. Points arrive as
 * { lat, lng } objects, or as GeoJSON-order [lng, lat] arrays.
 */
function normalizeLeg(raw: unknown): RouteLeg | null {
  if (!isRecord(raw)) return null;

  const points = parseLatLngList(raw.points);
  if (points.length < 2) return null;

  return {
    points,
    distanceMeters: finiteNumber(raw.distanceMeters) ?? Number.NaN,
    durationSeconds: finiteNumber(raw.durationSeconds) ?? Number.NaN,
  };
}

export function normalizeRoutePlan(raw: unknown): RoutePlan {
  const r = expectRecord(raw, "route");
  const emergencyId = idOf(r.emergencyId);
  if (!emergencyId) badResponse("route");

  return {
    emergencyId,
    // Null once the vehicle has reached the scene
    toScene: normalizeLeg(r.toScene),
    toDestination: normalizeLeg(r.toDestination),
    destinationName: str(r.destinationName).trim() || undefined,
    etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
    calculatedAt: str(r.calculatedAt) || undefined,
  };
}

export const routingApi = {
  async getRoutePlan(emergencyId: string): Promise<RoutePlan> {
    const data = await http.get<unknown>(
      `/emergencies/${pathSegment(emergencyId)}/route`
    );
    return normalizeRoutePlan(data);
  },

  /** For a blocked road or a changed destination */
  async recalculateRoute(emergencyId: string): Promise<RoutePlan> {
    const data = await http.post<unknown>(
      `/emergencies/${pathSegment(emergencyId)}/route/recalculate`
    );
    return normalizeRoutePlan(data);
  },
};