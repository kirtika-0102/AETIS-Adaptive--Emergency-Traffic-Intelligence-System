import type { Emergency } from "../../types/emergency.types";
import type { IncomingAlert, PatientInfo } from "../../types/hospital.types";
import { emergencyApi, normalizeEmergency } from "./emergencyApi";
import {
  USE_MOCK_API,
  badResponse,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  isRecord,
  pathSegment,
  str,
} from "./axiosClient";

export interface HospitalFacility {
  id: string;
  name: string;
  address: string;
  availableBeds: number;
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];

function normalizePatient(raw: unknown): PatientInfo {
  const r = isRecord(raw) ? raw : {};

  const vitals = Array.isArray(r.vitals)
    ? r.vitals.flatMap((v) =>
        isRecord(v) && typeof v.label === "string" && typeof v.value === "string"
          ? [{ label: v.label, value: v.value }]
          : []
      )
    : undefined;

  return {
    name: str(r.name).trim() || undefined,
    age: finiteNumber(r.age),
    gender: str(r.gender).trim() || undefined,
    condition: str(r.condition),
    vitals: vitals && vitals.length > 0 ? vitals : undefined,
    notes: str(r.notes).trim() || undefined,
    requiredResources: strings(r.requiredResources),
  };
}

function normalizeSeverity(raw: string): Emergency["severity"] {
  const s = raw.trim().toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  return "high";
}

function normalizeAlert(raw: unknown, emergencyMap?: Map<string, Emergency>): IncomingAlert {
  const r = expectRecord(raw, "alert");

  if (isRecord(r.emergency)) {
    const emergency = normalizeEmergency(r.emergency);
    const receivedAt = str(r.receivedAt);
    if (!receivedAt) badResponse("alert");

    return {
      emergencyId: idOf(r.emergencyId) || emergency.id,
      emergency,
      vehicleLabel: str(r.vehicleLabel),
      vehicleType: (str(r.vehicleType) || "ambulance") as IncomingAlert["vehicleType"],
      etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
      acknowledged: r.acknowledged === true,
      acknowledgedAt: str(r.acknowledgedAt) || undefined,
      receivedAt,
      patient: normalizePatient(r.patient),
    };
  }

  // Canonical backend HospitalAlertResponse shape
  const emergencyId = idOf(r.emergency_id);
  if (!emergencyId) badResponse("alert");
  const matched = emergencyMap?.get(emergencyId);

  const etaAt = str(r.estimated_arrival);
  const etaMins = finiteNumber(r.estimated_arrival_minutes);
  const etaSeconds =
    etaAt && Number.isFinite(Date.parse(etaAt))
      ? Math.max(0, Math.round((Date.parse(etaAt) - Date.now()) / 1000))
      : etaMins !== undefined
        ? Math.max(0, Math.round(etaMins * 60))
        : Number.NaN;

  const fallbackEmergency: Emergency = matched ?? {
    id: emergencyId,
    type: "medical",
    severity: normalizeSeverity(str(r.severity)),
    status: "dispatched",
    callerName: str(r.emergency_title) || "Dispatch",
    callerPhone: "",
    description: str(r.patient_notes).trim() || undefined,
    location: { address: str(r.emergency_title) || emergencyId, lat: Number.NaN, lng: Number.NaN },
    createdAt: str(r.acknowledged_at) || new Date().toISOString(),
  };

  return {
    emergencyId,
    emergency: fallbackEmergency,
    vehicleLabel: fallbackEmergency.assignedVehicleId ?? "Assigned unit",
    vehicleType:
      fallbackEmergency.type === "fire"
        ? "fire"
        : fallbackEmergency.type === "police"
          ? "police"
          : "ambulance",
    etaSeconds,
    acknowledged: r.acknowledged === true,
    acknowledgedAt: str(r.acknowledged_at) || undefined,
    receivedAt: fallbackEmergency.createdAt,
    patient: normalizePatient({
      condition: str(r.patient_condition) || str(r.emergency_title) || "Inbound emergency",
      notes: str(r.patient_notes) || str(r.notes),
      requiredResources: [],
    }),
  };
}

export const hospitalApi = {
  async getHospitals(): Promise<HospitalFacility[]> {
    if (USE_MOCK_API) {
      return [
        { id: "HOSP-CITY", name: "City General Hospital", address: "Central Sector", availableBeds: 12 },
        { id: "HOSP-RIVER", name: "Riverside Hospital", address: "Riverfront Rd", availableBeds: 8 },
      ];
    }
    const data = await http.get<unknown>("/hospitals");
    return expectArray(data, "hospital list").map((item) => {
      const r = expectRecord(item, "hospital");
      return {
        id: idOf(r.id),
        name: str(r.name) || idOf(r.id),
        address: str(r.address),
        availableBeds: finiteNumber(r.available_beds) ?? 0,
      };
    });
  },

  async getIncomingAlerts(): Promise<IncomingAlert[]> {
    if (USE_MOCK_API) {
      const data = await http.get<unknown>("/destination/alerts");
      return expectArray(data, "alert list").map((a) => normalizeAlert(a));
    }

    const [alertsRaw, emergenciesPage] = await Promise.all([
      http.get<unknown>("/hospitals/inbound-alerts"),
      emergencyApi.getEmergencies({ status: "active", page: 1, pageSize: 100 }),
    ]);
    const emergencyMap = new Map(emergenciesPage.data.map((e) => [e.id, e]));
    return expectArray(alertsRaw, "alert list").map((a) => normalizeAlert(a, emergencyMap));
  },

  async getAlertById(emergencyId: string): Promise<IncomingAlert> {
    if (USE_MOCK_API) {
      const data = await http.get<unknown>(
        `/destination/alerts/${pathSegment(emergencyId)}`
      );
      return normalizeAlert(data);
    }

    const [alertRaw, emergency] = await Promise.all([
      http.get<unknown>(`/hospitals/inbound-alerts/${pathSegment(emergencyId)}`),
      emergencyApi.getEmergencyById(emergencyId),
    ]);
    return normalizeAlert(alertRaw, new Map([[emergency.id, emergency]]));
  },

  async acknowledge(emergencyId: string): Promise<void> {
    if (USE_MOCK_API) {
      await http.post(`/destination/alerts/${pathSegment(emergencyId)}/acknowledge`);
      return;
    }
    await http.post(`/hospitals/alerts/${pathSegment(emergencyId)}/acknowledge`, {
      trauma_bay_assigned: "ER-BAY-1",
    });
  },
};