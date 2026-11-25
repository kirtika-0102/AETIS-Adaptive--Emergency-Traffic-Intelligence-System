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
  USE_MOCK_API,
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

function normalizeAdminUser(raw: unknown): AdminUser {
  const r = expectRecord(raw, "user");
  const id = idOf(r.id);
  if (!id) badResponse("user");
  const isActive = r.is_active !== false;
  const rawRole = (str(r.role).trim().toLowerCase() || "dispatcher") as UserRole;
  const status = (
    str(r.status).trim().toLowerCase() || (isActive ? "active" : "suspended")
  ) as UserStatus;

  return {
    id,
    name: str(r.name).trim() || str(r.full_name).trim() || str(r.email) || id,
    email: str(r.email),
    phone: str(r.phone) || "-",
    role: rawRole,
    status,
    verified: typeof r.verified === "boolean" ? r.verified : isActive,
    employeeId: str(r.employeeId).trim() || undefined,
    organization: str(r.organization).trim() || str(r.hospital_id).trim() || undefined,
    lastLoginAt: str(r.lastLoginAt).trim() || undefined,
    createdAt: str(r.createdAt).trim() || new Date().toISOString(),
  };
}

function normalizeAdminVehicle(raw: unknown): AdminVehicleRow {
  const r = expectRecord(raw, "vehicle");
  const id = idOf(r.id);
  if (!id) badResponse("vehicle");
  const rawType = str(r.type).trim().toLowerCase();
  const vType = (
    rawType === "fire_truck" || rawType === "fire"
      ? "fire"
      : rawType === "police"
        ? "police"
        : "ambulance"
  ) as AdminVehicleRow["type"];
  const rawStatus = str(r.status).trim().toLowerCase() || "offline";
  const retired = r.retired === true || rawStatus === "maintenance";
  const drv = isRecord(r.driver)
    ? { id: idOf(r.driver.id), name: str(r.driver.name) }
    : null;

  return {
    id,
    label: str(r.label).trim() || str(r.call_sign).trim() || id,
    type: vType,
    registrationNumber: str(r.registrationNumber) || str(r.license_plate) || "-",
    homeBase: str(r.homeBase) || "Central Dispatch",
    status: rawStatus === "maintenance" ? "offline" : rawStatus,
    retired,
    driver: drv && drv.id ? drv : null,
  };
}

function headingToDirection(deg: number | undefined): AdminCameraRow["direction"] {
  const norm = (((deg ?? 0) % 360) + 360) % 360;
  if (norm >= 45 && norm < 135) return "east";
  if (norm >= 135 && norm < 225) return "south";
  if (norm >= 225 && norm < 315) return "west";
  return "north";
}

const DIRECTION_TO_HEADING: Record<AdminCameraRow["direction"], number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

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
    const page = clampInt(options.page, 1, 10_000, 1);
    const pageSize = clampInt(options.pageSize, 1, 100, 20);
    const { data, headers } = await http.getWithHeaders<unknown>("/admin/audit-logs", {
      params: { page, pageSize },
    });
    if (Array.isArray(data)) {
      const items = data.map(mapRow<AuditLogEntry>("audit log entry"));
      const rawTotal = headers["x-total-count"] ?? headers["X-Total-Count"];
      const parsedTotal = rawTotal !== undefined ? Number(rawTotal) : items.length;
      return {
        data: items,
        total: Number.isFinite(parsedTotal) ? parsedTotal : items.length,
        page,
        pageSize,
      };
    }
    return expectPage(data, "audit log", mapRow<AuditLogEntry>("audit log entry"));
  },

  /* ---------- Users ---------- */

  async getUsers(filters: AdminUserFilters = {}): Promise<PaginatedResponse<AdminUser>> {
    const page = clampInt(filters.page, 1, 10_000, 1);
    const pageSize = clampInt(filters.pageSize, 1, 100, 10);
    const params: Record<string, string | number> = { page, pageSize };

    const search = filters.search?.trim();
    if (search) params.search = search.slice(0, 100);
    if (filters.role) params.role = USE_MOCK_API ? filters.role : filters.role.toUpperCase();
    if (filters.status) params.status = filters.status;

    const { data, headers } = await http.getWithHeaders<unknown>("/admin/users", { params });
    if (Array.isArray(data)) {
      const items = data.map(normalizeAdminUser);
      const rawTotal = headers["x-total-count"] ?? headers["X-Total-Count"];
      const parsedTotal = rawTotal !== undefined ? Number(rawTotal) : items.length;
      return {
        data: items,
        total: Number.isFinite(parsedTotal) ? parsedTotal : items.length,
        page,
        pageSize,
      };
    }
    return expectPage(data, "user list", normalizeAdminUser);
  },

  async createUser(payload: CreateUserPayload): Promise<AdminUser> {
    if (USE_MOCK_API) {
      const data = await http.post<unknown>("/admin/users", payload);
      return normalizeAdminUser(data);
    }

    const data = await http.post<unknown>("/admin/users", {
      email: payload.email,
      full_name: payload.name,
      password: payload.password,
      role: payload.role.toUpperCase(),
      phone: payload.phone || undefined,
      hospital_id: payload.role === "hospital" ? payload.hospitalId || payload.organization : undefined,
    });
    return normalizeAdminUser(data);
  },

  async verifyUser(id: string): Promise<void> {
    if (USE_MOCK_API) {
      await http.post(`/admin/users/${pathSegment(id)}/verify`);
      return;
    }
    await http.patch(`/admin/users/${pathSegment(id)}/status`, { status: "active" });
  },

  async setUserStatus(id: string, status: "active" | "suspended"): Promise<void> {
    if (!USER_STATUS_CHANGES.includes(status)) {
      throw new ApiError({ code: "VALIDATION", message: "Invalid status." });
    }
    await http.patch(`/admin/users/${pathSegment(id)}/status`, { status });
  },

  /* ---------- Vehicles ---------- */

  async getVehicles(): Promise<AdminVehicleRow[]> {
    const path = USE_MOCK_API ? "/admin/vehicles" : "/vehicles";
    return expectArray(await http.get<unknown>(path), "vehicle list").map(normalizeAdminVehicle);
  },

  async createVehicle(payload: CreateVehiclePayload): Promise<void> {
    if (USE_MOCK_API) {
      await http.post("/admin/vehicles", payload);
      return;
    }
    const vType =
      payload.type === "fire"
        ? "FIRE_TRUCK"
        : payload.type === "police"
          ? "POLICE"
          : "AMBULANCE";
    await http.post("/vehicles", {
      id: payload.label.trim().toUpperCase(),
      call_sign: payload.label.trim().toUpperCase(),
      type: vType,
      license_plate: payload.registrationNumber,
    });
  },

  async updateVehicle(id: string, changes: VehicleChanges): Promise<void> {
    const path = USE_MOCK_API
      ? `/admin/vehicles/${pathSegment(id)}`
      : `/vehicles/${pathSegment(id)}`;
    await http.patch(path, changes);
  },

  /** Verified, active drivers */
  async getAvailableDrivers(): Promise<AdminDriverOption[]> {
    if (USE_MOCK_API) {
      const data = await http.get<unknown>("/admin/drivers/available");
      return rows<AdminDriverOption>(data, "driver list").map((d) => ({
        ...d,
        name: str((d as { name?: unknown }).name),
      }));
    }

    const page = await adminApi.getUsers({ role: "driver", status: "active", pageSize: 100 });
    return page.data.map((d) => ({ id: d.id, name: d.name }));
  },

  /* ---------- Signals ---------- */

  async getSignals(): Promise<AdminSignalRow[]> {
    if (USE_MOCK_API) {
      return rows<AdminSignalRow>(await http.get<unknown>("/admin/signals"), "signal list");
    }

    const [rawSignals, rawCameras] = await Promise.all([
      http.get<unknown>("/signals"),
      http.get<unknown>("/cameras"),
    ]);
    const camCounts = new Map<string, number>();
    for (const c of expectArray(rawCameras, "camera list")) {
      if (isRecord(c)) {
        const sigId = idOf(c.connected_signal_id);
        if (sigId) camCounts.set(sigId, (camCounts.get(sigId) ?? 0) + 1);
      }
    }

    return expectArray(rawSignals, "signal list").map((item) => {
      const r = expectRecord(item, "signal");
      const id = idOf(r.id);
      if (!id) badResponse("signal");
      const phase = str(r.current_phase).toUpperCase();
      const status = (r.is_preempted === true
        ? "priority"
        : phase === "FAULT"
          ? "fault"
          : "normal") as AdminSignalRow["status"];
      return {
        id,
        name: str(r.name).trim() || id,
        controllerId: id,
        status,
        enabled: phase !== "FAULT",
        cameraCount: camCounts.get(id) ?? 0,
        lastHeartbeatAt: str(r.last_preemption_at).trim() || null,
      };
    });
  },

  async createSignal(payload: CreateSignalPayload): Promise<void> {
    if (USE_MOCK_API) {
      await http.post("/admin/signals", payload);
      return;
    }
    await http.post("/signals", {
      id: (payload.id || payload.controllerId).trim().toUpperCase(),
      name: payload.name.trim(),
      latitude: payload.location.lat,
      longitude: payload.location.lng,
      normal_cycle_seconds: payload.normalCycleSeconds ?? 60,
    });
  },

  async setSignalEnabled(id: string, enabled: boolean): Promise<void> {
    if (USE_MOCK_API) {
      await http.patch(`/admin/signals/${pathSegment(id)}`, { enabled });
      return;
    }
    if (!enabled) {
      throw new ApiError({
        code: "NOT_SUPPORTED",
        message: "Disabling a signal controller is not persisted by the backend.",
      });
    }
    await http.post(`/signals/${pathSegment(id)}/reset`);
  },

  async resetSignal(id: string): Promise<void> {
    if (USE_MOCK_API) {
      await http.patch(`/admin/signals/${pathSegment(id)}`, { enabled: true });
      return;
    }
    await http.post(`/signals/${pathSegment(id)}/reset`);
  },

  async getSignalSettings(): Promise<{ bufferSeconds: number }> {
    if (!USE_MOCK_API) {
      return { bufferSeconds: 60 };
    }
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
    if (!USE_MOCK_API) {
      throw new ApiError({
        code: "NOT_SUPPORTED",
        message: "Global signal buffer configuration is managed via corridor evaluation parameters.",
      });
    }
    await http.put("/admin/signal-settings", { bufferSeconds });
  },

  /** Signals to choose from when connecting a camera */
  async getSignalOptions(): Promise<{ id: string; name: string }[]> {
    const path = USE_MOCK_API ? "/admin/signal-options" : "/signals";
    const data = await http.get<unknown>(path);
    return rows<{ id: string; name: string }>(data, "signal list").map((s) => ({
      id: s.id,
      name: str((s as { name?: unknown }).name) || s.id,
    }));
  },

  /* ---------- Cameras ---------- */

  async getCameras(): Promise<AdminCameraRow[]> {
    if (USE_MOCK_API) {
      return rows<AdminCameraRow>(await http.get<unknown>("/admin/cameras"), "camera list");
    }

    const [rawCameras, rawSignals] = await Promise.all([
      http.get<unknown>("/cameras"),
      http.get<unknown>("/signals"),
    ]);
    const sigNames = new Map<string, string>();
    for (const s of expectArray(rawSignals, "signal list")) {
      if (isRecord(s)) {
        const sid = idOf(s.id);
        if (sid) sigNames.set(sid, str(s.name).trim() || sid);
      }
    }

    return expectArray(rawCameras, "camera list").map((item) => {
      const r = expectRecord(item, "camera");
      const id = idOf(r.id);
      if (!id) badResponse("camera");
      const sigId = idOf(r.connected_signal_id);
      const rawStatus = str(r.status).trim().toLowerCase();
      const status = (
        rawStatus === "offline" ? "offline" : rawStatus === "error" ? "degraded" : "online"
      ) as AdminCameraRow["status"];

      return {
        id,
        name: str(r.name).trim() || id,
        signalId: sigId,
        signalName: sigNames.get(sigId) || sigId,
        direction: headingToDirection(finiteNumber(r.view_heading)),
        status,
        detectionEnabled: status !== "offline",
        lastDetectionAt: str(r.lastDetectionAt).trim() || null,
      };
    });
  },

  /** The stream address is sent once and never comes back in any UI listing */
  async createCamera(payload: CreateCameraPayload): Promise<void> {
    if (USE_MOCK_API) {
      await http.post("/admin/cameras", payload);
      return;
    }

    const id = (payload.id || payload.name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");

    await http.post("/cameras", {
      id: id || `CAM-${Date.now()}`,
      name: payload.name.trim(),
      latitude: payload.latitude ?? 28.6692,
      longitude: payload.longitude ?? 77.4538,
      stream_url: payload.streamUrl.trim(),
      connected_signal_id: payload.signalId,
      view_heading: DIRECTION_TO_HEADING[payload.direction] ?? 0,
      status: "ONLINE",
    });
  },

  async setCameraDetection(id: string, enabled: boolean): Promise<void> {
    if (USE_MOCK_API) {
      await http.patch(`/admin/cameras/${pathSegment(id)}`, {
        detectionEnabled: enabled,
      });
      return;
    }
    await http.patch(`/cameras/${pathSegment(id)}/status`, {
      status: enabled ? "ONLINE" : "OFFLINE",
    });
  },

  async testCameraConnection(id: string): Promise<CameraTestResult> {
    if (!USE_MOCK_API) {
      const data = await http.get<unknown>(`/cameras/${pathSegment(id)}`);
      const r = expectRecord(data, "camera");
      const status = str(r.status).trim().toUpperCase();
      const ok = status === "ONLINE";
      return {
        ok,
        message: ok
          ? `Camera ${id} is registered as ONLINE.`
          : `Camera ${id} is currently ${status || "OFFLINE"}.`,
      };
    }

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