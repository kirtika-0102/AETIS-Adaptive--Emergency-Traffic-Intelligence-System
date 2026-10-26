/**
 * "-" is shown wherever a value is unknown. The API layer uses NaN for
 * "unknown", so a missing ETA never appears as a misleading "0 s".
 */

/** 45 -> "45 s", 252 -> "4 min 12 s", 1500 -> "25 min", 7500 -> "2 h 5 min" */
export function formatDuration(seconds: number): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "-";

  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;

  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    // Seconds only matter for short waits
    return minutes < 10 && secs > 0 ? `${minutes} min ${secs} s` : `${minutes} min`;
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours < 24) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

/** Local time in the browser's own format, e.g. "26 Oct, 14:05". The year is added for other years. */
export function formatDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const sameYear = date.getFullYear() === new Date().getFullYear();

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}