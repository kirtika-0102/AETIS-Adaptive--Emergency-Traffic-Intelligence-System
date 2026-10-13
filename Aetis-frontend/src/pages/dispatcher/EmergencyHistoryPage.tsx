import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

import Badge from "../../components/common/Badge";
import Table, { type TableColumn } from "../../components/common/Table";
import SeverityBadge from "../../components/emergency/SeverityBadge";
import { useDebounce } from "../../hooks/useDebounce";
import { buildTrackingPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import type {
  Emergency,
  EmergencyStatus,
  EmergencyType,
} from "../../types/emergency.types";
import {
  EMERGENCY_STATUS_LABELS,
  EMERGENCY_TYPE_LABELS,
} from "../../utils/constants";
import { formatDateTime, formatDuration } from "../../utils/formatters";

const PAGE_SIZE = 10;

const STATUS_TONE: Record<
  EmergencyStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  pending: "warning",
  dispatched: "info",
  en_route: "danger",
  arrived: "info",
  completed: "success",
  cancelled: "neutral",
};

const selectClass =
  "rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm focus:border-[var(--action-primary)] focus:outline-none";

function EmergencyHistoryPage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<EmergencyType | "">("");
  const [status, setStatus] = useState<EmergencyStatus | "">("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 300);

  const [rows, setRows] = useState<Emergency[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Emergency History | AETIS";
  }, []);

  // Any filter change returns to the first page
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, status]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    emergencyApi
      .getEmergencies({
        search: debouncedSearch || undefined,
        type: type || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load emergency history.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, type, status, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: TableColumn<Emergency>[] = [
    {
      key: "id",
      header: "ID",
      render: (e) => (
        <span className="font-[var(--font-mono)] text-xs">{e.id}</span>
      ),
    },
    { key: "type", header: "Type", render: (e) => EMERGENCY_TYPE_LABELS[e.type] },
    {
      key: "location",
      header: "Location",
      render: (e) => (
        <span className="line-clamp-1 max-w-[260px]">{e.location.address}</span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (e) => <SeverityBadge severity={e.severity} />,
    },
    {
      key: "status",
      header: "Status",
      render: (e) => (
        <Badge tone={STATUS_TONE[e.status]}>
          {EMERGENCY_STATUS_LABELS[e.status]}
        </Badge>
      ),
    },
    {
      key: "response",
      header: "Response time",
      render: (e) =>
        e.responseSeconds != null ? formatDuration(e.responseSeconds) : "-",
    },
    {
      key: "createdAt",
      header: "Reported",
      render: (e) => formatDateTime(e.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
          Emergency history
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every request handled through AETIS. Select a row to open its route.
        </p>
      </div>

      {/* ---------- Filters ---------- */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 md:max-w-sm">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, caller or location"
            aria-label="Search emergencies"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
          />
        </div>

        <select
          value={type}
          onChange={(e) => setType(e.target.value as EmergencyType | "")}
          aria-label="Filter by type"
          className={selectClass}
        >
          <option value="">All types</option>
          {(Object.keys(EMERGENCY_TYPE_LABELS) as EmergencyType[]).map((t) => (
            <option key={t} value={t}>
              {EMERGENCY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EmergencyStatus | "")}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="">All statuses</option>
          {(Object.keys(EMERGENCY_STATUS_LABELS) as EmergencyStatus[]).map(
            (s) => (
              <option key={s} value={s}>
                {EMERGENCY_STATUS_LABELS[s]}
              </option>
            )
          )}
        </select>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      {/* ---------- Table ---------- */}
      <section className="card overflow-hidden">
        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          emptyMessage="No emergencies match these filters."
          onRowClick={(e) => navigate(buildTrackingPath(e.id))}
        />

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-5 py-3 text-sm sm:flex-row">
          <p className="text-[var(--text-secondary)]">
            {total === 0
              ? "No results"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                  page * PAGE_SIZE,
                  total
                )} of ${total}`}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-[var(--text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default EmergencyHistoryPage;