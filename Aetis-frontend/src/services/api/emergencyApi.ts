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
  USE_MOCK_API,
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

const EMERGENCY_TYPES: readonly string[] = ["medical", "police", "fire"];

function normalizeStatus(raw: string): Emergency["status"] {
  const s = raw.trim().toLowerCase();
  if (s === "in_transit" || s === "en_route") return "en_route";
  if (s === "pending" || s === "dispatched" || s === "arrived" || s === "completed" || s === "cancelled") {
    return s;
  }
  return "pending";
}

function normalizeSeverity(raw: string): Emergency["severity"] {
  const s = raw.trim().toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  return "high";
}

export function normalizeEmergency(raw: unknown): Emergency {
  const r = expectRecord(raw, "emergency");

  const id = idOf(r.id);
  const rawType = str(r.type).trim().toLowerCase() || "medical";
  const type = EMERGENCY_TYPES.includes(rawType) ? rawType : "medical";
  const rawStatus = str(r.status);
  const rawSeverity = str(r.severity);
  const createdAt = str(r.createdAt) || str(r.created_at);

  const loc = isRecord(r.location)
    ? r.location
    : {
        address: str(r.pickup_address) || str(r.title),
        lat: r.pickup_latitude,
        lng: r.pickup_longitude,
      };

  if (!id || !rawStatus || !rawSeverity || !createdAt) {
    badResponse("emergency");
  }

  const point = parseLatLng(loc);
  const createdMs = Date.parse(createdAt);
  const completedStr = str(r.completed_at);
  const completedMs = completedStr ? Date.parse(completedStr) : Number.NaN;
  const computedResponseSec =
    Number.isFinite(createdMs) && Number.isFinite(completedMs) && completedMs >= createdMs
      ? Math.round((completedMs - createdMs) / 1000)
      : undefined;

  return {
    ...(r as unknown as Emergency),
    id,
    type: type as Emergency["type"],
    status: normalizeStatus(rawStatus),
    severity: normalizeSeverity(rawSeverity),
    createdAt,
    callerName: str(r.callerName) || str(r.title) || "Dispatch",
    callerPhone: str(r.callerPhone) || "",
    description: str(r.description).trim() || str(r.patient_notes).trim() || undefined,
    location: {
      address: str(loc.address),
      lat: point?.lat ?? Number.NaN,
      lng: point?.lng ?? Number.NaN,
    },
    responseSeconds: finiteNumber(r.responseSeconds) ?? computedResponseSec,
    assignedVehicleId: idOf(r.assignedVehicleId) || idOf(r.assigned_vehicle_id) || undefined,
    destinationHospitalId:
      idOf(r.destinationHospitalId) || idOf(r.destination_hospital_id) || undefined,
    journeyLeg: str(r.journey_leg) || str(r.journeyLeg) || undefined,
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
    const page = clampInt(filters.page, 1, 10_000, 1);
    const pageSize = clampInt(filters.pageSize, 1, 100, 10);
    const params: Record<string, string | number> = { page, pageSize };

    const search = filters.search?.trim();
    if (search) params.search = search.slice(0, 100);
    if (filters.type) params.type = filters.type;
    if (filters.status) {
      params.status =
        filters.status === "en_route"
          ? "IN_TRANSIT"
          : filters.status === "active"
            ? "active"
            : filters.status.toUpperCase();
    }

    const { data, headers } = await http.getWithHeaders<unknown>("/emergencies", { params });
    if (Array.isArray(data)) {
      const items = data.map(normalizeEmergency);
      const rawTotal = headers["x-total-count"] ?? headers["X-Total-Count"];
      const parsedTotal = rawTotal !== undefined ? Number(rawTotal) : items.length;
      return {
        data: items,
        total: Number.isFinite(parsedTotal) ? parsedTotal : items.length,
        page,
        pageSize,
      };
    }
    return expectPage(data, "emergency list", normalizeEmergency);
  },

  async getEmergencyById(id: string): Promise<Emergency> {
    const data = await http.get<unknown>(`/emergencies/${pathSegment(id)}`);
    return normalizeEmergency(data);
  },

  async createEmergency(payload: CreateEmergencyPayload): Promise<Emergency> {
    if (USE_MOCK_API) {
      const data = await http.post<unknown>("/emergencies", payload);
      return normalizeEmergency(data);
    }

    const noteParts = [
      payload.description?.trim(),
      payload.patient?.name ? `Patient: ${payload.patient.name.trim()}` : "",
      payload.patient?.condition ? `Condition: ${payload.patient.condition.trim()}` : "",
      payload.patient?.requiredResources?.length
        ? `Resources: ${payload.patient.requiredResources.join(", ")}`
        : "",
      `Caller: ${payload.callerName.trim()} (${payload.callerPhone.trim()})`,
    ].filter(Boolean);

    const backendPayload = {
      title: payload.patient?.condition
        ? `${payload.type.toUpperCase()} - ${payload.patient.condition.trim()}`
        : `${payload.type.toUpperCase()} Emergency - ${payload.location.address.trim()}`,
      type: payload.type,
      severity: payload.severity.toUpperCase(),
      pickup_latitude: payload.location.lat ?? 28.6692,
      pickup_longitude: payload.location.lng ?? 77.4538,
      pickup_address: payload.location.address.trim(),
      patient_notes: noteParts.join(" | ").slice(0, 1000) || undefined,
      destination_hospital_id: payload.destinationHospitalId || undefined,
    };

    const data = await http.post<unknown>("/emergencies", backendPayload);
    return normalizeEmergency(data);
  },

  async getDispatcherSummary(): Promise<DispatcherSummary> {
    if (USE_MOCK_API) {
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
        avgResponseSeconds: finiteNumber(r.avgResponseSeconds) ?? Number.NaN,
      };
    }

    const data = await http.get<unknown>("/analytics/kpis");
    const r = expectRecord(data, "summary");
    const activeCount = finiteNumber(r.active_emergencies) ?? 0;
    const signalsClearedToday = finiteNumber(r.total_signal_preemptions) ?? 0;
    const avgMinutes = finiteNumber(r.avg_response_time_minutes);

    return {
      activeCount,
      signalsClearedToday,
      avgResponseSeconds:
        avgMinutes !== undefined && avgMinutes > 0
          ? Math.round(avgMinutes * 60)
          : Number.NaN,
    };
  },

  /** The driver's current job, or null when there is none */
  async getDriverAssignment(): Promise<Emergency | null> {
    if (USE_MOCK_API) {
      const data = await nullIfNotFound(http.get<unknown>("/driver/assignment"));
      if (data == null || data === "") return null;
      return normalizeEmergency(data);
    }

    const page = await emergencyApi.getEmergencies({
      status: "active",
      page: 1,
      pageSize: 20,
    });
    return page.data[0] ?? null;
  },

  async updateStatus(id: string, status: DriverStatus): Promise<void> {
    if (!DRIVER_STATUSES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    const payload = USE_MOCK_API
      ? { status }
      : { status: status === "en_route" ? "IN_TRANSIT" : "ARRIVED" };
    await http.patch(`/emergencies/${pathSegment(id)}/status`, payload);
  },

  async completeEmergency(
    id: string,
    payload: CompleteEmergencyPayload
  ): Promise<void> {
    if (USE_MOCK_API) {
      await http.post(`/emergencies/${pathSegment(id)}/complete`, {
        outcome: payload.outcome,
        notes: payload.notes?.trim().slice(0, MAX_NOTES) || undefined,
        handoverConfirmed: payload.handoverConfirmed,
      });
      return;
    }

    const nextStatus = payload.outcome === "false_alarm" ? "CANCELLED" : "COMPLETED";
    const note = payload.notes?.trim().slice(0, MAX_NOTES);
    await http.patch(`/emergencies/${pathSegment(id)}/status`, {
      status: nextStatus,
      patient_notes: note ? `[${payload.outcome}] ${note}` : `[${payload.outcome}]`,
    });
  },
};