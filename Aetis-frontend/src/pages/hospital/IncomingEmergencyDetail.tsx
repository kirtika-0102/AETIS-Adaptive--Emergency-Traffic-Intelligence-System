import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Truck } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/common/Badge";
import Loader from "../../components/common/Loader";
import SeverityBadge from "../../components/emergency/SeverityBadge";
import AcknowledgeButton from "../../components/hospital/AcknowledgeButton";
import PatientDetailsPanel from "../../components/hospital/PatientDetailsPanel";
import ETAPanel from "../../components/tracking/ETAPanel";
import LiveMap from "../../components/tracking/LiveMap";
import { useLiveTracking } from "../../hooks/useLiveTracking";
import { ROUTES } from "../../routes/routePaths";
import { hospitalApi } from "../../services/api/hospitalApi";
import type { IncomingAlert } from "../../types/hospital.types";
import { EMERGENCY_TYPE_LABELS } from "../../utils/constants";
import { formatDateTime, formatDuration } from "../../utils/formatters";

const POLL_MS = 10_000;

function IncomingEmergencyDetail() {
  const { emergencyId } = useParams<{ emergencyId: string }>();
  const { evs } = useLiveTracking();

  const [alert, setAlert] = useState<IncomingAlert | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      if (!emergencyId) return;
      try {
        const data = await hospitalApi.getAlertById(emergencyId);
        if (signal?.cancelled) return;
        setAlert(data);
      } catch {
        if (!signal?.cancelled) {
          setError("Could not load this emergency.");
        }
      } finally {
        if (!signal?.cancelled) setIsLoading(false);
      }
    },
    [emergencyId]
  );

  useEffect(() => {
    document.title = "Emergency Details | AETIS";
    const signal = { cancelled: false };

    load(signal);
    const id = window.setInterval(() => load(signal), POLL_MS);

    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  // Live position of the vehicle bringing this patient or response team
  const ev = useMemo(
    () => evs.find((e) => e.emergencyId === emergencyId) ?? null,
    [evs, emergencyId]
  );

  const handleAcknowledge = async () => {
    if (!emergencyId || !alert) return;

    setIsAcknowledging(true);
    setError(null);
    try {
      await hospitalApi.acknowledge(emergencyId);
      setAlert({
        ...alert,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      });
    } catch {
      setError("Could not acknowledge this alert. Please try again.");
    } finally {
      setIsAcknowledging(false);
    }
  };

  if (isLoading) return <Loader />;

  if (!alert) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-xl">Emergency not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error ?? "This emergency does not exist or is no longer assigned to you."}
        </p>
        <Link
          to={ROUTES.HOSPITAL.DASHBOARD}
          className="mt-6 inline-block text-sm font-semibold text-[var(--action-accent)]"
        >
          Back to incoming emergencies
        </Link>
      </div>
    );
  }

  const { emergency } = alert;
  const eta = ev?.etaSeconds ?? alert.etaSeconds;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={ROUTES.HOSPITAL.DASHBOARD}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to incoming emergencies
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
              {emergency.id}
            </p>
            <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
              {EMERGENCY_TYPE_LABELS[emergency.type]}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Received {formatDateTime(alert.receivedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={emergency.severity} />
            <Badge tone={alert.acknowledged ? "success" : "warning"}>
              {alert.acknowledged ? "Acknowledged" : "Awaiting acknowledgement"}
            </Badge>
          </div>
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

      {/* ---------- Arrival summary ---------- */}
      <section
        className="card-dark flex flex-wrap items-center justify-between gap-4 p-5"
        aria-label="Arrival summary"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-[var(--color-sand-200)]">
            <Truck size={24} aria-hidden />
          </div>
          <div>
            <p className="text-sm text-[var(--text-inverse-muted)]">
              Arriving with {alert.vehicleLabel}
            </p>
            <p className="font-[var(--font-display)] text-2xl font-extrabold text-[var(--text-inverse)]">
              {formatDuration(eta)}
            </p>
          </div>
        </div>

        <AcknowledgeButton
          acknowledged={alert.acknowledged}
          isSubmitting={isAcknowledging}
          onAcknowledge={handleAcknowledge}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <PatientDetailsPanel patient={alert.patient} emergency={emergency} />

        <div className="space-y-6">
          <section className="card overflow-hidden" aria-label="Live map">
            <LiveMap
              evs={ev ? [ev] : []}
              emergencies={[emergency]}
              selectedId={ev?.emergencyId ?? null}
              route={ev?.route ?? null}
              className="h-[320px]"
            />
          </section>

          <ETAPanel ev={ev} />
        </div>
      </div>
    </div>
  );
}

export default IncomingEmergencyDetail;