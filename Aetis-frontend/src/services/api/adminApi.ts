import type {
  AdminOverview,
  AuditLogEntry,
  PaginatedResponse,
  ServiceHealthStatus,
} from "../../types/api.types";
import type { AdminCameraRow, CreateCameraPayload } from "../../types/camera.types";
import type { AdminSignalRow, CreateSignalPayload } from "../../types/signal.types";
import type {
  AdminUser,
  CreateUserPayload,
  UserRole,
  UserStatus,
} from "../../types/user.types";
import type {
  AdminDriverOption,
  AdminVehicleRow,
  CreateVehiclePayload,
} from "../../types/vehicle.types";
import {
  ApiError,
  badResponse,
  clampInt,
  expectArray,
  expectPage,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  isRecord,
  pathSegment,
  str,
} from "./axiosClient";

/* ---------- Row mapping ---------- */

/**
 * Admin rows are passed through as the server sent them, except that `id` must
 * be present and is always a string (the pages call string methods on it).
 */
const mapRow =
  <T extends { id: string }>(what: string) =>
  (item: unknown): T => {
    const r = expectRecord(item, what);
    const id = idOf(r.id);
    if (!id) badResponse(what);
    return { ...r, id } as unknown as T;
  };

const rows = <T extends { id: string }>(raw: unknown, what: string): T[] =>
  expectArray(raw, what).map(mapRow<T>(what));

/* ---------- Shapes owned by this file ---------- */

export interface AdminUserFilters {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
}

export interface VehicleChanges {
  /** null removes the current driver */
  driverId?: string | null;
  retired?: boolean;
}

export interface CameraTestResult {
  ok: boolean;
  message: string;
}

/** Must match the limits in ManageSignalsPage */
const BUFFER_MIN = 20;
const BUFFER_MAX = 180;

const USER_STATUS_CHANGES: readonly string[] = ["active", "suspended"];

const SERVICE_STATUSES: readonly string[] = ["operational", "degraded", "down"];

/** Cameras can take a while to answer a connection test */
const CAMERA_TEST_TIMEOUT_MS = 30_000;

function normalizeOverview(raw: unknown): AdminOverview {
  const r = expectRecord(raw, "overview");

  const emergenciesToday = finiteNumber(r.emergenciesToday);
  const pendingVerifications = finiteNumber(r.pendingVerifications);
  if (emergenciesToday === undefined || pendingVerifications === undefined) {
    badResponse("overview");
  }

  const services = Array.isArray(r.services)
    ? r.services.flatMap((s) =>
        isRecord(s) && str(s.name)
          ? [
              {
                name: str(s.name),
                status: (SERVICE_STATUSES.includes(str(s.status))
                  ? str(s.status)
                  : "down") as ServiceHealthStatus,
              },
            ]
          : []
      )
    : [];

  return {
    ...(r as unknown as AdminOverview),
    emergenciesToday,
    pendingVerifications,
    avgResponseSeconds: finiteNumber(r.avgResponseSeconds) ?? Number.NaN,
    services,
  };
}

export const adminApi = {
  /* ---------- Overview ---------- */

  async getOverview(): Promise<AdminOverview> {
    return normalizeOverview(await http.get<unknown>("/admin/overview"));
  },

  async getAuditLogs(options: {
    page?: number;
    pageSize?: number;
  } = {}): Promise<PaginatedResponse<AuditLogEntry>> {
    const data = await http.get<unknown>("/admin/audit-logs", {
      params: {
        page: clampInt(options.page, 1, 10_000, 1),
        pageSize: clampInt(options.pageSize, 1, 100, 20),
      },
    });
    return expectPage(data, "audit log", mapRow<AuditLogEntry>("audit log entry"));
  },

  /* ---------- Users ---------- */

  async getUsers(filters: AdminUserFilters = {}): Promise<PaginatedResponse<AdminUser>> {
    const params: Record<string, string | number> = {
      page: clampInt(filters.page, 1, 10_000, 1),
      pageSize: clampInt(filters.pageSize, 1, 100, 10),
    };

    const search = filters.search?.trim();
    if (search) params.search = search.slice(0, 100);
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;

    const data = await http.get<unknown>("/admin/users", { params });
    return expectPage(data, "user list", mapRow<AdminUser>("user"));
  },

  async createUser(payload: CreateUserPayload): Promise<AdminUser> {
    const data = await http.post<unknown>("/admin/users", payload);
    return mapRow<AdminUser>("user")(data);
  },

  async verifyUser(id: string): Promise<void> {
    await http.post(`/admin/users/${pathSegment(id)}/verify`);
  },

  async setUserStatus(id: string, status: "active" | "suspended"): Promise<void> {
    if (!USER_STATUS_CHANGES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    await http.patch(`/admin/users/${pathSegment(id)}/status`, { status });
  },

  /* ---------- Vehicles ---------- */

  async getVehicles(): Promise<AdminVehicleRow[]> {
    return rows<AdminVehicleRow>(await http.get<unknown>("/admin/vehicles"), "vehicle list");
  },

  async createVehicle(payload: CreateVehiclePayload): Promise<void> {
    await http.post("/admin/vehicles", payload);
  },

  async updateVehicle(id: string, changes: VehicleChanges): Promise<void> {
    await http.patch(`/admin/vehicles/${pathSegment(id)}`, changes);
  },

  /** Verified, active drivers who do not have a vehicle yet */
  async getAvailableDrivers(): Promise<AdminDriverOption[]> {
    const data = await http.get<unknown>("/admin/drivers/available");
    return rows<AdminDriverOption>(data, "driver list").map((d) => ({
      ...d,
      name: str((d as { name?: unknown }).name),
    }));
  },

  /* ---------- Signals ---------- */

  async getSignals(): Promise<AdminSignalRow[]> {
    return rows<AdminSignalRow>(await http.get<unknown>("/admin/signals"), "signal list");
  },

  async createSignal(payload: CreateSignalPayload): Promise<void> {
    await http.post("/admin/signals", payload);
  },

  async setSignalEnabled(id: string, enabled: boolean): Promise<void> {
    await http.patch(`/admin/signals/${pathSegment(id)}`, { enabled });
  },

  async getSignalSettings(): Promise<{ bufferSeconds: number }> {
    const r = expectRecord(
      await http.get<unknown>("/admin/signal-settings"),
      "signal settings"
    );
    const bufferSeconds = finiteNumber(r.bufferSeconds);
    if (bufferSeconds === undefined) badResponse("signal settings");
    return { bufferSeconds };
  },

  async updateSignalSettings(settings: { bufferSeconds: number }): Promise<void> {
    const { bufferSeconds } = settings;
    if (
      !Number.isInteger(bufferSeconds) ||
      bufferSeconds < BUFFER_MIN ||
      bufferSeconds > BUFFER_MAX
    ) {
      throw new ApiError({
        code: "VALIDATION",
        message: `The buffer must be a whole number between ${BUFFER_MIN} and ${BUFFER_MAX} seconds.`,
      });
    }
    await http.put("/admin/signal-settings", { bufferSeconds });
  },

  /** Signals to choose from when connecting a camera */
  async getSignalOptions(): Promise<{ id: string; name: string }[]> {
    const data = await http.get<unknown>("/admin/signal-options");
    return rows<{ id: string; name: string }>(data, "signal list").map((s) => ({
      id: s.id,
      name: str((s as { name?: unknown }).name) || s.id,
    }));
  },

  /* ---------- Cameras ---------- */

  async getCameras(): Promise<AdminCameraRow[]> {
    return rows<AdminCameraRow>(await http.get<unknown>("/admin/cameras"), "camera list");
  },

  /** The stream address is sent once and never comes back in any response */
  async createCamera(payload: CreateCameraPayload): Promise<void> {
    await http.post("/admin/cameras", payload);
  },

  async setCameraDetection(id: string, enabled: boolean): Promise<void> {
    await http.patch(`/admin/cameras/${pathSegment(id)}`, {
      detectionEnabled: enabled,
    });
  },

  async testCameraConnection(id: string): Promise<CameraTestResult> {
    const data = await http.post<unknown>(
      `/admin/cameras/${pathSegment(id)}/test`,
      undefined,
      { timeout: CAMERA_TEST_TIMEOUT_MS }
    );
    const r = expectRecord(data, "connection test");
    const ok = r.ok === true;

    return {
      ok,
      message: str(r.message).trim() || (ok ? "Connection successful." : "Connection failed."),
    };
  },
};