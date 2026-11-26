import type { CameraDetection } from "../../types/camera.types";
import {
  USE_MOCK_API,
  badResponse,
  clampInt,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  str,
} from "./axiosClient";

function normalizeDetectionVehicleType(raw: string): CameraDetection["vehicleType"] {
  const v = raw.trim().toLowerCase();
  if (v === "fire" || v === "fire_truck") return "fire";
  if (v === "police") return "police";
  return "ambulance";
}

function normalizeDetection(raw: unknown): CameraDetection {
  const r = expectRecord(raw, "detection");
  const id = idOf(r.id);
  const detectedAt = str(r.detectedAt);
  if (!id || !detectedAt) badResponse("detection");

  const cameraId = idOf(r.cameraId);
  const signalId = idOf(r.signalId);

  return {
    id,
    cameraId,
    cameraName: str(r.cameraName).trim() || cameraId,
    signalId,
    signalName: str(r.signalName).trim() || signalId,
    vehicleType: normalizeDetectionVehicleType(str(r.vehicleType)),
    // 0 to 1. The feed clamps and displays it as a percentage.
    confidence: finiteNumber(r.confidence) ?? Number.NaN,
    detectedAt,
    // Null when the detection was not matched to an active emergency
    emergencyId: idOf(r.emergencyId) || null,
  };
}

export const cameraApi = {
  /** Newest first */
  async getRecentDetections(limit = 30): Promise<CameraDetection[]> {
    const path = USE_MOCK_API ? "/cameras/detections" : "/detections/recent";
    const data = await http.get<unknown>(path, {
      params: { limit: clampInt(limit, 1, 200, 30) },
    });
    return expectArray(data, "detection list").map(normalizeDetection);
  },
};