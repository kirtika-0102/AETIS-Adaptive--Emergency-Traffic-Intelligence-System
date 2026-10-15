import type { CameraDetection } from "../../types/camera.types";
import {
  badResponse,
  clampInt,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  str,
} from "./axiosClient";

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
    vehicleType: str(r.vehicleType) as CameraDetection["vehicleType"],
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
    const data = await http.get<unknown>("/cameras/detections", {
      params: { limit: clampInt(limit, 1, 200, 30) },
    });
    return expectArray(data, "detection list").map(normalizeDetection);
  },
};