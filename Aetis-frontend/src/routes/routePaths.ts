import type { UserRole } from "../types/user.types";

/**
 * Single source of truth for every URL in AETIS.
 * Never hardcode a path string in a component; import from here.
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  UNAUTHORIZED: "/unauthorized",

  DISPATCHER: {
    DASHBOARD: "/dispatcher/dashboard",
    CREATE_EMERGENCY: "/dispatcher/emergency/new",
    DISPATCH_VEHICLE: "/dispatcher/emergency/:emergencyId/dispatch",
    TRAFFIC_SIGNALS: "/dispatcher/signals",
    HISTORY: "/dispatcher/history",
  },

  /** Live tracking is visible to all authenticated roles */
  TRACKING: {
    ROOT: "/tracking",
    DETAIL: "/tracking/:emergencyId",
  },

  DRIVER: {
    HOME: "/driver/home",
    NAVIGATION: "/driver/navigation/:emergencyId",
    COMPLETE: "/driver/complete/:emergencyId",
  },

  /** Used by hospital, police and fire destinations */
  HOSPITAL: {
    DASHBOARD: "/hospital/dashboard",
    EMERGENCY_DETAIL: "/hospital/emergency/:emergencyId",
  },

  ADMIN: {
    DASHBOARD: "/admin/dashboard",
    USERS: "/admin/users",
    VEHICLES: "/admin/vehicles",
    SIGNALS: "/admin/signals",
    CAMERAS: "/admin/cameras",
    ANALYTICS: "/admin/analytics",
  },
} as const;

/* ---------- Dynamic path builders ---------- */

export const buildDispatchPath = (emergencyId: string) =>
  `/dispatcher/emergency/${encodeURIComponent(emergencyId)}/dispatch`;

export const buildTrackingPath = (emergencyId?: string) =>
  emergencyId
    ? `/tracking/${encodeURIComponent(emergencyId)}`
    : ROUTES.TRACKING.ROOT;

export const buildDriverNavigationPath = (emergencyId: string) =>
  `/driver/navigation/${encodeURIComponent(emergencyId)}`;

export const buildDriverCompletePath = (emergencyId: string) =>
  `/driver/complete/${encodeURIComponent(emergencyId)}`;

export const buildHospitalEmergencyPath = (emergencyId: string) =>
  `/hospital/emergency/${encodeURIComponent(emergencyId)}`;

/* ---------- Role groups for access control ---------- */

export const DESTINATION_ROLES: readonly UserRole[] = [
  "hospital",
  "police",
  "fire",
];

export const ALL_ROLES: readonly UserRole[] = [
  "dispatcher",
  "driver",
  "hospital",
  "police",
  "fire",
  "admin",
];

/** Where each role lands after login */
export const ROLE_HOME: Record<UserRole, string> = {
  dispatcher: ROUTES.DISPATCHER.DASHBOARD,
  driver: ROUTES.DRIVER.HOME,
  hospital: ROUTES.HOSPITAL.DASHBOARD,
  police: ROUTES.HOSPITAL.DASHBOARD,
  fire: ROUTES.HOSPITAL.DASHBOARD,
  admin: ROUTES.ADMIN.DASHBOARD,
};

export const getHomeRouteForRole = (role: UserRole): string =>
  ROLE_HOME[role] ?? ROUTES.HOME;