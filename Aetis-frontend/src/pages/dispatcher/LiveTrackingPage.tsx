import { useEffect, useMemo } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import ActiveEVQueue from "../../components/tracking/ActiveEVQueue";
import ETAPanel from "../../components/tracking/ETAPanel";
import LiveMap from "../../components/tracking/LiveMap";
import SignalOnRouteList from "../../components/signals/SignalOnRouteList";
import { useLiveTracking } from "../../hooks/useLiveTracking";
import { useSignalStatus } from "../../hooks/useSignalStatus";
import { buildTrackingPath } from "../../routes/routePaths";

/**
 * Shared by every signed-in role (/tracking and /tracking/:emergencyId).
 * The selected vehicle lives in the URL so any view can be shared or reloaded.
 */
function LiveTrackingPage() {
  const { emergencyId } = useParams<{ emergencyId: string }>();
  const navigate = useNavigate();

  const { evs, isConnected, isLoading } = useLiveTracking();

  const selected = useMemo(
    () => evs.find((e) => e.emergencyId === emergencyId) ?? null,
    [evs, emergencyId]
  );

  const { signals, isLoading: signalsLoading } = useSignalStatus(
    selected?.emergencyId
  );

  useEffect(() => {
    document.title = "Live Tracking | AETIS";
  }, []);

  const handleSelect = (id: string) => {
    navigate(buildTrackingPath(id === emergencyId ? undefined : id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
            Live tracking
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {evs.length} {evs.length === 1 ? "vehicle" : "vehicles"} currently
            on route
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isConnected
              ? "bg-[var(--color-olive-50)] text-[var(--color-olive-700)]"
              : "bg-[var(--color-sand-200)] text-[var(--text-secondary)]"
          }`}
          role="status"
        >
          {isConnected ? (
            <Wifi size={14} aria-hidden />
          ) : (
            <WifiOff size={14} aria-hidden />
          )}
          {isConnected ? "Live" : "Reconnecting"}
        </span>
      </div>

      {emergencyId && !isLoading && !selected && (
        <div
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]"
        >
          This emergency is not being tracked. It may have been completed.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <section className="card overflow-hidden" aria-label="Map">
          <LiveMap
            evs={evs}
            signals={signals}
            selectedId={selected?.emergencyId ?? null}
            route={selected?.route ?? null}
            onSelectEV={handleSelect}
            className="h-[560px]"
          />
        </section>

        <div className="space-y-6">
          <ETAPanel ev={selected} />

          <section className="card flex flex-col" aria-label="Active vehicles">
            <div className="border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 className="text-lg">Active vehicles</h2>
            </div>
            <div className="max-h-[260px] overflow-y-auto p-3 scrollbar-thin">
              <ActiveEVQueue
                evs={evs}
                selectedId={selected?.emergencyId ?? null}
                onSelect={handleSelect}
                isLoading={isLoading}
              />
            </div>
          </section>

          {selected && (
            <section className="card" aria-label="Signals on route">
              <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                <h2 className="text-lg">Signals on route</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Priority timing for {selected.vehicleLabel}
                </p>
              </div>
              <div className="p-3">
                <SignalOnRouteList
                  signals={signals}
                  isLoading={signalsLoading}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveTrackingPage;