import type { SeverityLevel } from "../styles/theme";
import type { CameraDirection } from "../types/camera.types";
import type { EmergencyStatus, EmergencyType } from "../types/emergency.types";
import type { UserRole, UserStatus } from "../types/user.types";
import type { VehicleType } from "../types/vehicle.types";

/** The helpline number is part of the label, since that is how callers know the service */
export const EMERGENCY_TYPE_LABELS: Record<EmergencyType, string> = {
  medical: "Medical (108)",
  police: "Police (100)",
  fire: "Fire (101)",
};

/** Object key order is the order shown in the History page's status filter */
export const EMERGENCY_STATUS_LABELS: Record<EmergencyStatus, string> = {
  pending: "Pending",
  dispatched: "Dispatched",
  en_route: "En route",
  arrived: "Arrived",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  dispatcher: "Dispatcher",
  driver: "Driver",
  hospital: "Hospital",
  police: "Police",
  fire: "Fire",
  admin: "Administrator",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  ambulance: "Ambulance",
  fire: "Fire engine",
  police: "Police vehicle",
};

export const CAMERA_DIRECTION_LABELS: Record<CameraDirection, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};