import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import StatCard from "../../components/analytics/StatCard";
import Tabs from "../../components/common/Tabs";
import IncomingAlertCard from "../../components/hospital/IncomingAlertCard";
import { useAuth } from "../../hooks/useAuth";
import { buildHospitalEmergencyPath } from "../../routes/routePaths";
import { hospitalApi } from "../../services/api/hospitalApi";
import type { IncomingAlert } from "../../types/hospital.types";
import { formatDuration } from "../../utils/formatters";

const POLL_MS = 10_000;

type TabId = "all" | "pending" | "acknowledged";

const DESTINATION_LABEL = {
  hospital: "Hospital",
  police: "Police station",
  fire: "Fire station",
} as const;

function HospitalDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState<IncomingAlert[]>([]);
  const [tab, setTab] = useState<TabId>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const destinationLabel =
    user && user.role in DESTINATION_LABEL
      ? DESTINATION_LABEL[user.role as keyof typeof DESTINATION_LABEL]
      : "Destination";

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const data = await hospitalApi.getIncomingAlerts();
      if (signal?.cancelled) return;
      setAlerts(data);
      setError(null);
    } catch {
      if (!signal?.cancelled) {
        setError("Could not refresh incoming alerts. Retrying automatically.");
      }
    } finally {
      if (!signal?.cancelled) setIsLoading(false);
    }
  }, []);

  // Polling until the WebSocket layer pushes alerts
  useEffect(() => {
    document.title = "Incoming Emergencies | AETIS";
    const signal = { cancelled: false };

    load(signal);
    const id = window.setInterval(() => load(signal), POLL_MS);

    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  const handleAcknowledge = async (emergencyId: string) => {
    setAcknowledgingId(emergencyId);
    try {
      await hospitalApi.acknowledge(emergencyId);
      setAlerts((prev) =>
        prev.map((a) =>
          a.emergencyId === emergencyId
            ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() }
            : a
        )
      );
      setError(null);
    } catch {
      setError("Could not acknowledge this alert. Please try again.");
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Soonest arrival first
  const sorted = useMemo(
    () => [...alerts].sort((a, b) => a.etaSeconds - b.etaSeconds),
    [alerts]
  );

  const pending = useMemo(() => sorted.filter((a) => !a.acknowledged), [sorted]);
  const acknowledged = useMemo(
    () => sorted.filter((a) => a.acknowledged),
    [sorted]
  );

  const visible =
    tab === "pending" ? pending : tab === "acknowledged" ? acknowledged : sorted;

  const nextEta = sorted.length > 0 ? sorted[0].etaSeconds : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
          Incoming emergencies
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {destinationLabel} view. Review each case and acknowledge it so the
          dispatcher knows your team is preparing.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting acknowledgement"
          value={String(pending.length)}
          icon={<BellRing size={22} aria-hidden />}
          tone="clay"
        />
        <StatCard
          label="Acknowledged"
          value={String(acknowledged.length)}
          icon={<CheckCheck size={22} aria-hidden />}
          tone="olive"
        />
        <StatCard
          label="Next arrival"
          value={nextEta != null ? formatDuration(nextEta) : "-"}
          icon={<Clock size={22} aria-hidden />}
          tone="teal"
        />
      </div>

      <Tabs
        tabs={[
          { id: "all", label: "All", count: sorted.length },
          { id: "pending", label: "Needs acknowledgement", count: pending.length },
          { id: "acknowledged", label: "Acknowledged", count: acknowledged.length },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <section aria-label="Incoming alerts" className="space-y-3">
        {isLoading && (
          <p className="text-sm text-[var(--text-secondary)]">
            Loading alerts...
          </p>
        )}

        {!isLoading && visible.length === 0 && (
          <div className="card-sand p-10 text-center">
            <h2 className="text-lg">Nothing here right now</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              New emergencies headed to your {destinationLabel.toLowerCase()}{" "}
              appear here automatically.
            </p>
          </div>
        )}

        {visible.map((alert) => (
          <IncomingAlertCard
            key={alert.emergencyId}
            alert={alert}
            isAcknowledging={acknowledgingId === alert.emergencyId}
            onOpen={(id) => navigate(buildHospitalEmergencyPath(id))}
            onAcknowledge={handleAcknowledge}
          />
        ))}
      </section>
    </div>
  );
}

export default HospitalDashboard;