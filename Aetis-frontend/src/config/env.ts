/**
 * Settings from the .env files. Everything starting with VITE_ is bundled
 * into the site and readable by anyone, so never put a secret in an env file.
 *
 * The API and WebSocket addresses are read where they are used
 * (services/api/axiosClient.ts and services/websocket/socketClient.ts).
 */

function numberInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  // An empty value must not become 0, which is a valid coordinate
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export const env = {
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
  mapDefaultLat: numberInRange(import.meta.env.VITE_MAP_DEFAULT_LAT, 28.66, -90, 90),
  mapDefaultLng: numberInRange(import.meta.env.VITE_MAP_DEFAULT_LNG, 77.38, -180, 180),
  /** Only needed if the map tiles come from a provider that requires a key */
  mapApiKey: (import.meta.env.VITE_MAP_API_KEY ?? "").trim(),
} as const;