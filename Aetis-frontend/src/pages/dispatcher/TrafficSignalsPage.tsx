import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import Tabs from "../../components/common/Tabs";
import CameraDetectionFeed from "../../components/signals/CameraDetectionFeed";
import SignalStatusCard from "../../components/signals/SignalStatusCard";
import SignalTimeline from "../../components/signals/SignalTimeline";
import { useDebounce } from "../../hooks/useDebounce";
import { useSignalStatus } from "../../hooks/useSignalStatus";
import { cameraApi } from "../../services/api/cameraApi";
import type { CameraDetection } from "../../types/camera.types";

type TabId = "priority" | "all" | "detections";

const DETECTION_POLL_MS = 10_000;

function TrafficSignalsPage() {
  const { signals, isLoading } = useSignalStatus();

  const [tab, setTab] = useState<TabId>("priority");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const [detections, setDetections] = useState<CameraDetection[]>([]);
  const [detectionsLoading, setDetectionsLoading] = useState(true);

  useEffect(() => {
    document.title = "Traffic Signals | AETIS";
  }, []);

  // Recent camera detections, refreshed on an interval
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await cameraApi.getRecentDetections(30);
        if (!cancelled) setDetections(data);
      } catch {
        /* keep the previous list on transient failures */
      } finally {
        if (!cancelled) setDetectionsLoading(false);
      }
    };

    load();
    const id = window.setInterval(load, DETECTION_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const prioritySignals = useMemo(
    () =>
      signals
        .filter((s) => s.status === "priority" || s.status === "pending")
        .sort((a, b) => (a.expectedArrivalAt ?? 0) - (b.expectedArrivalAt ?? 0)),
    [signals]
  );

  const filteredSignals = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return signals;
    return signals.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [signals, debouncedQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
          Traffic signals
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Priority activations, signal states and camera detections along active
          routes.
        </p>
      </div>

      <Tabs
        tabs={[
          { id: "priority", label: "On route", count: prioritySignals.length },
          { id: "all", label: "All signals", count: signals.length },
          { id: "detections", label: "Camera detections" },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === "priority" && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <section className="card p-5" aria-label="Activation timeline">
            <h2 className="text-lg">Activation timeline</h2>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              Signals ordered by expected vehicle arrival
            </p>
            <SignalTimeline signals={prioritySignals} />
          </section>

          <section className="space-y-3" aria-label="Signals on route">
            {isLoading && (
              <p className="text-sm text-[var(--text-secondary)]">
                Loading signals...
              </p>
            )}
            {!isLoading && prioritySignals.length === 0 && (
              <div className="card-sand p-6 text-center text-sm text-[var(--text-secondary)]">
                No signals are currently set for emergency priority.
              </div>
            )}
            {prioritySignals.map((s) => (
              <SignalStatusCard key={s.id} signal={s} />
            ))}
          </section>
        </div>
      )}

      {tab === "all" && (
        <section className="space-y-4" aria-label="All signals">
          <div className="relative max-w-sm">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ID"
              aria-label="Search signals"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSignals.map((s) => (
              <SignalStatusCard key={s.id} signal={s} />
            ))}
          </div>

          {!isLoading && filteredSignals.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              No signals match "{debouncedQuery}".
            </p>
          )}
        </section>
      )}

      {tab === "detections" && (
        <section className="card p-5" aria-label="Camera detections">
          <h2 className="text-lg">Recent camera detections</h2>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Emergency vehicles identified by traffic signal cameras
          </p>
          <CameraDetectionFeed
            detections={detections}
            isLoading={detectionsLoading}
          />
        </section>
      )}
    </div>
  );
}

export default TrafficSignalsPage;