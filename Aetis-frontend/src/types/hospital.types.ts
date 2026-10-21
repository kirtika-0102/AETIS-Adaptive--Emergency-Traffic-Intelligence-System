import type { Emergency } from "./emergency.types";
import type { VehicleType } from "./vehicle.types";

export interface PatientVital {
  label: string;
  value: string;
}

/** What a hospital, police station or fire station is told about the case */
export interface PatientInfo {
  name?: string;
  age?: number;
  gender?: string;
  /** For police and fire alerts this carries the situation summary */
  condition: string;
  vitals?: PatientVital[];
  notes?: string;
  requiredResources: string[];
}

export interface IncomingAlert {
  emergencyId: string;
  /** The caller's name and phone are left out for destinations */
  emergency: Emergency;
  vehicleLabel: string;
  vehicleType: VehicleType;
  /** Seconds until arrival. NaN when unknown, 0 or less when arriving. */
  etaSeconds: number;
  acknowledged: boolean;
  /** ISO date-time */
  acknowledgedAt?: string;
  /** ISO date-time */
  receivedAt: string;
  patient: PatientInfo;
}