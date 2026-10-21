import type { SeverityLevel } from "../styles/theme";

/** Which helpline was called: 108, 100 or 101 */
export type EmergencyType = "medical" | "police" | "fire";

export type EmergencyStatus =
  | "pending"
  | "dispatched"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled";

/** "active" is a filter value only: pending, dispatched or en route */
export type EmergencyStatusFilter = EmergencyStatus | "active";

export type PatientGender = "male" | "female" | "other";

export interface EmergencyLocation {
  address: string;
  /** NaN when the server sent no usable coordinates. Check before drawing. */
  lat: number;
  lng: number;
}

export interface Emergency {
  id: string;
  type: EmergencyType;
  severity: SeverityLevel;
  status: EmergencyStatus;
  callerName: string;
  callerPhone: string;
  description?: string;
  location: EmergencyLocation;
  /** ISO date-time */
  createdAt: string;
  /** Seconds from dispatch to arrival. Set once the vehicle has arrived. */
  responseSeconds?: number;
}

export interface CreateEmergencyPatient {
  name?: string;
  age?: number;
  gender?: PatientGender;
  condition: string;
  requiredResources: string[];
}

export interface CreateEmergencyPayload {
  type: EmergencyType;
  severity: SeverityLevel;
  callerName: string;
  callerPhone: string;
  /** Coordinates are optional here. When absent, the backend finds the address. */
  location: { address: string; lat?: number; lng?: number };
  description?: string;
  /** Medical emergencies only */
  patient?: CreateEmergencyPatient;
}

export interface EmergencyFilters {
  search?: string;
  type?: EmergencyType;
  status?: EmergencyStatusFilter;
  page?: number;
  pageSize?: number;
}

export interface DispatcherSummary {
  activeCount: number;
  /** NaN when no emergency has been completed yet */
  avgResponseSeconds: number;
  signalsClearedToday: number;
}

export type CompletionOutcome = "handed_over" | "no_patient" | "false_alarm";

export interface CompleteEmergencyPayload {
  outcome: CompletionOutcome;
  notes?: string;
  handoverConfirmed: boolean;
}