import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { palette, semantic } from "../../styles/theme";
import type { AnalyticsReport } from "../../types/api.types";
import EmptyState from "../common/EmptyState";

type Point = AnalyticsReport["signalPerformance"][number];

export interface SignalPerformanceChartProps {
  data: Point[];
  height?: number;
  className?: string;
}

interface Row {
  label: string;
  onTime: number;
  late: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
  label?: string | number;
}

const cleanCount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

function PerformanceTooltip({ active, payload, label }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const total = row.onTime + row.late;
  const pct = total > 0 ? Math.round((row.onTime / total) * 100) : null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 shadow-[shadow:var(--shadow-md)]">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">
        <span className="font-semibold">{row.onTime}</span> on time
      </p>
      <p className="text-sm text-[var(--text-primary)]">
        <span className="font-semibold">{row.late}</span> late
      </p>
      {pct !== null && (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{pct}% on time</p>
      )}
    </div>
  );
}

function SignalPerformanceChart({
  data,
  height = 280,
  className,
}: SignalPerformanceChartProps) {
  const reduce = useReducedMotion();

  const rows = useMemo<Row[]>(
    () =>
      data.map((p) => ({
        label: p.label,
        onTime: cleanCount(p.onTime),
        late: cleanCount(p.late),
      })),
    [data]
  );

  // Percentages come from summed counts, so a busy day outweighs a quiet one
  const totals = useMemo(() => {
    const onTime = rows.reduce((sum, r) => sum + r.onTime, 0);
    const late = rows.reduce((sum, r) => sum + r.late, 0);
    return { onTime, late, all: onTime + late };
  }, [rows]);

  if (totals.all === 0) {
    return (
      <EmptyState
        compact
        title="No signal activations in this period"
        description="Signals cleared for emergency vehicles are counted here."
        className={className}
      />
    );
  }

  const pct = Math.round((totals.onTime / totals.all) * 100);

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--text-primary)]">
            {pct}%
          </span>{" "}
          opened on time ({totals.onTime} of {totals.all})
        </p>

        {/* Legend is text as well as colour */}
        <ul className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm bg-[var(--color-olive-500)]"
            />
            On time
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm bg-[var(--color-clay-500)]"
            />
            Late
          </li>
        </ul>
      </div>

      <div aria-hidden style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
              allowDecimals={false}
              tick={{ fontSize: 12, fill: semantic.text.secondary }}
            />
            <Tooltip
              content={<PerformanceTooltip />}
              cursor={{ fill: "rgba(13, 59, 78, 0.06)" }}
            />
            <Bar
              dataKey="onTime"
              name="On time"
              stackId="signals"
              fill={palette.olive[500]}
              isAnimationActive={!reduce}
            />
            <Bar
              dataKey="late"
              name="Late"
              stackId="signals"
              fill={palette.clay[500]}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduce}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Signals opened on time and late, by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">On time</th>
            <th scope="col">Late</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`}>
              <th scope="row">{r.label}</th>
              <td>{r.onTime}</td>
              <td>{r.late}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SignalPerformanceChart;