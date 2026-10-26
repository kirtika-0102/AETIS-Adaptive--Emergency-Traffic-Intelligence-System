import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MapPinned, Play, Wifi, WifiOff } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Loader from "../../components/common/Loader";
import SeverityBadge from "../../components/emergency/SeverityBadge";
import SignalOnRouteList from "../../components/signals/SignalOnRouteList";
import ETAPanel from "../../components/tracking/ETAPanel";
import LiveMap from "../../components/tracking/LiveMap";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLiveTracking } from "../../hooks/useLiveTracking";
import { useSignalStatus } from "../../hooks/useSignalStatus";
import { ROUTES, buildDriverCompletePath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import { trackingApi } from "../../services/api/trackingApi";
import type { Emergency } from "../../types/emergency.types";
import { EMERGENCY_TYPE_LABELS } from "../../utils/constants";

/** How often the driver's GPS fix is pushed to the backend */
const SEND_INTERVAL_MS = 3_000;

function DriverNavigation() {
  const { emergencyId } = useParams<{ emergencyId: string }>();
  const navigate = useNavigate();

  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GPS runs only once the trip has started (status en_route)
  const tripActive = emergency?.status === "en_route";

  const { position, error: gpsError } = useGeolocation({ enabled: tripActive });
  const { evs, isConnected } = useLiveTracking();
  const { signals, isLoading: signalsLoading } = useSignalStatus(emergencyId);

  const ev = useMemo(
    () => evs.find((e) => e.emergencyId === emergencyId) ?? null,
    [evs, emergencyId]
  );

  /* ---------- Load the emergency ---------- */
  useEffect(() => {
    document.title = "Navigation | AETIS";
    if (!emergencyId) return;

    let cancelled = false;

    emergencyApi
      .getEmergencyById(emergencyId)
      .then((e) => {
        if (!cancelled) setEmergency(e);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this assignment.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [emergencyId]);

  /* ---------- Push GPS to the backend on an interval ---------- */
  const latestPosition = useRef(position);
  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  useEffect(() => {
    if (!tripActive || !emergencyId) return;

    const id = window.setInterval(() => {
      const p = latestPosition.current;
      if (!p) return;

      trackingApi
        .sendLocation(emergencyId, {
          lat: p.lat,
          lng: p.lng,
          speedKmh: p.speedKmh ?? 0,
          heading: p.heading ?? null,
          timestamp: p.timestamp,
        })
        .catch(() => {
          /* a dropped fix is fine; the next one follows in seconds */
        });
    }, SEND_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [tripActive, emergencyId]);

  /* ---------- Keep the screen awake during a trip (best effort) ---------- */
  useEffect(() => {
    if (!tripActive || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let released = false;

    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (released) l.release().catch(() => undefined);
        else lock = l;
      })
      .catch(() => undefined);

    return () => {
      released = true;
      lock?.release().catch(() => undefined);
    };
  }, [tripActive]);

  /* ---------- Status transitions ---------- */
  const updateStatus = async (status: "en_route" | "arrived") => {
    if (!emergencyId || !emergency) return;

    setIsUpdating(true);
    setError(null);
    try {
      await emergencyApi.updateStatus(emergencyId, status);
      setEmergency({ ...emergency, status });

      if (status === "arrived") {
        navigate(buildDriverCompletePath(emergencyId));
      }
    } catch {
      setError("Could not update the status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) return <Loader />;

  if (!emergency) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-xl">Assignment not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error ?? "This assignment does not exist or was removed."}
        </p>
        <Link
          to={ROUTES.DRIVER.HOME}
          className="mt-6 inline-block text-sm font-semibold text-[var(--action-accent)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const notStarted = emergency.status === "dispatched";
  const finished =
    emergency.status === "completed" || emergency.status === "cancelled";

  return (
    <div className="space-y-4">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
            {emergency.id}
          </p>
          <h1 className="text-xl text-[var(--text-primary)] sm:text-2xl">
            {EMERGENCY_TYPE_LABELS[emergency.type]}
          </h1>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
            <MapPinned size={16} aria-hidden className="mt-0.5 shrink-0" />
            {emergency.location.address}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SeverityBadge severity={emergency.severity} />
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isConnected
                ? "bg-[var(--color-olive-50)] text-[var(--color-olive-700)]"
                : "bg-[var(--color-sand-200)] text-[var(--text-secondary)]"
            }`}
          >
            {isConnected ? (
              <Wifi size={12} aria-hidden />
            ) : (
              <WifiOff size={12} aria-hidden />
            )}
            {isConnected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {tripActive && gpsError && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          Location unavailable: {gpsError}. Allow location access so signals can
          be cleared ahead of you.
        </div>
      )}

      {/* ---------- Map ---------- */}
      <section className="card overflow-hidden" aria-label="Route map">
        <LiveMap
          evs={ev ? [ev] : []}
          emergencies={[emergency]}
          signals={signals}
          selectedId={ev?.emergencyId ?? null}
          route={ev?.route ?? null}
          className="h-[360px] sm:h-[460px]"
        />
      </section>

      {/* ---------- ETA + signals ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ETAPanel ev={ev} />

        <section className="card" aria-label="Signals on route">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Signals ahead</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Cleared automatically as you approach
            </p>
          </div>
          <div className="max-h-[220px] overflow-y-auto p-3 scrollbar-thin">
            <SignalOnRouteList signals={signals} isLoading={signalsLoading} />
          </div>
        </section>
      </div>

      {/* ---------- Primary action ---------- */}
      {!finished && (
        <div className="sticky bottom-4 z-10">
          {notStarted ? (
            <button
              type="button"
              onClick={() => updateStatus("en_route")}
              disabled={isUpdating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--action-accent)] px-6 py-4 text-base font-semibold text-white shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--action-accent-hover)] disabled:opacity-60"
            >
              <Play size={18} aria-hidden />
              {isUpdating ? "Starting..." : "Start trip"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => updateStatus("arrived")}
              disabled={isUpdating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--action-secondary)] px-6 py-4 text-base font-semibold text-white shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--action-secondary-hover)] disabled:opacity-60"
            >
              <CheckCircle2 size={18} aria-hidden />
              {isUpdating ? "Updating..." : "I have arrived"}
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="card-sand p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            This emergency is {emergency.status}.
          </p>
          <Link
            to={ROUTES.DRIVER.HOME}
            className="mt-3 inline-block text-sm font-semibold text-[var(--action-accent)]"
          >
            Back to home
          </Link>
        </div>
      )}
    </div>
  );
}

export default DriverNavigation;