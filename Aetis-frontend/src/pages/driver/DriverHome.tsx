import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Navigation, Power, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import Badge from "../../components/common/Badge";
import Loader from "../../components/common/Loader";
import SeverityBadge from "../../components/emergency/SeverityBadge";
import { useAuth } from "../../hooks/useAuth";
import { buildDriverNavigationPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import { vehicleApi } from "../../services/api/vehicleApi";
import type { Emergency } from "../../types/emergency.types";
import type { Vehicle } from "../../types/vehicle.types";
import { EMERGENCY_TYPE_LABELS } from "../../utils/constants";

const POLL_MS = 10_000;

type DutyStatus = "available" | "offline";

function DriverHome() {
  const { user } = useAuth();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [assignment, setAssignment] = useState<Emergency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const [v, a] = await Promise.all([
        vehicleApi.getMyVehicle(),
        emergencyApi.getDriverAssignment(),
      ]);
      if (signal?.cancelled) return;
      setVehicle(v);
      setAssignment(a);
      setError(null);
    } catch {
      if (!signal?.cancelled) {
        setError("Could not refresh your assignment. Retrying automatically.");
      }
    } finally {
      if (!signal?.cancelled) setIsLoading(false);
    }
  }, []);

  // Poll for new assignments (replaced by a WebSocket push later)
  useEffect(() => {
    document.title = "Driver Home | AETIS";
    const signal = { cancelled: false };

    load(signal);
    const id = window.setInterval(() => load(signal), POLL_MS);

    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  const onDuty = vehicle != null && vehicle.status !== "offline";
  // A vehicle on an active emergency cannot be switched off duty
  const canToggle = !assignment && vehicle != null;

  const handleToggleDuty = async () => {
    if (!vehicle || !canToggle) return;

    const next: DutyStatus = onDuty ? "offline" : "available";
    setIsToggling(true);
    try {
      await vehicleApi.setMyStatus(next);
      setVehicle({ ...vehicle, status: next });
      setError(null);
    } catch {
      setError("Could not change your duty status. Please try again.");
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
          Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your assignment and vehicle status appear here.
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

      {/* ---------- Vehicle + duty ---------- */}
      <section className="card p-5" aria-label="Vehicle">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-teal-50)] text-[var(--color-teal-600)]">
              <Truck size={24} aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold">
                {vehicle?.label ?? "No vehicle assigned"}
              </p>
              <p className="text-sm capitalize text-[var(--text-secondary)]">
                {vehicle ? vehicle.type : "Ask your admin to assign one"}
              </p>
            </div>
          </div>

          {vehicle && (
            <Badge tone={onDuty ? "success" : "neutral"}>
              {assignment ? "On assignment" : onDuty ? "On duty" : "Off duty"}
            </Badge>
          )}
        </div>

        {vehicle && (
          <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
            <button
              type="button"
              onClick={handleToggleDuty}
              disabled={!canToggle || isToggling}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-50 sm:w-auto ${
                onDuty
                  ? "border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-muted)]"
                  : "bg-[var(--action-secondary)] text-white hover:bg-[var(--action-secondary-hover)]"
              }`}
            >
              <Power size={16} aria-hidden />
              {onDuty ? "Go off duty" : "Go on duty"}
            </button>
            {assignment && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Duty status is locked while an emergency is active.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---------- Current assignment ---------- */}
      {assignment ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="card-dark p-6"
          aria-label="Current assignment"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="eyebrow">New assignment</span>
            <SeverityBadge severity={assignment.severity} />
          </div>

          <h2 className="mt-4 text-xl text-[var(--text-inverse)]">
            {EMERGENCY_TYPE_LABELS[assignment.type]}
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[var(--text-inverse-muted)]">Pickup location</dt>
              <dd className="font-semibold text-[var(--text-inverse)]">
                {assignment.location.address}
              </dd>
            </div>
            {assignment.description && (
              <div>
                <dt className="text-[var(--text-inverse-muted)]">Situation</dt>
                <dd className="text-[var(--text-inverse)]">
                  {assignment.description}
                </dd>
              </div>
            )}
          </dl>

          <Link
            to={buildDriverNavigationPath(assignment.id)}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--action-accent-hover)]"
          >
            <Navigation size={18} aria-hidden />
            Start navigation
          </Link>
        </motion.section>
      ) : (
        <section
          className="card-sand p-8 text-center"
          aria-label="No assignment"
        >
          <h2 className="text-lg">No active assignment</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {onDuty
              ? "You are on duty. New dispatches appear here automatically."
              : "Go on duty to receive dispatches."}
          </p>
        </section>
      )}
    </div>
  );
}

export default DriverHome;