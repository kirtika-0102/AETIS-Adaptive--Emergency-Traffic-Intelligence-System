import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Camera,
  Clock,
  Siren,
  TrafficCone,
  Truck,
  Users,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

import StatCard from "../../components/analytics/StatCard";
import Badge from "../../components/common/Badge";
import { ROUTES } from "../../routes/routePaths";
import { adminApi } from "../../services/api/adminApi";
import type {
  AdminOverview,
  AuditLogEntry,
  ServiceHealthStatus,
} from "../../types/api.types";
import { formatDateTime, formatDuration } from "../../utils/formatters";

const REFRESH_MS = 30_000;

const HEALTH_TONE: Record<ServiceHealthStatus, "success" | "warning" | "danger"> =
  {
    operational: "success",
    degraded: "warning",
    down: "danger",
  };

const HEALTH_LABEL: Record<ServiceHealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
};

const MANAGE_LINKS = [
  {
    to: ROUTES.ADMIN.USERS,
    label: "Users",
    description: "Verify dispatchers, drivers and destination staff",
    icon: Users,
  },
  {
    to: ROUTES.ADMIN.VEHICLES,
    label: "Vehicles",
    description: "Register vehicles and assign drivers",
    icon: Truck,
  },
  {
    to: ROUTES.ADMIN.SIGNALS,
    label: "Signals",
    description: "Manage signals and the priority buffer",
    icon: TrafficCone,
  },
  {
    to: ROUTES.ADMIN.CAMERAS,
    label: "Cameras",
    description: "Connect cameras and control detection",
    icon: Camera,
  },
  {
    to: ROUTES.ADMIN.ANALYTICS,
    label: "Analytics",
    description: "Response times and signal performance",
    icon: BarChart3,
  },
] as const;

function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const [o, a] = await Promise.all([
        adminApi.getOverview(),
        adminApi.getAuditLogs({ page: 1, pageSize: 8 }),
      ]);
      if (signal?.cancelled) return;
      setOverview(o);
      setAudit(a.data);
      setError(null);
    } catch {
      if (!signal?.cancelled) {
        setError("Could not refresh system data. Retrying automatically.");
      }
    } finally {
      if (!signal?.cancelled) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Admin Dashboard | AETIS";
    const signal = { cancelled: false };

    load(signal);
    const id = window.setInterval(() => load(signal), REFRESH_MS);

    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  const ratio = (online?: number, total?: number) =>
    online != null && total != null ? `${online}/${total}` : "-";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
          System overview
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Health of the AETIS network and the accounts that operate it.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {overview && overview.pendingVerifications > 0 && (
        <Link
          to={ROUTES.ADMIN.USERS}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-5 py-4 transition-colors hover:bg-[var(--color-clay-100)]"
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-[var(--color-clay-700)]">
            <UserCheck size={20} aria-hidden />
            {overview.pendingVerifications}{" "}
            {overview.pendingVerifications === 1 ? "account is" : "accounts are"}{" "}
            waiting for verification
          </span>
          <span className="text-sm font-semibold text-[var(--color-clay-700)]">
            Review
          </span>
        </Link>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Emergencies today"
          value={overview ? String(overview.emergenciesToday) : "-"}
          icon={<Siren size={22} aria-hidden />}
          tone="clay"
        />
        <StatCard
          label="Avg. response time"
          value={overview ? formatDuration(overview.avgResponseSeconds) : "-"}
          icon={<Clock size={22} aria-hidden />}
          tone="sand"
        />
        <StatCard
          label="Vehicles online"
          value={ratio(overview?.vehiclesOnline, overview?.vehiclesTotal)}
          icon={<Truck size={22} aria-hidden />}
          tone="teal"
        />
        <StatCard
          label="Signals online"
          value={ratio(overview?.signalsOnline, overview?.signalsTotal)}
          icon={<TrafficCone size={22} aria-hidden />}
          tone="olive"
        />
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        {/* ---------- Service health ---------- */}
        <section className="card" aria-label="Service health">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Service health</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Cameras online:{" "}
              {ratio(overview?.camerasOnline, overview?.camerasTotal)}
            </p>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {isLoading && (
              <li className="px-5 py-4 text-sm text-[var(--text-secondary)]">
                Loading...
              </li>
            )}
            {overview?.services.map((s) => (
              <li
                key={s.name}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <span className="font-semibold">{s.name}</span>
                <Badge tone={HEALTH_TONE[s.status]}>
                  {HEALTH_LABEL[s.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Audit trail ---------- */}
        <section className="card" aria-label="Recent activity">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Recent activity</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Latest actions recorded in the audit log
            </p>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {!isLoading && audit.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">
                No activity recorded yet.
              </li>
            )}
            {audit.map((entry) => (
              <li key={entry.id} className="px-5 py-3 text-sm">
                <p>
                  <span className="font-semibold">{entry.actor}</span>{" "}
                  {entry.action}
                  {entry.target && (
                    <>
                      {" "}
                      <span className="font-[var(--font-mono)] text-xs text-[var(--text-secondary)]">
                        {entry.target}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatDateTime(entry.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---------- Quick links ---------- */}
      <section aria-label="Management" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {MANAGE_LINKS.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="card group p-5 transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-teal-50)] text-[var(--color-teal-600)] transition-colors group-hover:bg-[var(--color-teal-600)] group-hover:text-white">
              <Icon size={20} aria-hidden />
            </div>
            <h3 className="mt-4 text-base">{label}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default AdminDashboard;