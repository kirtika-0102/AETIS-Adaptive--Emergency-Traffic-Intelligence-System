import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { palette, semantic } from "../../styles/theme";
import type { AnalyticsReport } from "../../types/api.types";
import { formatDuration } from "../../utils/formatters";
import EmptyState from "../common/EmptyState";

type Point = AnalyticsReport["responseTimes"][number];

export interface ResponseTimeChartProps {
  data: Point[];
  /** Plot height in pixels */
  height?: number;
  className?: string;
}

interface Row {
  label: string;
  /** null leaves a gap in the line instead of drawing a false zero */
  seconds: number | null;
  minutes: number | null;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  label?: string | number;
}

function ResponseTooltip({ active, payload, label }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 shadow-[shadow:var(--shadow-md)]">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {row.seconds === null ? "No data" : formatDuration(row.seconds)}
      </p>
    </div>
  );
}

function ResponseTimeChart({ data, height = 280, className }: ResponseTimeChartProps) {
  const reduce = useReducedMotion();

  const rows = useMemo<Row[]>(
    () =>
      data.map((p) => {
        const ok = Number.isFinite(p.avgSeconds) && p.avgSeconds >= 0;
        return {
          label: p.label,
          seconds: ok ? p.avgSeconds : null,
          minutes: ok ? p.avgSeconds / 60 : null,
        };
      }),
    [data]
  );

  const hasData = rows.some((r) => r.seconds !== null);

  if (!hasData) {
    return (
      <EmptyState
        compact
        title="No response times for this period"
        description="Once emergencies are completed, their average response time appears here."
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-[var(--text-muted)]">
        Minutes from dispatch to arrival
      </p>

      {/* The drawing is hidden from assistive tech; the table below replaces it */}
      <div aria-hidden style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={semantic.border.subtle} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: semantic.border.default }}
              tick={{ fontSize: 12, fill: semantic.text.secondary }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[0, "auto"]}
              allowDecimals
              tick={{ fontSize: 12, fill: semantic.text.secondary }}
              tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
            />
            <Tooltip
              content={<ResponseTooltip />}
              cursor={{ stroke: semantic.border.strong, strokeDasharray: "4 4" }}
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke={palette.clay[500]}
              strokeWidth={3}
              connectNulls={false}
              isAnimationActive={!reduce}
              dot={{ r: 3, fill: palette.clay[500], stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: palette.clay[600], stroke: "#ffffff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Average response time by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Average response time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <th scope="row">{r.label}</th>
              <td>{r.seconds === null ? "No data" : formatDuration(r.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ResponseTimeChart;