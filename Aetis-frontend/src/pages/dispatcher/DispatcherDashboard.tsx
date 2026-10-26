import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Plus, Siren, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../../components/analytics/StatCard";
import EmergencyList from "../../components/emergency/EmergencyList";
import ActiveEVQueue from "../../components/tracking/ActiveEVQueue";
import LiveMap from "../../components/tracking/LiveMap";
import { useLiveTracking } from "../../hooks/useLiveTracking";
import { ROUTES, buildTrackingPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import type {
  DispatcherSummary,
  Emergency,
} from "../../types/emergency.types";
import { formatDuration } from "../../utils/formatters";

const REFRESH_MS = 15_000;

function DispatcherDashboard() {
  const { evs, isConnected, isLoading: evsLoading } = useLiveTracking();

  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [summary, setSummary] = useState<DispatcherSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const [list, stats] = await Promise.all([
        emergencyApi.getEmergencies({ status: "active", page: 1, pageSize: 6 }),
        emergencyApi.getDispatcherSummary(),
      ]);
      if (signal?.cancelled) return;
      setEmergencies(list.data);
      setSummary(stats);
      setError(null);
    } catch {
      if (!signal?.cancelled) {
        setError("Could not load dashboard data. Retrying automatically.");
      }
    } finally {
      if (!signal?.cancelled) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Dispatcher Dashboard | AETIS";
    const signal = { cancelled: false };

    load(signal);
    const id = window.setInterval(() => load(signal), REFRESH_MS);

    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
            Dispatcher Dashboard
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected
                  ? "bg-[var(--feedback-success)] blink"
                  : "bg-[var(--text-muted)]"
              }`}
            />
            {isConnected ? "Live updates connected" : "Reconnecting to live feed"}
          </p>
        </div>

        <Link
          to={ROUTES.DISPATCHER.CREATE_EMERGENCY}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[shadow:var(--shadow-sm)] transition-colors hover:bg-[var(--action-accent-hover)]"
        >
          <Plus size={18} aria-hidden />
          New emergency
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {/* ---------- Stats ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Active emergencies"
          value={summary ? String(summary.activeCount) : "-"}
          icon={<Siren size={22} aria-hidden />}
          tone="clay"
        />
        <StatCard
          label="Avg. response time"
          value={summary ? formatDuration(summary.avgResponseSeconds) : "-"}
          icon={<Clock size={22} aria-hidden />}
          tone="sand"
        />
        <StatCard
          label="Units on the road"
          value={String(evs.length)}
          icon={<Truck size={22} aria-hidden />}
          tone="teal"
        />
        <StatCard
          label="Signals cleared today"
          value={summary ? String(summary.signalsClearedToday) : "-"}
          icon={<Activity size={22} aria-hidden />}
          tone="olive"
        />
      </motion.div>

      {/* ---------- Map + EV queue ---------- */}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden" aria-label="Live map">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Live overview</h2>
            <Link
              to={buildTrackingPath()}
              className="text-sm font-semibold text-[var(--action-accent)] hover:text-[var(--action-accent-hover)]"
            >
              Open full tracking
            </Link>
          </div>
          <LiveMap evs={evs} emergencies={emergencies} className="h-[380px]" />
        </section>

        <section className="card flex flex-col" aria-label="Active vehicles">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Active vehicles</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Vehicles currently on route
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            <ActiveEVQueue
              evs={evs}
              selectedId={null}
              onSelect={(id) => {
                window.location.assign(buildTrackingPath(id));
              }}
              isLoading={evsLoading}
            />
          </div>
        </section>
      </div>

      {/* ---------- Recent emergencies ---------- */}
      <section className="card" aria-label="Recent emergencies">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 className="text-lg">Active emergencies</h2>
          <Link
            to={ROUTES.DISPATCHER.HISTORY}
            className="text-sm font-semibold text-[var(--action-accent)] hover:text-[var(--action-accent-hover)]"
          >
            View all
          </Link>
        </div>
        <div className="p-4">
          <EmergencyList
            emergencies={emergencies}
            isLoading={isLoading}
            emptyMessage="No active emergencies right now."
          />
        </div>
      </section>
    </div>
  );
}

export default DispatcherDashboard;