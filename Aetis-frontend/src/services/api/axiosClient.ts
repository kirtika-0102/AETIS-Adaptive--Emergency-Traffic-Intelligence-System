import axios from "axios";
import type { AxiosRequestConfig } from "axios";

import type { PaginatedResponse } from "../../types/api.types";
import type { LatLng } from "../../types/route.types";

declare module "axios" {
  // The type parameter must match axios's own declaration for the merge to work
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  export interface AxiosRequestConfig<D = any> {
    /**
     * When true, a 401 does not trigger the global sign-out handler. Used by
     * the login request and the startup session check, where a 401 is an
     * expected answer and not an expired session.
     */
    skipAuthRedirect?: boolean;
  }
}

/* ==========================================================================
   Configuration
   ========================================================================== */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

/** Falls back to "/api", which the Vite dev proxy can forward to the backend */
const BASE_URL = (
  typeof rawBaseUrl === "string" && rawBaseUrl.trim() ? rawBaseUrl.trim() : "/api"
).replace(/\/+$/, "");

/**
 * Mock data is for development only. The DEV check means a production build
 * can never serve fake emergencies, even if the variable is left on.
 */
export const USE_MOCK_API: boolean =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === "true";

const TIMEOUT_MS = 15_000;

/* ==========================================================================
   Errors
   ========================================================================== */

/**
 * Every failed request ends up as one of these, so pages and forms never deal
 * with raw axios errors. `code` is a stable machine-readable value (for
 * example "INVALID_CREDENTIALS"); `message` is safe to show to a user.
 */
export class ApiError extends Error {
  readonly code: string;
  /** HTTP status, or null when no response arrived */
  readonly status: number | null;
  /** Field-level problems from the server, if it sent any */
  readonly details?: unknown;

  constructor(init: {
    code: string;
    message: string;
    status?: number | null;
    details?: unknown;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status ?? null;
    this.details = init.details;
  }
}

const DEFAULT_MESSAGES: Record<string, string> = {
  NETWORK: "Could not reach AETIS. Check your connection and try again.",
  TIMEOUT: "The server took too long to respond. Please try again.",
  UNAUTHORIZED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "That item could not be found.",
  CONFLICT: "That conflicts with the current state. Refresh and try again.",
  VALIDATION: "Some of the details are not valid.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a moment and try again.",
  SERVER_ERROR: "AETIS had a problem handling that. Please try again.",
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

function codeForStatus(status: number): string {
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "TOO_MANY_ATTEMPTS";
  if (status >= 500) return "SERVER_ERROR";
  return "HTTP_ERROR";
}

/** Server error codes look like INVALID_CREDENTIALS; anything else is ignored */
const CODE_PATTERN = /^[A-Z0-9_]{2,64}$/;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function toApiError(error: unknown): Promise<ApiError> {
  if (error instanceof ApiError) return error;

  if (axios.isCancel(error)) {
    return new ApiError({ code: "CANCELLED", message: "The request was cancelled." });
  }

  if (!axios.isAxiosError(error)) {
    return new ApiError({ code: "UNKNOWN", message: FALLBACK_MESSAGE });
  }

  const response = error.response;

  if (!response) {
    const timedOut = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
    const code = timedOut ? "TIMEOUT" : "NETWORK";
    return new ApiError({ code, message: DEFAULT_MESSAGES[code] });
  }

  // A download that failed arrives as a Blob; read the JSON error out of it
  let body: unknown = response.data;
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    try {
      body = JSON.parse(await body.text());
    } catch {
      body = undefined;
    }
  }

  const status = response.status;
  const fields = isRecord(body) ? body : null;

  const code =
    fields && typeof fields.code === "string" && CODE_PATTERN.test(fields.code)
      ? fields.code
      : codeForStatus(status);

  // Server messages are shown only for client errors. A 5xx message can
  // contain internals, so those always use the generic wording.
  const serverMessage =
    status < 500 && fields && typeof fields.message === "string"
      ? fields.message.trim().slice(0, 200)
      : "";

  return new ApiError({
    code,
    status,
    message: serverMessage || DEFAULT_MESSAGES[code] || FALLBACK_MESSAGE,
    details: fields?.details,
  });
}

/* ==========================================================================
   Client
   ========================================================================== */

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  // The session lives in an HttpOnly cookie, so JavaScript never sees the
  // token. The browser must be told to send it.
  withCredentials: true,
  // CSRF: matches Spring Security's CookieCsrfTokenRepository defaults
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  withXSRFToken: true,
  headers: { Accept: "application/json" },
});

/**
 * Only paths on our own API are allowed. An absolute URL would make axios
 * ignore the base URL and send the session cookie to another site.
 */
apiClient.interceptors.request.use((config) => {
  const url = config.url ?? "";
  if (!url.startsWith("/") || url.startsWith("//")) {
    throw new ApiError({ code: "BAD_REQUEST", message: "Invalid request path." });
  }
  return config;
});

let unauthorizedHandler: (() => void) | null = null;

/**
 * AuthContext registers a function here that signs the user out locally.
 * It lives outside React so this file never imports the store.
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const apiError = await toApiError(error);

    const skip = axios.isAxiosError(error) && error.config?.skipAuthRedirect === true;
    if (apiError.status === 401 && !skip) {
      try {
        unauthorizedHandler?.();
      } catch {
        /* a failing handler must not hide the original error */
      }
    }

    throw apiError;
  }
);

if (USE_MOCK_API) {
  console.info("[AETIS] Mock API is active. No requests go to a server.");

  // Loaded on first use, so the mock code stays out of the main bundle
  apiClient.defaults.adapter = async (config) => {
    const { mockAdapter } = await import("../mock/mockAdapter");
    return mockAdapter(config);
  };
}

/** Per-request options. The base URL cannot be overridden. */
export type RequestOptions = Omit<
  AxiosRequestConfig,
  "url" | "method" | "data" | "baseURL"
>;

/** Thin wrappers that return the response body directly */
export const http = {
  get: async <T = unknown>(url: string, options?: RequestOptions): Promise<T> =>
    (await apiClient.get<T>(url, options)).data,

  post: async <T = unknown>(
    url: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> => (await apiClient.post<T>(url, body, options)).data,

  put: async <T = unknown>(
    url: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> => (await apiClient.put<T>(url, body, options)).data,

  patch: async <T = unknown>(
    url: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> => (await apiClient.patch<T>(url, body, options)).data,
};

/* ==========================================================================
   Shared helpers for the api files
   ========================================================================== */

/** Ids are placed in URL paths, so they are always encoded */
export const pathSegment = (id: string): string => encodeURIComponent(id);

/** Turns a 404 into null, for "the thing may legitimately not exist" calls */
export async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n =
    typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/* ---------- Reading server responses safely ---------- */

export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

export const finiteNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Ids are strings everywhere in the interface. A whole-number id is converted,
 * but very large ids (past 2^53) lose precision in JSON numbers, so the
 * backend should send ids as strings.
 */
export const idOf = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isSafeInteger(v)) return String(v);
  return "";
};

/**
 * A response that does not match the agreed shape is an error, not an empty
 * result. Showing "no emergencies" because of a backend bug would be worse
 * than showing that loading failed.
 */
export function badResponse(what: string): never {
  throw new ApiError({
    code: "BAD_RESPONSE",
    message: `The server sent an unexpected ${what}.`,
  });
}

export function expectRecord(raw: unknown, what: string): Record<string, unknown> {
  if (!isRecord(raw)) badResponse(what);
  return raw;
}

export function expectArray(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) badResponse(what);
  return raw;
}

export function expectPage<T>(
  raw: unknown,
  what: string,
  mapItem: (item: unknown) => T
): PaginatedResponse<T> {
  const r = expectRecord(raw, what);
  const data = expectArray(r.data, what).map(mapItem);

  const total = finiteNumber(r.total);
  if (total === undefined) badResponse(what);

  return {
    data,
    total,
    page: finiteNumber(r.page) ?? 1,
    pageSize: finiteNumber(r.pageSize) ?? data.length,
  };
}

/* ---------- Coordinates and times ---------- */

/**
 * Accepts { lat, lng }, or an array in GeoJSON order [longitude, latitude].
 * Returns null for anything out of range. Arrays must be [lng, lat]: a
 * [lat, lng] array would pass the range check and place the point in the
 * wrong part of the world.
 */
export function parseLatLng(raw: unknown): LatLng | null {
  let lat: unknown;
  let lng: unknown;

  if (Array.isArray(raw)) {
    lng = raw[0];
    lat = raw[1];
  } else if (isRecord(raw)) {
    lat = raw.lat;
    lng = raw.lng;
  } else {
    return null;
  }

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export function parseLatLngList(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    const point = parseLatLng(p);
    return point ? [point] : [];
  });
}

/** Epoch milliseconds from a number, or from an ISO date string */
export function toEpochMs(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}