import axios, { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

import type { SeverityLevel } from "../../styles/theme";
import type {
  CompletionOutcome,
  EmergencyType,
} from "../../types/emergency.types";
import type { NotificationType } from "../../types/notification.types";
import type { LatLng } from "../../types/route.types";
import type { SignalStatus } from "../../types/signal.types";
import type { UserRole, UserStatus } from "../../types/user.types";
import type { VehicleType } from "../../types/vehicle.types";
import {
  seedCameras,
  seedDetections,
  syncLastDetections,
} from "./mockCameras";
import type {
  MockCamera,
  MockDetection,
  MockDirection,
} from "./mockCameras";
import {
  MOCK_DESTINATIONS,
  MOCK_SEED_TRIP_STARTS,
  mockGeocode,
  pickDestination,
  seedEmergencies,
  toAlertEmergency,
  toPublicEmergency,
} from "./mockEmergencies";
import type { MockEmergency, MockPatient } from "./mockEmergencies";
import { MOCK_BUFFER_SECONDS, seedSignals } from "./mockSignals";
import type { MockSignal } from "./mockSignals";
import {
  PASS_HOLD_MS,
  TRIP_SPEED_MPS,
  buildTripPlan,
  computeTripView,
  createRng,
  estimateTravelSeconds,
  hashString,
  passTimeMs,
  remainingRoute,
  signalWindow,
  splitLegs,
} from "./mockTracking";
import type { Trip } from "./mockTracking";
import { MOCK_DEMO_PASSWORD, seedUsers } from "./mockUsers";
import type { MockUser } from "./mockUsers";
import { seedVehicles } from "./mockVehicles";
import type { MockVehicle } from "./mockVehicles";

/* ==========================================================================
   A fake backend for development. axiosClient installs mockAdapter as the
   HTTP adapter when VITE_USE_MOCK_DATA=true in a development build, so every
   api file, page and hook runs against it unchanged.

   - State lives in memory in this browser tab and resets on page reload
   - Responses are copied through JSON, like a real server's, so nothing the
     UI does can change the mock's own data
   - Positions and signal states are worked out from the clock on each request
   ========================================================================== */

if (!import.meta.env.DEV) {
  throw new Error("The mock API is for development builds only.");
}

/* ---------- Settings ---------- */

const LATENCY_MIN_MS = 120;
const LATENCY_MAX_MS = 320;

/**
 * Set a number of milliseconds to make dispatched vehicles start moving on
 * their own, as if the driver had pressed "Start trip". Null (the default)
 * waits for the driver, or for __aetisMock.startTrip().
 */
export const AUTO_START_AFTER_MS: number | null = null;

const SESSION_KEY = "aetis:mock-session";
const MAX_LOGIN_FAILURES = 5;
const LOGIN_BLOCK_MS = 30_000;
const AUDIT_LIMIT = 300;
const NOTIFICATION_LIMIT = 100;
const DETECTION_LIMIT = 500;
const DAY_MS = 86_400_000;

const ROLES: readonly UserRole[] = [
  "dispatcher",
  "driver",
  "hospital",
  "police",
  "fire",
  "admin",
];
const DESTINATION_ROLES: readonly UserRole[] = ["hospital", "police", "fire"];
const EMERGENCY_TYPES: readonly EmergencyType[] = ["medical", "police", "fire"];
const SEVERITIES: readonly SeverityLevel[] = ["critical", "high", "medium", "low"];
const VEHICLE_TYPES: readonly VehicleType[] = ["ambulance", "fire", "police"];
const DIRECTIONS: readonly MockDirection[] = ["north", "south", "east", "west"];
const OUTCOMES: readonly CompletionOutcome[] = [
  "handed_over",
  "no_patient",
  "false_alarm",
];

const TYPE_LABEL: Record<EmergencyType, string> = {
  medical: "medical",
  police: "police",
  fire: "fire",
};

/* ==========================================================================
   Types and state
   ========================================================================== */

interface MockNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  urgent?: boolean;
  link?: string;
}

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target?: string;
  timestamp: number;
}

interface State {
  users: MockUser[];
  vehicles: MockVehicle[];
  emergencies: MockEmergency[];
  signals: MockSignal[];
  cameras: MockCamera[];
  detections: MockDetection[];
  trips: Map<string, Trip>;
  notifications: Map<string, MockNotification[]>;
  audit: AuditEntry[];
  bufferSeconds: number;
  signalsClearedToday: number;
  counters: {
    emergency: number;
    user: number;
    vehicle: number;
    signal: number;
    camera: number;
    detection: number;
    notification: number;
    audit: number;
  };
  loginFailures: Map<string, { count: number; blockedUntil: number }>;
}

let current: State | null = null;
let failuresLeft = 0;

/* ==========================================================================
   Errors and small helpers
   ========================================================================== */

class MockHttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class Reply {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    this.status = status;
    this.data = data;
  }
}

const noContent = () => new Reply(204, "");

/** A function declaration, so TypeScript knows nothing runs after a call */
function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown
): never {
  throw new MockHttpError(status, code, message, details);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const iso = (ms: number) => new Date(ms).toISOString();

const hasText = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

function strField(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function pageOf<T>(list: T[], query: Record<string, string>, defaultSize: number) {
  const page = clampInt(query.page, 1, 10_000, 1);
  const pageSize = clampInt(query.pageSize, 1, 100, defaultSize);
  const start = (page - 1) * pageSize;

  return {
    data: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize,
  };
}

function assertValid(errors: Record<string, string>): void {
  if (Object.keys(errors).length > 0) {
    fail(400, "VALIDATION", "Some of the details are not valid.", errors);
  }
}

const isActiveStatus = (status: string) =>
  status !== "completed" && status !== "cancelled";

const isLive = (u: MockUser) => u.status === "active" && u.verified;

function validPoint(lat: unknown, lng: unknown): LatLng | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* ==========================================================================
   Session (sessionStorage keeps a reload signed in; state still resets)
   ========================================================================== */

let sessionUserId: string | null | undefined;

function readSession(): string | null {
  if (sessionUserId !== undefined) return sessionUserId;
  try {
    sessionUserId = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    sessionUserId = null;
  }
  return sessionUserId ?? null;
}

function writeSession(id: string | null): void {
  sessionUserId = id;
  try {
    if (id) window.sessionStorage.setItem(SESSION_KEY, id);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage can be blocked; the session then lasts until reload */
  }
}

function currentUser(state: State): MockUser | null {
  const id = readSession();
  if (!id) return null;
  const user = state.users.find((u) => u.id === id);
  return user && isLive(user) ? user : null;
}

/* ==========================================================================
   Building the starting state
   ========================================================================== */

function buildState(now: number): State {
  const signals = seedSignals(now);
  const cameras = seedCameras();
  const emergencies = seedEmergencies(now);
  const detections = seedDetections(
    now,
    cameras,
    signals,
    emergencies.filter((e) => e.status === "completed").map((e) => e.id)
  );
  syncLastDetections(cameras, detections);

  const state: State = {
    users: seedUsers(now),
    vehicles: seedVehicles(),
    emergencies,
    signals,
    cameras,
    detections,
    trips: new Map(),
    notifications: new Map(),
    audit: [],
    bufferSeconds: MOCK_BUFFER_SECONDS,
    signalsClearedToday: 38,
    counters: {
      emergency: 1006,
      user: 1,
      vehicle: 10,
      signal: 113,
      camera: 115,
      detection: 15,
      notification: 1000,
      audit: 1,
    },
    loginFailures: new Map(),
  };

  seedTrips(state, now);
  seedNotifications(state, now);
  seedAudit(state, now);
  return state;
}

function getState(now: number): State {
  if (!current) current = buildState(now);
  return current;
}

function seedTrips(state: State, now: number): void {
  for (const e of state.emergencies) {
    if (!e.vehicleId || (e.status !== "dispatched" && e.status !== "en_route")) {
      continue;
    }
    const vehicle = state.vehicles.find((v) => v.id === e.vehicleId);
    if (!vehicle) continue;

    const startedAgo = MOCK_SEED_TRIP_STARTS[e.id] ?? null;
    createTrip(
      state,
      e,
      vehicle,
      e.dispatchedAt ?? now,
      startedAgo === null ? null : now - startedAgo
    );
  }
}

function seedNotifications(state: State, now: number): void {
  const forRole = (
    role: UserRole,
    n: Omit<MockNotification, "id" | "createdAt" | "read"> & {
      ago: number;
      read?: boolean;
    }
  ) => {
    for (const u of state.users.filter((x) => x.role === role && isLive(x))) {
      const { ago, ...rest } = n;
      notify(state, u.id, { ...rest, createdAt: now - ago });
    }
  };

  forRole("admin", {
    type: "signal_fault",
    title: "Signal not responding",
    message: "Controller CTRL-0107 has not reported for 21 minutes.",
    urgent: true,
    link: "/admin/signals",
    ago: 20 * 60_000,
  });
  forRole("admin", {
    type: "system",
    title: "Nightly backup completed",
    message: "The scheduled backup finished without errors.",
    ago: 6 * 3_600_000,
    read: true,
  });
  forRole("dispatcher", {
    type: "signal_fault",
    title: "Signal not responding",
    message: "NH-9 Link Crossing is not responding. Priority cannot be applied there.",
    urgent: true,
    link: "/dispatcher/signals",
    ago: 20 * 60_000,
  });

  const driver = state.users.find((u) => u.id === "U-R01");
  if (driver) {
    notify(state, driver.id, {
      type: "emergency_assigned",
      title: "New assignment",
      message: "A medical emergency has been assigned to AMB-01.",
      link: "/driver/navigation/EM-1003",
      createdAt: now - 2 * 60_000,
    });
  }

  const alertFor = (org: string, id: string, label: string, urgent: boolean, ago: number) => {
    for (const u of state.users.filter((x) => x.organization === org && isLive(x))) {
      notify(state, u.id, {
        type: "emergency_incoming",
        title: `Incoming ${label} emergency`,
        message: "A vehicle is on the way. Open the alert for details.",
        urgent,
        link: `/hospital/emergency/${id}`,
        createdAt: now - ago,
      });
    }
  };
  alertFor("Demo City Hospital", "EM-1003", "medical", false, 2 * 60_000);
  alertFor("Demo Riverside Hospital", "EM-1001", "medical", true, 6 * 60_000);
  alertFor("Demo Fire Station, Vasundhara", "EM-1002", "fire", true, 4 * 60_000);
}

function seedAudit(state: State, now: number): void {
  const entries: Array<[string, string, string | undefined, number]> = [
    ["Demo Admin", "verified account", "Neha Kapoor", 3 * 3_600_000],
    ["Demo Admin", "registered vehicle", "AMB-04", 5 * 3_600_000],
    ["Demo Dispatcher", "signed in", undefined, 30 * 60_000],
    ["Demo Dispatcher", "created emergency", "EM-1001", 7 * 60_000],
    ["Demo Dispatcher", "dispatched AMB-02 to", "EM-1001", 6.5 * 60_000],
    ["Demo Dispatcher", "created emergency", "EM-1002", 5 * 60_000],
    ["Demo Dispatcher", "dispatched FIRE-01 to", "EM-1002", 4.5 * 60_000],
    ["Demo Dispatcher", "dispatched AMB-01 to", "EM-1003", 2 * 60_000],
  ];

  for (const [actor, action, target, ago] of entries) {
    addAudit(state, actor, action, target, now - ago);
  }
  state.audit.sort((a, b) => b.timestamp - a.timestamp);
}

/* ==========================================================================
   Audit log and notifications
   ========================================================================== */

function addAudit(
  state: State,
  actor: string,
  action: string,
  target?: string,
  at: number = Date.now()
): void {
  state.audit.unshift({
    id: `AU-${state.counters.audit++}`,
    actor,
    action,
    target,
    timestamp: at,
  });
  if (state.audit.length > AUDIT_LIMIT) state.audit.length = AUDIT_LIMIT;
}

function notify(
  state: State,
  userId: string,
  n: {
    type: NotificationType;
    title: string;
    message: string;
    urgent?: boolean;
    link?: string;
    createdAt?: number;
    read?: boolean;
  }
): void {
  const list = state.notifications.get(userId) ?? [];

  list.unshift({
    id: `N-${state.counters.notification++}`,
    type: n.type,
    title: n.title,
    message: n.message,
    urgent: n.urgent,
    link: n.link,
    createdAt: n.createdAt ?? Date.now(),
    read: n.read ?? false,
  });

  if (list.length > NOTIFICATION_LIMIT) list.length = NOTIFICATION_LIMIT;
  state.notifications.set(userId, list);
}

/* ==========================================================================
   Trips, signals and detections
   ========================================================================== */

function createTrip(
  state: State,
  e: MockEmergency,
  vehicle: MockVehicle,
  dispatchedAt: number,
  startedAt: number | null
): Trip {
  const destination =
    MOCK_DESTINATIONS.find((d) => d.id === e.destinationId) ??
    pickDestination(e.type, e.location);
  e.destinationId = destination.id;

  const sites = state.signals
    .filter((s) => s.enabled)
    .map((s) => ({ id: s.id, location: s.location }));

  const plan = buildTripPlan(
    vehicle.base,
    e.location,
    e.type === "medical"
      ? { name: destination.name, location: destination.location }
      : null,
    e.location.address,
    sites
  );

  const trip: Trip = {
    emergencyId: e.id,
    vehicleId: vehicle.id,
    plan,
    dispatchedAt,
    startedAt,
    endedAt: null,
    passed: new Set(),
  };
  state.trips.set(e.id, trip);
  return trip;
}

function startTrip(state: State, trip: Trip, now: number): void {
  const e = state.emergencies.find((x) => x.id === trip.emergencyId);
  const v = state.vehicles.find((x) => x.id === trip.vehicleId);
  if (!e || !v) return;

  trip.startedAt = now;
  e.status = "en_route";
  v.status = "en_route";
}

/** Brings the simulation up to date: auto-starts, signal passes and detections */
function advance(state: State, now: number): void {
  for (const trip of state.trips.values()) {
    if (
      AUTO_START_AFTER_MS !== null &&
      trip.startedAt === null &&
      now - trip.dispatchedAt >= AUTO_START_AFTER_MS
    ) {
      startTrip(state, trip, now);
    }

    if (trip.startedAt === null || trip.endedAt !== null) continue;

    for (const pass of trip.plan.passes) {
      if (trip.passed.has(pass.signalId)) continue;

      const at = passTimeMs(trip.startedAt, pass.atMeters);
      if (at > now) continue;

      trip.passed.add(pass.signalId);
      recordPass(state, trip, pass.signalId, at);
    }
  }
}

function recordPass(state: State, trip: Trip, signalId: string, at: number): void {
  const signal = state.signals.find((s) => s.id === signalId);
  if (!signal || !signal.enabled || signal.faulty) return;

  state.signalsClearedToday += 1;

  const camera = state.cameras.find(
    (c) => c.signalId === signalId && c.detectionEnabled && c.status !== "offline"
  );
  const vehicle = state.vehicles.find((v) => v.id === trip.vehicleId);
  if (!camera || !vehicle) return;

  state.detections.unshift({
    id: `DET-${String(state.counters.detection++).padStart(4, "0")}`,
    cameraId: camera.id,
    cameraName: camera.name,
    signalId,
    signalName: signal.name,
    vehicleType: vehicle.type,
    confidence:
      0.88 + (hashString(`${trip.emergencyId}:${signalId}`) % 100) / 1000,
    detectedAt: at,
    emergencyId: trip.emergencyId,
  });
  if (state.detections.length > DETECTION_LIMIT) {
    state.detections.length = DETECTION_LIMIT;
  }
  camera.lastDetectionAt = at;
}

/** A signal's status across every live trip, plus the next time a vehicle is due */
function signalState(
  state: State,
  s: MockSignal,
  now: number
): { status: SignalStatus; expectedArrivalAt?: number } {
  if (!s.enabled) return { status: "normal" };
  if (s.faulty) return { status: "fault" };

  let status: SignalStatus = "normal";
  let next: number | undefined;

  for (const trip of state.trips.values()) {
    if (trip.startedAt === null || trip.endedAt !== null) continue;

    for (const pass of trip.plan.passes) {
      if (pass.signalId !== s.id) continue;

      const at = passTimeMs(trip.startedAt, pass.atMeters);
      const window = signalWindow(at, state.bufferSeconds, now);

      if (window === "priority") status = "priority";
      else if (window === "pending" && status === "normal") status = "pending";

      if (at + PASS_HOLD_MS >= now && (next === undefined || at < next)) next = at;
    }
  }

  return { status, expectedArrivalAt: next };
}

function heartbeatOf(s: MockSignal, now: number): number {
  return s.lastHeartbeatAt ?? now - ((hashString(s.id) % 25) + 3) * 1000;
}

function toSignalJson(state: State, s: MockSignal, now: number) {
  const st = signalState(state, s, now);
  return {
    id: s.id,
    name: s.name,
    status: st.status,
    location: s.location,
    expectedArrivalAt: st.expectedArrivalAt,
  };
}

/** Signals on one trip, in the order the vehicle reaches them */
function routeSignalsJson(state: State, trip: Trip, now: number) {
  return trip.plan.passes.flatMap((pass) => {
    const s = state.signals.find((x) => x.id === pass.signalId);
    if (!s) return [];

    return [
      {
        id: s.id,
        name: s.name,
        status: signalState(state, s, now).status,
        location: s.location,
        // Only known once the trip has started
        expectedArrivalAt:
          trip.startedAt === null ? undefined : passTimeMs(trip.startedAt, pass.atMeters),
      },
    ];
  });
}

/* ==========================================================================
   Conversions to the JSON the api files expect
   ========================================================================== */

function driverVehicle(state: State, user: MockUser): MockVehicle | null {
  return state.vehicles.find((v) => v.driverId === user.id && !v.retired) ?? null;
}

function tripForVehicle(state: State, vehicleId: string): Trip | undefined {
  for (const t of state.trips.values()) if (t.vehicleId === vehicleId) return t;
  return undefined;
}

function vehicleLocation(state: State, v: MockVehicle, now: number): LatLng {
  const trip = tripForVehicle(state, v.id);
  return trip ? computeTripView(trip.plan, trip.startedAt, now).location : v.base;
}

function destinationName(e: MockEmergency): string | undefined {
  return MOCK_DESTINATIONS.find((d) => d.id === e.destinationId)?.name;
}

function toTrackedEV(state: State, trip: Trip, now: number) {
  const e = state.emergencies.find((x) => x.id === trip.emergencyId);
  const v = state.vehicles.find((x) => x.id === trip.vehicleId);
  if (!e || !v) return null;

  const view = computeTripView(trip.plan, trip.startedAt, now);

  return {
    emergencyId: e.id,
    vehicleId: v.id,
    vehicleLabel: v.label,
    vehicleType: v.type,
    location: view.location,
    speedKmh: view.speedKmh,
    etaSeconds: Math.round(view.etaSeconds),
    destinationName: trip.plan.destinationName,
    route: remainingRoute(trip.plan, view.distanceMeters),
    // The simulated vehicle reports continuously
    lastUpdateAt: iso(now),
  };
}

function toAdminUser(u: MockUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    verified: u.verified,
    employeeId: u.employeeId,
    organization: u.organization,
    lastLoginAt: u.lastLoginAt === undefined ? undefined : iso(u.lastLoginAt),
    createdAt: iso(u.createdAt),
  };
}

function toAdminVehicle(state: State, v: MockVehicle) {
  const driver = v.driverId ? state.users.find((u) => u.id === v.driverId) : undefined;

  return {
    id: v.id,
    label: v.label,
    type: v.type,
    registrationNumber: v.registrationNumber,
    homeBase: v.homeBase,
    status: v.retired ? "offline" : v.status,
    retired: v.retired,
    driver: driver ? { id: driver.id, name: driver.name } : null,
  };
}

function toAdminSignal(state: State, s: MockSignal, now: number) {
  return {
    id: s.id,
    name: s.name,
    controllerId: s.controllerId,
    status: signalState(state, s, now).status,
    enabled: s.enabled,
    cameraCount: state.cameras.filter((c) => c.signalId === s.id).length,
    lastHeartbeatAt: iso(heartbeatOf(s, now)),
  };
}

function toAdminCamera(state: State, c: MockCamera) {
  // The stream address is write-only: it is never part of any response
  return {
    id: c.id,
    name: c.name,
    signalId: c.signalId,
    signalName: state.signals.find((s) => s.id === c.signalId)?.name ?? c.signalId,
    direction: c.direction,
    status: c.status,
    detectionEnabled: c.detectionEnabled,
    lastDetectionAt: c.lastDetectionAt === null ? null : iso(c.lastDetectionAt),
  };
}

function toDetectionJson(d: MockDetection) {
  return { ...d, detectedAt: iso(d.detectedAt) };
}

function toAlertPatient(e: MockEmergency): MockPatient {
  if (e.type === "medical" && e.patient) return e.patient;
  return {
    condition: e.description ?? "No details were provided.",
    requiredResources: [],
  };
}

function toAlert(state: State, e: MockEmergency, now: number) {
  const trip = state.trips.get(e.id);
  const vehicle = state.vehicles.find((v) => v.id === e.vehicleId);
  const view = trip ? computeTripView(trip.plan, trip.startedAt, now) : null;

  return {
    emergencyId: e.id,
    emergency: toAlertEmergency(e),
    vehicleLabel: vehicle?.label ?? "",
    vehicleType: vehicle?.type ?? "ambulance",
    etaSeconds: view ? Math.round(view.etaSeconds) : 0,
    acknowledged: e.acknowledgedAt !== undefined,
    acknowledgedAt: e.acknowledgedAt === undefined ? undefined : iso(e.acknowledgedAt),
    receivedAt: iso(e.dispatchedAt ?? Date.parse(e.createdAt)),
    patient: toAlertPatient(e),
  };
}

function toNotificationJson(n: MockNotification) {
  return { ...n, createdAt: iso(n.createdAt) };
}

/* ==========================================================================
   Access rules (mirrors what the real backend must enforce)
   ========================================================================== */

interface Ctx {
  state: State;
  now: number;
  user: MockUser | null;
  params: string[];
  query: Record<string, string>;
  body: Record<string, unknown>;
}

function requireUser(ctx: Ctx): MockUser {
  if (!ctx.user) fail(401, "UNAUTHORIZED", "Please sign in.");
  return ctx.user;
}

function requireRole(ctx: Ctx, roles: readonly UserRole[]): MockUser {
  const user = requireUser(ctx);
  if (!roles.includes(user.role)) {
    fail(403, "FORBIDDEN", "You do not have permission to do that.");
  }
  return user;
}

function canSee(state: State, user: MockUser, e: MockEmergency): boolean {
  switch (user.role) {
    case "admin":
    case "dispatcher":
      return true;
    case "driver": {
      const v = driverVehicle(state, user);
      return v !== null && e.vehicleId === v.id;
    }
    default:
      return e.vehicleId !== undefined && destinationName(e) === user.organization;
  }
}

function getEmergency(state: State, id: string): MockEmergency {
  const e = state.emergencies.find((x) => x.id === id);
  if (!e) fail(404, "NOT_FOUND", "That emergency could not be found.");
  return e;
}

/** Looks up an emergency the user may see. Others get a 404, not a 403. */
function getVisibleEmergency(ctx: Ctx, user: MockUser, id: string): MockEmergency {
  const e = getEmergency(ctx.state, id);
  if (!canSee(ctx.state, user, e)) {
    fail(404, "NOT_FOUND", "That emergency could not be found.");
  }
  return e;
}

/* ==========================================================================
   Routes
   ========================================================================== */

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface RouteDef {
  method: string;
  regex: RegExp;
  handler: Handler;
}

const routes: RouteDef[] = [];

function on(method: string, pattern: string, handler: Handler): void {
  const source = pattern
    .split("/")
    .map((seg) =>
      seg.startsWith(":") ? "([^/]+)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("/");

  routes.push({ method, regex: new RegExp(`^${source}$`), handler });
}

/* ---------- Auth ---------- */

on("POST", "/auth/login", (ctx) => {
  const { state, now, body } = ctx;

  const email = strField(body, "email").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = strField(body, "role");

  if (!email || !password || !ROLES.includes(role as UserRole)) {
    fail(400, "VALIDATION", "Enter your email, password and role.");
  }

  const failures = state.loginFailures.get(email);
  if (failures && failures.blockedUntil > now) {
    fail(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please wait and try again.");
  }

  const user = state.users.find((u) => u.email.toLowerCase() === email);
  const valid = user !== undefined && user.role === role && password === MOCK_DEMO_PASSWORD;

  if (!valid || !user) {
    const count = (failures?.count ?? 0) + 1;
    state.loginFailures.set(email, {
      count: count >= MAX_LOGIN_FAILURES ? 0 : count,
      blockedUntil: count >= MAX_LOGIN_FAILURES ? now + LOGIN_BLOCK_MS : 0,
    });
    if (state.loginFailures.size > 200) {
      const oldest = state.loginFailures.keys().next().value;
      if (oldest !== undefined) state.loginFailures.delete(oldest);
    }
    // The same answer for a wrong password, an unknown email and a wrong role
    fail(401, "INVALID_CREDENTIALS", "Incorrect email, password or role.");
  }

  if (user.status === "suspended") {
    fail(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
  }
  if (!user.verified || user.status === "pending") {
    fail(403, "ACCOUNT_PENDING", "This account is awaiting verification.");
  }

  state.loginFailures.delete(email);
  user.lastLoginAt = now;
  writeSession(user.id);
  addAudit(state, user.name, "signed in", undefined, now);

  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

on("POST", "/auth/logout", (ctx) => {
  if (ctx.user) addAudit(ctx.state, ctx.user.name, "signed out", undefined, ctx.now);
  writeSession(null);
  return noContent();
});

on("GET", "/auth/me", (ctx) => {
  const user = requireUser(ctx);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/* ---------- Emergencies ---------- */

on("GET", "/emergencies", (ctx) => {
  requireRole(ctx, ["dispatcher", "admin"]);
  const { query, state } = ctx;

  const search = (query.search ?? "").trim().toLowerCase().slice(0, 100);
  const status = query.status;

  const list = state.emergencies
    .filter((e) => {
      if (query.type && e.type !== query.type) return false;
      if (status === "active") {
        if (!isActiveStatus(e.status)) return false;
      } else if (status && e.status !== status) {
        return false;
      }
      if (!search) return true;
      return (
        e.id.toLowerCase().includes(search) ||
        e.callerName.toLowerCase().includes(search) ||
        e.location.address.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const page = pageOf(list, query, 10);
  return { ...page, data: page.data.map(toPublicEmergency) };
});

on("POST", "/emergencies", (ctx) => {
  const user = requireRole(ctx, ["dispatcher", "admin"]);
  const { state, body, now } = ctx;
  const errors: Record<string, string> = {};

  const type = strField(body, "type") as EmergencyType;
  if (!EMERGENCY_TYPES.includes(type)) errors.type = "Choose a valid service.";

  const severity = strField(body, "severity") as SeverityLevel;
  if (!SEVERITIES.includes(severity)) errors.severity = "Choose a valid severity.";

  const callerName = strField(body, "callerName");
  if (callerName.length < 2 || callerName.length > 100) {
    errors.callerName = "Enter the caller's name.";
  }

  const callerPhone = strField(body, "callerPhone");
  if (!/^[0-9+()\-\s]{7,20}$/.test(callerPhone)) {
    errors.callerPhone = "Enter a valid phone number.";
  }

  const description = strField(body, "description");
  if (description.length > 500) errors.description = "Keep the situation under 500 characters.";

  const loc = isRecord(body.location) ? body.location : {};
  const address = strField(loc, "address");
  if (address.length < 5 || address.length > 300) errors.address = "Enter the location.";

  let point: LatLng | null = null;
  if (loc.lat !== undefined || loc.lng !== undefined) {
    point = validPoint(loc.lat, loc.lng);
    if (!point) errors.location = "The coordinates are not valid.";
  }

  let patient: MockPatient | undefined;
  if (type === "medical") {
    const p = isRecord(body.patient) ? body.patient : null;
    const condition = p ? strField(p, "condition") : "";

    if (condition.length < 3 || condition.length > 300) {
      errors.condition = "Describe the patient's condition.";
    } else if (p) {
      const age = p.age;
      if (age !== undefined && (typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 120)) {
        errors.patientAge = "Enter an age between 0 and 120.";
      }
      const gender = strField(p, "gender");
      if (gender && !["male", "female", "other"].includes(gender)) {
        errors.patientGender = "Choose a valid gender.";
      }

      const resources = Array.isArray(p.requiredResources)
        ? p.requiredResources.filter(hasText).map((r) => r.trim().slice(0, 60)).slice(0, 12)
        : [];

      patient = {
        name: strField(p, "name") || undefined,
        age: typeof age === "number" ? age : undefined,
        gender: (gender || undefined) as MockPatient["gender"],
        condition,
        requiredResources: resources,
      };
    }
  }

  assertValid(errors);

  const where = point ?? mockGeocode(address);
  const id = `EM-${state.counters.emergency++}`;

  const record: MockEmergency = {
    id,
    type,
    severity,
    status: "pending",
    callerName,
    callerPhone,
    description: description || undefined,
    location: { address, lat: where.lat, lng: where.lng },
    createdAt: iso(now),
    patient,
  };

  state.emergencies.unshift(record);
  addAudit(state, user.name, "created emergency", id, now);

  return new Reply(201, toPublicEmergency(record));
});

on("GET", "/emergencies/:id", (ctx) => {
  const user = requireUser(ctx);
  return toPublicEmergency(getVisibleEmergency(ctx, user, ctx.params[0]));
});

on("PATCH", "/emergencies/:id/status", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const { state, now } = ctx;
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);

  const status = strField(ctx.body, "status");
  if (status !== "en_route" && status !== "arrived") {
    fail(400, "VALIDATION", "That status cannot be set here.");
  }

  const trip = state.trips.get(e.id);
  const vehicle = state.vehicles.find((v) => v.id === e.vehicleId);
  if (!trip || !vehicle) fail(404, "NOT_FOUND", "There is no active trip for this emergency.");

  if (status === "en_route") {
    if (e.status !== "dispatched") fail(409, "CONFLICT", "This trip has already started.");
    startTrip(state, trip, now);
    addAudit(state, user.name, "started trip", e.id, now);
  } else {
    if (e.status !== "en_route") fail(409, "CONFLICT", "Start the trip before marking arrival.");
    trip.endedAt = now;
    e.status = "arrived";
    e.arrivedAt = now;
    e.responseSeconds = Math.max(
      0,
      Math.round((now - (e.dispatchedAt ?? Date.parse(e.createdAt))) / 1000)
    );
    vehicle.status = "arrived";
    addAudit(state, user.name, "arrived at", e.id, now);
  }

  return noContent();
});

on("POST", "/emergencies/:id/complete", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const { state, now, body } = ctx;
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);

  const outcome = strField(body, "outcome") as CompletionOutcome;
  if (!OUTCOMES.includes(outcome)) fail(400, "VALIDATION", "Choose an outcome.");
  if (body.handoverConfirmed !== true) {
    fail(400, "VALIDATION", "Confirm the details before closing.");
  }
  if (strField(body, "notes").length > 500) {
    fail(400, "VALIDATION", "Keep the notes under 500 characters.");
  }

  if (e.status !== "arrived") {
    fail(409, "CONFLICT", "Confirm arrival before closing this emergency.");
  }

  e.status = outcome === "false_alarm" ? "cancelled" : "completed";
  e.outcome = outcome;

  const vehicle = state.vehicles.find((v) => v.id === e.vehicleId);
  if (vehicle) vehicle.status = vehicle.driverId ? "available" : "offline";
  state.trips.delete(e.id);

  addAudit(state, user.name, "closed emergency", e.id, now);
  for (const d of state.users.filter((u) => u.role === "dispatcher" && isLive(u))) {
    notify(state, d.id, {
      type: "emergency_completed",
      title: "Emergency closed",
      message: `${e.id} was closed by the driver.`,
      link: "/dispatcher/history",
    });
  }

  return noContent();
});

on("GET", "/emergencies/:id/nearby-vehicles", (ctx) => {
  requireRole(ctx, ["dispatcher", "admin"]);
  const { state, now } = ctx;
  const e = getEmergency(state, ctx.params[0]);

  return state.vehicles
    .filter((v) => !v.retired)
    .map((v) => {
      const location = vehicleLocation(state, v, now);
      return {
        id: v.id,
        label: v.label,
        type: v.type,
        location,
        etaSeconds: estimateTravelSeconds(location, e.location),
        // A vehicle with no driver cannot be dispatched
        status: v.driverId ? v.status : "offline",
      };
    })
    .sort((a, b) => a.etaSeconds - b.etaSeconds)
    .slice(0, 8);
});

on("POST", "/emergencies/:id/dispatch", (ctx) => {
  const user = requireRole(ctx, ["dispatcher", "admin"]);
  const { state, now } = ctx;
  const e = getEmergency(state, ctx.params[0]);

  const vehicleId = strField(ctx.body, "vehicleId");
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v || v.retired) fail(404, "NOT_FOUND", "That vehicle does not exist.");

  if (e.status !== "pending") {
    fail(409, "ALREADY_DISPATCHED", "This emergency already has a vehicle.");
  }
  if (v.status !== "available" || !v.driverId) {
    fail(409, "VEHICLE_UNAVAILABLE", "That vehicle is no longer available.");
  }

  const destination = pickDestination(e.type, e.location);

  e.status = "dispatched";
  e.vehicleId = v.id;
  e.destinationId = destination.id;
  e.dispatchedAt = now;
  v.status = "dispatched";
  createTrip(state, e, v, now, null);

  addAudit(state, user.name, `dispatched ${v.label} to`, e.id, now);

  const urgent = e.severity === "critical" || e.severity === "high";
  const label = TYPE_LABEL[e.type];

  const driver = state.users.find((u) => u.id === v.driverId);
  if (driver) {
    notify(state, driver.id, {
      type: "emergency_assigned",
      title: "New assignment",
      message: `A ${label} emergency has been assigned to ${v.label}.`,
      urgent,
      link: `/driver/navigation/${e.id}`,
    });
  }

  // Notification text carries no patient or caller details
  for (const u of state.users) {
    if (
      DESTINATION_ROLES.includes(u.role) &&
      u.organization === destination.name &&
      isLive(u)
    ) {
      notify(state, u.id, {
        type: "emergency_incoming",
        title: `Incoming ${label} emergency`,
        message: "A vehicle is on the way. Open the alert for details.",
        urgent,
        link: `/hospital/emergency/${e.id}`,
      });
    }
  }

  return noContent();
});

on("GET", "/emergencies/:id/route", (ctx) => {
  const user = requireUser(ctx);
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);
  return routePlanJson(ctx.state, e, ctx.now, false);
});

on("POST", "/emergencies/:id/route/recalculate", (ctx) => {
  const user = requireRole(ctx, ["dispatcher", "admin", "driver"]);
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);
  // The mock has no traffic to react to, so the plan stays the same
  return routePlanJson(ctx.state, e, ctx.now, true);
});

function routePlanJson(state: State, e: MockEmergency, now: number, fresh: boolean) {
  const trip = state.trips.get(e.id);
  if (!trip) fail(404, "NO_ROUTE", "No route has been planned for this emergency.");

  const plan = trip.plan;
  const view = computeTripView(plan, trip.startedAt, now);
  const legs = splitLegs(plan);
  const sceneAt = plan.cumulative[plan.sceneIndex];

  return {
    emergencyId: e.id,
    toScene:
      view.distanceMeters < sceneAt
        ? {
            points: legs.toScene,
            distanceMeters: Math.round(sceneAt),
            durationSeconds: Math.round(sceneAt / TRIP_SPEED_MPS),
          }
        : null,
    toDestination: legs.toDestination
      ? {
          points: legs.toDestination,
          distanceMeters: Math.round(plan.totalMeters - sceneAt),
          durationSeconds: Math.round((plan.totalMeters - sceneAt) / TRIP_SPEED_MPS),
        }
      : null,
    destinationName: plan.destinationName,
    etaSeconds: Math.round(view.etaSeconds),
    calculatedAt: iso(fresh ? now : trip.dispatchedAt),
  };
}

on("GET", "/emergencies/:id/signals", (ctx) => {
  const user = requireUser(ctx);
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);
  const trip = ctx.state.trips.get(e.id);
  return trip ? routeSignalsJson(ctx.state, trip, ctx.now) : [];
});

/* ---------- Dispatcher and driver ---------- */

on("GET", "/dispatcher/summary", (ctx) => {
  requireRole(ctx, ["dispatcher", "admin"]);
  const { state } = ctx;

  const timed = state.emergencies.filter(
    (e) => e.status === "completed" && typeof e.responseSeconds === "number"
  );
  const total = timed.reduce((sum, e) => sum + (e.responseSeconds ?? 0), 0);

  return {
    activeCount: state.emergencies.filter((e) => isActiveStatus(e.status)).length,
    avgResponseSeconds: timed.length > 0 ? Math.round(total / timed.length) : null,
    signalsClearedToday: state.signalsClearedToday,
  };
});

on("GET", "/driver/assignment", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const vehicle = driverVehicle(ctx.state, user);
  if (!vehicle) return noContent();

  const e = ctx.state.emergencies.find(
    (x) =>
      x.vehicleId === vehicle.id &&
      (x.status === "dispatched" || x.status === "en_route" || x.status === "arrived")
  );
  return e ? toPublicEmergency(e) : noContent();
});

on("GET", "/driver/vehicle", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const v = driverVehicle(ctx.state, user);
  if (!v) return noContent();

  const trip = tripForVehicle(ctx.state, v.id);
  const view = trip ? computeTripView(trip.plan, trip.startedAt, ctx.now) : null;

  return {
    id: v.id,
    label: v.label,
    type: v.type,
    location: view ? view.location : v.base,
    etaSeconds: view ? Math.round(view.etaSeconds) : undefined,
    status: v.status,
  };
});

on("PATCH", "/driver/vehicle/status", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const v = driverVehicle(ctx.state, user);
  if (!v) fail(404, "NOT_FOUND", "You do not have a vehicle assigned.");

  const status = strField(ctx.body, "status");
  if (status !== "available" && status !== "offline") {
    fail(400, "VALIDATION", "That status cannot be set here.");
  }
  if (["dispatched", "en_route", "arrived"].includes(v.status)) {
    fail(409, "CONFLICT", "You cannot change duty status during an emergency.");
  }

  v.status = status;
  addAudit(ctx.state, user.name, status === "available" ? "went on duty" : "went off duty", v.label, ctx.now);
  return noContent();
});

/* ---------- Tracking ---------- */

on("GET", "/tracking/active", (ctx) => {
  const user = requireUser(ctx);
  const out = [];

  for (const trip of ctx.state.trips.values()) {
    if (trip.endedAt !== null) continue;
    const e = ctx.state.emergencies.find((x) => x.id === trip.emergencyId);
    if (!e || (e.status !== "dispatched" && e.status !== "en_route")) continue;
    if (!canSee(ctx.state, user, e)) continue;

    const ev = toTrackedEV(ctx.state, trip, ctx.now);
    if (ev) out.push(ev);
  }
  return out;
});

on("GET", "/tracking/:id", (ctx) => {
  const user = requireUser(ctx);
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);
  const trip = ctx.state.trips.get(e.id);

  if (!trip || trip.endedAt !== null) fail(404, "NOT_FOUND", "This trip is not live.");
  return toTrackedEV(ctx.state, trip, ctx.now);
});

on("POST", "/tracking/:id/location", (ctx) => {
  const user = requireRole(ctx, ["driver"]);
  const e = getVisibleEmergency(ctx, user, ctx.params[0]);

  if (e.status !== "en_route") fail(409, "CONFLICT", "This trip is not in progress.");
  if (!validPoint(ctx.body.lat, ctx.body.lng)) {
    fail(400, "VALIDATION", "The location is not valid.");
  }
  // The mock moves vehicles itself, so a real GPS fix is checked and dropped
  return noContent();
});

/* ---------- Notifications ---------- */

on("GET", "/notifications", (ctx) => {
  const user = requireUser(ctx);
  const limit = clampInt(ctx.query.limit, 1, 100, 50);
  const all = ctx.state.notifications.get(user.id) ?? [];

  return {
    items: all.slice(0, limit).map(toNotificationJson),
    unreadCount: all.filter((n) => !n.read).length,
  };
});

on("POST", "/notifications/read-all", (ctx) => {
  const user = requireUser(ctx);
  for (const n of ctx.state.notifications.get(user.id) ?? []) n.read = true;
  return noContent();
});

on("POST", "/notifications/:id/read", (ctx) => {
  const user = requireUser(ctx);
  const n = (ctx.state.notifications.get(user.id) ?? []).find((x) => x.id === ctx.params[0]);
  if (!n) fail(404, "NOT_FOUND", "That notification could not be found.");
  n.read = true;
  return noContent();
});

/* ---------- Signals and cameras ---------- */

on("GET", "/signals", (ctx) => {
  requireRole(ctx, ["dispatcher", "admin"]);
  return ctx.state.signals.map((s) => toSignalJson(ctx.state, s, ctx.now));
});

on("GET", "/cameras/detections", (ctx) => {
  requireRole(ctx, ["dispatcher", "admin"]);
  const limit = clampInt(ctx.query.limit, 1, 200, 30);

  return [...ctx.state.detections]
    .sort((a, b) => b.detectedAt - a.detectedAt)
    .slice(0, limit)
    .map(toDetectionJson);
});

/* ---------- Hospitals, police and fire stations ---------- */

function alertVisible(user: MockUser, e: MockEmergency): boolean {
  return (
    e.vehicleId !== undefined &&
    (e.status === "dispatched" || e.status === "en_route" || e.status === "arrived") &&
    (user.role === "admin" || destinationName(e) === user.organization)
  );
}

on("GET", "/destination/alerts", (ctx) => {
  const user = requireRole(ctx, [...DESTINATION_ROLES, "admin"]);
  return ctx.state.emergencies
    .filter((e) => alertVisible(user, e))
    .map((e) => toAlert(ctx.state, e, ctx.now));
});

on("GET", "/destination/alerts/:id", (ctx) => {
  const user = requireRole(ctx, [...DESTINATION_ROLES, "admin"]);
  const e = ctx.state.emergencies.find((x) => x.id === ctx.params[0]);
  if (!e || !alertVisible(user, e)) fail(404, "NOT_FOUND", "That alert could not be found.");
  return toAlert(ctx.state, e, ctx.now);
});

on("POST", "/destination/alerts/:id/acknowledge", (ctx) => {
  const user = requireRole(ctx, [...DESTINATION_ROLES, "admin"]);
  const e = ctx.state.emergencies.find((x) => x.id === ctx.params[0]);
  if (!e || !alertVisible(user, e)) fail(404, "NOT_FOUND", "That alert could not be found.");

  // Acknowledging twice is harmless
  if (e.acknowledgedAt === undefined) {
    e.acknowledgedAt = ctx.now;
    addAudit(ctx.state, user.name, "acknowledged alert", e.id, ctx.now);

    for (const d of ctx.state.users.filter((u) => u.role === "dispatcher" && isLive(u))) {
      notify(ctx.state, d.id, {
        type: "acknowledgement",
        title: "Destination is preparing",
        message: `${destinationName(e) ?? "The destination"} acknowledged ${e.id}.`,
        link: `/tracking/${e.id}`,
      });
    }
  }
  return noContent();
});

/* ---------- Admin ---------- */

on("GET", "/admin/overview", (ctx) => {
  requireRole(ctx, ["admin"]);
  const { state, now } = ctx;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const timed = state.emergencies.filter(
    (e) => e.status === "completed" && typeof e.responseSeconds === "number"
  );
  const total = timed.reduce((sum, e) => sum + (e.responseSeconds ?? 0), 0);

  const vehicles = state.vehicles.filter((v) => !v.retired);
  const faultSignals = state.signals.some((s) => s.enabled && s.faulty);
  const cameraTrouble = state.cameras.some((c) => c.status !== "online");

  return {
    emergenciesToday: state.emergencies.filter(
      (e) => Date.parse(e.createdAt) >= startOfToday.getTime()
    ).length,
    avgResponseSeconds: timed.length > 0 ? Math.round(total / timed.length) : null,
    pendingVerifications: state.users.filter((u) => !u.verified).length,
    vehiclesOnline: vehicles.filter((v) => v.status !== "offline").length,
    vehiclesTotal: vehicles.length,
    signalsOnline: state.signals.filter((s) => s.enabled && !s.faulty).length,
    signalsTotal: state.signals.length,
    camerasOnline: state.cameras.filter((c) => c.status !== "offline").length,
    camerasTotal: state.cameras.length,
    services: [
      { name: "Authentication Service", status: "operational" },
      { name: "Emergency Management", status: "operational" },
      { name: "Routing and ETA Engine", status: "operational" },
      { name: "Tracking Service", status: "operational" },
      { name: "Notification Service", status: "operational" },
      { name: "Signal Control Engine", status: faultSignals ? "degraded" : "operational" },
      { name: "Camera and AI Detection", status: cameraTrouble ? "degraded" : "operational" },
      { name: "Analytics and Reporting", status: "operational" },
    ],
  };
});

on("GET", "/admin/audit-logs", (ctx) => {
  requireRole(ctx, ["admin"]);
  const page = pageOf(ctx.state.audit, ctx.query, 20);
  return {
    ...page,
    data: page.data.map((a) => ({ ...a, timestamp: iso(a.timestamp) })),
  };
});

/* Users */

on("GET", "/admin/users", (ctx) => {
  requireRole(ctx, ["admin"]);
  const { query, state } = ctx;
  const search = (query.search ?? "").trim().toLowerCase().slice(0, 100);

  const list = state.users.filter((u) => {
    if (query.role && u.role !== query.role) return false;
    if (query.status && u.status !== query.status) return false;
    if (!search) return true;
    return (
      u.name.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search) ||
      (u.employeeId ?? "").toLowerCase().includes(search)
    );
  });

  const page = pageOf(list, query, 10);
  return { ...page, data: page.data.map(toAdminUser) };
});

on("POST", "/admin/users", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, body, now } = ctx;
  const errors: Record<string, string> = {};

  const name = strField(body, "name");
  if (name.length < 2 || name.length > 100) errors.name = "Enter the full name.";

  const email = strField(body, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email.";

  const phone = strField(body, "phone");
  if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) errors.phone = "Enter a valid phone number.";

  const role = strField(body, "role") as UserRole;
  if (!ROLES.includes(role)) errors.role = "Choose a valid role.";

  const employeeId = strField(body, "employeeId");
  if ((role === "dispatcher" || role === "driver") && !employeeId) {
    errors.employeeId = "An employee ID is required for this role.";
  }
  const organization = strField(body, "organization");
  if (DESTINATION_ROLES.includes(role) && !organization) {
    errors.organization = "Enter the hospital or station name.";
  }
  assertValid(errors);

  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    fail(409, "EMAIL_EXISTS", "An account with that email already exists.");
  }

  const user: MockUser = {
    id: `U-N${String(state.counters.user++).padStart(3, "0")}`,
    name,
    email,
    phone,
    role,
    status: "pending",
    verified: false,
    employeeId: employeeId || undefined,
    organization: organization || undefined,
    createdAt: now,
  };
  state.users.push(user);
  addAudit(state, admin.name, "created account for", name, now);

  return new Reply(201, toAdminUser(user));
});

on("POST", "/admin/users/:id/verify", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const user = ctx.state.users.find((u) => u.id === ctx.params[0]);
  if (!user) fail(404, "NOT_FOUND", "That user could not be found.");

  user.verified = true;
  if (user.status === "pending") user.status = "active";
  addAudit(ctx.state, admin.name, "verified account", user.name, ctx.now);
  return noContent();
});

on("PATCH", "/admin/users/:id/status", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const user = ctx.state.users.find((u) => u.id === ctx.params[0]);
  if (!user) fail(404, "NOT_FOUND", "That user could not be found.");

  const status = strField(ctx.body, "status") as UserStatus;
  if (status !== "active" && status !== "suspended") {
    fail(400, "VALIDATION", "That status cannot be set here.");
  }
  if (user.id === admin.id && status === "suspended") {
    fail(403, "FORBIDDEN", "You cannot suspend your own account.");
  }

  user.status = status;
  addAudit(
    ctx.state,
    admin.name,
    status === "suspended" ? "suspended account" : "reactivated account",
    user.name,
    ctx.now
  );
  return noContent();
});

/* Vehicles */

on("GET", "/admin/vehicles", (ctx) => {
  requireRole(ctx, ["admin"]);
  return ctx.state.vehicles.map((v) => toAdminVehicle(ctx.state, v));
});

on("POST", "/admin/vehicles", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, body, now } = ctx;
  const errors: Record<string, string> = {};

  const label = strField(body, "label").toUpperCase();
  if (label.length < 2 || label.length > 20) errors.label = "Enter a vehicle label.";

  const type = strField(body, "type") as VehicleType;
  if (!VEHICLE_TYPES.includes(type)) errors.type = "Choose a valid type.";

  const registrationNumber = strField(body, "registrationNumber")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{6,12}$/.test(registrationNumber)) {
    errors.registrationNumber = "Enter a valid registration number.";
  }

  const homeBase = strField(body, "homeBase");
  if (!homeBase) errors.homeBase = "Enter the base station or hospital.";
  assertValid(errors);

  if (
    state.vehicles.some(
      (v) => v.label === label || v.registrationNumber === registrationNumber
    )
  ) {
    fail(409, "VEHICLE_EXISTS", "That label or registration is already registered.");
  }

  // The new vehicle waits at the destination of the same name, or at a default spot
  const base =
    MOCK_DESTINATIONS.find((d) => d.name === homeBase)?.location ?? mockGeocode(homeBase);

  const vehicle: MockVehicle = {
    id: `VEH-${String(state.counters.vehicle++).padStart(3, "0")}`,
    label,
    type,
    registrationNumber,
    homeBase,
    base,
    driverId: null,
    status: "offline",
    retired: false,
  };
  state.vehicles.push(vehicle);
  addAudit(state, admin.name, "registered vehicle", label, now);

  return new Reply(201, toAdminVehicle(state, vehicle));
});

const BUSY = ["dispatched", "en_route", "arrived"];

on("PATCH", "/admin/vehicles/:id", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, body, now } = ctx;
  const v = state.vehicles.find((x) => x.id === ctx.params[0]);
  if (!v) fail(404, "NOT_FOUND", "That vehicle could not be found.");

  if (BUSY.includes(v.status)) {
    fail(409, "VEHICLE_BUSY", "This vehicle is on an active emergency.");
  }

  if ("driverId" in body) {
    const driverId = body.driverId;

    if (driverId === null) {
      v.driverId = null;
      v.status = "offline";
      addAudit(state, admin.name, "removed the driver from", v.label, now);
    } else if (typeof driverId === "string") {
      const driver = state.users.find((u) => u.id === driverId);
      const taken = state.vehicles.some((x) => x.driverId === driverId && x.id !== v.id);

      if (!driver || driver.role !== "driver" || !isLive(driver)) {
        fail(400, "VALIDATION", "Choose a verified, active driver.");
      }
      if (taken) fail(409, "DRIVER_ASSIGNED", "That driver already has a vehicle.");

      if (v.driverId !== driverId) {
        v.driverId = driverId;
        // The new driver has to go on duty themselves
        v.status = "offline";
        addAudit(state, admin.name, `assigned ${driver.name} to`, v.label, now);
      }
    } else {
      fail(400, "VALIDATION", "The driver is not valid.");
    }
  }

  if (typeof body.retired === "boolean" && body.retired !== v.retired) {
    v.retired = body.retired;
    if (v.retired) {
      v.driverId = null;
      v.status = "offline";
    }
    addAudit(state, admin.name, v.retired ? "retired vehicle" : "restored vehicle", v.label, now);
  }

  return noContent();
});

on("GET", "/admin/drivers/available", (ctx) => {
  requireRole(ctx, ["admin"]);
  const { state } = ctx;
  const assigned = new Set(state.vehicles.map((v) => v.driverId).filter(hasText));

  return state.users
    .filter((u) => u.role === "driver" && isLive(u) && !assigned.has(u.id))
    .map((u) => ({ id: u.id, name: u.name }));
});

/* Signals */

on("GET", "/admin/signals", (ctx) => {
  requireRole(ctx, ["admin"]);
  return ctx.state.signals.map((s) => toAdminSignal(ctx.state, s, ctx.now));
});

on("POST", "/admin/signals", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, body, now } = ctx;
  const errors: Record<string, string> = {};

  const name = strField(body, "name");
  if (name.length < 3 || name.length > 120) errors.name = "Enter the junction name.";

  const controllerId = strField(body, "controllerId");
  if (!controllerId || controllerId.length > 40) errors.controllerId = "Enter the controller ID.";

  const loc = isRecord(body.location) ? body.location : {};
  const point = validPoint(loc.lat, loc.lng);
  if (!point) errors.location = "The coordinates are not valid.";
  assertValid(errors);

  if (state.signals.some((s) => s.controllerId === controllerId)) {
    fail(409, "CONTROLLER_EXISTS", "That controller is already registered.");
  }

  const signal: MockSignal = {
    id: `S-${state.counters.signal++}`,
    name,
    controllerId,
    location: point as LatLng,
    enabled: true,
    faulty: false,
    lastHeartbeatAt: null,
  };
  state.signals.push(signal);
  addAudit(state, admin.name, "added signal", name, now);

  return new Reply(201, toAdminSignal(state, signal, now));
});

on("PATCH", "/admin/signals/:id", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, now } = ctx;
  const s = state.signals.find((x) => x.id === ctx.params[0]);
  if (!s) fail(404, "NOT_FOUND", "That signal could not be found.");

  if (typeof ctx.body.enabled !== "boolean") {
    fail(400, "VALIDATION", "Say whether the signal is enabled.");
  }

  const st = signalState(state, s, now).status;
  if (st === "priority" || st === "pending") {
    fail(409, "SIGNAL_IN_USE", "This signal is part of an active emergency route.");
  }

  s.enabled = ctx.body.enabled;
  addAudit(state, admin.name, s.enabled ? "enabled signal" : "disabled signal", s.name, now);
  return noContent();
});

on("GET", "/admin/signal-settings", (ctx) => {
  requireRole(ctx, ["admin"]);
  return { bufferSeconds: ctx.state.bufferSeconds };
});

on("PUT", "/admin/signal-settings", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const seconds = ctx.body.bufferSeconds;

  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 20 || seconds > 180) {
    fail(400, "VALIDATION", "The buffer must be a whole number between 20 and 180 seconds.");
  }

  addAudit(
    ctx.state,
    admin.name,
    "changed the priority buffer",
    `${ctx.state.bufferSeconds}s to ${seconds}s`,
    ctx.now
  );
  ctx.state.bufferSeconds = seconds;
  return noContent();
});

on("GET", "/admin/signal-options", (ctx) => {
  requireRole(ctx, ["admin"]);
  return ctx.state.signals.map((s) => ({ id: s.id, name: s.name }));
});

/* Cameras */

on("GET", "/admin/cameras", (ctx) => {
  requireRole(ctx, ["admin"]);
  return ctx.state.cameras.map((c) => toAdminCamera(ctx.state, c));
});

on("POST", "/admin/cameras", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const { state, body, now } = ctx;
  const errors: Record<string, string> = {};

  const name = strField(body, "name");
  if (name.length < 3 || name.length > 80) errors.name = "Enter a camera name.";

  const signalId = strField(body, "signalId");
  if (!state.signals.some((s) => s.id === signalId)) errors.signalId = "Choose a signal.";

  const direction = strField(body, "direction") as MockDirection;
  if (!DIRECTIONS.includes(direction)) errors.direction = "Choose a direction.";

  if (!/^(rtsp|rtsps|http|https):\/\/\S+$/i.test(strField(body, "streamUrl"))) {
    errors.streamUrl = "Enter an rtsp:// or http(s):// address.";
  }
  assertValid(errors);

  if (state.cameras.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    fail(409, "CAMERA_EXISTS", "A camera with that name already exists.");
  }

  // The stream address is checked and discarded; the mock never stores it
  const camera: MockCamera = {
    id: `CAM-${state.counters.camera++}`,
    name,
    signalId,
    direction,
    status: "online",
    detectionEnabled: true,
    lastDetectionAt: null,
  };
  state.cameras.push(camera);
  addAudit(state, admin.name, "connected camera", name, now);

  return new Reply(201, toAdminCamera(state, camera));
});

on("PATCH", "/admin/cameras/:id", (ctx) => {
  const admin = requireRole(ctx, ["admin"]);
  const c = ctx.state.cameras.find((x) => x.id === ctx.params[0]);
  if (!c) fail(404, "NOT_FOUND", "That camera could not be found.");

  if (typeof ctx.body.detectionEnabled !== "boolean") {
    fail(400, "VALIDATION", "Say whether detection is enabled.");
  }

  c.detectionEnabled = ctx.body.detectionEnabled;
  addAudit(
    ctx.state,
    admin.name,
    c.detectionEnabled ? "resumed detection on" : "paused detection on",
    c.name,
    ctx.now
  );
  return noContent();
});

on("POST", "/admin/cameras/:id/test", async (ctx) => {
  requireRole(ctx, ["admin"]);
  const c = ctx.state.cameras.find((x) => x.id === ctx.params[0]);
  if (!c) fail(404, "NOT_FOUND", "That camera could not be found.");

  // Cameras take a moment to answer
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 700));

  if (c.status === "offline") return { ok: false, message: "No response from the camera." };
  if (c.status === "degraded") {
    return { ok: true, message: "Connected, but the frame rate is low." };
  }
  return { ok: true, message: "Connection successful." };
});

/* ---------- Analytics ---------- */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/**
 * Generated, not worked out from the mock emergencies: the same range gives
 * the same numbers all day. The 30-day report has one period with no data,
 * to show how the response-time chart draws a gap.
 */
function buildReport(state: State, range: Range, now: number) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const step = range === "90d" ? 7 : 1;
  const periods = Math.ceil(days / step);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rng = createRng(hashString(`report-${range}-${today.getTime()}`));

  const responseTimes: Array<{ label: string; avgSeconds: number | null }> = [];
  const signalPerformance: Array<{ label: string; onTime: number; late: number }> = [];

  let emergencies = 0;
  let weightedSeconds = 0;
  let weightedCount = 0;
  let cleared = 0;

  for (let i = 0; i < periods; i++) {
    const start = new Date(today.getTime() - (periods - 1 - i) * step * DAY_MS);
    const label = dayLabel(start);

    const count = Math.round((6 + rng() * 14) * step);
    const avg = Math.round(520 - (i / periods) * 70 + (rng() - 0.5) * 90);
    const gap = range === "30d" && i === 3;

    const signals = count * 3;
    const onTime = Math.round(signals * (0.9 + rng() * 0.09));

    emergencies += count;
    cleared += signals;

    if (!gap) {
      weightedSeconds += avg * count;
      weightedCount += count;
    }

    responseTimes.push({ label, avgSeconds: gap ? null : avg });
    signalPerformance.push({ label, onTime, late: signals - onTime });
  }

  return {
    summary: {
      totalEmergencies: emergencies,
      avgResponseSeconds: weightedCount > 0 ? Math.round(weightedSeconds / weightedCount) : null,
      signalsCleared: cleared,
      detectionAccuracyPct: Math.round((93 + rng() * 4) * 10) / 10,
    },
    responseTimes,
    signalPerformance,
    vehicleUsage: state.vehicles
      .filter((v) => !v.retired)
      .map((v) => ({
        label: v.label,
        dispatches: Math.round(((hashString(v.label) + days) % 9 + 3) * (days / 7)),
      })),
  };
}

function parseRange(raw: string | undefined): Range {
  if (!RANGES.includes(raw as Range)) fail(400, "VALIDATION", "Invalid date range.");
  return raw as Range;
}

/** Text that a spreadsheet could read as a formula is defused */
function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

on("GET", "/analytics/report", (ctx) => {
  requireRole(ctx, ["admin"]);
  return buildReport(ctx.state, parseRange(ctx.query.range), ctx.now);
});

on("GET", "/analytics/report/export", (ctx) => {
  requireRole(ctx, ["admin"]);
  const report = buildReport(ctx.state, parseRange(ctx.query.range), ctx.now);

  const lines = ["Period,Avg response (seconds),Signals on time,Signals late"];
  report.responseTimes.forEach((p, i) => {
    const s = report.signalPerformance[i];
    lines.push(
      [csvCell(p.label), p.avgSeconds === null ? "" : p.avgSeconds, s.onTime, s.late].join(",")
    );
  });
  lines.push("", "Vehicle,Dispatches");
  report.vehicleUsage.forEach((v) => lines.push(`${csvCell(v.label)},${v.dispatches}`));

  return new Reply(200, new Blob([lines.join("\r\n")], { type: "text/csv" }));
});

/* ==========================================================================
   The adapter
   ========================================================================== */

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

function wait(ms: number, config: InternalAxiosRequestConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const signal = config.signal;
    if (signal?.aborted) {
      reject(new axios.CanceledError(undefined, config));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new axios.CanceledError(undefined, config));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener?.("abort", onAbort);
  });
}

function parseBody(data: unknown): Record<string, unknown> {
  if (data === undefined || data === null || data === "") return {};

  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return isRecord(parsed) ? parsed : {};
    } catch {
      fail(400, "BAD_REQUEST", "The request body is not valid JSON.");
    }
  }
  return isRecord(data) ? data : {};
}

function parseQuery(params: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(params)) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) out[key] = String(value);
    }
  }
  return out;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return fail(400, "BAD_REQUEST", "The request path is not valid.");
  }
}

function respond(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown
): AxiosResponse {
  // Copied through JSON like a real server's reply, so shared objects cannot leak
  let body: unknown;
  if (typeof Blob !== "undefined" && data instanceof Blob) body = data;
  else if (data === undefined || typeof data === "string") body = data ?? "";
  else body = JSON.parse(JSON.stringify(data));

  return {
    data: body,
    status,
    statusText: STATUS_TEXT[status] ?? "OK",
    headers: {},
    config,
    request: {},
  };
}

function toAxiosError(config: InternalAxiosRequestConfig, err: unknown): unknown {
  if (axios.isCancel(err) || axios.isAxiosError(err)) return err;

  let status = 500;
  let body: Record<string, unknown> = {
    code: "SERVER_ERROR",
    message: "The mock server hit an unexpected error.",
  };

  if (err instanceof MockHttpError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else {
    console.error("[AETIS mock] Unexpected error:", err);
  }

  return new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    respond(config, status, body)
  );
}

export async function mockAdapter(
  config: InternalAxiosRequestConfig
): Promise<AxiosResponse> {
  const method = (config.method ?? "get").toUpperCase();
  const path = (config.url ?? "").split("?")[0].replace(/\/+$/, "") || "/";

  await wait(LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS), config);

  try {
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      fail(500, "SERVER_ERROR", "Injected failure for testing.");
    }

    const now = Date.now();
    const state = getState(now);
    advance(state, now);

    let params: string[] = [];
    const route = routes.find((r) => {
      if (r.method !== method) return false;
      const m = r.regex.exec(path);
      if (!m) return false;
      params = m.slice(1).map(decode);
      return true;
    });
    if (!route) fail(404, "NOT_FOUND", "No such endpoint in the mock API.");

    const result = await route.handler({
      state,
      now,
      user: currentUser(state),
      params,
      query: parseQuery(config.params),
      body: parseBody(config.data),
    });

    const reply = result instanceof Reply ? result : new Reply(200, result);
    return respond(config, reply.status, reply.data);
  } catch (err) {
    throw toAxiosError(config, err);
  }
}

/* ==========================================================================
   Console helpers (development only, since this module only loads in mock mode)
   ========================================================================== */

interface MockDevTools {
  /** Starts a dispatched trip, as if the driver pressed "Start trip" */
  startTrip(emergencyId?: string): string | null;
  /** Makes the next requests fail with a server error */
  failNext(count?: number): void;
  /** Throws away all mock data and signs out */
  reset(): void;
}

const devTools: MockDevTools = {
  startTrip(emergencyId) {
    if (!current) return null;
    const now = Date.now();

    for (const trip of current.trips.values()) {
      if (trip.startedAt !== null) continue;
      if (emergencyId && trip.emergencyId !== emergencyId) continue;

      startTrip(current, trip, now);
      return trip.emergencyId;
    }
    return null;
  },
  failNext(count = 1) {
    failuresLeft = Math.max(0, Math.floor(count));
  },
  reset() {
    current = null;
    failuresLeft = 0;
    writeSession(null);
  },
};

if (typeof window !== "undefined") {
  (window as unknown as { __aetisMock?: MockDevTools }).__aetisMock = devTools;
}