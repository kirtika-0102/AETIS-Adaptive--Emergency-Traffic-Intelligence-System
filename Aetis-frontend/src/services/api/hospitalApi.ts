import type { IncomingAlert, PatientInfo } from "../../types/hospital.types";
import { normalizeEmergency } from "./emergencyApi";
import {
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

const strings = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];

/** Police and fire alerts may carry no patient at all */
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

function normalizeAlert(raw: unknown): IncomingAlert {
  const r = expectRecord(raw, "alert");
  const emergency = normalizeEmergency(r.emergency);
  const receivedAt = str(r.receivedAt);
  if (!receivedAt) badResponse("alert");

  return {
    emergencyId: idOf(r.emergencyId) || emergency.id,
    emergency,
    vehicleLabel: str(r.vehicleLabel),
    vehicleType: str(r.vehicleType) as IncomingAlert["vehicleType"],
    etaSeconds: finiteNumber(r.etaSeconds) ?? Number.NaN,
    acknowledged: r.acknowledged === true,
    acknowledgedAt: str(r.acknowledgedAt) || undefined,
    receivedAt,
    patient: normalizePatient(r.patient),
  };
}

/**
 * The server works out the destination from the signed-in user, so the
 * browser never says which hospital or station it is asking for.
 */
export const hospitalApi = {
  async getIncomingAlerts(): Promise<IncomingAlert[]> {
    const data = await http.get<unknown>("/destination/alerts");
    return expectArray(data, "alert list").map(normalizeAlert);
  },

  async getAlertById(emergencyId: string): Promise<IncomingAlert> {
    const data = await http.get<unknown>(
      `/destination/alerts/${pathSegment(emergencyId)}`
    );
    return normalizeAlert(data);
  },

  async acknowledge(emergencyId: string): Promise<void> {
    await http.post(`/destination/alerts/${pathSegment(emergencyId)}/acknowledge`);
  },
};