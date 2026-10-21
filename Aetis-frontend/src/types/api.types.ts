/** Every paged list from the server has this shape */
export interface PaginatedResponse<T> {
  data: T[];
  /** Total matching rows across all pages. Required. */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The body of every error response. `code` is a stable value such as
 * INVALID_CREDENTIALS or VEHICLE_UNAVAILABLE. `message` is shown to people
 * only for client errors (4xx); a 5xx message is never displayed.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  /** Field-level problems, keyed by field name */
  details?: unknown;
}

/* ---------- Admin overview ---------- */

export type ServiceHealthStatus = "operational" | "degraded" | "down";

export interface ServiceHealth {
  name: string;
  status: ServiceHealthStatus;
}

export interface AdminOverview {
  emergenciesToday: number;
  /** NaN when nothing has been completed yet */
  avgResponseSeconds: number;
  pendingVerifications: number;
  vehiclesOnline: number;
  vehiclesTotal: number;
  signalsOnline: number;
  signalsTotal: number;
  camerasOnline: number;
  camerasTotal: number;
  services: ServiceHealth[];
}

export interface AuditLogEntry {
  id: string;
  /** Who did it, as a name */
  actor: string;
  /** What they did, as a phrase that reads after the actor */
  action: string;
  /** What it was done to, if anything */
  target?: string;
  /** ISO date-time */
  timestamp: string;
}

/* ---------- Analytics ---------- */

export type AnalyticsRange = "7d" | "30d" | "90d";

export interface AnalyticsSummary {
  totalEmergencies: number;
  /** NaN when nothing has been completed in the period */
  avgResponseSeconds: number;
  signalsCleared: number;
  /** 0 to 100 */
  detectionAccuracyPct: number;
}

export interface ResponseTimePoint {
  label: string;
  /** NaN for a period with no data, which the chart draws as a gap */
  avgSeconds: number;
}

export interface SignalPerformancePoint {
  label: string;
  onTime: number;
  late: number;
}

export interface VehicleUsagePoint {
  label: string;
  dispatches: number;
}

export interface AnalyticsReport {
  summary: AnalyticsSummary;
  responseTimes: ResponseTimePoint[];
  signalPerformance: SignalPerformancePoint[];
  vehicleUsage: VehicleUsagePoint[];
}