import type { VehicleType } from "../../types/vehicle.types";
import { createRng, hashString } from "./mockTracking";

export type MockCameraStatus = "online" | "degraded" | "offline";
export type MockDirection = "north" | "south" | "east" | "west";

export interface MockCamera {
  id: string;
  name: string;
  signalId: string;
  direction: MockDirection;
  status: MockCameraStatus;
  detectionEnabled: boolean;
  lastDetectionAt: number | null;
}

export interface MockDetection {
  id: string;
  cameraId: string;
  cameraName: string;
  signalId: string;
  signalName: string;
  vehicleType: VehicleType;
  /** 0 to 1 */
  confidence: number;
  detectedAt: number;
  /** Null when it was not matched to an active emergency */
  emergencyId: string | null;
}

/** [id, signal, direction, name, status] */
const CAMERAS: ReadonlyArray<
  readonly [string, string, MockDirection, string, MockCameraStatus]
> = [
  ["CAM-101", "S-101", "east", "Kaushambi, east approach", "online"],
  ["CAM-102", "S-101", "west", "Kaushambi, west approach", "online"],
  ["CAM-103", "S-102", "east", "Vaishali, east approach", "online"],
  ["CAM-104", "S-102", "west", "Vaishali, west approach", "online"],
  ["CAM-105", "S-103", "north", "Vasundhara Chowk, north", "online"],
  ["CAM-106", "S-104", "east", "Shakti Khand, east approach", "online"],
  ["CAM-107", "S-104", "south", "Shakti Khand, south approach", "degraded"],
  ["CAM-108", "S-105", "north", "Sahibabad, north approach", "online"],
  ["CAM-109", "S-106", "west", "Mohan Nagar, west approach", "online"],
  ["CAM-110", "S-107", "east", "NH-9 Link, east approach", "offline"],
  ["CAM-111", "S-108", "south", "ISBT, south approach", "online"],
  ["CAM-112", "S-109", "east", "Kavi Nagar, east approach", "online"],
  ["CAM-113", "S-110", "north", "Raj Nagar, north approach", "online"],
  ["CAM-114", "S-111", "west", "Crossings Link, west", "online"],
];

export function seedCameras(): MockCamera[] {
  return CAMERAS.map(([id, signalId, direction, name, status]) => ({
    id,
    name,
    signalId,
    direction,
    status,
    detectionEnabled: true,
    lastDetectionAt: null,
  }));
}

const VEHICLE_TYPES: VehicleType[] = ["ambulance", "fire", "police"];

/**
 * Past detections, spread over the last few hours. A third of them are
 * deliberately unmatched, which the detection feed shows differently.
 */
export function seedDetections(
  now: number,
  cameras: MockCamera[],
  signals: Array<{ id: string; name: string }>,
  emergencyIds: string[]
): MockDetection[] {
  const rng = createRng(hashString("mock-detections"));
  const pool = cameras.filter((c) => c.status !== "offline");
  const signalName = new Map(signals.map((s) => [s.id, s.name]));

  const out: MockDetection[] = [];

  for (let i = 0; i < 14; i++) {
    const camera = pool[Math.floor(rng() * pool.length)];
    const matched = i % 3 !== 2 && emergencyIds.length > 0;

    out.push({
      id: `DET-${String(i + 1).padStart(4, "0")}`,
      cameraId: camera.id,
      cameraName: camera.name,
      signalId: camera.signalId,
      signalName: signalName.get(camera.signalId) ?? camera.signalId,
      vehicleType: VEHICLE_TYPES[i % VEHICLE_TYPES.length],
      confidence: Math.round((0.82 + rng() * 0.17) * 1000) / 1000,
      detectedAt: now - (12 + i * 11) * 60_000 - Math.floor(rng() * 40_000),
      emergencyId: matched ? emergencyIds[i % emergencyIds.length] : null,
    });
  }

  return out;
}

/** Sets each camera's last detection from the detections list */
export function syncLastDetections(
  cameras: MockCamera[],
  detections: MockDetection[]
): void {
  for (const camera of cameras) {
    const times = detections
      .filter((d) => d.cameraId === camera.id)
      .map((d) => d.detectedAt);
    camera.lastDetectionAt = times.length > 0 ? Math.max(...times) : null;
  }
}