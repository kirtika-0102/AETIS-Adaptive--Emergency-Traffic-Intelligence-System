import type { LatLng } from "../../types/route.types";

/* ==========================================================================
   Simulation helpers for the mock API. Nothing here knows about HTTP.

   A trip is a fixed route plus a start time. Where the vehicle is, how long
   until it arrives and which signals are open are all worked out from the
   clock when asked, so no timers run in the background.
   ========================================================================== */

/* ---------- Constants ---------- */

/** About 50 km/h. Routes are a few kilometres, so trips last a few minutes. */
export const TRIP_SPEED_MPS = 13.9;
export const TRIP_SPEED_KMH = Math.round(TRIP_SPEED_MPS * 3.6);

/** Signals are first flagged "pending" this long before their priority window opens */
export const PENDING_LEAD_MS = 90_000;
/** A signal stays in priority this long after the vehicle is due, until the camera confirms it passed */
export const PASS_HOLD_MS = 6_000;

const MAX_DETOUR_METERS = 1_100;
const MAX_SIGNALS_PER_LEG = 4;
/** Real roads are longer than straight lines */
const ROUTE_FACTOR = 1.25;

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

/* ---------- Small utilities ---------- */

const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Same text always gives the same number (FNV-1a) */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded random numbers (mulberry32), so generated data is stable between reloads */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function estimateTravelSeconds(from: LatLng, to: LatLng): number {
  return Math.round((haversineMeters(from, to) * ROUTE_FACTOR) / TRIP_SPEED_MPS);
}

/* ---------- Route planning ---------- */

export interface SignalSite {
  id: string;
  location: LatLng;
}

export interface RoutePass {
  signalId: string;
  /** Distance along the whole route at which the signal is reached */
  atMeters: number;
}

export interface TripPlan {
  points: LatLng[];
  /** Distance along the route at each point */
  cumulative: number[];
  totalMeters: number;
  /** Index of the scene in `points` (the end of the first leg) */
  sceneIndex: number;
  hasDestination: boolean;
  passes: RoutePass[];
  destinationName: string;
}

export interface TripDestination {
  name: string;
  location: LatLng;
}

function toXY(p: LatLng, origin: LatLng) {
  return {
    x:
      (p.lng - origin.lng) *
      METERS_PER_DEG_LNG_AT_EQUATOR *
      Math.cos(rad(origin.lat)),
    y: (p.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

/**
 * Signals worth routing through between two points: those lying roughly along
 * the way, closest to the line first, then put in travelling order.
 */
function planLeg(
  from: LatLng,
  to: LatLng,
  sites: SignalSite[],
  exclude: Set<string>
): SignalSite[] {
  const end = toXY(to, from);
  const lenSq = end.x * end.x + end.y * end.y;
  if (lenSq < 1) return [];
  const len = Math.sqrt(lenSq);

  const near: Array<{ site: SignalSite; t: number; detour: number }> = [];

  for (const site of sites) {
    if (exclude.has(site.id)) continue;

    const p = toXY(site.location, from);
    const t = (p.x * end.x + p.y * end.y) / lenSq;
    const detour = Math.abs(p.x * end.y - p.y * end.x) / len;

    if (t > 0.05 && t < 0.95 && detour <= MAX_DETOUR_METERS) {
      near.push({ site, t, detour });
    }
  }

  return near
    .sort((a, b) => a.detour - b.detour || (a.site.id < b.site.id ? -1 : 1))
    .slice(0, MAX_SIGNALS_PER_LEG)
    .sort((a, b) => a.t - b.t)
    .map((n) => n.site);
}

/**
 * origin -> scene, and for medical emergencies on to the destination. A
 * signal is used once per trip, so the way back goes through different ones.
 */
export function buildTripPlan(
  origin: LatLng,
  scene: LatLng,
  destination: TripDestination | null,
  sceneName: string,
  sites: SignalSite[]
): TripPlan {
  const points: LatLng[] = [origin];
  const signalAt: Array<{ signalId: string; index: number }> = [];
  const used = new Set<string>();

  const addLeg = (from: LatLng, to: LatLng) => {
    for (const site of planLeg(from, to, sites, used)) {
      used.add(site.id);
      points.push(site.location);
      signalAt.push({ signalId: site.id, index: points.length - 1 });
    }
    points.push(to);
  };

  addLeg(origin, scene);
  const sceneIndex = points.length - 1;
  if (destination) addLeg(scene, destination.location);

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(points[i - 1], points[i]));
  }

  return {
    points,
    cumulative,
    totalMeters: cumulative[cumulative.length - 1],
    sceneIndex,
    hasDestination: destination !== null,
    passes: signalAt.map((s) => ({
      signalId: s.signalId,
      atMeters: cumulative[s.index],
    })),
    destinationName: destination ? destination.name : sceneName,
  };
}

export function positionAt(plan: TripPlan, meters: number): LatLng {
  const { points, cumulative, totalMeters } = plan;
  const d = Math.min(Math.max(meters, 0), totalMeters);
  if (d <= 0 || points.length < 2) return points[0];

  for (let i = 1; i < points.length; i++) {
    if (d <= cumulative[i]) {
      const a = points[i - 1];
      const b = points[i];
      const span = cumulative[i] - cumulative[i - 1];
      const f = span > 0 ? (d - cumulative[i - 1]) / span : 1;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
  }
  return points[points.length - 1];
}

/** The vehicle's position followed by the rest of the route */
export function remainingRoute(plan: TripPlan, meters: number): LatLng[] {
  const d = Math.min(Math.max(meters, 0), plan.totalMeters);
  const here = positionAt(plan, d);
  const rest = plan.points.filter((_, i) => plan.cumulative[i] > d);

  return rest.length > 0
    ? [here, ...rest]
    : [here, plan.points[plan.points.length - 1]];
}

export function splitLegs(plan: TripPlan): {
  toScene: LatLng[];
  toDestination: LatLng[] | null;
} {
  return {
    toScene: plan.points.slice(0, plan.sceneIndex + 1),
    toDestination: plan.hasDestination ? plan.points.slice(plan.sceneIndex) : null,
  };
}

/* ---------- Trips ---------- */

export interface Trip {
  emergencyId: string;
  vehicleId: string;
  plan: TripPlan;
  dispatchedAt: number;
  /** Null until the driver starts the trip */
  startedAt: number | null;
  /** Set when the driver confirms arrival */
  endedAt: number | null;
  /** Signals the vehicle has already passed and had recorded */
  passed: Set<string>;
}

export interface TripView {
  distanceMeters: number;
  location: LatLng;
  speedKmh: number;
  etaSeconds: number;
  /** Reached the end of the route and waiting for the driver to confirm */
  atEnd: boolean;
}

export function computeTripView(
  plan: TripPlan,
  startedAt: number | null,
  now: number
): TripView {
  const total = plan.totalMeters;

  if (startedAt === null) {
    return {
      distanceMeters: 0,
      location: plan.points[0],
      speedKmh: 0,
      etaSeconds: total / TRIP_SPEED_MPS,
      atEnd: false,
    };
  }

  const traveled = Math.min(
    total,
    Math.max(0, ((now - startedAt) / 1000) * TRIP_SPEED_MPS)
  );
  const atEnd = traveled >= total;
  // A small, repeatable wobble so the speed reading looks alive
  const wobble = ((Math.floor(now / 4000) % 5) - 2) * 2;

  return {
    distanceMeters: traveled,
    location: positionAt(plan, traveled),
    speedKmh: atEnd ? 0 : TRIP_SPEED_KMH + wobble,
    etaSeconds: (total - traveled) / TRIP_SPEED_MPS,
    atEnd,
  };
}

/** When a started trip reaches a point `atMeters` along its route */
export function passTimeMs(startedAt: number, atMeters: number): number {
  return startedAt + (atMeters / TRIP_SPEED_MPS) * 1000;
}

export type WindowState = "normal" | "pending" | "priority";

/**
 * Signals open `bufferSeconds` BEFORE the vehicle is due and are released
 * shortly after it passes. This is one reading of the "+60 seconds" in the
 * project brief (see the note at the end of the mock files).
 */
export function signalWindow(
  passAtMs: number,
  bufferSeconds: number,
  now: number
): WindowState {
  const openAt = passAtMs - bufferSeconds * 1000;

  if (now >= openAt && now <= passAtMs + PASS_HOLD_MS) return "priority";
  if (now >= openAt - PENDING_LEAD_MS && now < openAt) return "pending";
  return "normal";
}