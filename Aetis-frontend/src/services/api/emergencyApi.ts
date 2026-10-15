import type { PaginatedResponse } from "../../types/api.types";
import type {
  CompleteEmergencyPayload,
  CreateEmergencyPayload,
  DispatcherSummary,
  Emergency,
  EmergencyFilters,
} from "../../types/emergency.types";
import {
  ApiError,
  badResponse,
  clampInt,
  expectPage,
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

/**
 * Unknown types are rejected because the emergency cards have no fallback
 * for them. Severity and status do have fallbacks, so they pass through.
 */
const EMERGENCY_TYPES: readonly string[] = ["medical", "police", "fire"];

export function normalizeEmergency(raw: unknown): Emergency {
  const r = expectRecord(raw, "emergency");

  const id = idOf(r.id);
  const type = str(r.type);
  const status = str(r.status);
  const severity = str(r.severity);
  const createdAt = str(r.createdAt);
  const loc = isRecord(r.location) ? r.location : null;

  if (!id || !EMERGENCY_TYPES.includes(type) || !status || !severity || !createdAt || !loc) {
    badResponse("emergency");
  }

  const point = parseLatLng(loc);

  return {
    ...(r as unknown as Emergency),
    id,
    type: type as Emergency["type"],
    status: status as Emergency["status"],
    severity: severity as Emergency["severity"],
    createdAt,
    callerName: str(r.callerName),
    callerPhone: str(r.callerPhone),
    description: str(r.description).trim() || undefined,
    // Missing or invalid coordinates become NaN; the map skips such points
    location: {
      address: str(loc.address),
      lat: point?.lat ?? Number.NaN,
      lng: point?.lng ?? Number.NaN,
    },
    responseSeconds: finiteNumber(r.responseSeconds),
  };
}

const DRIVER_STATUSES = ["en_route", "arrived"] as const;
type DriverStatus = (typeof DRIVER_STATUSES)[number];

const MAX_NOTES = 500;

export const emergencyApi = {
  /** status "active" means pending, dispatched or en route */
  async getEmergencies(
    filters: EmergencyFilters = {}
  ): Promise<PaginatedResponse<Emergency>> {
    const params: Record<string, string | number> = {
      page: clampInt(filters.page, 1, 10_000, 1),
      pageSize: clampInt(filters.pageSize, 1, 100, 10),
    };

    const search = filters.search?.trim();
    if (search) params.search = search.slice(0, 100);
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;

    const data = await http.get<unknown>("/emergencies", { params });
    return expectPage(data, "emergency list", normalizeEmergency);
  },

  async getEmergencyById(id: string): Promise<Emergency> {
    const data = await http.get<unknown>(`/emergencies/${pathSegment(id)}`);
    return normalizeEmergency(data);
  },

  async createEmergency(payload: CreateEmergencyPayload): Promise<Emergency> {
    const data = await http.post<unknown>("/emergencies", payload);
    return normalizeEmergency(data);
  },

  async getDispatcherSummary(): Promise<DispatcherSummary> {
    const data = await http.get<unknown>("/dispatcher/summary");
    const r = expectRecord(data, "summary");

    const activeCount = finiteNumber(r.activeCount);
    const signalsClearedToday = finiteNumber(r.signalsClearedToday);
    if (activeCount === undefined || signalsClearedToday === undefined) {
      badResponse("summary");
    }

    return {
      activeCount,
      signalsClearedToday,
      // null when nothing has been completed yet; formatDuration shows "-" for NaN
      avgResponseSeconds: finiteNumber(r.avgResponseSeconds) ?? Number.NaN,
    };
  },

  /** The driver's current job, or null when there is none */
  async getDriverAssignment(): Promise<Emergency | null> {
    const data = await nullIfNotFound(http.get<unknown>("/driver/assignment"));
    if (data == null || data === "") return null;
    return normalizeEmergency(data);
  },

  async updateStatus(id: string, status: DriverStatus): Promise<void> {
    if (!DRIVER_STATUSES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    await http.patch(`/emergencies/${pathSegment(id)}/status`, { status });
  },

  async completeEmergency(
    id: string,
    payload: CompleteEmergencyPayload
  ): Promise<void> {
    await http.post(`/emergencies/${pathSegment(id)}/complete`, {
      outcome: payload.outcome,
      notes: payload.notes?.trim().slice(0, MAX_NOTES) || undefined,
      handoverConfirmed: payload.handoverConfirmed,
    });
  },
};