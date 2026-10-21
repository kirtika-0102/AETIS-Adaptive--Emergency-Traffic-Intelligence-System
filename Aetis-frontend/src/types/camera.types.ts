import type { VehicleType } from "./vehicle.types";

export type CameraDirection = "north" | "south" | "east" | "west";

export type CameraStatus = "online" | "degraded" | "offline";

/**
 * A row on the admin Cameras page. There is deliberately no stream address
 * here: it is sent when a camera is connected and never comes back.
 */
export interface AdminCameraRow {
  id: string;
  name: string;
  signalId: string;
  signalName: string;
  direction: CameraDirection;
  status: CameraStatus;
  detectionEnabled: boolean;
  /** ISO date-time. Null when nothing has been detected yet. */
  lastDetectionAt: string | null;
}

export interface CreateCameraPayload {
  name: string;
  signalId: string;
  direction: CameraDirection;
  /** rtsp://, rtsps://, http:// or https://. Write-only. */
  streamUrl: string;
}

/** An emergency vehicle spotted by a signal camera */
export interface CameraDetection {
  id: string;
  cameraId: string;
  cameraName: string;
  signalId: string;
  signalName: string;
  vehicleType: VehicleType;
  /** 0 to 1, so 0.94 and not 94. NaN when unknown. */
  confidence: number;
  /** ISO date-time */
  detectedAt: string;
  /** Null when the detection was not matched to an active emergency */
  emergencyId: string | null;
}