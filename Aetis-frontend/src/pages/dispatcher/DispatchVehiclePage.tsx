import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import SeverityBadge from "../../components/emergency/SeverityBadge";
import LiveMap from "../../components/tracking/LiveMap";
import VehicleAssignModal from "../../components/vehicles/VehicleAssignModal";
import VehicleList from "../../components/vehicles/VehicleList";
import Loader from "../../components/common/Loader";
import { ROUTES, buildTrackingPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import { vehicleApi } from "../../services/api/vehicleApi";
import type { Emergency } from "../../types/emergency.types";
import type { Vehicle } from "../../types/vehicle.types";
import { EMERGENCY_TYPE_LABELS } from "../../utils/constants";

function DispatchVehiclePage() {
  const { emergencyId } = useParams<{ emergencyId: string }>();
  const navigate = useNavigate();

  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Dispatch Vehicle | AETIS";
    if (!emergencyId) return;

    let cancelled = false;

    (async () => {
      try {
        const [e, v] = await Promise.all([
          emergencyApi.getEmergencyById(emergencyId),
          vehicleApi.getNearbyVehicles(emergencyId),
        ]);
        if (cancelled) return;
        setEmergency(e);
        setVehicles(v);
      } catch {
        if (!cancelled) setError("Could not load this emergency.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emergencyId]);

  // Fastest ETA first
  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => a.etaSeconds - b.etaSeconds),
    [vehicles]
  );

  const handleConfirm = async () => {
    if (!emergencyId || !selected) return;

    setIsDispatching(true);
    try {
      await vehicleApi.dispatchVehicle(emergencyId, selected.id);
      navigate(buildTrackingPath(emergencyId), { replace: true });
    } catch {
      setError("Dispatch failed. The vehicle may no longer be available.");
      setIsDispatching(false);
      setModalOpen(false);
    }
  };

  if (isLoading) return <Loader />;

  if (!emergency) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-xl">Emergency not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error ?? "This request does not exist or was removed."}
        </p>
        <Link
          to={ROUTES.DISPATCHER.DASHBOARD}
          className="mt-6 inline-block text-sm font-semibold text-[var(--action-accent)]"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={ROUTES.DISPATCHER.DASHBOARD}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl text-[var(--text-primary)] sm:text-3xl">
          Dispatch a vehicle
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {/* ---------- Emergency summary ---------- */}
      <section className="card p-5" aria-label="Emergency summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)]">
              {emergency.id}
            </p>
            <h2 className="mt-1 text-lg">
              {EMERGENCY_TYPE_LABELS[emergency.type]}
            </h2>
          </div>
          <SeverityBadge severity={emergency.severity} />
        </div>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[var(--text-muted)]">Caller</dt>
            <dd className="font-semibold">
              {emergency.callerName} &middot; {emergency.callerPhone}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--text-muted)]">Location</dt>
            <dd className="font-semibold">{emergency.location.address}</dd>
          </div>
          {emergency.description && (
            <div className="sm:col-span-3">
              <dt className="text-[var(--text-muted)]">Situation</dt>
              <dd>{emergency.description}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ---------- Vehicles + map ---------- */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="card flex flex-col" aria-label="Available vehicles">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 className="text-lg">Nearby available vehicles</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Sorted by fastest estimated arrival
            </p>
          </div>
          <div className="max-h-[480px] flex-1 overflow-y-auto p-3 scrollbar-thin">
            <VehicleList
              vehicles={sortedVehicles}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              isLoading={false}
            />
          </div>
          <div className="border-t border-[var(--border-subtle)] p-4">
            <button
              type="button"
              disabled={!selected}
              onClick={() => setModalOpen(true)}
              className="w-full rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--action-accent-hover)] disabled:bg-[var(--color-sand-300)] disabled:text-[var(--text-muted)]"
            >
              {selected ? `Dispatch ${selected.label}` : "Select a vehicle"}
            </button>
          </div>
        </section>

        <section className="card overflow-hidden" aria-label="Map">
          <LiveMap
            vehicles={sortedVehicles}
            emergencies={[emergency]}
            selectedId={selected?.id ?? null}
            onSelectVehicleId={(id) =>
              setSelected(sortedVehicles.find((v) => v.id === id) ?? null)
            }
            className="h-[480px]"
          />
        </section>
      </div>

      <VehicleAssignModal
        open={modalOpen}
        vehicle={selected}
        emergency={emergency}
        isSubmitting={isDispatching}
        onConfirm={handleConfirm}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

export default DispatchVehiclePage;