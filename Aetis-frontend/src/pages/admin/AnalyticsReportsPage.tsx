import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, Siren, Target } from "lucide-react";

import StatCard from "../../components/analytics/StatCard";
import ResponseTimeChart from "../../components/analytics/ResponseTimeChart";
import SignalPerformanceChart from "../../components/analytics/SignalPerformanceChart";
import VehicleUsageChart from "../../components/analytics/VehicleUsageChart";
import Tabs from "../../components/common/Tabs";
import { analyticsApi } from "../../services/api/analyticsApi";
import type { AnalyticsRange, AnalyticsReport } from "../../types/api.types";
import { formatDuration } from "../../utils/formatters";

const RANGE_TABS: { id: AnalyticsRange; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

function AnalyticsReportsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Analytics & Reports | AETIS";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    analyticsApi
      .getReport(range)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load analytics for this period.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const blob = await analyticsApi.exportReport(range);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aetis-report-${range}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export the report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const summary = report?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
            Analytics &amp; reports
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            How quickly vehicles reach emergencies and how signals perform along
            the way.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || isLoading || !report}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-3 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
        >
          <Download size={16} aria-hidden />
          {isExporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      <Tabs
        tabs={RANGE_TABS}
        activeId={range}
        onChange={(id) => setRange(id as AnalyticsRange)}
      />

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {/* Previous data stays visible (dimmed) while a new range loads */}
      <div
        className={`space-y-6 transition-opacity ${
          isLoading && report ? "opacity-60" : "opacity-100"
        }`}
        aria-busy={isLoading}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Emergencies handled"
            value={summary ? String(summary.totalEmergencies) : "-"}
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
            label="Signals cleared"
            value={summary ? String(summary.signalsCleared) : "-"}
            icon={<CheckCircle2 size={22} aria-hidden />}
            tone="olive"
          />
          <StatCard
            label="Detection accuracy"
            value={summary ? `${summary.detectionAccuracyPct.toFixed(1)}%` : "-"}
            icon={<Target size={22} aria-hidden />}
            tone="teal"
          />
        </div>

        {isLoading && !report && (
          <p className="text-sm text-[var(--text-secondary)]">
            Loading analytics...
          </p>
        )}

        {report && (
          <>
            <section className="card p-5" aria-label="Response time">
              <h2 className="text-lg">Response time</h2>
              <p className="mb-4 text-sm text-[var(--text-secondary)]">
                Average time from dispatch to arrival
              </p>
              <ResponseTimeChart data={report.responseTimes} />
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="card p-5" aria-label="Signal performance">
                <h2 className="text-lg">Signal performance</h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  Signals open on time versus late
                </p>
                <SignalPerformanceChart data={report.signalPerformance} />
              </section>

              <section className="card p-5" aria-label="Vehicle usage">
                <h2 className="text-lg">Vehicle usage</h2>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                  Dispatches per vehicle
                </p>
                <VehicleUsageChart data={report.vehicleUsage} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AnalyticsReportsPage;