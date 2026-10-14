import { useEffect, useState } from "react";
import { Camera } from "lucide-react";

import type { CameraDetection } from "../../types/camera.types";
import { VEHICLE_TYPE_LABELS } from "../../utils/constants";
import { formatDateTime, formatDuration } from "../../utils/formatters";
import Badge from "../common/Badge";
import EmptyState from "../common/EmptyState";

export interface CameraDetectionFeedProps {
  detections: CameraDetection[];
  isLoading: boolean;
  skeletonCount?: number;
}

const TICK_MS = 5_000;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}

function formatAge(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Time unknown";

  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  return seconds < 5 ? "Just now" : `${formatDuration(seconds)} ago`;
}

/** The number is always written out; the bar colour is only a visual aid */
function confidenceBar(confidence: number): string {
  if (confidence >= 0.9) return "bg-[var(--color-olive-500)]";
  if (confidence >= 0.7) return "bg-[var(--feedback-warning)]";
  return "bg-[var(--color-clay-500)]";
}

function CameraDetectionFeed({
  detections,
  isLoading,
  skeletonCount = 4,
}: CameraDetectionFeedProps) {
  const now = useNow(detections.length > 0);

  if (isLoading && detections.length === 0) {
    return (
      <ul className="space-y-2" aria-busy="true">
        <li className="sr-only">Loading detections</li>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li
            key={i}
            aria-hidden
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3.5"
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-sand-200)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--color-sand-200)]" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (detections.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Camera size={26} />}
        title="No detections yet"
        description="Detections appear here when a signal camera spots an emergency vehicle."
      />
    );
  }

  return (
    <ul
      aria-busy={isLoading}
      className={cx(
        "max-h-[560px] space-y-2 overflow-y-auto pr-1 transition-opacity scrollbar-thin",
        isLoading ? "opacity-60" : "opacity-100"
      )}
    >
      {detections.map((d) => {
        // Clamped so a bad value cannot draw a bar outside its track
        const confidence = Number.isFinite(d.confidence)
          ? Math.min(1, Math.max(0, d.confidence))
          : 0;
        const percent = Math.round(confidence * 100);
        const linked = Boolean(d.emergencyId);

        return (
          <li
            key={d.id}
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-teal-600)] text-white"
              >
                <Camera size={20} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="truncate text-sm font-semibold">{d.cameraName}</p>
                  <time
                    dateTime={d.detectedAt}
                    title={formatDateTime(d.detectedAt)}
                    className="shrink-0 text-xs text-[var(--text-muted)]"
                  >
                    {formatAge(d.detectedAt, now)}
                  </time>
                </div>

                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                  {VEHICLE_TYPE_LABELS[d.vehicleType] ?? d.vehicleType} at{" "}
                  {d.signalName}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-sand-200)]"
                    >
                      <span
                        className={cx("block h-full rounded-full", confidenceBar(confidence))}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {percent}% confidence
                    </span>
                  </span>

                  <Badge tone={linked ? "success" : "neutral"} size="sm">
                    {linked
                      ? `Linked to ${d.emergencyId}`
                      : "No active emergency matched"}
                  </Badge>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default CameraDetectionFeed;