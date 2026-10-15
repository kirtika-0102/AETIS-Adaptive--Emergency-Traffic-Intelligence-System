import type { AnalyticsRange, AnalyticsReport } from "../../types/api.types";
import {
  ApiError,
  badResponse,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  isRecord,
  str,
} from "./axiosClient";

const RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d"];

function assertRange(range: AnalyticsRange) {
  if (!RANGES.includes(range)) {
    throw new ApiError({ code: "VALIDATION", message: "Invalid date range." });
  }
}

/** Rows that are not objects are dropped; the charts also handle bad numbers */
const records = (raw: unknown, what: string) =>
  expectArray(raw, what).filter(isRecord);

function normalizeReport(raw: unknown): AnalyticsReport {
  const r = expectRecord(raw, "report");
  const s = expectRecord(r.summary, "report summary");

  const totalEmergencies = finiteNumber(s.totalEmergencies);
  const signalsCleared = finiteNumber(s.signalsCleared);
  const detectionAccuracyPct = finiteNumber(s.detectionAccuracyPct);
  if (
    totalEmergencies === undefined ||
    signalsCleared === undefined ||
    detectionAccuracyPct === undefined
  ) {
    badResponse("report summary");
  }

  return {
    summary: {
      totalEmergencies,
      signalsCleared,
      detectionAccuracyPct,
      avgResponseSeconds: finiteNumber(s.avgResponseSeconds) ?? Number.NaN,
    },
    responseTimes: records(r.responseTimes, "report").map((p) => ({
      label: str(p.label),
      // NaN leaves a gap in the line, instead of a false zero
      avgSeconds: finiteNumber(p.avgSeconds) ?? Number.NaN,
    })),
    signalPerformance: records(r.signalPerformance, "report").map((p) => ({
      label: str(p.label),
      onTime: finiteNumber(p.onTime) ?? 0,
      late: finiteNumber(p.late) ?? 0,
    })),
    vehicleUsage: records(r.vehicleUsage, "report").map((p) => ({
      label: str(p.label),
      dispatches: finiteNumber(p.dispatches) ?? 0,
    })),
  };
}

export const analyticsApi = {
  async getReport(range: AnalyticsRange): Promise<AnalyticsReport> {
    assertRange(range);
    const data = await http.get<unknown>("/analytics/report", { params: { range } });
    return normalizeReport(data);
  },

  /** A CSV file, to be saved by the caller */
  async exportReport(range: AnalyticsRange): Promise<Blob> {
    assertRange(range);
    const data = await http.get<unknown>("/analytics/report/export", {
      params: { range, format: "csv" },
      responseType: "blob",
      timeout: 60_000,
    });

    if (!(data instanceof Blob)) badResponse("export");
    return data;
  },
};