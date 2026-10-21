import { useEffect, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  /** null when the device did not report a speed */
  speedKmh: number | null;
  /** Degrees clockwise from north, or null */
  heading: number | null;
  /** Uncertainty radius in metres, or null */
  accuracy: number | null;
  /** When the device took this fix (epoch ms) */
  timestamp: number;
}

export interface UseGeolocationOptions {
  /** Watching runs only while true. Default true. */
  enabled?: boolean;
  /** Uses more battery, which a moving vehicle needs. Default true. */
  highAccuracy?: boolean;
}

export interface UseGeolocationResult {
  position: GeoPosition | null;
  /**
   * A lowercase fragment written to follow "Location unavailable: ", e.g.
   * "permission was denied". Null when the position is being received.
   */
  error: string | null;
}

const INITIAL: UseGeolocationResult = { position: null, error: null };

const MAXIMUM_AGE_MS = 5_000;
const TIMEOUT_MS = 20_000;

const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function toPosition(pos: GeolocationPosition): GeoPosition | null {
  const { latitude, longitude, speed, heading, accuracy } = pos.coords;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const metresPerSecond = finiteOrNull(speed);

  return {
    lat: latitude,
    lng: longitude,
    speedKmh:
      metresPerSecond !== null && metresPerSecond >= 0
        ? metresPerSecond * 3.6
        : null,
    heading: finiteOrNull(heading),
    accuracy: finiteOrNull(accuracy),
    timestamp: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
  };
}

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "permission was denied";
    case err.POSITION_UNAVAILABLE:
      return "the device could not work out its position";
    case err.TIMEOUT:
      return "waiting for a position took too long";
    default:
      return "the position could not be read";
  }
}

/**
 * Follows the device's GPS while `enabled`. Turning it off stops the watch
 * and forgets the last position, so an old fix is never reused later.
 *
 * Browsers only allow location on https pages (localhost counts as secure).
 * If permission is denied and then allowed again in the browser's settings,
 * watching resumes by itself.
 */
export function useGeolocation(
  options: UseGeolocationOptions = {}
): UseGeolocationResult {
  const { enabled = true, highAccuracy = true } = options;

  const [state, setState] = useState<UseGeolocationResult>(INITIAL);
  // Bumped when the permission changes, to restart the watch
  const [attempt, setAttempt] = useState(0);

  /* Restart when the user changes the permission outside the page */
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => setAttempt((n) => n + 1);

    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {
        /* not supported for geolocation on this browser */
      });

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [enabled]);

  /* The watch itself */
  useEffect(() => {
    if (!enabled) {
      // Same object each time, so this does nothing if already cleared
      setState(INITIAL);
      return;
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ position: null, error: "the device does not support location" });
      return;
    }
    if (window.isSecureContext === false) {
      setState({
        position: null,
        error: "the page is not on a secure (https) connection",
      });
      return;
    }

    setState(INITIAL);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const position = toPosition(pos);
        if (position) setState({ position, error: null });
      },
      (err) => {
        setState((prev) => ({
          // A denied permission means the old position can no longer be trusted
          position: err.code === err.PERMISSION_DENIED ? null : prev.position,
          error: describeError(err),
        }));
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: MAXIMUM_AGE_MS,
        timeout: TIMEOUT_MS,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, highAccuracy, attempt]);

  return state;
}