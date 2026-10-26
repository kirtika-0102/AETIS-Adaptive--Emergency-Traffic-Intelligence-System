import type { LatLng } from "../types/route.types";

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * True only for an object with a real latitude and longitude. NaN, strings
 * and out-of-range numbers all fail, so a bad record can never reach the map.
 */
export function isValidLatLng(p: unknown): p is LatLng {
  if (typeof p !== "object" || p === null) return false;

  const { lat, lng } = p as { lat?: unknown; lng?: unknown };

  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Leaflet wants [latitude, longitude] */
export const toLatLngTuple = (p: LatLng): [number, number] => [p.lat, p.lng];

/** Straight-line distance over the Earth's surface */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance left along a route, measured from the point of the route nearest
 * to `from`. Null when the route has fewer than 2 valid points.
 */
export function routeRemainingMeters(route: LatLng[], from: LatLng): number | null {
  if (!isValidLatLng(from)) return null;

  const points = route.filter(isValidLatLng);
  if (points.length < 2) return null;

  // Flat approximation around `from`, accurate enough over a city
  const kx = METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos(rad(from.lat));
  const toXY = (p: LatLng) => ({
    x: (p.lng - from.lng) * kx,
    y: (p.lat - from.lat) * METERS_PER_DEG_LAT,
  });

  let best = { index: 0, t: 0, dist: Number.POSITIVE_INFINITY };

  for (let i = 0; i < points.length - 1; i++) {
    const a = toXY(points[i]);
    const b = toXY(points[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    // Position on this segment closest to the vehicle (the origin)
    const t =
      lenSq > 0 ? Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lenSq)) : 0;
    const dist = Math.hypot(a.x + t * dx, a.y + t * dy);

    if (dist < best.dist) best = { index: i, t, dist };
  }

  let remaining =
    (1 - best.t) * haversineMeters(points[best.index], points[best.index + 1]);

  for (let i = best.index + 1; i < points.length - 1; i++) {
    remaining += haversineMeters(points[i], points[i + 1]);
  }

  return remaining;
}