import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { palette, semantic } from "../../styles/theme";
import type { AnalyticsReport } from "../../types/api.types";
import EmptyState from "../common/EmptyState";

type Point = AnalyticsReport["vehicleUsage"][number];

export interface VehicleUsageChartProps {
  data: Point[];
  /** How many vehicles to show, busiest first */
  maxItems?: number;
  className?: string;
}

interface Row {
  label: string;
  dispatches: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
}

const ROW_HEIGHT = 34;
const CHART_PADDING = 24;

const truncate = (value: string, max = 12) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

function UsageTooltip({ active, payload }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 shadow-[shadow:var(--shadow-md)]">
      <p className="text-xs text-[var(--text-muted)]">{row.label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {row.dispatches} {row.dispatches === 1 ? "dispatch" : "dispatches"}
      </p>
    </div>
  );
}

function VehicleUsageChart({ data, maxItems = 10, className }: VehicleUsageChartProps) {
  const reduce = useReducedMotion();

  const { rows, totalVehicles, totalDispatches } = useMemo(() => {
    const cleaned: Row[] = data.map((p) => ({
      label: p.label,
      dispatches: Number.isFinite(p.dispatches) && p.dispatches > 0
        ? Math.round(p.dispatches)
        : 0,
    }));

    const sorted = [...cleaned].sort((a, b) => b.dispatches - a.dispatches);

    return {
      rows: sorted.slice(0, maxItems),
      totalVehicles: sorted.length,
      totalDispatches: sorted.reduce((sum, r) => sum + r.dispatches, 0),
    };
  }, [data, maxItems]);

  if (totalDispatches === 0) {
    return (
      <EmptyState
        compact
        title="No dispatches in this period"
        description="Vehicle usage appears here once vehicles have been dispatched."
        className={className}
      />
    );
  }

  const height = rows.length * ROW_HEIGHT + CHART_PADDING;

  return (
    <div className={className}>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        <span className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--text-primary)]">
          {totalDispatches}
        </span>{" "}
        {totalDispatches === 1 ? "dispatch" : "dispatches"} across{" "}
        {totalVehicles} {totalVehicles === 1 ? "vehicle" : "vehicles"}
      </p>

      <div aria-hidden style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 36, left: 0, bottom: 4 }}
          >
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="label"
              width={92}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 12, fill: semantic.text.secondary }}
              tickFormatter={(v: string) => truncate(String(v))}
            />
            <Tooltip
              content={<UsageTooltip />}
              cursor={{ fill: "rgba(13, 59, 78, 0.06)" }}
            />
            <Bar
              dataKey="dispatches"
              fill={palette.teal[600]}
              radius={[0, 4, 4, 0]}
              barSize={18}
              isAnimationActive={!reduce}
            >
              <LabelList
                dataKey="dispatches"
                position="right"
                style={{ fontSize: 12, fontWeight: 600, fill: semantic.text.primary }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {totalVehicles > rows.length && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Showing the {rows.length} busiest of {totalVehicles} vehicles.
        </p>
      )}

      <table className="sr-only">
        <caption>Dispatches per vehicle, busiest first</caption>
        <thead>
          <tr>
            <th scope="col">Vehicle</th>
            <th scope="col">Dispatches</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <th scope="row">{r.label}</th>
              <td>{r.dispatches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default VehicleUsageChart;